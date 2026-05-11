/**
 * @description 用于记录一次报告生成任务。
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('finance_report')
export class FinanceReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  merchantId: number;

  @Column()
  title: string;

  @Column()
  status: string; // pending, processing, completed, failed

  @Column({ nullable: true })
  taskId: string;

  @Column({ type: 'json', nullable: true })
  extractedData: unknown;

  @Column({ type: 'json', nullable: true })
  metrics: unknown;

  @Column({ type: 'longtext', nullable: true })
  reportMarkdown: string;

  @Column({ nullable: true })
  pdfQiniuKey: string;

  @Column({ nullable: true })
  pdfUrl: string;

  @Column({ nullable: true })
  wordQiniuKey: string;

  @Column({ nullable: true })
  wordUrl: string;

  @Column({ nullable: true })
  failReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
