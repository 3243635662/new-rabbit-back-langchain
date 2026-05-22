import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskProgressKeys } from '../../common/constants/redis-key.constant';
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
@Processor('finance-report-queue', {
  concurrency: 1,
  // 锁超时 10 分钟，避免报表生成（含 LLM 调用）时间过长导致锁过期
  lockDuration: 600_000,
  // 自动续期间隔 5 分钟（锁有效期的一半），确保锁不会过期
  lockRenewTime: 300_000,
  // 每 30 秒检测一次 stalled，尽早续期
  stalledInterval: 30_000,
})
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

      // 绑定进度回调
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

      // 在 LLM 调用前手动续期锁的函数（防止长耗时 LLM 调用导致锁过期）
      const extendLock = async () => {
        try {
          await job.extendLock(job.id!, 120_000);
          this.logger.debug(`[taskId:${job.id}] 手动续期任务锁成功`);
        } catch (err) {
          this.logger.warn(
            `[taskId:${job.id}] 手动续期任务锁失败：${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      };

      const state = await this.compiledGraph.invoke(
        { request, user: userContext, logs: [] },
        { configurable: { pushProgress, extendLock } },
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

    const updateData: Record<string, unknown> = {
      status: FinanceReportStatus.COMPLETED,
      url: reportUrl || undefined,
      qiniuKey: exportResult.key || undefined,
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
