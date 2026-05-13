import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { FinanceSourceFile } from './entities/finance-source-file.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuService } from '../qiniu/qiniu.service';
import { RedisService } from '../db/redis/redis.service';
import {
  RedisKeys,
  TaskProgressKeys,
} from '../../common/constants/redis-key.constant';
import {
  DocType,
  FINANCE_ALLOWED_MIME_MAP,
  FINANCE_UPLOAD_MIME_LIMIT,
  type ConfirmBody,
  type PresignResult,
} from '../../types/file.type';
import {
  type FinanceSourceFileJobData,
  FinanceSourceParseStatus,
  FinanceSourceProgressPhase,
  FinanceTaskPollStatus,
} from '../../types/finance.type';
import type { TaskProgressPayload } from '../../types/task-progress.type';

interface SseEvent {
  data: unknown;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(FinanceSourceFile)
    private readonly sourceFileRepo: Repository<FinanceSourceFile>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectQueue(RedisKeys.FINANCE.SOURCE_QUEUE_NAME)
    private readonly financeQueue: Queue<FinanceSourceFileJobData>,
    private readonly qiniuService: QiniuService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 生成客户端直传七牛的凭证（财务报表文件上传）
   */
  generatePresign = async (
    fileName: string,
    userId: string,
  ): Promise<PresignResult> => {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const merchantId = merchant.id.toString();
    const keyPrefix = `finance/raw/${merchantId}`;
    return this.qiniuService.generatePresign(
      keyPrefix,
      fileName,
      FINANCE_UPLOAD_MIME_LIMIT,
    );
  };

  /**
   * 客户端直传七牛成功后，回调确认
   */
  confirmUpload = async (body: ConfirmBody, userId: string) => {
    const { qiniuKey, fileName, mimeType, fileSize } = body;

    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const merchantId = merchant.id.toString();
    const expectedPrefix = `finance/raw/${merchantId}/`;

    const {
      qiniuUrl,
      actualMime,
      docType,
      fileSize: validatedFileSize,
    } = await this.qiniuService.validateFile(
      qiniuKey,
      expectedPrefix,
      mimeType,
      fileSize,
      FINANCE_ALLOWED_MIME_MAP,
    );

    const record = this.sourceFileRepo.create({
      fileName,
      mimeType: actualMime,
      fileSize: validatedFileSize,
      qiniuKey,
      qiniuUrl,
      fileType: docType,
      isParsed: false,
      parseStatus: FinanceSourceParseStatus.PENDING,
      parseFailReason: null,
      merchantId: merchant.id,
    });
    await this.sourceFileRepo.save(record);

    // 根据文件类型匹配具体的 Job Name
    const jobNameMap: Record<string, string> = {
      [DocType.PDF]: RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_PDF,
      [DocType.IMAGE]: RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_IMAGE,
      [DocType.DOCX]: RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_DOCX,
    };
    const specificJobName =
      jobNameMap[docType] ||
      RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_PARSING;

    const job = await this.financeQueue.add(
      specificJobName,
      { qiniuKey, merchantId, fileName, sourceFileId: record.id, docType },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 100 },
        removeOnFail: { age: 172800 },
      },
    );

    // 回写 taskId
    record.taskId = job.id || '';
    await this.sourceFileRepo.save(record);

    this.logger.log(
      `商户 ${merchantId} 财务文件确认上传已入队: ${fileName} → taskId: ${job.id}`,
    );

    return {
      id: record.id,
      fileName: record.fileName,
      fileType: record.fileType,
      parseStatus: record.parseStatus,
      /** @deprecated 与 parseStatus 同步，优先读 parseStatus */
      status: record.parseStatus,
      taskId: job.id || '',
      merchantId: record.merchantId,
      qiniuUrl: record.qiniuUrl,
      createdAt: record.createdAt,
    };
  };

  /**
   * 查询 BullMQ 任务状态
   */
  getTaskStatus = async (taskId: string) => {
    const job = await this.financeQueue.getJob(taskId);
    if (!job) {
      const record = await this.sourceFileRepo.findOne({ where: { taskId } });
      if (record) {
        return {
          taskId,
          parseStatus: record.parseStatus,
          isParsed: record.isParsed,
          fileName: record.fileName,
          failReason: record.parseFailReason,
          progress:
            record.parseStatus === FinanceSourceParseStatus.COMPLETED ? 100 : 0,
        };
      }
      return {
        taskId,
        status: FinanceTaskPollStatus.NOT_FOUND,
        progress: 0,
      };
    }

    const state = await job.getState();
    const progress = (job.progress as number) || 0;

    return {
      taskId,
      status: state,
      progress,
      failReason: state === 'failed' ? job.failedReason : null,
    };
  };

  /**
   * SSE 实时推送财务文件处理进度（与知识库 progress 同理，使用 TaskProgressKeys.FINANCE_SOURCE）
   */
  progressSse = (taskId: string): Observable<SseEvent> => {
    return new Observable((observer) => {
      const keySet = TaskProgressKeys.FINANCE_SOURCE;
      const channel = keySet.getProgressChannel(taskId);
      let subClient: Redis | null = null;

      const init = async () => {
        try {
          const cached = (await this.redisService.getTaskProgressCache(
            keySet,
            taskId,
          )) as TaskProgressPayload | null;
          if (cached) {
            observer.next({ data: cached });
            if (
              cached.status === FinanceSourceProgressPhase.COMPLETED ||
              cached.status === FinanceSourceProgressPhase.FAILED
            ) {
              observer.complete();
              return;
            }
          }

          subClient = this.redisService.createSubscriber();
          void subClient.subscribe(channel, (err: Error | null) => {
            if (err) {
              this.logger.error(
                `财务 SSE 订阅失败 [${taskId}]: ${err.message}`,
              );
              observer.error(err);
            }
          });

          subClient.on('message', (_: string, message: string) => {
            try {
              const data = JSON.parse(message) as TaskProgressPayload;
              observer.next({ data });
              if (
                data.status === FinanceSourceProgressPhase.COMPLETED ||
                data.status === FinanceSourceProgressPhase.FAILED
              ) {
                observer.complete();
                if (subClient) {
                  subClient.unsubscribe(channel).catch(() => {});
                }
              }
            } catch {
              observer.next({ data: message });
            }
          });
        } catch (err) {
          observer.error(err);
        }
      };

      void init();

      return () => {
        if (subClient) {
          subClient.unsubscribe(channel).catch(() => {});
          subClient.quit().catch(() => {});
        }
      };
    });
  };
}
