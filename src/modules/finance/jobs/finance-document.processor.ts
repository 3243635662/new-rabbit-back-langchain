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
import { DocType } from '../../../types/file.type';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  ) {
    super();
  }

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
    switch (job.name) {
      case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_PDF:
        await this.handlePdf(job);
        break;
      case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_IMAGE:
        await this.handleImage(job);
        break;
      case RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_DOCX:
        await this.handleDocx(job);
        break;
      default:
        // 如果是通用任务名或不匹配，走通用解析
        await this.handleGeneral(job);
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
  private async finishParse(sourceFileId: number, fileName: string, job: Job) {
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

  /**
   * 处理 PDF 财务文件
   */
  private async handlePdf(job: Job<FinanceSourceFileJobData>) {
    const { sourceFileId, fileName } = job.data;
    this.logger.log(`开始处理 PDF 财务文件: ${fileName}`);

    try {
      await this.initParse(sourceFileId);
      await this.pushProgress(
        job,
        10,
        FinanceSourceProgressPhase.PARSING,
        '正在提取 PDF 文本与表格...',
      );
      await sleep(1000);
      await this.finishParse(sourceFileId, fileName, job);
    } catch (e) {
      await this.handleError(job, e);
    }
  }

  /**
   * 处理图片财务文件（发票/收据）
   */
  private async handleImage(job: Job<FinanceSourceFileJobData>) {
    const { sourceFileId, fileName } = job.data;
    this.logger.log(`开始处理图片财务文件: ${fileName}`);

    try {
      await this.initParse(sourceFileId);
      await this.pushProgress(
        job,
        10,
        FinanceSourceProgressPhase.PARSING,
        '正在进行 OCR 识别...',
      );
      await sleep(1500);
      await this.finishParse(sourceFileId, fileName, job);
    } catch (e) {
      await this.handleError(job, e);
    }
  }

  /**
   * 处理 Word/Docx 财务文件
   */
  private async handleDocx(job: Job<FinanceSourceFileJobData>) {
    const { sourceFileId, fileName } = job.data;
    this.logger.log(`开始处理 Word 财务文件: ${fileName}`);

    try {
      await this.initParse(sourceFileId);
      await this.pushProgress(
        job,
        10,
        FinanceSourceProgressPhase.PARSING,
        '正在解析 Word 文档结构...',
      );
      await sleep(800);
      await this.finishParse(sourceFileId, fileName, job);
    } catch (e) {
      await this.handleError(job, e);
    }
  }

  /**
   * 通用解析处理
   */
  private async handleGeneral(job: Job<FinanceSourceFileJobData>) {
    const { sourceFileId, fileName } = job.data;
    try {
      await this.initParse(sourceFileId);
      await this.pushProgress(
        job,
        50,
        FinanceSourceProgressPhase.PARSING,
        '正在进行常规解析...',
      );
      await sleep(500);
      await this.finishParse(sourceFileId, fileName, job);
    } catch (e) {
      await this.handleError(job, e);
    }
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
