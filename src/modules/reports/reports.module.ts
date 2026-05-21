import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { User } from '../user/entities/user.entity';
import { Order } from '../order/entities/orders.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { FinanceExtractedRecord } from '../finance/entities/finance-extracted-record.entity';
import { FinanceReport } from './entities/finance-report.entity';
import { ReportRenderModule } from '../report-render/report-render.module';
import { QiniuModule } from '../qiniu/qiniu.module';
import { LangChainModule } from '../../langchain/langchain.module';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { FinanceReportProcessor } from './generateReport.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Order,
      Inventory,
      FinanceExtractedRecord,
      FinanceReport,
    ]),
    BullModule.registerQueue({
      name: RedisKeys.FINANCE.REPORT_QUEUE_NAME,
    }),
    ReportRenderModule,
    QiniuModule,
    LangChainModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, FinanceReportProcessor],
  exports: [ReportsService],
})
export class ReportsModule {}
