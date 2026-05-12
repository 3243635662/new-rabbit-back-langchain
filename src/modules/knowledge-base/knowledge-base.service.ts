import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { KnowledgeBase, IngestStatus } from './entities/knowledge-base.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuService } from '../qiniu/qiniu.service';
import { MerchantRagService } from '../../langchain/rag/merchant-rag/merchant-rag.service';
import { RedisService } from '../../modules/db/redis/redis.service';
import { RAGJobData } from '../../types/rag.type';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import type { PresignResult, ConfirmBody } from '../../types/file.type';

interface ProgressPayload {
  status: string;
  progress?: number;
  message?: string;
  failReason?: string;
  [key: string]: unknown;
}

interface SseEvent {
  data: unknown;
}
@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly kbRepo: Repository<KnowledgeBase>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectQueue(RedisKeys.RAG.QUEUE_NAME)
    private readonly ragQueue: Queue<RAGJobData>,
    private readonly qiniuService: QiniuService,
    private readonly merchantRagService: MerchantRagService,
    @Inject(RedisService)
    private readonly redisService: RedisService,
  ) {}

  /**
   * 生成客户端直传七牛的凭证
   * key 前缀绑定 merchantId，防止客户端乱传路径
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
    const keyPrefix = `rag/raw/${merchantId}`;
    return this.qiniuService.generatePresign(keyPrefix, fileName);
  };

  /**
   * 客户端直传七牛成功后，回调确认 → 校验文件真实性 → 创建 DB 记录 + 推入队列
   * 服务器全程不接触文件内容，零内存/带宽
   */
  confirmUpload = async (body: ConfirmBody, userId: string) => {
    const { qiniuKey, fileName, mimeType, fileSize } = body;

    //  校验商户
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const merchantId = merchant.id.toString();
    const expectedPrefix = `rag/raw/${merchantId}/`;

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
    );
    const record = this.kbRepo.create({
      fileName,
      docType,
      mimeType: actualMime,
      fileSize: validatedFileSize,
      qiniuKey,
      qiniuUrl,
      chunkCount: 0,
      status: IngestStatus.PENDING,
      merchantId: merchant.id,
    });
    await this.kbRepo.save(record);

    // 推入 BullMQ 队列（传 qiniuKey + fileName，fileName 用于去重判断）
    const job = await this.ragQueue.add(
      RedisKeys.RAG.JOB_NAMES.PROCESS_DOCUMENT,
      { qiniuKey, merchantId, fileName },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 100 },
        removeOnFail: { age: 172800 },
      },
    );

    //  回写 taskId
    record.taskId = job.id || '';
    await this.kbRepo.save(record);

    this.logger.log(
      `商户 ${merchantId} 确认上传已入队: ${fileName} → taskId: ${job.id}`,
    );

    return {
      id: record.id,
      fileName: record.fileName,
      docType: record.docType,
      status: record.status,
      taskId: record.taskId,
      merchantId: record.merchantId,
      qiniuUrl: record.qiniuUrl,
      createdAt: record.createdAt,
    };
  };

  /**
   * 查询任务处理进度
   */
  getTaskStatus = async (taskId: string) => {
    const job = await this.ragQueue.getJob(taskId);
    if (!job) {
      const record = await this.kbRepo.findOne({ where: { taskId } });
      if (record) {
        return {
          taskId,
          status: record.status,
          progress: record.status === IngestStatus.COMPLETED ? 100 : 0,
          chunkCount: record.chunkCount,
          failReason: record.failReason,
        };
      }
      return { taskId, status: 'not_found', progress: 0 };
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
   * 查询商户的知识库文档列表
   */
  listByMerchant = async (userId: string) => {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    return this.kbRepo.find({
      where: { merchantId: merchant.id },
      order: { createdAt: 'DESC' },
    });
  };

  /**
   * 删除知识库文档记录
   * 同时清理 ChromaDB 向量数据和七牛云文件
   */
  remove = async (id: number, userId: string) => {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const record = await this.kbRepo.findOne({
      where: { id, merchantId: merchant.id },
    });
    if (!record) {
      throw new NotFoundException('文档不存在或不属于当前商户');
    }

    // 1. 删除 ChromaDB 中的向量数据
    await this.merchantRagService
      .deleteDocumentsBySourceFile(
        record.merchantId.toString(),
        record.fileName,
      )
      .catch((err) => {
        this.logger.warn(`删除向量数据失败: ${(err as Error).message}`);
      });

    // 2. 删除七牛云文件
    await this.qiniuService.deleteFile(record.qiniuKey).catch(() => {});

    // 3. 删除数据库记录
    await this.kbRepo.remove(record);
    return { id };
  };

  /**
   * SSE 实时推送 RAG 解析进度（EventSource）
   * 返回 Observable，由 Controller 的 @Sse() 装饰器自动转换为 SSE 流
   */
  progressSse = (taskId: string): Observable<SseEvent> => {
    return new Observable((observer) => {
      const channel = RedisKeys.RAG.getProgressChannel(taskId);
      let subClient: Redis | null = null;

      const init = async () => {
        try {
          // 先推缓存的最新状态
          const cached = (await this.redisService.getProgressCache(
            taskId,
          )) as ProgressPayload | null;
          if (cached) {
            observer.next({ data: cached });
            if (cached.status === 'completed' || cached.status === 'failed') {
              observer.complete();
              return;
            }
          }

          // Redis 订阅
          subClient = this.redisService.createSubscriber();
          void subClient.subscribe(channel, (err: Error | null) => {
            if (err) {
              this.logger.error(`SSE 订阅失败 [${taskId}]: ${err.message}`);
              observer.error(err);
            }
          });

          subClient.on('message', (_: string, message: string) => {
            try {
              const data = JSON.parse(message) as ProgressPayload;
              observer.next({ data });
              if (data.status === 'completed' || data.status === 'failed') {
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
      // 不等待它执行完，让 Observable 立即返回
      void init();

      // 清理防内存泄露
      return () => {
        if (subClient) {
          subClient.unsubscribe(channel).catch(() => {});
          subClient.quit().catch(() => {});
        }
      };
    });
  };
}
