import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('coupon')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  // ----------------------
  // 1. 基础信息
  // ----------------------
  @Column({ length: 100, comment: '优惠券名称' })
  name: string;

  // ----------------------
  // 2. 类型与金额 (核心逻辑)
  // ----------------------
  @Column({
    type: 'enum',
    enum: ['FULL_REDUCTION', 'DISCOUNT', 'NO_THRESHOLD'], // 满减、打折、无门槛
    comment: '优惠券类型',
  })
  type: string;

  // 优惠值：
  // - 如果是满减/无门槛，存金额（如 10.00）
  // - 如果是打折，存折扣率（如 0.88 表示88折，或存 8.8，业务层处理）
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '优惠值(金额或折扣率)',
  })
  value: number;

  // 门槛金额：
  // - 满减券需要设置（如满100）
  // - 打折券/无门槛券设为0即可
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: '最低消费门槛',
  })
  minAmount: number;

  // ----------------------
  // 3. 适用范围 (解决专用券问题)
  // ----------------------
  @Column({
    type: 'enum',
    enum: ['ALL', 'CATEGORY', 'GOODS'],
    default: 'ALL',
    comment: '适用范围: ALL-全场, CATEGORY-某分类, GOODS-某商品',
  })
  scopeType: string;

  // 存储关联的ID数组，例如 [1, 2] (分类ID) 或 [101] (商品ID)
  // 使用 simple-array 类型，TypeORM 会自动将数组转为 "1,2,3" 存储
  @Column({
    type: 'simple-array',
    nullable: true,
    comment: '关联的分类或商品ID列表',
  })
  scopeIds: number[];

  // ----------------------
  // 4. 库存与限制 (解决秒杀券问题)
  // ----------------------
  @Column({ type: 'int', comment: '发行总量' })
  total: number;

  @Column({ type: 'int', default: 0, comment: '已领取数量' })
  claimedCount: number; // 用于判断是否领光

  @Column({ type: 'int', default: 1, comment: '每人限领数量' })
  limitPerUser: number;

  // ----------------------
  // 5. 有效期
  // ----------------------
  @Column({ type: 'timestamp', comment: '生效开始时间' })
  startTime: Date;

  @Column({ type: 'timestamp', comment: '生效结束时间' })
  endTime: Date;

  // ----------------------
  // 6. 状态
  // ----------------------
  @Column({ default: false, comment: '是否启用' })
  status: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
