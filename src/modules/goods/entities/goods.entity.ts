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
import { GoodsSku } from './goods_sku.entity';

@Entity('goods')
export class Goods {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, nullable: false, comment: '商品名称' })
  name: string;

  @Column({ length: 255, nullable: false, comment: '商品描述' })
  description: string;

  @Column({ nullable: true, comment: '商品主图' })
  mainPicture: string;

  @Column({ length: 50, nullable: true, comment: '品牌名称' })
  brand: string;

  @Column({ default: 0, comment: '库存预警值' })
  warningStock: number;

  @Column({ nullable: true, comment: '商品分类ID' })
  categoryId: number;

  // *关联所属分类
  @ManyToOne(() => Categories, (category) => category.goods)
  @JoinColumn({ name: 'categoryId' })
  category: Categories;

  // *关联商品规格
  @OneToMany(() => Spec, (spec) => spec.goods)
  specs: Spec[];

  @Column({ default: true, comment: '状态:true-启用,false-禁用' })
  status: boolean;

  @Column({ nullable: true, comment: '商户ID' })
  merchantId: number;

  // *所属商家
  @ManyToOne(() => Merchant)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  //*商品详情
  @OneToOne(() => GoodsInfo, (goodsInfo) => goodsInfo.goods)
  goodsInfo: GoodsInfo;

  //*关联商品具体所有的 SKU 集合
  @OneToMany(() => GoodsSku, (sku) => sku.goods)
  skus: GoodsSku[];
}
