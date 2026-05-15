import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fsp from 'fs/promises';
import * as path from 'path';
import {
  FinanceSourceProgressPhase,
  type FinanceSourceFileJobData,
  type FinanceSourceProgressPhaseValue,
} from '../../../../types/finance.type';
import { FinanceOcrService } from '../../services/finance-ocr.service';
import { QiniuService } from '../../../qiniu/qiniu.service';
import { FinanceExtractedRecord } from '../../entities/finance-extracted-record.entity';
import { DocType } from '../../../../types/file.type';

const PARSE_TMP_DIR = path.resolve(process.cwd(), '.parser-tmp');

@Injectable()
export class InvoiceOcrParser {
  private readonly logger = new Logger(InvoiceOcrParser.name);

  constructor(
    private readonly financeOcrService: FinanceOcrService,
    private readonly qiniuService: QiniuService,
    @InjectRepository(FinanceExtractedRecord)
    private readonly extractedRecordRepo: Repository<FinanceExtractedRecord>,
  ) {}

  async parse(
    job: Job<FinanceSourceFileJobData>,
    pushProgress: (
      job: Job<FinanceSourceFileJobData>,
      progress: number,
      status: FinanceSourceProgressPhaseValue,
      message: string,
    ) => Promise<void>,
  ) {
    const { fileName, qiniuKey, sourceFileId, docType } = job.data;
    this.logger.log(`开始处理发票文件: ${fileName}`);
    let localFilePath = '';

    try {
      // 0. 检查文件大小 (OCR 最大支持 10MB Base64, 约 7.5MB 原图)
      await pushProgress(
        job,
        5,
        FinanceSourceProgressPhase.PARSING,
        '正在检查文件信息...',
      );

      const fileStat = await this.qiniuService.statFile(qiniuKey);
      if (!fileStat) {
        throw new Error('无法获取云端文件信息，文件可能不存在');
      }

      // 限制 7MB，留出一定的 Base64 膨胀余量
      if (fileStat.fsize > 7 * 1024 * 1024) {
        throw new Error(
          `文件大小超过限制 (约 7MB), 实际大小: ${Math.round(fileStat.fsize / 1024)}KB`,
        );
      }

      // 1. 下载文件
      await pushProgress(
        job,
        10,
        FinanceSourceProgressPhase.PARSING,
        '正在从云端下载文件...',
      );

      const ext = path.extname(qiniuKey) || '.jpg';
      const tmpDir = path.join(PARSE_TMP_DIR, `${job.id || Date.now()}`);
      await fsp.mkdir(tmpDir, { recursive: true });
      localFilePath = path.join(
        tmpDir,
        `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
      );

      await this.qiniuService.downloadToLocal(qiniuKey, localFilePath);

      // 2. 调用 OCR
      await pushProgress(
        job,
        40,
        FinanceSourceProgressPhase.EXTRACTING,
        '正在调用腾讯 OCR 进行发票识别...',
      );

      const isPdf = docType === DocType.PDF;
      const ocrResult = await this.financeOcrService.recognizeVatInvoice({
        localPath: localFilePath,
        isPdf,
        pdfPageNumber: 1, // 当前仅支持解析第一页
      });

      if (!ocrResult.record) {
        throw new Error(
          ocrResult.warnings.join('; ') || '未能识别出发票有效信息',
        );
      }

      // 3. 数据落库
      await pushProgress(
        job,
        80,
        FinanceSourceProgressPhase.PERSISTING,
        '正在保存结构化发票数据...',
      );

      // 日期格式化助手：处理 "2025年05月20日" 等中文字符串
      const normalizeDate = (input?: string | null): Date | undefined => {
        if (!input) return undefined;
        const m = input.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (m) {
          const [, y, mo, d] = m;
          return new Date(
            `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`,
          );
        }
        const date = new Date(input);
        return isNaN(date.getTime()) ? undefined : date;
      };

      const recordEntity = this.extractedRecordRepo.create({
        sourceFileId: sourceFileId,
        occurredAt: normalizeDate(ocrResult.record.date),
        amount:
          ocrResult.record.amount != null
            ? String(ocrResult.record.amount)
            : undefined,
        taxAmount:
          ocrResult.record.taxAmount != null
            ? String(ocrResult.record.taxAmount)
            : undefined,
        totalAmount:
          ocrResult.record.totalAmount != null
            ? String(ocrResult.record.totalAmount)
            : undefined,
        taxRate:
          ocrResult.record.taxRate != null
            ? String(ocrResult.record.taxRate)
            : undefined,
        currency: 'CNY',
        counterparty: ocrResult.record.counterparty || '',
        category: ocrResult.record.category || '',
        documentNo: ocrResult.record.invoiceNo || '',
        confidence: String(ocrResult.record.confidence),
        summary: ocrResult.record.summary,
        raw: ocrResult,
      });

      await this.extractedRecordRepo.save(recordEntity);
    } finally {
      // 4. 清理本地临时文件目录
      if (localFilePath) {
        const tmpDir = path.dirname(localFilePath);
        try {
          await fsp.rm(tmpDir, { recursive: true, force: true });
          this.logger.log(`[taskId:${job.id}] 临时目录已清理: ${tmpDir}`);
        } catch (err) {
          this.logger.warn(`清理临时文件失败: ${tmpDir}`, err);
        }
      }
    }
  }
}
