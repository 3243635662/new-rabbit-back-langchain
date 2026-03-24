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

  @Column()
  status: number;

  @Column()
  icon: string;

  @Column()
  desc: string;
}
