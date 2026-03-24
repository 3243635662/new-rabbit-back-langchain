import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Goods } from './goods.entity';
@Entity('categories')
export class Categories {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, nullable: true })
  name: string;

  @Column({ default: 0 })
  //   父分类id
  pid: number;

  @Column({ default: 1 })
  status: number; // 分类状态：1-启用，0-禁用

  @Column({ nullable: true })
  picture: string;

  @Column({ nullable: true })
  saleInfo: string;

  @OneToMany(() => Goods, (goods) => goods.category)
  goods: Goods[];
}
