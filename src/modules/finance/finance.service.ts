import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Brackets } from 'typeorm';
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
import type { PaginationOptionsType } from '../../types/pagination.type';
import { RedisTTL } from '../../common/constants/redis-TTL.constant';
import { FinanceExtractedRecord } from './entities/finance-extracted-record.entity';

interface SseEvent {
  data: unknown;
}

export interface FinanceSourceListResult {
  items: FinanceSourceFile[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(FinanceSourceFile)
    private readonly sourceFileRepo: Repository<FinanceSourceFile>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(FinanceExtractedRecord)
    private readonly extractedRecordRepo: Repository<FinanceExtractedRecord>,
    @InjectQueue(RedisKeys.FINANCE.SOURCE_QUEUE_NAME)
    private readonly financeSourceQueue: Queue<FinanceSourceFileJobData>,
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
    const { qiniuKey, fileName, mimeType, fileSize, sourceType } = body;

    if (!sourceType) {
      throw new BadRequestException('财务文件上传必须提供 sourceType');
    }

    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const merchantId = merchant.id.toString();
    const expectedPrefix = `finance/raw/${merchantId}/`;

    // 幂等性检查：如果已存在相同 qiniuKey 且未失败记录，直接返回已有记录
    const existingRecord = await this.sourceFileRepo.findOne({
      where: {
        qiniuKey,
        merchantId: merchant.id,
        parseStatus: Not(FinanceSourceParseStatus.FAILED),
      },
      order: { createdAt: 'DESC' },
    });

    if (existingRecord) {
      this.logger.warn(
        `商户 ${merchantId} 重复提交已存在的文件: ${fileName} → 已有 taskId: ${existingRecord.taskId}`,
      );
      return {
        id: existingRecord.id,
        fileName: existingRecord.fileName,
        sourceType: existingRecord.sourceType,
        parseStatus: existingRecord.parseStatus,
        status: existingRecord.parseStatus,
        taskId: existingRecord.taskId,
        merchantId: existingRecord.merchantId,
        qiniuUrl: existingRecord.qiniuUrl,
        createdAt: existingRecord.createdAt,
      };
    }

    // 验证一遍文件存在性以及获取URL
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
      sourceType,
      isParsed: false,
      parseStatus: FinanceSourceParseStatus.PENDING,
      parseFailReason: null,
      merchantId: merchant.id,
    });
    await this.sourceFileRepo.save(record);

    // 根据业务类型匹配具体的 Job Name
    const jobNameMap: Record<string, string> = {
      img: RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_GENERAL_IMG,
      invoice: RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_INVOICE,
      contract: RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_SOURCE_CONTRACT,
    };
    const specificJobName = jobNameMap[sourceType];

    if (!specificJobName) {
      throw new Error(`不支持的业务资源类型: ${sourceType}`);
    }

    const job = await this.financeSourceQueue.add(
      specificJobName,
      {
        qiniuKey,
        merchantId,
        fileName,
        sourceFileId: record.id,
        docType,
        sourceType,
      },
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

    // 清除该商户的资源列表缓存
    void this.redisService.delByPrefixSafe(
      RedisKeys.FINANCE.getSourceListPrefix(merchant.id),
    );

    this.logger.log(
      `商户 ${merchantId} 财务文件确认上传已入队: ${fileName} → taskId: ${job.id}`,
    );

    return {
      id: record.id,
      fileName: record.fileName,
      sourceType: record.sourceType,
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
   * 获取商户对应的 FinanceSourceFile 列表 (支持分页、模糊搜索)
   */
  async getSourceFiles(
    userId: string,
    options: PaginationOptionsType,
  ): Promise<FinanceSourceListResult> {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const { page, limit, keyword, sourceType, startTime, endTime } = options;
    const cacheKey = RedisKeys.FINANCE.getSourceListKey(
      merchant.id,
      page,
      limit,
      keyword,
      sourceType,
      startTime,
      endTime,
    );

    const cached =
      await this.redisService.getWithLogicExpire<FinanceSourceListResult>(
        cacheKey,
      );
    if (cached.data) {
      if (cached.isExpired) {
        void this.rebuildListCache(cacheKey, merchant.id, options);
      }
      return cached.data;
    }

    return await this.rebuildListCache(cacheKey, merchant.id, options);
  }

  private async rebuildListCache(
    cacheKey: string,
    merchantId: number,
    options: PaginationOptionsType,
  ): Promise<FinanceSourceListResult> {
    const { page, limit, keyword, sourceType, startTime, endTime } = options;
    const queryBuilder = this.sourceFileRepo
      .createQueryBuilder('file')
      .leftJoinAndSelect('file.extractedRecords', 'record')
      .where('file.merchantId = :merchantId', { merchantId });

    if (sourceType) {
      queryBuilder.andWhere('file.sourceType = :sourceType', { sourceType });
    }

    if (startTime && endTime) {
      queryBuilder.andWhere('file.createdAt BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      });
    } else if (startTime) {
      queryBuilder.andWhere('file.createdAt >= :startTime', { startTime });
    } else if (endTime) {
      queryBuilder.andWhere('file.createdAt <= :endTime', { endTime });
    }

    if (keyword) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('file.fileName LIKE :keyword', { keyword: `%${keyword}%` })
            .orWhere('record.category LIKE :keyword', {
              keyword: `%${keyword}%`,
            })
            .orWhere('record.counterparty LIKE :keyword', {
              keyword: `%${keyword}%`,
            });
        }),
      );
    }

    queryBuilder
      .orderBy('file.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    const result = {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    void this.redisService.setWithLogicExpire(
      cacheKey,
      result,
      RedisTTL.CACHE.FINANCE_SOURCE_LIST,
    );

    return result;
  }

  /**
   * 获取单个 FinanceSourceFile 详情 (关联 extractedRecords)
   */
  async getSourceFileDetail(
    id: number,
    userId: string,
  ): Promise<FinanceSourceFile> {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const cacheKey = RedisKeys.FINANCE.getSourceDetailKey(id);

    const cached =
      await this.redisService.getWithLogicExpire<FinanceSourceFile>(cacheKey);
    if (cached.data) {
      if (cached.data.merchantId !== merchant.id) {
        throw new NotFoundException('无权访问该资源');
      }
      if (cached.isExpired) {
        void this.rebuildDetailCache(cacheKey, id, merchant.id);
      }
      return cached.data;
    }

    return await this.rebuildDetailCache(cacheKey, id, merchant.id);
  }

  private async rebuildDetailCache(
    cacheKey: string,
    id: number,
    merchantId: number,
  ): Promise<FinanceSourceFile> {
    const sourceFile = await this.sourceFileRepo.findOne({
      where: { id, merchantId },
      relations: ['extractedRecords'],
    });

    if (!sourceFile) {
      throw new NotFoundException('找不到指定资源或无权限访问');
    }

    void this.redisService.setWithLogicExpire(
      cacheKey,
      sourceFile,
      RedisTTL.CACHE.FINANCE_SOURCE_DETAIL,
    );

    return sourceFile;
  }

  /**
   * 删除财务资源 (同时删除关联记录并清理缓存)
   */
  async deleteSourceFile(id: number, userId: string) {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const sourceFile = await this.sourceFileRepo.findOne({
      where: { id, merchantId: merchant.id },
      relations: ['extractedRecords'],
    });

    if (!sourceFile) {
      throw new NotFoundException('找不到指定资源或无权限访问');
    }

    // 1. 删除关联的结构化记录 (手动删以保持数据整洁)
    if (sourceFile.extractedRecords?.length > 0) {
      await this.extractedRecordRepo.remove(sourceFile.extractedRecords);
    }

    // 2. 删除主文件记录
    await this.sourceFileRepo.remove(sourceFile);

    // 3. 清理缓存
    // 删除详情缓存
    await this.redisService.del(RedisKeys.FINANCE.getSourceDetailKey(id));
    // 批量删除列表缓存
    void this.redisService.delByPrefixSafe(
      RedisKeys.FINANCE.getSourceListPrefix(merchant.id),
    );

    return true;
  }

  /**
   * 查询 BullMQ 任务状态
   */
  getTaskStatus = async (taskId: string) => {
    const job = await this.financeSourceQueue.getJob(taskId);
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
