import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Goods } from './goods.entity';

@Entity('goods_sku')
export class GoodsSku {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'goods_id', comment: '关联的商品(SPU)的主键ID' })
  goodsId: number;

  @ManyToOne(() => Goods, (goods) => goods.skus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goods_id' })
  goods: Goods;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'SKU具体售价',
  })
  price: number;

  @Column({ default: 0, comment: 'SKU具体库存量' })
  stock: number;

  @Column({ nullable: true, comment: 'SKU 编码 (唯一)' })
  skuCode: string;

  @Column({
    nullable: true,
    comment: 'SKU图 (用户选则红色时，商品小图可以切换)',
  })
  picture: string;

  // 用 JSON 存储这套 SKU 相关的全部规格键值组合，避免极其复杂的 Join 连表
  @Column({
    type: 'json',
    comment:
      '所选规格集合，例如: [{"name": "颜色", "value": "红"},{"name": "尺码", "value": "XXL"}]',
  })
  specs: { name: string; value: string }[];

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;
}
