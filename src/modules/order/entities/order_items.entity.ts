import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './orders.entity';
import { GoodsSku } from '../../goods/entities/goods_sku.entity';

@Entity('order_items')
@Index(['orderId'])
@Index(['skuId'])
export class OrderItem {
  @PrimaryColumn({
    type: 'bigint',
    comment: '订单项ID (Snowflake生成)',
  })
  id: string;

  @Column({
    type: 'bigint',
    comment: '订单ID',
  })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  // ----------------------
  // 商品信息
  // ----------------------
  @Column({
    type: 'int',
    comment: '商品SKU ID',
  })
  skuId: number;

  @ManyToOne(() => GoodsSku)
  @JoinColumn({ name: 'skuId' })
  sku: GoodsSku;

  @Column({
    length: 50,
    comment: 'SKU编码',
  })
  skuCode: string;

  @Column({
    length: 200,
    comment: '商品名称',
  })
  skuName: string;

  // ----------------------
  // 数量和价格
  // ----------------------
  @Column({
    type: 'int',
    comment: '购买数量',
  })
  count: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '单价',
  })
  price: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '小计 (数量 × 单价)',
  })
  totalPrice: number;

  // ----------------------
  // 其他信息
  // ----------------------
  @Column({
    nullable: true,
    type: 'text',
    comment: '商品备注',
  })
  remark: string;
}
