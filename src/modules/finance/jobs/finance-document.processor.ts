import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../db/redis/redis.service';
import { FinanceSourceFile } from '../entities/finance-source-file.entity';
import {
  RedisKeys,
  TaskProgressKeys,
} from '../../../common/constants/redis-key.constant';
import {
  FinanceSourceParseStatus,
  FinanceSourceProgressPhase,
  type FinanceSourceFileJobData,
} from '../../../types/finance.type';
import { VisionImageParser } from './parsers/vision-image.parser';
import { ContractParser } from './parsers/contract.parser';
import { InvoiceOcrParser } from './parsers/invoice-ocr.parser';
import { pushTaskProgress } from '../../../utils/task-progress.util';

/**
 * 财务原始文件处理 Worker（资源解析）。
 * 专门负责处理从七牛上传后的原始财务文件解析。
 *
 * 路由策略：
 *  - GENERAL_IMG → VisionImageParser（统一 LangGraph 视觉抽取流程）
 *  - INVOICE      → InvoiceOcrParser（腾讯云 OCR 发票高精度抽取流程）
 *  - CONTRACT     → ContractParser（合同文本解析 + 视觉抽取）
 */
@Injectable()
@Processor(RedisKeys.FINANCE.SOURCE_QUEUE_NAME)
export class FinanceSourceProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceSourceProcessor.name);

  constructor(
    @InjectRepository(FinanceSourceFile)
    private readonly sourceFileRepo: Repository<FinanceSourceFile>,
    private readonly redisService: RedisService,
    private readonly visionParser: VisionImageParser,
    private readonly contractParser: ContractParser,
    private readonly invoiceOcrParser: InvoiceOcrParser,
  ) {
    super();
  }

  override process = async (
    job: Job<FinanceSourceFileJobData>,
  ): Promise<void> => {
    const { sourceFileId, fileName } = job.data;
    try {
      await this.initParse(sourceFileId);

      switch (job.name) {
        // 通用图片 → 统一走视觉解析流程
        case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_GENERAL_IMG:
          await this.visionParser.parse(job, (j, p, s, m) =>
            pushTaskProgress(
              j,
              this.redisService,
              p,
              s,
              m,
              TaskProgressKeys.FINANCE_SOURCE,
            ),
          );
          break;

        // 发票 → 走腾讯云 OCR 发票高精度提取流程
        case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_INVOICE:
          await this.invoiceOcrParser.parse(job, (j, p, s, m) =>
            pushTaskProgress(
              j,
              this.redisService,
              p,
              s,
              m,
              TaskProgressKeys.FINANCE_SOURCE,
            ),
          );
          break;

        // 合同 → 走合同专属解析流程（同样走 Vision，但 docType 会是 pdf/docx）
        case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_CONTRACT:
          await this.contractParser.parse(job, (j, p, s, m) =>
            pushTaskProgress(
              j,
              this.redisService,
              p,
              s,
              m,
              TaskProgressKeys.FINANCE_SOURCE,
            ),
          );
          break;

        default:
          this.logger.warn(`未知的任务类型: ${job.name}，跳过解析`);
          return; // 未知类型不触发 finishParse
      }

      await this.finishParse(sourceFileId, fileName, job);
    } catch (e) {
      await this.handleError(job, e);
    }
  };

  /**
   * 通用解析前的初始化
   */
  private async initParse(sourceFileId: number) {
    await this.sourceFileRepo.update(
      { id: sourceFileId },
      {
        parseStatus: FinanceSourceParseStatus.PROCESSING,
        parseFailReason: null,
        isParsed: false,
      },
    );
  }

  /**
   * 通用解析后的完成处理
   */
  private async finishParse(
    sourceFileId: number,
    fileName: string,
    job: Job<FinanceSourceFileJobData>,
  ) {
    await this.sourceFileRepo.update(
      { id: sourceFileId },
      {
        parseStatus: FinanceSourceParseStatus.COMPLETED,
        parseFailReason: null,
        isParsed: true,
      },
    );
    await pushTaskProgress(
      job,
      this.redisService,
      100,
      FinanceSourceProgressPhase.COMPLETED,
      `解析完成：${fileName}`,
      TaskProgressKeys.FINANCE_SOURCE,
    );
  }

  private async handleError(job: Job<FinanceSourceFileJobData>, error: any) {
    const { sourceFileId } = job.data;
    const errMsg = (error as Error).message;
    this.logger.error(`[taskId:${job.id}] 资源解析失败: ${errMsg}`);
    await this.sourceFileRepo.update(
      { id: sourceFileId },
      {
        parseStatus: FinanceSourceParseStatus.FAILED,
        parseFailReason: errMsg,
        isParsed: false,
      },
    );
    await pushTaskProgress(
      job,
      this.redisService,
      0,
      FinanceSourceProgressPhase.FAILED,
      `解析失败: ${errMsg}`,
      TaskProgressKeys.FINANCE_SOURCE,
    );
    throw error;
  }
}
