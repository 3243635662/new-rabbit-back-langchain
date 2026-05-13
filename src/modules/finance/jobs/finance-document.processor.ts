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
import type { FinanceSourceFileJobData } from '../../../types/finance.type';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 财务原始文件处理 Worker（当前为模拟进度闭环，后续在此接入真实解析）。
 * 与 FinanceService.confirmUpload 入队的 job name / data 一致。
 */
@Injectable()
@Processor(RedisKeys.FINANCE.QUEUE_NAME)
export class FinanceDocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceDocumentProcessor.name);

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
    status: string,
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
    if (job.name !== RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_DOCUMENT) {
      this.logger.warn(`跳过未知任务类型: ${job.name}`);
      return;
    }

    const { sourceFileId, fileName } = job.data;

    try {
      await this.pushProgress(job, 5, 'received', '任务已接收（模拟）');
      await sleep(400);
      await this.pushProgress(job, 30, 'parsing', '模拟：正在解析文档结构...');
      await sleep(600);
      await this.pushProgress(job, 60, 'extracting', '模拟：提取业务字段...');
      await sleep(500);
      await this.pushProgress(job, 90, 'persisting', '模拟：写入结果...');
      await sleep(300);

      await this.sourceFileRepo.update(
        { id: sourceFileId },
        { isParsed: true },
      );
      await this.pushProgress(job, 100, 'completed', `模拟完成：${fileName}`);

      this.logger.log(
        `[taskId:${job.id}] 财务文件模拟处理完成 sourceFileId=${sourceFileId}`,
      );
    } catch (error) {
      const errMsg = (error as Error).message;
      this.logger.error(`[taskId:${job.id}] 财务处理失败: ${errMsg}`);
      await this.pushProgress(job, 0, 'failed', `处理失败: ${errMsg}`);
      throw error;
    }
  };
}
