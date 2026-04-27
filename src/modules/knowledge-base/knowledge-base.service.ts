import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  KnowledgeBase,
  DocType,
  IngestStatus,
} from './entities/knowledge-base.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuService } from '../qiniu/qiniu.service';
import { MerchantRagService } from '../../langchain/rag/merchant-rag/merchant-rag.service';
import { RAGJobData } from '../../types/rag.type';

const ALLOWED_MIME_MAP: Record<string, DocType> = {
  'application/json': DocType.JSON,
  'text/csv': DocType.CSV,
  'application/pdf': DocType.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    DocType.DOCX,
  'text/plain': DocType.TXT,
};

export interface PresignResult {
  uploadToken: string;
  key: string;
  domain: string;
}

export interface ConfirmBody {
  qiniuKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly kbRepo: Repository<KnowledgeBase>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectQueue('rag-queue') private readonly ragQueue: Queue<RAGJobData>,
    private readonly qiniuService: QiniuService,
    private readonly merchantRagService: MerchantRagService,
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
    const key = `rag/raw/${merchantId}/${Date.now()}-${fileName}`;
    const { token, domain } = this.qiniuService.generateUploadToken(key);

    return { uploadToken: token, key, domain: domain || '' };
  };

  /**
   * 客户端直传七牛成功后，回调确认 → 校验文件真实性 → 创建 DB 记录 + 推入队列
   * 服务器全程不接触文件内容，零内存/带宽
   */
  confirmUpload = async (body: ConfirmBody, userId: string) => {
    const { qiniuKey, fileName, mimeType, fileSize } = body;

    //  校验商户 + key 前缀安全（防止客户端传别人的 key）
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('当前用户未关联商户');
    }

    const merchantId = merchant.id.toString();
    if (!qiniuKey.startsWith(`rag/raw/${merchantId}/`)) {
      throw new BadRequestException('qiniuKey 与当前商户不匹配');
    }

    //  查询文件实际元信息，校验文件存在性
    const fileStat = await this.qiniuService.statFile(qiniuKey);
    if (!fileStat) {
      throw new BadRequestException('文件不存在于七牛云，请确认上传是否成功');
    }

    //  以七牛实际 mimeType 为准校验，客户端上报不一致则删文件
    const actualMime = fileStat.mimeType || mimeType;
    const docType = ALLOWED_MIME_MAP[actualMime];
    if (!docType) {
      await this.qiniuService.deleteFile(qiniuKey);
      this.logger.warn(
        `商户 ${merchantId} 文件类型不支持: 实际=${actualMime}，已删除文件`,
      );
      throw new BadRequestException(
        `不支持的文件类型: ${actualMime}，仅支持 json/csv/pdf/docx/txt，文件已删除`,
      );
    }

    if (fileStat.mimeType && fileStat.mimeType !== mimeType) {
      await this.qiniuService.deleteFile(qiniuKey);
      this.logger.warn(
        `商户 ${merchantId} 上报 mimeType=${mimeType}，实际=${fileStat.mimeType}，已删除文件`,
      );
      throw new BadRequestException(
        `文件类型不一致：上报 ${mimeType}，实际 ${fileStat.mimeType}，文件已删除`,
      );
    }

    //  写入数据库（状态 pending），mimeType/fileSize 以七牛实际值为准
    const qiniuUrl = this.qiniuService.buildUrl(qiniuKey);
    const record = this.kbRepo.create({
      fileName,
      docType,
      mimeType: actualMime,
      fileSize: fileStat.fsize || fileSize,
      qiniuKey,
      qiniuUrl,
      chunkCount: 0,
      status: IngestStatus.PENDING,
      merchantId: merchant.id,
    });
    await this.kbRepo.save(record);

    // 推入 BullMQ 队列（传 qiniuKey + fileName，fileName 用于去重判断）
    const job = await this.ragQueue.add(
      'process-document',
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
}
