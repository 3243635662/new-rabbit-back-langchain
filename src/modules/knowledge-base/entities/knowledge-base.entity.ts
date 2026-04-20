import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';

export enum DocType {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
}

export enum IngestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('knowledge_base')
export class KnowledgeBase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ comment: '文件名' })
  fileName: string;

  @Column({ type: 'enum', enum: DocType, comment: '文档类型' })
  docType: DocType;

  @Column({ comment: '原始 MIME 类型' })
  mimeType: string;

  @Column({ comment: '文件大小 (bytes)' })
  fileSize: number;

  @Column({ comment: '七牛云存储 key' })
  qiniuKey: string;

  @Column({ type: 'varchar', nullable: true, comment: '七牛云访问 URL' })
  qiniuUrl: string | null;

  @Column({ default: 0, comment: '向量化片段数' })
  chunkCount: number;

  @Column({
    type: 'enum',
    enum: IngestStatus,
    default: IngestStatus.PENDING,
    comment: '向量化状态',
  })
  status: IngestStatus;

  @Column({ type: 'varchar', nullable: true, comment: '失败原因' })
  failReason: string | null;

  @Column({ type: 'varchar', nullable: true, comment: 'BullMQ 任务 ID' })
  taskId: string | null;

  @Column({ comment: '商户 ID' })
  merchantId: number;

  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @CreateDateColumn({ comment: '上传时间' })
  createdAt: Date;
}
