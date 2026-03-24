import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('address')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ----------------------
  // 1. 关联用户 (增强索引)
  // ----------------------
  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.addresses)
  @JoinColumn({ name: 'userId' })
  user: User;

  // ----------------------
  // 2. 收货人信息
  // ----------------------
  @Column({ length: 50, comment: '收货人姓名' })
  name: string;

  @Index() // 手机号通常用于搜索订单和地址，建议加索引
  @Column({ length: 20, comment: '收货人手机号' })
  phone: string;

  // ----------------------
  // 3. 地区信息 (编码 + 名称 双存储)
  // ----------------------

  @Column({ length: 20, name: 'province_code', comment: '省编码' })
  provinceCode: string;

  @Column({ length: 50, name: 'province_name', comment: '省名称' })
  provinceName: string;

  @Column({ length: 20, name: 'city_code', comment: '市编码' })
  cityCode: string;

  @Column({ length: 50, name: 'city_name', comment: '市名称' })
  cityName: string;

  @Column({ length: 20, name: 'district_code', comment: '区/县编码' })
  districtCode: string;

  @Column({ length: 50, name: 'district_name', comment: '区/县名称' })
  districtName: string;

  @Column({
    length: 20,
    name: 'street_code',
    nullable: true,
    comment: '街道编码',
  })
  streetCode: string;

  @Column({
    length: 50,
    name: 'street_name',
    nullable: true,
    comment: '街道名称',
  })
  streetName: string;

  // ----------------------
  // 4. 详细地址
  // ----------------------
  @Column({ type: 'varchar', length: 255, comment: '详细地址' })
  detail: string;

  // ----------------------
  // 5. 状态与标记
  // ----------------------
  @Column({
    type: 'boolean',
    default: false,
    name: 'is_default',
    comment: '是否默认地址',
  })
  isDefault: boolean;

  @Column({ length: 20, nullable: true, comment: '地址标签：家、公司、学校' })
  label: string;

  // ----------------------
  // 6. 基础字段 (规范化小驼峰)
  // ----------------------
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
