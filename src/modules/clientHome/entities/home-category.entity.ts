import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('home_categories')
export class HomeCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ comment: '主标题' })
  main: string;

  @Column({ comment: '子标题' })
  sub: string;

  @Column({ default: 0, comment: '排序值' })
  sort: number;

  @Column({ default: true, comment: '是否可用' })
  isActive: boolean;
}
