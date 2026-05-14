/**
 * @description 做趋势分析、同比环比、发票明细查询，建议单独建表存提取后的明细。
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

@Entity('finance_extracted_record')
export class FinanceExtractedRecord {
  @PrimaryGeneratedColumn({
    comment: '主键，示例：1',
  })
  id: number;

  @Column({
    nullable: true,
    comment: '来源文件 ID，示例：88',
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
    comment: '业务发生日期（发票日期/签约日期等），示例：2026-05-01',
  })
  occurredAt: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '不含税或主要金额（合同金额等），示例：1000.00',
  })
  amount: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '税额，示例：60.00',
  })
  taxAmount: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '含税总额或最终金额，示例：1060.00',
  })
  totalAmount: string;

  @Column({
    default: 'CNY',
    comment: '币种，示例：CNY',
  })
  currency: string;

  @Column({
    nullable: true,
    comment: '交易对方（供应商/合同对方公司），示例：某某供应商',
  })
  counterparty: string;

  @Column({
    nullable: true,
    comment: '收入或支出分类，示例：办公用品',
  })
  category: string;

  @Column({
    nullable: true,
    comment: '单据编号（发票号码/合同编号等），示例：12345678',
  })
  documentNo: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '文字提取摘要或正文内容（适用于合同、通用图片）',
  })
  summary: string;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
    nullable: true,
    comment: 'AI 提取置信度，示例：0.91',
  })
  confidence: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: '特定类型的专属数据存放地，示例：{...}',
  })
  raw: unknown;

  @CreateDateColumn()
  createdAt: Date;
}
