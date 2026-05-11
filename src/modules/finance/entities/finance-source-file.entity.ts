/**
 *@description 用于记录商家上传的原始文件。
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('finance_source_file')
export class FinanceSourceFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  merchantId: number;

  @Column()
  fileName: string;

  @Column()
  mimeType: string;

  @Column()
  fileSize: number;

  @Column()
  qiniuKey: string;

  @Column()
  qiniuUrl: string;
  // 业务文件类型，不等同于 MIME
  @Column()
  fileType: string; // invoice_image, invoice_pdf, csv, excel, word, pdf_report

  @CreateDateColumn()
  createdAt: Date;
}
