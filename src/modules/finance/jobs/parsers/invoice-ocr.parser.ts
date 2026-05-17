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

      const record = ocrResult.record;

      // 优化：直接从 OCR 结果构建结构化字段，避免二次映射
      // 将 OCR 服务已提取的字段转换为标准化格式
      const structuredFields: Array<{
        name: string;
        desc: string;
        value: unknown;
        confidence: number;
      }> = [];

      if (record) {
        // 字段中文描述映射（覆盖腾讯云 OCR 返回的所有字段）
        const descMap: Record<string, string> = {
          // 基础信息
          invoiceCode: '发票代码',
          invoiceNo: '发票号码',
          date: '开票日期',
          invoiceType: '发票类型',

          // 金额相关
          amount: '金额（不含税）',
          taxAmount: '税额',
          totalAmount: '价税合计',
          taxRate: '税率',

          // 购买方信息
          buyer: '购方名称',
          buyerTaxId: '购方纳税人识别号',
          buyerAddressPhone: '购方地址电话',
          buyerBankInfo: '购方开户行及账号',

          // 销售方信息
          seller: '销方名称',
          sellerTaxId: '销方纳税人识别号',
          sellerAddressPhone: '销方地址电话',
          sellerBankInfo: '销方开户行及账号',

          // 其他信息
          category: '分类',
          counterparty: '交易对方',
          summary: '摘要',
          remark: '备注',
          payee: '收款人',
          checker: '复核人',
          issuer: '开票人',
          serviceType: '服务类型',
          recordType: '记录类型',
        };

        for (const [key, val] of Object.entries(record)) {
          if (val !== null && val !== undefined && val !== '') {
            structuredFields.push({
              name: key,
              desc: descMap[key] || key,
              value: val as unknown,
              confidence: 0.95,
            });
          }
        }
      }

      // 补充：将腾讯云 OCR 原始返回的 VatInvoiceInfos 也存入 fields
      // 这样不会丢失任何原始信息
      if (ocrResult.fields && typeof ocrResult.fields === 'object') {
        for (const [key, val] of Object.entries(
          ocrResult.fields as Record<string, unknown>,
        )) {
          if (val && !structuredFields.some((f) => f.name === key)) {
            structuredFields.push({
              name: key,
              desc: key,
              value: val as unknown,
              confidence: 0.9,
            });
          }
        }
      }

      const jsonOutput = {
        document_type: 'invoice',
        summary: record?.summary || '发票OCR识别结果',
        process_time: new Date().toISOString(),
        structured_fields: structuredFields,
        // 保存完整的 OCR 原始返回，用于审计和二次分析
        raw_ocr_response: ocrResult.rawResponse || null,
        items: ocrResult.items || [],
      };

      // ❌ 不再设置 fields，raw.structured_fields 已包含
      const recordEntity = this.extractedRecordRepo.create({
        sourceFileId: sourceFileId,
        recordType: 'invoice',
        raw: jsonOutput,
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
