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
  type FinanceSourceProgressPhaseValue,
} from '../../../types/finance.type';
import { GeneralImgParser } from './parsers/general-img.parser';
import { InvoiceOcrParser } from './parsers/invoice-ocr.parser';
import { ContractParser } from './parsers/contract.parser';

/**
 * 财务原始文件处理 Worker（资源解析）。
 * 专门负责处理从七牛上传后的原始财务文件解析。
 */
@Injectable()
@Processor(RedisKeys.FINANCE.SOURCE_QUEUE_NAME)
export class FinanceSourceProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceSourceProcessor.name);

  constructor(
    @InjectRepository(FinanceSourceFile)
    private readonly sourceFileRepo: Repository<FinanceSourceFile>,
    private readonly redisService: RedisService,
    private readonly generalImgParser: GeneralImgParser,
    private readonly invoiceOcrParser: InvoiceOcrParser,
    private readonly contractParser: ContractParser,
  ) {
    super();
  }

  // 统一进度推送函数
  private pushProgress = async (
    job: Job<FinanceSourceFileJobData>,
    progress: number,
    status: FinanceSourceProgressPhaseValue,
    message: string,
  ) => {
    const taskId = String(job.id);
    const payload = { progress, status, message };
    await job.updateProgress(progress);
    await this.redisService.publishTaskProgress(
      TaskProgressKeys.FINANCE_SOURCE,
      taskId,
      payload,
    );
    await this.redisService.setTaskProgressCache(
      TaskProgressKeys.FINANCE_SOURCE,
      taskId,
      payload,
    );
  };

  override process = async (
    job: Job<FinanceSourceFileJobData>,
  ): Promise<void> => {
    const { sourceFileId, fileName } = job.data;
    try {
      await this.initParse(sourceFileId);

      switch (job.name) {
        case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_GENERAL_IMG:
          await this.generalImgParser.parse(job, this.pushProgress);
          break;
        case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_INVOICE:
          await this.invoiceOcrParser.parse(job, this.pushProgress);
          break;
        case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_CONTRACT:
          await this.contractParser.parse(job, this.pushProgress);
          break;
        default:
          this.logger.warn(`未知的任务类型: ${job.name}`);
      }

      // 如果有特殊需求，可以判断未知的任务类型时不执行 finishParse
      // 目前为了保证队列状态流转正常，暂且照旧 finishParse
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
    await this.pushProgress(
      job,
      100,
      FinanceSourceProgressPhase.COMPLETED,
      `解析完成：${fileName}`,
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
    await this.pushProgress(
      job,
      0,
      FinanceSourceProgressPhase.FAILED,
      `解析失败: ${errMsg}`,
    );
    throw error;
  }
}
