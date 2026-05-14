/**
 * @description 用于记录商家上传的原始文件。
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { FinanceExtractedRecord } from './finance-extracted-record.entity';
import { FinanceSourceParseStatus } from '../../../types/finance.type';

@Entity('finance_source_file')
export class FinanceSourceFile {
  @PrimaryGeneratedColumn({
    comment: '主键',
  })
  id: number;

  @Column({
    comment: '商户 ID，用于权限隔离',
  })
  merchantId: number;

  @Column({
    nullable: true,
    comment: 'BullMQ 任务 ID',
  })
  taskId: string;

  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @OneToMany(() => FinanceExtractedRecord, (record) => record.sourceFile)
  extractedRecords: FinanceExtractedRecord[];

  @Column({
    comment: '文件名称，示例：2026年5月发票.pdf',
  })
  fileName: string;

  @Column({
    comment: '文件 MIME 类型，示例：application/pdf',
  })
  mimeType: string;

  @Column({
    comment: '文件大小（字节），示例：204800',
  })
  fileSize: number;

  @Column({
    comment: '七牛云文件 key，示例：finance/source/12/1715400000000-file.pdf',
  })
  qiniuKey: string;

  @Column({
    comment: '文件访问地址，示例：https://cdn.xxx.com/.../file.pdf',
  })
  qiniuUrl: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '业务资源类型：img / invoice / contract',
  })
  sourceType: string;

  @Column({
    type: 'enum',
    enum: FinanceSourceParseStatus,
    default: FinanceSourceParseStatus.PENDING,
    comment: '解析流水线状态',
  })
  parseStatus: FinanceSourceParseStatus;

  @Column({
    type: 'varchar',
    length: 2000,
    nullable: true,
    comment: '解析失败原因（成功时为 null）',
  })
  parseFailReason: string | null;

  @Column({
    comment: '是否已解析成功（与 parseStatus===completed 同步，便于旧查询）',
    default: false,
  })
  isParsed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
