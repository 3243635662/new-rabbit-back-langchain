import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Categories } from './categories.entity';
import { Spec } from './spec.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { GoodsInfo } from './goodInfo.entity';

@Entity('goods')
export class Goods {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, nullable: false, comment: '商品名称' })
  name: string;

  @Column({ length: 255, nullable: false, comment: '商品描述' })
  description: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    comment: '商品价格',
  })
  price: number;

  @Column({ nullable: true, comment: '商品分类ID' })
  categoryId: number;

  // *关联所属分类
  @ManyToOne(() => Categories, (category) => category.goods)
  @JoinColumn({ name: 'categoryId' })
  category: Categories;

  // *关联商品规格
  @OneToMany(() => Spec, (spec) => spec.goods)
  specs: Spec[];

  @Column({ default: 0, comment: '排序' })
  orderNum: number;

  @Column({ default: 1, comment: '状态:1-启用,0-禁用' })
  status: number;

  @Column({ nullable: true, comment: '商户ID' })
  merchantId: number;

  // *所属商家
  @ManyToOne(() => Merchant)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  //*商品详情
  @OneToOne(() => GoodsInfo, (goodsInfo) => goodsInfo.goods)
  goodsInfo: GoodsInfo[];
}
