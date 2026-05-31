import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { IngestStatus } from '../../../types/rag.type';
import { DocType } from '../../../types/file.type';
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

  @Column({ comment: '商户 ID', nullable: true, default: 0 })
  merchantId: number | null;

  @ManyToOne(() => Merchant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant | null;

  @CreateDateColumn({ comment: '上传时间' })
  createdAt: Date;
}
export { DocType, IngestStatus };
