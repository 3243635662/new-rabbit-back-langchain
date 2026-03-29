import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Goods } from './goods.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';
@Entity('categories')
export class Categories {
  @PrimaryGeneratedColumn({})
  id: number;

  @Column({ length: 255, nullable: true })
  name: string;

  @Column({ default: 0 })
  //   父分类id
  pid: number;

  @Column({ default: true, comment: '分类状态:true-启用,false-禁用' })
  status: boolean;

  @Column({ nullable: true })
  picture: string;

  @Column({ nullable: true })
  saleInfo: string;

  @OneToMany(() => Goods, (goods) => goods.category)
  goods: Goods[];

  @Column({ nullable: true, comment: '所属商家ID' })
  merchantId: number;

  @ManyToOne(() => Merchant, (merchant) => merchant.categories)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;
}
