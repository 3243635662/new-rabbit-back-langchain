import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Coupon } from './coupon.entity';
import { User } from '../../user/entities/user.entity';

@Entity('user_coupon')
export class UserCoupon {
  @PrimaryGeneratedColumn()
  id: number;

  // ----------------------
  // 1. 关联关系
  // ----------------------
  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column()
  couponId: number;

  @ManyToOne(() => Coupon)
  @JoinColumn({ name: 'couponId' })
  coupon: Coupon; // 关联模板，用于查询具体的优惠规则

  // ----------------------
  // 2. 状态管理
  // ----------------------
  @Column({
    type: 'enum',
    enum: ['UNUSED', 'USED', 'EXPIRED'],
    default: 'UNUSED',
    comment: '状态: UNUSED-未使用, USED-已使用, EXPIRED-已过期',
  })
  status: string;

  // 订单使用后，记录订单ID，防止重复使用，也方便反查
  @Column({ nullable: true, comment: '使用的订单ID' })
  orderId: number;

  // ----------------------
  // 3. 有效期 (冗余字段，防止模板修改影响已领取的券)
  // ----------------------
  @Column({ type: 'timestamp', comment: '过期时间' })
  expireTime: Date;

  @CreateDateColumn()
  createdAt: Date;
}
