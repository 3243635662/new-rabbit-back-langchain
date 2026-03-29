import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './orders.entity';
import { GoodsSku } from '../../goods/entities/goods_sku.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  // ----------------------
  // 商品快照 (下单时的商品信息，防止商品修改影响订单记录)
  // ----------------------
  @Column()
  skuId: number;

  // 可选：关联查询当前最新的SKU信息，但订单展示必须用下面的快照字段
  @ManyToOne(() => GoodsSku)
  @JoinColumn({ name: 'skuId' })
  sku: GoodsSku;

  @Column({ comment: '商品快照-SKU规格描述' })
  skuSpecs: string; // 例如 "红色, XL"

  @Column({ comment: '商品快照-商品名称' })
  goodsName: string;

  @Column({ comment: '商品快照-图片' })
  goodsImage: string;

  // ----------------------
  // 价格与数量
  // ----------------------
  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '下单单价' })
  price: number;

  @Column({ comment: '购买数量' })
  count: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '小计金额' })
  totalPrice: number;
}
