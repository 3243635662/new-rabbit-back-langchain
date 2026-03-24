import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Role } from '../../role/entities/role.entity';
import { User } from '../../user/entities/user.entity';
import { Goods } from '../../goods/entities/goods.entity';

@Entity('merchant')
export class Merchant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, nullable: false, comment: '商户名称' })
  name: string;

  @Column({ length: 255, nullable: false, comment: '商户地址' })
  address: string;

  @Column({ length: 255, nullable: false, comment: '商户邮箱' })
  email: string;

  @Column({
    length: 255,
    default:
      'https://img2.baidu.com/it/u=2189235222,3353969295&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=500',
    comment: '商户头像',
  })
  avatar: string;

  @Column({ default: 2, comment: '角色的 ID' })
  roleId: number;

  @ManyToOne(() => Role, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'roleId' })
  role: Role;

  @Column({ nullable: true, comment: '地区编码' })
  areaId: number;

  @Column()
  remark: string;

  @Column({ nullable: true, comment: '用户ID' })
  userId: string;
  // 与用户表的一对一关联
  @OneToOne(() => User, (user) => user.merchant)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Goods, (goods) => goods.merchant)
  goods: Goods[];
}
