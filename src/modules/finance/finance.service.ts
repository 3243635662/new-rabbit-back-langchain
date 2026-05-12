import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FinanceSourceFile } from './entities/finance-source-file.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuService } from '../qiniu/qiniu.service';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import type { PresignResult, ConfirmBody } from '../../types/file.type';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(FinanceSourceFile)
    private readonly sourceFileRepo: Repository<FinanceSourceFile>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectQueue(RedisKeys.FINANCE.QUEUE_NAME)
    private readonly financeQueue: Queue,
    private readonly qiniuService: QiniuService,
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
    return this.qiniuService.generatePresign(keyPrefix, fileName);
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
    );

    const record = this.sourceFileRepo.create({
      fileName,
      mimeType: actualMime,
      fileSize: validatedFileSize,
      qiniuKey,
      qiniuUrl,
      fileType: docType,
      isParsed: false,
      merchantId: merchant.id,
    });
    await this.sourceFileRepo.save(record);

    const job = await this.financeQueue.add(
      RedisKeys.FINANCE.JOB_NAMES.PROCESS_FINANCE_DOCUMENT,
      { qiniuKey, merchantId, fileName, sourceFileId: record.id },
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
      status: 'pending',
      taskId: job.id || '',
      merchantId: record.merchantId,
      qiniuUrl: record.qiniuUrl,
      createdAt: record.createdAt,
    };
  };
}
