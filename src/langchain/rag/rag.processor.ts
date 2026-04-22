import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as os from 'os';
import * as fsp from 'fs/promises';
import * as path from 'path';
import {
  KnowledgeBase,
  IngestStatus,
} from '../../modules/knowledge-base/entities/knowledge-base.entity';
import { MerchantRagService } from './merchant-rag/merchant-rag.service';
import { QiniuService } from '../../modules/qiniu/qiniu.service';
import { RedisService } from '../../modules/db/redis/redis.service';

export interface RAGJobData {
  qiniuKey: string;
  merchantId: string;
}

/** key → MIME 映射（从 qiniuKey 的扩展名推断） */
const EXT_MIME_MAP: Record<string, string> = {
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

@Injectable()
@Processor('rag-queue')
export class RagProcessor extends WorkerHost {
  private readonly logger = new Logger(RagProcessor.name);

  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly kbRepo: Repository<KnowledgeBase>,
    private readonly merchantRagService: MerchantRagService,
    private readonly qiniuService: QiniuService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  private pushProgress = async (
    job: Job<RAGJobData>,
    progress: number,
    status: string,
    message: string,
  ) => {
    const taskId = String(job.id);
    await job.updateProgress(progress);
    await this.redisService.publishProgress(taskId, {
      progress,
      status,
      message,
    });
    await this.redisService.setProgressCache(taskId, {
      progress,
      status,
      message,
    });
  };

  override process = async (job: Job<RAGJobData>): Promise<void> => {
    const { qiniuKey, merchantId } = job.data;
    let localFilePath = '';

    try {
      // ─── 1. 更新状态 → processing ───
      await this.pushProgress(job, 10, 'downloading', '开始处理...');
      const record = await this.kbRepo.findOne({ where: { qiniuKey } });
      if (record) {
        await this.kbRepo.update(record.id, {
          status: IngestStatus.PROCESSING,
        });
      }

      // ─── 2. 从七牛下载到 os.tmpdir()（LangChain Loader 需要本地文件路径） ───
      await this.pushProgress(job, 20, 'downloading', '正在从七牛下载文件...');
      const ext = path.extname(qiniuKey) || '.txt';
      const mimeType = EXT_MIME_MAP[ext] || 'text/plain';
      const tmpDir = path.join(
        os.tmpdir(),
        'rag-worker',
        `${job.id || Date.now()}`,
      );
      await fsp.mkdir(tmpDir, { recursive: true });
      localFilePath = path.join(
        tmpDir,
        `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
      );

      this.logger.log(
        `[taskId:${job.id}] 从七牛下载: ${qiniuKey} → ${localFilePath}`,
      );
      await this.qiniuService.downloadToLocal(qiniuKey, localFilePath);

      // ─── 3. LangChain 解析文档 + 向量化入库 ───
      const result = await this.merchantRagService.ingestDocument(
        localFilePath,
        mimeType,
        merchantId,
        (p, s, m) => this.pushProgress(job, p, s, m),
      );

      // ─── 4. 更新数据库记录 → completed ───
      await this.pushProgress(job, 90, 'persisting', '正在保存结果...');
      if (record) {
        await this.kbRepo.update(record.id, {
          status: IngestStatus.COMPLETED,
          chunkCount: result.count,
        });
      }

      await this.pushProgress(job, 100, 'completed', '解析完成，已就绪');
      this.logger.log(
        `[taskId:${job.id}] RAG处理完成: ${qiniuKey} → ${result.count} 个片段`,
      );
    } catch (error) {
      const errMsg = (error as Error).message;
      this.logger.error(`[taskId:${job.id}] RAG处理失败: ${errMsg}`);
      await this.pushProgress(job, 0, 'failed', `处理失败: ${errMsg}`);

      // 通过 qiniuKey 找到对应记录更新状态
      const record = await this.kbRepo.findOne({ where: { qiniuKey } });
      if (record) {
        await this.kbRepo.update(record.id, {
          status: IngestStatus.FAILED,
          failReason: errMsg,
        });
      }

      throw error; // BullMQ 捕获后自动重试
    } finally {
      // 清理 os.tmpdir() 临时文件
      if (localFilePath) {
        const tmpDir = path.dirname(localFilePath);
        try {
          await fsp.rm(tmpDir, { recursive: true, force: true });
          this.logger.log(`[taskId:${job.id}] 临时目录已清理: ${tmpDir}`);
        } catch (e) {
          this.logger.warn(`清理临时文件失败: ${(e as Error).message}`);
        }
      }
    }
  };
}
