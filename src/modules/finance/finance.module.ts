import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { FinanceSourceFile } from './entities/finance-source-file.entity';
import { FinanceReport } from './entities/finance-report.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuModule } from '../qiniu/qiniu.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FinanceSourceFile, FinanceReport, Merchant]),
    BullModule.registerQueue({ name: 'finance-queue' }),
    QiniuModule,
  ],
  providers: [FinanceService],
  controllers: [FinanceController],
  exports: [FinanceService],
})
export class FinanceModule {}
