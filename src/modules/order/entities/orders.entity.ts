import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { OrderItem } from './order_items.entity';

/**
 * 订单状态枚举
 * 与数据库 orders.status 字段对应
 */
export enum OrderStatus {
  PENDING_PAYMENT = 1, // 待支付
  PAID = 2, // 已支付
  PENDING_SHIPMENT = 3, // 待发货
  SHIPPED = 4, // 已发货
  RECEIVED = 5, // 已收货
  COMPLETED = 6, // 已完成
  CANCELLED = 7, // 已取消
  AFTER_SALE = 8, // 售后中
  TIMEOUT = 9, // 已超时（支付超时自动取消）
}

@Entity('orders')
@Index(['userId', 'createdAt'])
@Index(['orderNo'])
@Index(['status'])
@Index(['createdAt'])
export class Order {
  @PrimaryColumn({
    type: 'bigint',
    comment: '订单ID (Snowflake生成)',
  })
  id: string;

  // ----------------------
  // 基础信息
  // ----------------------
  @Column({
    unique: true,
    length: 50,
    comment: '业务订单号 (展示给用户)',
  })
  orderNo: string;

  @Column({
    type: 'tinyint',
    default: OrderStatus.PENDING_PAYMENT,
    comment:
      '订单状态 (1-待支付 2-已支付 3-待发货 4-已发货 5-已收货 6-已完成 7-已取消 8-售后中 9-已超时)',
  })
  status: OrderStatus;

  // ----------------------
  // 关联用户
  // ----------------------
  @Column({
    type: 'bigint',
    comment: '用户ID',
  })
  userId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  // ----------------------
  // 金额信息
  // ----------------------
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '订单总金额',
  })
  totalAmount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: '优惠金额',
  })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '实付金额' })
  payAmount: number;

  // ----------------------
  // 收货信息快照
  // ----------------------
  @Column({ type: 'json', comment: '收货地址快照' })
  addressSnapshot: {
    name: string;
    phone: string;
    address: string;
    province?: string;
    city?: string;
    district?: string;
    postalCode?: string;
  };

  // ----------------------
  // 支付信息
  // ----------------------
  @Column({
    nullable: true,
    length: 20,
    comment: '支付方式',
  })
  paymentMethod: string;

  @Column({ nullable: true, comment: '支付时间' })
  paidAt: Date;

  @Column({
    nullable: true,
    length: 100,
    comment: '支付流水号',
  })
  paymentNo: string;

  // ----------------------
  // 关联子订单
  // ----------------------
  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: false,
  })
  items: OrderItem[];

  @Column({
    nullable: true,
    type: 'text',
    comment: '订单备注',
  })
  remark: string;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;
}
