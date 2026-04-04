import { Column, Entity, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Goods } from './goods.entity';

@Entity('brands')
export class Brands {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, comment: '品牌名称' })
  name: string;

  @Column({ nullable: true, comment: '品牌图片' })
  picture: string;

  @OneToMany(() => Goods, (goods) => goods.brandRelation)
  goods: Goods[];
}
