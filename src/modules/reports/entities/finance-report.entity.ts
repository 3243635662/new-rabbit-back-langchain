/**
 * @description 用于记录一次报告生成任务。
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';

@Entity('finance_report')
export class FinanceReport {
  @PrimaryGeneratedColumn({
    comment: '报告主键，示例：1001',
  })
  id: number;

  @Column({
    comment: '商户 ID，用于权限隔离，示例：12',
  })
  merchantId: number;

  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @Column({
    comment: '报告标题，示例：2026年5月财务分析报告',
  })
  title: string;

  @Column({
    comment: '报告生成状态：pending / processing / completed / failed',
  })
  status: string;

  @Column({
    nullable: true,
    comment: 'BullMQ 任务 ID，示例：58',
  })
  taskId: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'AI 提取出的结构化财务数据，示例：{ records: [...] }',
  })
  extractedData: unknown;

  @Column({
    type: 'json',
    nullable: true,
    comment: '系统计算出的财务指标，示例：{ totalIncome: 10000 }',
  })
  metrics: unknown;

  @Column({
    type: 'longtext',
    nullable: true,
    comment: '生成的报告正文（Markdown 格式），示例：# 财务情况分析报告...',
  })
  reportMarkdown: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: '用户选择的报告类型列表，示例：["overview", "profit"]',
  })
  reportTypes: string[];

  @Column({
    nullable: true,
    comment: 'PDF 文件在七牛云的 key，示例：finance/reports/12/1001/report.pdf',
  })
  pdfQiniuKey: string;

  @Column({
    nullable: true,
    comment: 'PDF 下载或访问地址，示例：https://cdn.xxx.com/.../report.pdf',
  })
  pdfUrl: string;

  @Column({
    nullable: true,
    comment:
      'Word 文件在七牛云的 key，示例：finance/reports/12/1001/report.docx',
  })
  wordQiniuKey: string;

  @Column({
    nullable: true,
    comment: 'Word 下载或访问地址，示例：https://cdn.xxx.com/.../report.docx',
  })
  wordUrl: string;

  @Column({
    nullable: true,
    comment: '失败原因，示例：PDF解析失败',
  })
  failReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
