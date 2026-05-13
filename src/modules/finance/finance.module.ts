import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { FinanceSourceFile } from './entities/finance-source-file.entity';
import { FinanceReport } from './entities/finance-report.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuModule } from '../qiniu/qiniu.module';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { FinanceSourceProcessor } from './jobs/finance-document.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([FinanceSourceFile, FinanceReport, Merchant]),
    BullModule.registerQueue(
      { name: RedisKeys.FINANCE.SOURCE_QUEUE_NAME },
      { name: RedisKeys.FINANCE.REPORT_QUEUE_NAME },
    ),
    QiniuModule,
  ],
  providers: [FinanceService, FinanceSourceProcessor],
  controllers: [FinanceController],
  exports: [FinanceService],
})
export class FinanceModule {}
