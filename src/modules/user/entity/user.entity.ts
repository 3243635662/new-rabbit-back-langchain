import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20, nullable: false })
  username: string;

  @Column()
  password: string;

  @Column()
  avatar: string;
  @Column({ length: 50, default: 'user' })
  role: string;

  @Column({ type: 'tinyint', default: 1 })
  active: number;

  @Column({ nullable: true })
  areaId: number;
  @Column({ length: 255, default: '', unique: true })
  email: string;
  @Column({ length: 255, default: '无' })
  remark: string;
  // ⏰ 创建时间：自动设置，无需手动处理
  @CreateDateColumn()
  created_at: Date;

  // 🔄 更新时间：自动更新，无需手动处理
  @UpdateDateColumn()
  updated_at: Date;
}
