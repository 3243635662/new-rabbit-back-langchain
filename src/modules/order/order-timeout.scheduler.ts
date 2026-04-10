import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Order, OrderStatus } from './entities/orders.entity';
import { OrderItem } from './entities/order_items.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { InventoryLog } from '../inventory/entities/inventory_logs.entity';
import { RedisService } from '../db/redis/redis.service';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { UserCoupon } from '../coupon/entities/user-coupon.entity';
import { RedisTTL } from '../../common/constants/redis-TTL.constant';

/**
 * 订单超时定时任务调度器
 *
 * 核心职责：
 * 1. 每分钟扫描创建超过20分钟仍为"待支付"的订单
 * 2. 将超时订单状态更新为"已超时"(9)
 * 3. 回滚库存 + 记录库存日志
 * 4. 退还已使用的优惠券
 * 5. 清理 Redis 中的待支付订单记录
 *
 * 防重复执行：使用 Redis 分布式锁，多实例部署时只有一个实例执行
 */
@Injectable()
export class OrderTimeoutScheduler {
  private readonly logger = new Logger(OrderTimeoutScheduler.name);

  /** 支付超时时间（毫秒） */
  private readonly PAYMENT_TIMEOUT_MS =
    RedisTTL.ORDER_TIMEOUT.PAYMENT_MINUTES * 60 * 1000;

  /** 定时任务分布式锁的 Redis Key */
  private readonly SCHEDULER_LOCK_KEY = RedisKeys.SCHEDULER.ORDER_TIMEOUT_LOCK;

