import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { FinanceSourceFile } from './entities/finance-source-file.entity';
import { FinanceReport } from './entities/finance-report.entity';
import { FinanceExtractedRecord } from './entities/finance-extracted-record.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuModule } from '../qiniu/qiniu.module';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { FinanceSourceProcessor } from './jobs/finance-document.processor';
import { VisionImageParser } from './jobs/parsers/vision-image.parser';
import { ContractParser } from './jobs/parsers/contract.parser';
import { InvoiceOcrParser } from './jobs/parsers/invoice-ocr.parser';
import { FinanceOcrService } from './services/finance-ocr.service';
import { FinanceVisionService } from './services/finance-vision.service';
import { DocumentNormalizerService } from './services/document-normalizer.service';
import { LangChainModule } from '../../langchain/langchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceSourceFile,
      FinanceReport,
      Merchant,
      FinanceExtractedRecord,
    ]),
    BullModule.registerQueue(
      { name: RedisKeys.FINANCE.SOURCE_QUEUE_NAME },
      { name: RedisKeys.FINANCE.REPORT_QUEUE_NAME },
    ),
    QiniuModule,
    LangChainModule,
  ],
  providers: [
    FinanceService,
    FinanceOcrService,
    FinanceVisionService,
    DocumentNormalizerService,
    FinanceSourceProcessor,
    VisionImageParser,
    ContractParser,
    InvoiceOcrParser,
  ],
  controllers: [FinanceController],
  exports: [FinanceService],
})
export class FinanceModule {}
