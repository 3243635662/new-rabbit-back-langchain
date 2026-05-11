/**
 * @description 做趋势分析、同比环比、发票明细查询，建议单独建表存提取后的明细。
 */

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('finance_extracted_record')
export class FinanceExtractedRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reportId: number;

  @Column()
  merchantId: number;

  @Column()
  recordType: string; // invoice, revenue, expense, refund, tax, other

  @Column({ nullable: true })
  occurredAt: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: string;

  @Column({ nullable: true })
  currency: string;

  @Column({ nullable: true })
  counterparty: string;

  @Column({ nullable: true })
  category: string;

  @Column({ type: 'json', nullable: true })
  raw: unknown;
}