  /** 定时任务分布式锁的过期时间（秒） */
  private readonly SCHEDULER_LOCK_TTL = RedisTTL.SCHEDULER.ORDER_TIMEOUT_LOCK;

  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepo: Repository<OrderItem>,
    @InjectRepository(GoodsSku)
    private skuRepo: Repository<GoodsSku>,
    @InjectRepository(InventoryLog)
    private inventoryLogRepo: Repository<InventoryLog>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 定时任务：每分钟执行一次，检查并处理超时未支付订单
   *
   * 执行流程：
   * 1. 获取分布式锁（防止多实例重复执行）
   * 2. 查询超时订单
   * 3. 逐个处理：状态更新 + 库存回滚 + 优惠券退还 + Redis 清理
   * 4. 释放锁
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleTimeoutOrders(): Promise<void> {
    // 获取分布式锁，防止多实例重复执行
    const lockAcquired = await this.acquireSchedulerLock();
    if (!lockAcquired) {
      this.logger.debug('未获取到任务锁，跳过本次执行（可能由其他实例处理）');
      return;
    }

    try {
      // 计算超时截止时间：当前时间 - 20分钟
      const timeoutThreshold = new Date(Date.now() - this.PAYMENT_TIMEOUT_MS);

      // 查询所有超时未支付的订单
      const timeoutOrders = await this.orderRepo.find({
        where: {
          status: OrderStatus.PENDING_PAYMENT,
          createdAt: LessThan(timeoutThreshold),
        },
        select: ['id', 'orderNo', 'userId', 'createdAt'],
      });

      if (timeoutOrders.length === 0) {
        this.logger.debug('暂无超时订单');
        return;
      }

      this.logger.log(`发现 ${timeoutOrders.length} 个超时订单，开始处理...`);

      // 逐个处理超时订单（使用事务保证原子性）
      let successCount = 0;
      let failCount = 0;

      for (const order of timeoutOrders) {
        try {
          await this.processSingleTimeoutOrder(order);
          successCount++;
        } catch (error) {
          failCount++;
          this.logger.error(
            `处理超时订单失败 [orderId=${order.id}, orderNo=${order.orderNo}]: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `超时订单处理完成: 成功=${successCount}, 失败=${failCount}, 总计=${timeoutOrders.length}`,
      );
    } catch (error) {
      this.logger.error(
        `超时订单定时任务执行异常: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // 无论成功失败，都释放锁
      await this.releaseSchedulerLock();
    }
  }

  /**
   * 处理单个超时订单
   *
   * 在事务中完成以下操作：
   * 1. 更新订单状态为"已超时"
   * 2. 查询订单项并回滚库存
   * 3. 记录库存变动日志
   * 4. 退还优惠券（如果有）
   * 5. 清理 Redis 中的待支付记录
   */
  private async processSingleTimeoutOrder(order: {
    id: string;
    orderNo: string;
    userId: string;
    createdAt: Date;
  }): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. 再次确认订单状态（防止在查询和执行之间订单已被支付）
      const currentOrder = await queryRunner.manager.findOne(Order, {
        where: { id: order.id },
        lock: { mode: 'pessimistic_write' }, // 悲观写锁，防止并发修改
      });

      if (
        !currentOrder ||
        currentOrder.status !== OrderStatus.PENDING_PAYMENT
      ) {
        this.logger.debug(
          `订单 ${order.orderNo} 状态已变更（非待支付），跳过处理`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      // 2. 更新订单状态为"已超时"
      currentOrder.status = OrderStatus.TIMEOUT;
      await queryRunner.manager.save(Order, currentOrder);

      // 3. 查询订单项，用于回滚库存
      const orderItems = await queryRunner.manager.find(OrderItem, {
        where: { orderId: order.id },
      });

      // 4. 回滚库存 + 记录库存日志
      for (const item of orderItems) {
        const sku = await queryRunner.manager.findOne(GoodsSku, {
          where: { id: item.skuId },
          lock: { mode: 'pessimistic_write' },
        });

        if (sku) {
          // 恢复库存
          sku.stock += item.count;
          await queryRunner.manager.save(GoodsSku, sku);

          // 记录库存变动日志
          const inventoryLog = new InventoryLog();
          inventoryLog.skuId = item.skuId;
          inventoryLog.change = item.count; // 正数表示入库
          inventoryLog.currentStock = sku.stock;
          inventoryLog.type = 'REFUND'; // 退货/超时回滚
          inventoryLog.relatedId = order.orderNo;
          inventoryLog.remark = `订单超时取消，回滚库存`;
          await queryRunner.manager.save(InventoryLog, inventoryLog);
        }
      }

      // 5. 退还优惠券（查询该订单关联的用户优惠券）
      // 通过 orderId 反查 user_coupon 表，找到被该订单使用的优惠券
      await this.refundCouponIfNeeded(order.id, queryRunner);

      await queryRunner.commitTransaction();

      // 6. 清理 Redis 中的待支付订单记录（事务提交后执行，非关键操作）
      await this.cleanupRedisPendingRecord(order.userId, order.createdAt);

      this.logger.log(
        `订单超时处理完成: orderId=${order.id}, orderNo=${order.orderNo}, 回滚SKU数=${orderItems.length}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 退还该订单使用的优惠券
   *
   * 查找 user_coupon 表中 orderId 等于当前订单ID 且状态为 USED 的记录，
   * 将其状态恢复为 UNUSED，并清空 orderId。
   */
  private async refundCouponIfNeeded(
    orderId: string,
    queryRunner: import('typeorm').QueryRunner,
  ): Promise<void> {
    try {
      // 查找该订单使用的优惠券
      const userCoupons = await queryRunner.manager.find(UserCoupon, {
        where: { orderId: Number(orderId), status: 'USED' },
      });

      if (userCoupons.length > 0) {
        for (const uc of userCoupons) {
          await queryRunner.manager.update(UserCoupon, uc.id, {
            status: 'UNUSED',
            orderId: undefined,
          });
        }
        this.logger.log(
          `退还优惠券 ${userCoupons.length} 张，订单ID: ${orderId}`,
        );
      }
    } catch (error) {
      // 优惠券退还失败不应阻断整个流程，仅记录日志
      this.logger.warn(
        `退还优惠券失败（非致命），订单ID: ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 清理 Redis 中的待支付订单记录
   *
   * 删除 order:pending:payment:list:{userId}:{createdAtTimestamp} 对应的 key
   * 该操作非关键，失败不影响主流程
   */
  private async cleanupRedisPendingRecord(
    userId: string,
    createdAt: Date,
  ): Promise<void> {
    try {
      const key = RedisKeys.ORDER.getPendingOrderListKey(
        userId,
        Math.floor(createdAt.getTime() / 1000),
      );
      await this.redisService.del(key);
    } catch (error) {
      this.logger.warn(
        `清理 Redis 待支付记录失败（非致命）: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 获取定时任务分布式锁
   *
   * 使用 Redis SET NX EX 原子操作
   * 锁过期时间 55 秒（小于任务间隔 60 秒），确保不会跨周期残留
   */
  private async acquireSchedulerLock(): Promise<boolean> {
    try {
      const redis = this.redisService.clientInstance;
      const result = await redis.set(
        this.SCHEDULER_LOCK_KEY,
        String(Date.now()),
        'EX',
        this.SCHEDULER_LOCK_TTL,
        'NX',
      );
      return result === 'OK';
    } catch (error) {
      this.logger.error(
        `获取任务锁异常: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * 释放定时任务分布式锁
   */
  private async releaseSchedulerLock(): Promise<void> {
    try {
      await this.redisService.del(this.SCHEDULER_LOCK_KEY);
    } catch (error) {
      this.logger.error(
        `释放任务锁异常: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
