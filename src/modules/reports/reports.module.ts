import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { User } from '../user/entities/user.entity';
import { ReportRenderModule } from '../report-render/report-render.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), ReportRenderModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
