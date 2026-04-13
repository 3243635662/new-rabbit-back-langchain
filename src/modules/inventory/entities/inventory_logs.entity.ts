import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Inventory } from './inventory.entity';

@Entity('inventory_logs')
export class InventoryLog {
  @PrimaryGeneratedColumn()
  id: number;

  // ----------------------
  // 1. 关联库存记录
  // ----------------------
  @Index() // 经常需要查询某个SKU的变动记录
  @Column({ name: 'sku_id', comment: '关联的商品SKU ID' })
  skuId: number;

  @ManyToOne(() => Inventory, (inventory) => inventory.logs)
  @JoinColumn({ name: 'sku_id', referencedColumnName: 'skuId' })
  inventory: Inventory;

  // ----------------------
  // 2. 变动数量 (核心逻辑)
  // ----------------------
  @Column({
    type: 'int',
    comment: '变动数量 (正数代表入库/增加，负数代表出库/扣减)',
  })
  change: number;

  @Column({
    type: 'int',
    comment: '变动后的库存快照 (用于核对，防止并发导致数据不一致)',
  })
  currentStock: number;

  // ----------------------
  // 3. 变动类型与来源
  // ----------------------
  @Column({
    type: 'enum',
    enum: ['ORDER', 'REFUND', 'MANUAL_ADD', 'MANUAL_REDUCE'],
    comment:
      '变动类型: ORDER-下单扣减, REFUND-退货入库, MANUAL_ADD-人工补货, MANUAL_REDUCE-人工核减',
  })
  type: string;

  @Column({ nullable: true, comment: '关联单据ID (如订单号、售后单号)' })
  relatedId: string | null; // 比如下单扣减时，这里存 orderNo

  // ----------------------
  // 4. 操作信息
  // ----------------------
  @Column({ nullable: true, comment: '操作人ID (系统自动或管理员)' })
  operatorId: string | null;

  @Column({ length: 255, nullable: true, comment: '备注说明' })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
