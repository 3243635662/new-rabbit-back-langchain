import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GoodsSku } from '../../goods/entities/goods_sku.entity';
import { InventoryLog } from './inventory_logs.entity';

/**
 * 库存表 - 独立管理 SKU 库存
 * 将库存从 GoodsSku 中抽离，便于统一管理库存变动、预警和并发控制
 */
@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn()
  id: number;

  // ----------------------
  // 1. 关联SKU (一对一)
  // ----------------------
  @Column({ name: 'sku_id', unique: true, comment: '关联的商品SKU ID (唯一)' })
  skuId: number;

  @OneToOne(() => GoodsSku, (sku) => sku.inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sku_id' })
  sku: GoodsSku;

  // ----------------------
  // 2. 库存数量
  // ----------------------
  @Column({ default: 0, comment: '可用库存量' })
  stock: number;

  @Column({ default: 0, comment: '已锁定库存量 (已下单未支付)' })
  lockedStock: number;

  // ----------------------
  // 3. 预警
  // ----------------------
  @Column({ default: 0, comment: '库存预警值 (低于此值触发预警)' })
  warningStock: number;

  @Column({ default: false, comment: '是否已触发库存预警' })
  isWarning: boolean;

  @OneToMany(() => InventoryLog, (log) => log.inventory)
  logs: InventoryLog[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
