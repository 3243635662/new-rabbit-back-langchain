import { Controller, Post, Param } from '@nestjs/common';
import { MerchantRagService } from './merchant-rag.service';
import { resFormatMethod } from '../../../utils/resFormat.util';
import * as path from 'path';

@Controller('merchant-rag')
export class MerchantRagController {
  constructor(private readonly merchantRagService: MerchantRagService) {}

  /**
   * 测试：解析 CSV 并注入商户元数据
   * POST /merchant-rag/ingest/:merchantId
   */
  @Post('ingest/:merchantId')
  async ingestCsv(@Param('merchantId') merchantId: string) {
    const csvPath = path.join(
      process.cwd(),
      'src',
      'assets',
      'csv',
      'ecommerce_rules.csv',
    );

    const result = await this.merchantRagService.ingestCsv(csvPath, merchantId);
    return resFormatMethod(0, 'success', result);
  }
}
