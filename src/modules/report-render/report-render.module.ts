import { Module } from '@nestjs/common';
import { ReportRenderService } from './report-render.service';

@Module({
  providers: [ReportRenderService],
  exports: [ReportRenderService],
})
export class ReportRenderModule {}
