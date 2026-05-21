import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Sse,
  Param,
  Get,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { GenerateFinanceReportDto } from './dto/generate-finance-report.dto';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import { AuthGuard } from '../auth/auth.guard';
import { ReportsService, SseEvent } from './reports.service';
import { PaginateOptions } from '../../common/decorators/pagination.decorator';
import type { PaginationOptionsType } from '../../types/pagination.type';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    @InjectQueue(RedisKeys.FINANCE.REPORT_QUEUE_NAME)
    private readonly reportQueue: Queue,
    private readonly reportsService: ReportsService,
  ) {}

  @Post('generate')
  async generateReport(
    @Body() dto: GenerateFinanceReportDto,
    @Req() req: { user: JwtPayloadType },
  ) {
    const job = await this.reportQueue.add('generate-report', {
      userId: req?.user?.id,
      request: dto,
    });

    return resFormatMethod(0, '报表生成任务已提交，处理中', {
      taskId: job.id,
    });
  }

  /** 按 taskId 查询生成结果（含 URL、快照时间等） */
  @Get('result/:taskId')
  async getReportResult(@Param('taskId') taskId: string) {
    const report = await this.reportsService.getReportByTaskId(taskId);
    if (!report) {
      return resFormatMethod(1, '报表不存在或尚未生成', null);
    }
    return resFormatMethod(0, '查询成功', {
      id: report.id,
      title: report.title,
      status: report.status,
      pdfUrl: report.pdfUrl,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      failReason: report.failReason,
    });
  }

  /** 分页查询商户的报表列表 */
  @Get('list')
  async listReports(
    @Req() req: { user: JwtPayloadType },
    @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
    paginationOptions: PaginationOptionsType,
  ) {
    const userContext = await this.reportsService.getUserContext(req.user.id);
    const merchantId = userContext.merchantId || 0;
    const [list, total] = await this.reportsService.listReports(
      merchantId,
      paginationOptions.page,
      paginationOptions.limit,
    );
    return resFormatMethod(0, '查询成功', {
      list: list.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        pdfUrl: r.pdfUrl,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
    });
  }

  @Sse('progress/:taskId')
  progressSse(@Param('taskId') taskId: string): Observable<SseEvent> {
    return this.reportsService.progressSse(taskId);
  }
}
