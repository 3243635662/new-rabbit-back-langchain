import { CreateOrderDto } from './dto/create-order.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Address } from '../address/entities/address.entity';
import { RedisService } from '../db/redis/redis.service';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { InventoryLog } from '../inventory/entities/inventory_logs.entity';
import { OrderItem } from './entities/order_items.entity';
import { Order } from './entities/orders.entity';
import { SnowflakeIdService } from '../../common/services/snowflake-id.service';
import { OrderNoGeneratorService } from '../../common/services/order-no-generator.service';
import { CouponService } from '../coupon/coupon.service';
import { RedisKeys } from '../../common/constants/redis-key.constant';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    // @InjectRepository(Order)
    // private orderRepo: Repository<Order>,
    // @InjectRepository(OrderItem)
    // private orderItemRepo: Repository<OrderItem>,
    // @InjectRepository(GoodsSku)
    // private skuRepo: Repository<GoodsSku>,
    // @InjectRepository(Address)
    // private addressRepo: Repository<Address>,
    // @InjectRepository(InventoryLog)
    // private inventoryLogRepo: Repository<InventoryLog>,
    private readonly snowflakeIdService: SnowflakeIdService, // 雪花ID服务
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource, // TypeORM 数据源，用于事务
    private readonly orderNoGeneratorService: OrderNoGeneratorService, // 订单号生成服务
    private readonly couponService: CouponService, // 优惠券服务
  ) {}

  /**
   * 创建订单
   * @param userId 用户Id
   * @param createOrderDto 创建订单Dto
   */
  async createDto(userId: string, createOrderDto: CreateOrderDto) {
    const lockAcquired = await this.redisService.tryOrderCreateLock(userId);
    if (!lockAcquired) {
      throw new ConflictException('订单正在创建中，请稍候');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction(); // 开启事务

    try {
      // 生成订单ID
      const orderId = this.snowflakeIdService.generateOrderId();
      this.logger.log(`📝 生成订单ID: ${orderId}`);

      // 生成业务订单号
      const orderNo = await this.orderNoGeneratorService.generateOrderNo();
      this.logger.log(`📝 生成业务订单号: ${orderNo}`);

      // 验证收货地址
      const address = await queryRunner.manager.findOne(Address, {
        where: { id: createOrderDto.addressId, userId },
      });
      if (!address) {
        throw new NotFoundException('地址不存在');
      }

      // 验证商品和库存

      let totalAmount = 0; // 原价

      const orderItems: OrderItem[] = [];
      // 收集SKU信息用于优惠券范围匹配
      const skuInfoMap = new Map<
        number,
        { goodsId: number; categoryId: number | null }
      >();

      for (const item of createOrderDto.items) {
        // 库存锁
        const stockLockAcquired = await this.redisService.tryStockLock(
          String(item.skuId),
        );
        if (!stockLockAcquired) {
          throw new ConflictException('商品正在处理中请稍后');
        }

        try {
          // 查询sku信息
          const sku = await queryRunner.manager.findOne(GoodsSku, {
            where: { id: item.skuId },
            relations: ['goods'],
            lock: { mode: 'pessimistic_read' }, // 悲观锁 并发修改
          });

          if (!sku) {
            throw new NotFoundException('商品不存在');
          }

          // 检查库存
          if (sku.stock < item.count) {
            throw new BadRequestException('商品库存不足');
          }

          //生成订单项ID
          const orderItemId = this.snowflakeIdService.generateOrderItemId();

          const orderItem = new OrderItem();
          orderItem.id = orderItemId;
          orderItem.orderId = orderId;
          orderItem.skuId = item.skuId;
          orderItem.skuCode = sku.skuCode;
          orderItem.skuName = sku.goods.name;
          orderItem.count = item.count;
          orderItem.price = sku.price;
          orderItem.totalPrice = sku.price * item.count;
          orderItem.shippingStatus = 0; // 待发货

          orderItems.push(orderItem);

          // 记录SKU的goodsId和categoryId，用于优惠券范围匹配
          skuInfoMap.set(item.skuId, {
            goodsId: sku.goodsId,
            categoryId: sku.goods.categoryId,
          });

          // 计算总金额
          totalAmount += orderItem.totalPrice;
        } finally {
          await this.redisService.unlockStockLock(String(item.skuId));
        }
      }

      // 计算实际实付金额
      // 构建订单项信息用于优惠券计算
      const orderItemsForDiscount = orderItems.map((orderItem) => {
        const info = skuInfoMap.get(orderItem.skuId);
        return {
          skuId: orderItem.skuId,
          goodsId: info?.goodsId ?? 0,
          categoryId: info?.categoryId ?? null,
          totalPrice: orderItem.totalPrice,
        };
      });

      const { discountAmount, payAmount } =
        await this.couponService.calculateDiscount(
          userId,
          createOrderDto.couponId,
          orderItemsForDiscount,
          totalAmount,
          queryRunner,
        );

      // 创建订单
      const order = new Order();
      order.id = orderId;
      order.orderNo = orderNo;
      order.userId = userId;
      order.totalAmount = totalAmount;
      order.discountAmount = discountAmount;
      order.payAmount = payAmount;
      order.addressSnapshot = {
        name: address.name,
        phone: address.phone,
        address: address.detail,
        areaCode: address.areaCode,
      };

      // 保存订单
      await queryRunner.manager.save(Order, order);
      // 保存订单项
      await queryRunner.manager.save(OrderItem, orderItems);

      // 扣减库存 & 记录库存日志
      for (const item of createOrderDto.items) {
        const sku = await queryRunner.manager.findOne(GoodsSku, {
          where: { id: item.skuId },
          lock: { mode: 'pessimistic_write' },
        });
        if (sku) {
          sku.stock -= item.count;
          await queryRunner.manager.save(GoodsSku, sku);

          const inventoryLog = new InventoryLog();
          inventoryLog.skuId = item.skuId;
          inventoryLog.change = -item.count;
          inventoryLog.currentStock = sku.stock;
          inventoryLog.type = 'ORDER';
          inventoryLog.relatedId = orderNo;
          await queryRunner.manager.save(InventoryLog, inventoryLog);
        }
      }

      // 标记优惠券为已使用
      if (createOrderDto.couponId) {
        await this.couponService.markCouponUsed(
          createOrderDto.couponId,
          orderId,
          queryRunner,
        );
      }

      await queryRunner.commitTransaction();

      // 事务提交成功后，将订单加入 Redis 待支付列表（供超时定时任务检查）
      try {
        const pendingKey = RedisKeys.ORDER.getPendingOrderListKey(
          userId,
          Math.floor(order.createdAt.getTime() / 1000),
        );
        await this.redisService.set(pendingKey, orderId);
        this.logger.log(`已加入待支付列表: ${pendingKey}`);
      } catch (redisError) {
        // Redis 写入失败不影响订单创建，仅记录日志
        this.logger.warn(
          `写入待支付列表失败（非致命）: ${redisError instanceof Error ? redisError.message : String(redisError)}`,
        );
      }

      return {
        orderId,
        orderNo,
        totalAmount,
        discountAmount,
        payAmount,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
      await this.redisService.unlockOrderCreateLock(userId);
    }
  }
}
