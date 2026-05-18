/**
 * @description 通用图片/文档解析结果实体 - 所有提取的字段统一存储到 fields 或 raw JSON 中
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FinanceSourceFile } from './finance-source-file.entity';

export interface ExtractedField {
  name: string;
  desc: string;
  value: unknown;
  confidence?: number;
}

@Entity('finance_extracted_record')
export class FinanceExtractedRecord {
  @PrimaryGeneratedColumn({
    comment: '主键',
  })
  id: number;

  @Column({
    nullable: true,
    comment: '来源文件 ID',
  })
  sourceFileId: number;

  @ManyToOne(() => FinanceSourceFile, (file) => file.extractedRecords, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'sourceFileId' })
  sourceFile: FinanceSourceFile;

  @Column({
    nullable: true,
    comment: '记录类型（用于分类）：invoice / contract / general_image 等',
  })
  recordType: string;

  @Column({
    type: 'json',
    nullable: true,
    comment:
      '原始解析结果（腾讯云 OCR 等第三方 API 的原始返回），用于追溯和审计',
  })
  raw: Record<string, unknown>;

  @CreateDateColumn({
    comment: '创建时间',
  })
  createdAt: Date;
}
