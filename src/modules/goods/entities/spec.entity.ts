import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SpecValue } from './spec_value.entity'; // 引入下面的新实体
import { Goods } from './goods.entity';

@Entity('spec')
export class Spec {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, comment: '规格名称（如：颜色、尺码）' })
  name: string;

  @Column({ name: 'goods_id', comment: '关联的商品ID' })
  goodsId: number;

  @ManyToOne(() => Goods, (goods) => goods.specs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goods_id' })
  goods: Goods;

  // 一个规格名（如颜色）对应多个规格值（红、蓝...）
  @OneToMany(() => SpecValue, (specValue) => specValue.spec)
  values: SpecValue[];
}
