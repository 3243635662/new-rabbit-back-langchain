import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner, Brackets } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { InventoryLog } from './entities/inventory_logs.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { RedisService } from '../db/redis/redis.service';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { RedisTTL } from '../../common/constants/redis-TTL.constant';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginationOptionsType } from '../../types/pagination.type';
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate';

const DEFAULT_GOODS_PICTURE =
  'https://img2.baidu.com/it/u=1634170865,2624005952&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=500';

export interface InventoryQueryOptions extends PaginationOptionsType {
  isWarning?: string;
}

export interface UpdateInventoryDto {
  warningStock?: number;
  stock?: number;
  remark?: string;
}

export interface ManualStockDto {
  skuCode: string;
  count: number;
  type: 'MANUAL_ADD' | 'MANUAL_REDUCE';
  remark?: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(InventoryLog)
    private readonly inventoryLogRepo: Repository<InventoryLog>,
    @InjectRepository(GoodsSku)
    private readonly skuRepo: Repository<GoodsSku>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly redisService: RedisService,
  ) {}

  // ───────────────────────────────────────────────
  //  辅助方法
  // ───────────────────────────────────────────────

  private getMerchantId = async (userId: string): Promise<number | null> => {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    return merchant?.id ?? null;
  };

  private getSkuByCode = async (
    skuCode: string,
    merchantId: number,
  ): Promise<GoodsSku> => {
    const sku = await this.skuRepo.findOne({
      where: { skuCode },
      relations: ['goods'],
    });
    if (!sku) throw new NotFoundException(`SKU不存在: ${skuCode}`);
    if (sku.goods?.merchantId !== merchantId) {
      throw new ForbiddenException(`无权操作该SKU: ${skuCode}`);
    }
    return sku;
  };

  private clearMerchantListCache = async (
    merchantId: number,
  ): Promise<void> => {
    const prefix = RedisKeys.INVENTORY.getMerchantListPrefix(merchantId);
    await this.redisService.delByPrefixSafe(prefix);
    this.logger.log(`已清除商家 ${merchantId} 的库存列表缓存`);
  };

  private clearInventoryDetailCache = async (
    inventoryId: number,
  ): Promise<void> => {
    const key = RedisKeys.INVENTORY.getDetailKey(inventoryId);
    await this.redisService.del(key);
  };

  private clearInventoryStatsCache = async (skuId: number): Promise<void> => {
    const key = RedisKeys.INVENTORY.getStatsKey(skuId);
    await this.redisService.del(key);
  };

  private getStats = async (skuId: number) => {
    const cacheKey = RedisKeys.INVENTORY.getStatsKey(skuId);
    const cached = await this.redisService.get<{
      totalIn: number;
      totalOut: number;
    }>(cacheKey);
    if (cached) return cached;

    const logs = await this.inventoryLogRepo.find({ where: { skuId } });
    const totalIn = logs
      .filter((l) => l.change > 0)
      .reduce((sum, l) => sum + l.change, 0);
    const totalOut = logs
      .filter((l) => l.change < 0)
      .reduce((sum, l) => sum + Math.abs(l.change), 0);

    const result = { totalIn, totalOut };
    await this.redisService.set(
      cacheKey,
      result,
      RedisTTL.CACHE.INVENTORY_STATS,
    );
    return result;
  };

  private formatInventoryItem = async (inventory: Inventory) => {
    const sku = inventory.sku;
    const goods = sku?.goods;
    const stats = await this.getStats(inventory.skuId);

    const specsLabel =
      sku?.specs?.map((s) => `${s.name}: ${s.value}`).join(' / ') || '';

    return {
      id: inventory.id,
      skuCode: sku?.skuCode || '',
      goodsId: goods?.id,
      goodsName: goods?.name || '未知商品',
      goodsPicture: sku?.picture || goods?.mainPicture || DEFAULT_GOODS_PICTURE,
      shortName: goods?.name || '',
      specs: sku?.specs || [],
      specsLabel,
      cargoNo: sku?.skuCode || '',
      goodsStatus: sku?.isLaunching ? '上架' : '下架',
      status: sku?.isLaunching ?? false,
      totalOut: stats.totalOut,
      totalIn: stats.totalIn,
      stock: inventory.stock,
      warningStock: inventory.warningStock,
      isWarning: inventory.isWarning,
      lockedStock: inventory.lockedStock,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
    };
  };

  // ───────────────────────────────────────────────
  //  查询接口
  // ───────────────────────────────────────────────

  /**
   * 商家查询库存列表（带 Redis 缓存）
   */
  getMerchantInventoryList = async (
    payload: JwtPayloadType,
    options: InventoryQueryOptions,
  ) => {
    const merchantId = await this.getMerchantId(payload.id);
    if (!merchantId) {
      return {
        list: [],
        total: 0,
        page: options.page || 1,
        limit: options.limit || 10,
        totalPage: 0,
      };
    }

    const cacheKey = RedisKeys.INVENTORY.getMerchantListKey(
      merchantId,
      options.page || 1,
      options.limit || 10,
      options.keyword || '',
      options.isWarning || '',
    );

    const cached = await this.redisService.get<{
      list: unknown[];
      total: number;
      page: number;
      limit: number;
      totalPage: number;
    }>(cacheKey);
    if (cached) {
      this.logger.debug(`命中库存列表缓存: ${cacheKey}`);
      return cached;
    }

    const qb = this.inventoryRepo
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.sku', 'sku')
      .leftJoinAndSelect('sku.goods', 'goods')
      .where('goods.merchantId = :merchantId', { merchantId });

    if (options.keyword) {
      qb.andWhere(
        new Brackets((sq) => {
          sq.where('goods.name LIKE :keyword', {
            keyword: `%${options.keyword}%`,
          })
            .orWhere('sku.skuCode LIKE :keyword', {
              keyword: `%${options.keyword}%`,
            })
            .orWhere('CAST(sku.specs AS CHAR) LIKE :keyword', {
              keyword: `%${options.keyword}%`,
            });
        }),
      );
    }

    if (options.isWarning === '1' || options.isWarning === 'true') {
      qb.andWhere('inventory.isWarning = :isWarning', { isWarning: true });
    }

    const allowedSortFields = [
      'id',
      'stock',
      'warningStock',
      'createdAt',
      'updatedAt',
    ];
    const sortField = allowedSortFields.includes(options.sort || '')
      ? options.sort
      : 'updatedAt';
    const sortOrder = options.order === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`inventory.${sortField}`, sortOrder);

    const paginateOptions: IPaginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
    };

    const paginationData = await paginate<Inventory>(qb, paginateOptions);
    const list = await Promise.all(
      paginationData.items.map((item) => this.formatInventoryItem(item)),
    );

    const result = {
      list,
      total: paginationData.meta.totalItems,
      totalPage: paginationData.meta.totalPages,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
    };

    await this.redisService.set(
      cacheKey,
      result,
      RedisTTL.CACHE.INVENTORY_LIST,
    );
    return result;
  };

  /**
   * 获取单个库存详情（带 Redis 缓存）
   */
  getInventoryDetail = async (payload: JwtPayloadType, inventoryId: number) => {
    const merchantId = await this.getMerchantId(payload.id);
    if (!merchantId) throw new NotFoundException('商家信息不存在');

    const cacheKey = RedisKeys.INVENTORY.getDetailKey(inventoryId);
    const cached = await this.redisService.get<unknown>(cacheKey);
    if (cached) {
      this.logger.debug(`命中库存详情缓存: ${cacheKey}`);
      return cached;
    }

    const inventory = await this.inventoryRepo.findOne({
      where: { id: inventoryId },
      relations: ['sku', 'sku.goods'],
    });

    if (!inventory) throw new NotFoundException('库存记录不存在');
    if (inventory.sku?.goods?.merchantId !== merchantId) {
      throw new ForbiddenException('无权查看该库存记录');
    }

    const detail = await this.formatInventoryItem(inventory);
    await this.redisService.set(
      cacheKey,
      detail,
      RedisTTL.CACHE.INVENTORY_DETAIL,
    );
    return detail;
  };

  /**
   * 获取库存变动日志列表
   */
  getInventoryLogs = async (
    payload: JwtPayloadType,
    skuCode: string,
    options: PaginationOptionsType,
  ) => {
    const merchantId = await this.getMerchantId(payload.id);
    if (!merchantId) throw new NotFoundException('商家信息不存在');

    const sku = await this.getSkuByCode(skuCode, merchantId);
    const skuId = sku.id;

    const qb = this.inventoryLogRepo
      .createQueryBuilder('log')
      .where('log.skuId = :skuId', { skuId })
      .orderBy('log.createdAt', 'DESC');

    const paginateOptions: IPaginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
    };

    const paginationData = await paginate<InventoryLog>(qb, paginateOptions);
    return {
      list: paginationData.items,
      total: paginationData.meta.totalItems,
      totalPage: paginationData.meta.totalPages,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
    };
  };

  // ───────────────────────────────────────────────
  //  修改接口（均触发缓存清除）
  // ───────────────────────────────────────────────

  /**
   * 修改库存预警值与库存数量（人工调整）
   */
  updateInventory = async (
    payload: JwtPayloadType,
    inventoryId: number,
    dto: UpdateInventoryDto,
  ) => {
    const merchantId = await this.getMerchantId(payload.id);
    if (!merchantId) throw new NotFoundException('商家信息不存在');

    const inventory = await this.inventoryRepo.findOne({
      where: { id: inventoryId },
      relations: ['sku', 'sku.goods'],
    });
    if (!inventory) throw new NotFoundException('库存记录不存在');
    if (inventory.sku?.goods?.merchantId !== merchantId) {
      throw new ForbiddenException('无权修改该库存记录');
    }

    const oldStock = inventory.stock;

    if (dto.warningStock !== undefined) {
      inventory.warningStock = dto.warningStock;
    }

    if (dto.stock !== undefined && dto.stock !== oldStock) {
      const change = dto.stock - oldStock;
      inventory.stock = dto.stock;

      const log = this.inventoryLogRepo.create({
        skuId: inventory.skuId,
        change,
        currentStock: dto.stock,
        type: change > 0 ? 'MANUAL_ADD' : 'MANUAL_REDUCE',
        relatedId: null,
        remark: dto.remark || `人工调整库存: ${oldStock} → ${dto.stock}`,
      });
      await this.inventoryLogRepo.save(log);
      await this.clearInventoryStatsCache(inventory.skuId);
    }

    inventory.isWarning =
      inventory.warningStock > 0 && inventory.stock <= inventory.warningStock;

    const updated = await this.inventoryRepo.save(inventory);

    await this.clearMerchantListCache(merchantId);
    await this.clearInventoryDetailCache(inventoryId);

    return updated;
  };

  /**
   * 手动入库 / 出库
   */
  manualStockChange = async (payload: JwtPayloadType, dto: ManualStockDto) => {
    const merchantId = await this.getMerchantId(payload.id);
    if (!merchantId) throw new NotFoundException('商家信息不存在');

    const sku = await this.getSkuByCode(dto.skuCode, merchantId);
    const skuId = sku.id;

    let inventory = await this.inventoryRepo.findOne({
      where: { skuId },
    });
    if (!inventory) {
      inventory = this.inventoryRepo.create({
        skuId,
        stock: 0,
        warningStock: 0,
        isWarning: false,
      });
    }

    if (dto.type === 'MANUAL_REDUCE' && inventory.stock < dto.count) {
      throw new ForbiddenException('库存不足，无法出库');
    }

    const change = dto.type === 'MANUAL_ADD' ? dto.count : -dto.count;
    inventory.stock += change;
    inventory.isWarning =
      inventory.warningStock > 0 && inventory.stock <= inventory.warningStock;

    const updated = await this.inventoryRepo.save(inventory);

    const log = this.inventoryLogRepo.create({
      skuId,
      change,
      currentStock: inventory.stock,
      type: dto.type,
      relatedId: null,
      remark:
        dto.remark ||
        `${dto.type === 'MANUAL_ADD' ? '手动入库' : '手动出库'} ${dto.count}`,
    });
    await this.inventoryLogRepo.save(log);

    await this.clearMerchantListCache(merchantId);
    await this.clearInventoryDetailCache(updated.id);
    await this.clearInventoryStatsCache(skuId);

    return updated;
  };

  /**
   * 删除库存记录（谨慎操作，仅清除孤立记录）
   */
  deleteInventory = async (payload: JwtPayloadType, inventoryId: number) => {
    const merchantId = await this.getMerchantId(payload.id);
    if (!merchantId) throw new NotFoundException('商家信息不存在');

    const inventory = await this.inventoryRepo.findOne({
      where: { id: inventoryId },
      relations: ['sku', 'sku.goods'],
    });
    if (!inventory) throw new NotFoundException('库存记录不存在');
    if (inventory.sku?.goods?.merchantId !== merchantId) {
      throw new ForbiddenException('无权删除该库存记录');
    }

    await this.inventoryRepo.remove(inventory);

    await this.clearMerchantListCache(merchantId);
    await this.clearInventoryDetailCache(inventoryId);
    await this.clearInventoryStatsCache(inventory.skuId);

    return { id: inventoryId, deleted: true };
  };

  /**
   * 初始化单个 SKU 的库存记录
   * 创建商品时调用
   */
  initStock = async (
    skuId: number,
    stock: number,
    warningStock = 0,
    queryRunner?: QueryRunner,
  ): Promise<Inventory> => {
    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    const inventory = manager.create(Inventory, {
      skuId,
      stock,
      warningStock,
      isWarning: warningStock > 0 && stock <= warningStock,
    });

    return manager.save(Inventory, inventory);
  };

  /**
   * 批量初始化多个 SKU 的库存记录
   * 创建商品时批量生成 SKU 后调用
   */
  batchInitStock = async (
    items: { skuId: number; stock: number; warningStock?: number }[],
    queryRunner?: QueryRunner,
  ): Promise<Inventory[]> => {
    if (items.length === 0) return [];

    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    const inventories = items.map((item) =>
      manager.create(Inventory, {
        skuId: item.skuId,
        stock: item.stock,
        warningStock: item.warningStock ?? 0,
        isWarning:
          (item.warningStock ?? 0) > 0 &&
          item.stock <= (item.warningStock ?? 0),
      }),
    );

    return manager.save(Inventory, inventories);
  };

  /**
   * 根据 skuId 获取库存记录
   */
  getBySkuId = async (skuId: number): Promise<Inventory | null> => {
    return this.inventoryRepo.findOne({ where: { skuId } });
  };

  /**
   * 批量获取库存记录
   */
  getBySkuIds = async (skuIds: number[]): Promise<Inventory[]> => {
    if (skuIds.length === 0) return [];
    return this.inventoryRepo.find({
      where: skuIds.map((id) => ({ skuId: id })),
    });
  };

  /**
   * 扣减库存 (下单时在事务中调用)
   * @returns 扣减后的库存记录
   */
  deductStock = async (
    skuId: number,
    count: number,
    type: 'ORDER' | 'MANUAL_REDUCE' = 'ORDER',
    relatedId?: string,
    queryRunner?: QueryRunner,
  ): Promise<Inventory> => {
    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    const inventory = await manager.findOne(Inventory, {
      where: { skuId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!inventory) {
      throw new Error(`库存记录不存在: skuId=${skuId}`);
    }

    if (inventory.stock < count) {
      throw new Error('商品库存不足');
    }

    inventory.stock -= count;

    if (
      inventory.warningStock > 0 &&
      inventory.stock <= inventory.warningStock &&
      !inventory.isWarning
    ) {
      inventory.isWarning = true;
    }

    await manager.save(Inventory, inventory);

    const log = manager.create(InventoryLog, {
      skuId,
      change: -count,
      currentStock: inventory.stock,
      type,
      relatedId: relatedId ?? null,
    });
    await manager.save(InventoryLog, log);

    // 清除相关缓存
    try {
      await this.clearInventoryStatsCache(skuId);
      if (inventory.id) {
        await this.clearInventoryDetailCache(inventory.id);
        const goods = await this.skuRepo.findOne({
          where: { id: skuId },
          relations: ['goods'],
        });
        if (goods?.goods?.merchantId) {
          await this.clearMerchantListCache(goods.goods.merchantId);
        }
      }
    } catch {
      // 缓存清除失败不影响主流程
    }

    return inventory;
  };

  /**
   * 恢复库存 (订单取消/超时/退款时在事务中调用)
   */
  restoreStock = async (
    skuId: number,
    count: number,
    type: 'REFUND' | 'MANUAL_ADD' = 'REFUND',
    relatedId?: string,
    remark?: string,
    queryRunner?: QueryRunner,
  ): Promise<Inventory | null> => {
    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    const inventory = await manager.findOne(Inventory, {
      where: { skuId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!inventory) {
      this.logger.warn(`库存记录不存在，跳过恢复: skuId=${skuId}`);
      return null;
    }

    inventory.stock += count;

    if (inventory.isWarning && inventory.stock > inventory.warningStock) {
      inventory.isWarning = false;
    }

    await manager.save(Inventory, inventory);

    const log = manager.create(InventoryLog, {
      skuId,
      change: count,
      currentStock: inventory.stock,
      type,
      relatedId: relatedId ?? null,
      remark: remark ?? null,
    });
    await manager.save(InventoryLog, log);

    // 清除相关缓存
    try {
      await this.clearInventoryStatsCache(skuId);
      if (inventory.id) {
        await this.clearInventoryDetailCache(inventory.id);
        const goods = await this.skuRepo.findOne({
          where: { id: skuId },
          relations: ['goods'],
        });
        if (goods?.goods?.merchantId) {
          await this.clearMerchantListCache(goods.goods.merchantId);
        }
      }
    } catch {
      // 缓存清除失败不影响主流程
    }

    return inventory;
  };

  /**
   * 检查库存是否充足 (下单前在事务中调用，使用悲观读锁)
   */
  checkStock = async (
    skuId: number,
    count: number,
    queryRunner?: QueryRunner,
  ): Promise<Inventory> => {
    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    const inventory = await manager.findOne(Inventory, {
      where: { skuId },
      lock: { mode: 'pessimistic_read' },
    });

    if (!inventory) {
      throw new Error(`库存记录不存在: skuId=${skuId}`);
    }

    if (inventory.stock < count) {
      throw new Error('商品库存不足');
    }

    return inventory;
  };
}
