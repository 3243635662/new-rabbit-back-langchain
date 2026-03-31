import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Menu {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column()
  path: string;

  @Column()
  redirect: string;

  @Column()
  meta: string;

  @Column()
  pid: number;

  @Column({ default: true, comment: '菜单状态' })
  status: boolean;

  @Column()
  icon: string;

  @Column({ default: '', comment: '描述' })
  desc: string;

  @Column({ default: 0, comment: '排序' })
  sort: number;
}
