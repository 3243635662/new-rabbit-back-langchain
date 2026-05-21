import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RedisKeys,
  TaskProgressKeys,
} from '../../common/constants/redis-key.constant';
import { pushTaskProgress } from '../../utils/task-progress.util';
import { RedisService } from '../db/redis/redis.service';
import { ReportRenderService } from '../report-render/report-render.service';
import { QiniuService } from '../qiniu/qiniu.service';
import { ModelProviderService } from '../../langchain/model-provider.service';
import { Order } from '../order/entities/orders.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { FinanceExtractedRecord } from '../finance/entities/finance-extracted-record.entity';
import { ReportsService } from './reports.service';
import { FinanceReport } from './entities/finance-report.entity';
import { GenerateFinanceReportDto } from './dto/generate-finance-report.dto';
import { buildFinanceReportGraph } from '../../langchain/graph/reports/finance-report.graph';
import type { FinanceReportGraphState } from '../../langchain/graph/reports/finance-report.annotation';
import {
  FinanceReportStatus,
  FinanceReportProgressPhase,
} from '../../types/reports/report-status.type';

/** 报表生成 Job 入参 */
interface ReportJobData {
  userId: string;
  request: GenerateFinanceReportDto;
}

/** 根据请求日期构建报告标题 */
const buildReportTitle = (request: GenerateFinanceReportDto): string => {
  const start = new Date(request.startDate);
  const y = start.getFullYear();
  const m = start.getMonth() + 1;
  return `${y}年${m}月财务分析报告`;
};

/**
 * 财务报表生成 Worker。
 *
 * 与 FinanceSourceProcessor 同模式：
 * - 使用 compiledGraph.invoke() 执行 LangGraph 工作流
 * - 图节点通过 configurable.pushProgress 推送自身进度
 * - 前端通过 SSE / 轮询读取进度
 */
@Injectable()
@Processor(RedisKeys.FINANCE.REPORT_QUEUE_NAME, { concurrency: 1 })
export class FinanceReportProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceReportProcessor.name);
  private readonly compiledGraph: ReturnType<typeof buildFinanceReportGraph>;

  constructor(
    private readonly reportRenderService: ReportRenderService,
    private readonly qiniuService: QiniuService,
    private readonly modelProviderService: ModelProviderService,
    private readonly reportsService: ReportsService,
    private readonly redisService: RedisService,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(FinanceExtractedRecord)
    private readonly financeRecordRepo: Repository<FinanceExtractedRecord>,
    @InjectRepository(FinanceReport)
    private readonly financeReportRepo: Repository<FinanceReport>,
  ) {
    super();
    this.compiledGraph = buildFinanceReportGraph({
      getModel: () => this.modelProviderService.getReportModel(),
      orderRepo: this.orderRepo,
      inventoryRepo: this.inventoryRepo,
      financeRecordRepo: this.financeRecordRepo,
      qiniuService: this.qiniuService,
      reportRenderService: this.reportRenderService,
    });
  }

  override process = async (job: Job<ReportJobData>): Promise<void> => {
    const { userId, request } = job.data;

    if (!userId) throw new Error('报表任务处理失败：未提供用户 ID');
    if (!request) throw new Error('报表任务处理失败：未提供请求参数');

    try {
      const userContext = await this.reportsService.getUserContext(userId);

      // 写入数据库记录（pending）
      await this.financeReportRepo.save({
        merchantId: userContext.merchantId || 0,
        title: buildReportTitle(request),
        status: FinanceReportStatus.PROCESSING,
        taskId: String(job.id),
        reportTypes: request.dataScopes || [],
      });

      await pushTaskProgress(
        job,
        this.redisService,
        5,
        FinanceReportProgressPhase.STARTED,
        '开始生成报表',
        TaskProgressKeys.FINANCE_REPORT,
      );

      // 绑定进度回调，与 Finance 模块的图节点模式一致：
      // 节点内通过 config.configurable.pushProgress 推送自身进度
      const pushProgress = async (
        progress: number,
        status: string,
        message: string,
      ) =>
        pushTaskProgress(
          job,
          this.redisService,
          progress,
          status,
          message,
          TaskProgressKeys.FINANCE_REPORT,
        );

      const state = await this.compiledGraph.invoke(
        { request, user: userContext, logs: [] },
        { configurable: { pushProgress } },
      );

      await this.finishReport(job, state);
    } catch (error) {
      await this.handleError(job, error);
    }
  };

  /** 报表生成成功后的收尾 */
  private async finishReport(
    job: Job<ReportJobData>,
    state: FinanceReportGraphState,
  ) {
    const exportResult = state.exportResult;
    if (!exportResult) {
      throw new Error('报表任务执行完成，但未生成导出结果');
    }

    const reportUrl = exportResult.url || '';

    // 更新数据库记录为已完成
    const updateData: Record<string, unknown> = {
      status: FinanceReportStatus.COMPLETED,
      pdfUrl: reportUrl || undefined,
      pdfQiniuKey: exportResult.key || undefined,
    };
    if (state.metrics) updateData['metrics'] = state.metrics;
    if (state.normalizedData)
      updateData['extractedData'] = state.normalizedData;
    await this.financeReportRepo.update({ taskId: String(job.id) }, updateData);

    await pushTaskProgress(
      job,
      this.redisService,
      100,
      FinanceReportProgressPhase.COMPLETED,
      `报表生成成功|${reportUrl}`,
      TaskProgressKeys.FINANCE_REPORT,
    );

    this.logger.log(
      `[taskId:${job.id}] 报表生成完成 → ${reportUrl || exportResult.fileName}`,
    );
  }

  /** 统一错误处理 */
  private async handleError(job: Job<ReportJobData>, error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    this.logger.error(`[taskId:${job.id}] 报表生成失败: ${errMsg}`);

    // 更新数据库记录为失败
    await this.financeReportRepo.update(
      { taskId: String(job.id) },
      {
        status: FinanceReportStatus.FAILED,
        failReason: errMsg,
      },
    );

    await pushTaskProgress(
      job,
      this.redisService,
      0,
      FinanceReportProgressPhase.FAILED,
      `报表生成失败: ${errMsg}`,
      TaskProgressKeys.FINANCE_REPORT,
    );
    throw error;
  }
}
