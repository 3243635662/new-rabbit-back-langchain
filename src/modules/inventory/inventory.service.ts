import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { InventoryLog } from './entities/inventory_logs.entity';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
  ) {}

  /**
   * 初始化单个 SKU 的库存记录
   * 创建商品时调用
   */
  async initStock(
    skuId: number,
    stock: number,
    warningStock = 0,
    queryRunner?: QueryRunner,
  ): Promise<Inventory> {
    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    const inventory = manager.create(Inventory, {
      skuId,
      stock,
      warningStock,
      isWarning: warningStock > 0 && stock <= warningStock,
    });

    return manager.save(Inventory, inventory);
  }

  /**
   * 批量初始化多个 SKU 的库存记录
   * 创建商品时批量生成 SKU 后调用
   */
  async batchInitStock(
    items: { skuId: number; stock: number; warningStock?: number }[],
    queryRunner?: QueryRunner,
  ): Promise<Inventory[]> {
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
  }

  /**
   * 根据 skuId 获取库存记录
   */
  async getBySkuId(skuId: number): Promise<Inventory | null> {
    return this.inventoryRepo.findOne({ where: { skuId } });
  }

  /**
   * 批量获取库存记录
   */
  async getBySkuIds(skuIds: number[]): Promise<Inventory[]> {
    if (skuIds.length === 0) return [];
    return this.inventoryRepo.find({
      where: skuIds.map((id) => ({ skuId: id })),
    });
  }

  /**
   * 扣减库存 (下单时在事务中调用)
   * @returns 扣减后的库存记录
   */
  async deductStock(
    skuId: number,
    count: number,
    type: 'ORDER' | 'MANUAL_REDUCE' = 'ORDER',
    relatedId?: string,
    queryRunner?: QueryRunner,
  ): Promise<Inventory> {
    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    // 使用悲观写锁查询库存
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

    // 扣减库存
    inventory.stock -= count;

    // 检查预警
    if (
      inventory.warningStock > 0 &&
      inventory.stock <= inventory.warningStock &&
      !inventory.isWarning
    ) {
      inventory.isWarning = true;
    }

    await manager.save(Inventory, inventory);

    // 记录库存变动日志
    const log = manager.create(InventoryLog, {
      skuId,
      change: -count,
      currentStock: inventory.stock,
      type,
      relatedId: relatedId ?? null,
    });
    await manager.save(InventoryLog, log);

    return inventory;
  }

  /**
   * 恢复库存 (订单取消/超时/退款时在事务中调用)
   */
  async restoreStock(
    skuId: number,
    count: number,
    type: 'REFUND' | 'MANUAL_ADD' = 'REFUND',
    relatedId?: string,
    remark?: string,
    queryRunner?: QueryRunner,
  ): Promise<Inventory | null> {
    const manager = queryRunner?.manager ?? this.inventoryRepo.manager;

    // 使用悲观写锁查询库存
    const inventory = await manager.findOne(Inventory, {
      where: { skuId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!inventory) {
      this.logger.warn(`库存记录不存在，跳过恢复: skuId=${skuId}`);
      return null;
    }

    // 恢复库存
    inventory.stock += count;

    // 库存恢复到预警值以上时，清除预警标记
    if (inventory.isWarning && inventory.stock > inventory.warningStock) {
      inventory.isWarning = false;
    }

    await manager.save(Inventory, inventory);

    // 记录库存变动日志
    const log = manager.create(InventoryLog, {
      skuId,
      change: count,
      currentStock: inventory.stock,
      type,
      relatedId: relatedId ?? null,
      remark: remark ?? null,
    });
    await manager.save(InventoryLog, log);

    return inventory;
  }

  /**
   * 检查库存是否充足 (下单前在事务中调用，使用悲观读锁)
   */
  async checkStock(
    skuId: number,
    count: number,
    queryRunner?: QueryRunner,
  ): Promise<Inventory> {
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
  }
}
