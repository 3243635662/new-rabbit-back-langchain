import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Role } from '../../role/entities/role.entity';
import { Address } from '../../address/entities/address.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true, nullable: false, comment: '用户名' })
  username: string;

  @Column({ select: false })
  password: string;

  @Column({
    default:
      'https://www.dhs.tsinghua.edu.cn/wp-content/uploads/2025/03/2025031301575583.jpeg',
    comment: '头像',
  })
  avatar: string;

  @Column({ default: 2, comment: '角色的 ID' })
  roleId: number;

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'roleId' })
  role: Role;

  @Column({ type: 'tinyint', default: 1, comment: '用户状态：1-启用，0-禁用' })
  active: number;

  /**
   * 地区编码 (如：省市区编码)
   * 注意：具体送货地址关联在 Address 表中
   */
  @Column({ nullable: true, comment: '地区编码' })
  areaId: number;

  @Column({ length: 255, default: '', unique: true, comment: '电子邮箱' })
  email: string;

  @Column({ length: 255, default: '无', comment: '备注' })
  remark: string;

  // 1. 与地址表建立双向关联
  @OneToMany(() => Address, (address) => address.user)
  addresses: Address[];

  // 2. 与商家表建立一对一反向关联
  @OneToOne(() => Merchant, (merchant) => merchant.user)
  merchant: Merchant;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn() // 乐观锁：每次更新时版本号会自动 +1
  version: number;
}
