import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Goods } from './goods.entity';
@Entity('goods_info')
export class GoodsInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  goodsId: number;

  @ManyToOne(() => Goods, (goods) => goods.goodsInfo)
  @JoinColumn({ name: 'goodsId' })
  goods: Goods;

  @Column({ default: 0, comment: '销量' })
  salesCount: number;

  @Column({ default: 0, comment: '评论数' })
  commentCount: number;

  @Column({ default: 0, comment: '收藏数' })
  collectCount: number;

  @Column({
    type: 'simple-array',
    nullable: true,
    comment: '商品展示的小图数组',
  })
  smallPictures: string[];

  @Column({
    type: 'simple-array',
    nullable: true,
    comment: '商品展示的大图数组',
  })
  bigPictures: string[];

  @Column({ nullable: true, comment: '商品推荐视频' })
  videoUrl: string;
}
