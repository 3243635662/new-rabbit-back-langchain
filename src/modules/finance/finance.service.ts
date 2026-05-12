import { Injectable, NotFoundException } from '@nestjs/common';
import { PresignResult } from '../../types/file.type';
import { Merchant } from '../merchant/entities/merchant.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QiniuService } from '../qiniu/qiniu.service';
@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly qiniuService: QiniuService,
  ) {}
  // 获取上传凭证

  generatePresign = async (fileName: string, userId: string) => {
    const merchant = await this.merchantRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!merchant) {
      throw new NotFoundException('用户未关联商户');
    }
    const merchantId = merchant.id.toString();
    const keyPrefix = `finance/raw/${merchantId}/`;
    const mimeLimit =
      'application/json;text/csv;application/pdf;application/vnd.openxmlformats-officedocument.wordprocessingml.document;text/plain;application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;application/vnd.ms-excel;image/jpeg;image/png;image/webp';
    return this.qiniuService.generatePresign(keyPrefix, fileName, mimeLimit);
  };
}
