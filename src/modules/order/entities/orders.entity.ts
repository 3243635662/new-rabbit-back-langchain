import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { OrderItem } from './order_items.entity'; // 订单详情

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  // ----------------------
  // 1. 基础信息
  // ----------------------
  @Column({ unique: true, comment: '订单号' })
  orderNo: string; // 如：20260325xxxx

  @Column({
    default: 1,
    comment:
      '订单状态: 1-待支付, 2-待发货, 3-待收货, 4-已完成, 5-已取消, 6-售后',
  })
  status: number;

  // ----------------------
  // 2. 关联用户
  // ----------------------
  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  // ----------------------
  // 3. 金额信息
  // ----------------------
  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '订单总金额' })
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
  // 4. 收货信息快照 (非常重要！防止用户修改地址影响历史订单)
  // ----------------------
  @Column({ type: 'json', comment: '收货地址快照 (姓名/电话/地址)' })
  addressSnapshot: {
    name: string;
    phone: string;
    address: string;
  };

  // ----------------------
  // 5. 支付信息
  // ----------------------
  @Column({ nullable: true, comment: '支付方式 (微信/支付宝等)' })
  paymentMethod: string;

  @Column({ nullable: true, comment: '支付时间' })
  paidAt: Date;

  // ----------------------
  // 6. 关联子订单
  // ----------------------
  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
