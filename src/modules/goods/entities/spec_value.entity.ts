import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Spec } from './spec.entity';

@Entity('spec_value')
export class SpecValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, comment: '规格值（如：红色、XL）' })
  value: string;

  @Column({ nullable: true, comment: '规格预览图 (用于在选择按钮上显示小图)' })
  picture: string; // <--- 新增这个字段
  // 关联到规格维度表
  @Column({ name: 'spec_id' })
  specId: number;

  @ManyToOne(() => Spec, (spec) => spec.values)
  @JoinColumn({ name: 'spec_id' })
  spec: Spec;
}
