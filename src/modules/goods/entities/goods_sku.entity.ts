import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Goods } from './goods.entity';
import { Inventory } from '../../inventory/entities/inventory.entity';

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

  // 库存已迁移到 inventory 表，通过 inventory 关联获取
  @OneToOne(() => Inventory, (inventory) => inventory.sku)
  inventory: Inventory;

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

  @Column({ default: false, comment: '是否上架' })
  isLaunching: boolean;
  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;
}
