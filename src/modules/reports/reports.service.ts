import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Repository } from 'typeorm';
import { UserContextType } from '../../types/reports/report-userContext.type';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { RedisService } from '../db/redis/redis.service';
import { TaskProgressKeys } from '../../common/constants/redis-key.constant';
import type { TaskProgressPayload } from '../../types/task-progress.type';
import { FinanceReport } from './entities/finance-report.entity';
import { FinanceReportProgressPhase } from '../../types/reports/report-status.type';
import { QiniuService } from '../qiniu/qiniu.service';

export interface SseEvent {
  data: unknown;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(FinanceReport)
    private readonly financeReportRepo: Repository<FinanceReport>,
    private readonly redisService: RedisService,
    private readonly qiniuService: QiniuService,
  ) {}

  // *根据用户 ID 获取用户上下文（用于报表生成）
  getUserContext = async (userId: string): Promise<UserContextType> => {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['merchant'],
    });

    if (!user) {
      throw new Error(`用户不存在: ${userId}`);
    }

    const result: UserContextType = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      merchantId: user.merchant?.id,
    };

    return result;
  };

  /**
   * 根据 taskId 查询报表生成结果
   */
  getReportByTaskId = (taskId: string) => {
    return this.financeReportRepo.findOne({ where: { taskId } });
  };

  /**
   * 按商户分页查询报表列表
   */
  listReports = (
    merchantId: number,
    options: { page: number; limit: number },
  ) => {
    const { page = 1, limit = 10 } = options;
    return this.financeReportRepo.findAndCount({
      where: { merchantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  };

  /**
   * 删除报告：先删七牛文件，再删数据库记录
   */
  deleteReport = async (
    reportId: number,
    merchantId: number,
  ): Promise<{ deleted: boolean; reportTitle: string | null }> => {
    const report = await this.financeReportRepo.findOne({
      where: { id: reportId, merchantId },
    });

    if (!report) {
      return { deleted: false, reportTitle: null };
    }

    const title = report.title;

    if (report.qiniuKey) {
      try {
        await this.qiniuService.deleteFile(report.qiniuKey);
        this.logger.log(`七牛文件删除成功: ${report.qiniuKey}`);
      } catch (err) {
        this.logger.error(
          `七牛文件删除失败 [${report.qiniuKey}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.financeReportRepo.remove(report);
    this.logger.log(
      `报表记录删除成功 [id:${reportId}, merchantId:${merchantId}]`,
    );

    return { deleted: true, reportTitle: title };
  };

  /**
   * SSE 实时推送报表生成处理进度（与 finance progress 同模式，使用 TaskProgressKeys.FINANCE_REPORT）
   */
  progressSse = (taskId: string): Observable<SseEvent> => {
    return new Observable((observer) => {
      const keySet = TaskProgressKeys.FINANCE_REPORT;
      const channel = keySet.getProgressChannel(taskId);
      const cacheKey = keySet.getProgressDataKey(taskId);
      let subClient: Redis | null = null;
      let isClosed = false;

      this.logger.log(
        `报表 SSE 连接请求 [${taskId}] → channel: ${channel}, cache: ${cacheKey}`,
      );

      // 心跳定时器：每 30 秒发送 SSE comment 保持连接，防止 proxy 超时关闭
      const heartbeat = setInterval(() => {
        if (isClosed) return;
        observer.next({ data: '' } as SseEvent);
      }, 30_000);

      const init = async () => {
        try {
          // 1. 先创建订阅客户端并订阅频道（await 确认）
          subClient = this.redisService.createSubscriber();
          await subClient.subscribe(channel);
          this.logger.log(`报表 SSE 已订阅 [${taskId}] → ${channel}`);

          if (isClosed) {
            clearInterval(heartbeat);
            subClient.unsubscribe(channel).catch(() => {});
            subClient.quit().catch(() => {});
            return;
          }

          // 2. 注册消息监听（此时订阅已确认）
          subClient.on('message', (_: string, message: string) => {
            if (isClosed) return;
            try {
              const data = JSON.parse(message) as TaskProgressPayload;
              this.logger.log(
                `报表 SSE 收到 Pub/Sub [${taskId}]: progress=${data.progress}, status=${data.status}`,
              );
              observer.next({ data });
              if (
                data.status === FinanceReportProgressPhase.COMPLETED ||
                data.status === FinanceReportProgressPhase.FAILED
              ) {
                clearInterval(heartbeat);
                setTimeout(() => {
                  observer.complete();
                  if (subClient) subClient.unsubscribe(channel).catch(() => {});
                }, 100);
              }
            } catch {
              observer.next({ data: message });
            }
          });

          // 3. 订阅确认后再读缓存
          const cached = (await this.redisService.getTaskProgressCache(
            keySet,
            taskId,
          )) as TaskProgressPayload | null;

          if (cached) {
            this.logger.log(
              `报表 SSE 缓存命中 [${taskId}]: progress=${cached.progress}, status=${cached.status}`,
            );
            observer.next({ data: cached });
            if (
              cached.status === FinanceReportProgressPhase.COMPLETED ||
              cached.status === FinanceReportProgressPhase.FAILED
            ) {
              clearInterval(heartbeat);
              setTimeout(() => {
                observer.complete();
                if (subClient) subClient.unsubscribe(channel).catch(() => {});
              }, 100);
              return;
            }
          } else {
            this.logger.log(`报表 SSE 缓存未命中 [${taskId}]，发送心跳`);
            observer.next({
              data: {
                progress: 0,
                status: 'connected',
                message: 'SSE 连接已建立，等待任务开始...',
              },
            });
          }
        } catch (err) {
          clearInterval(heartbeat);
          this.logger.error(
            `报表 SSE 初始化失败 [${taskId}]: ${err instanceof Error ? err.message : String(err)}`,
          );
          observer.error(err);
        }
      };

      void init();

      return () => {
        isClosed = true;
        clearInterval(heartbeat);
        if (subClient) {
          subClient.unsubscribe(channel).catch(() => {});
          subClient.quit().catch(() => {});
        }
      };
    });
  };
}
