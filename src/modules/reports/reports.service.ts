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
  listReports = (merchantId: number, page: number = 1, limit: number = 10) => {
    return this.financeReportRepo.findAndCount({
      where: { merchantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  };

  /**
   * SSE 实时推送报表生成处理进度
   */
  progressSse = (taskId: string): Observable<SseEvent> => {
    return new Observable((observer) => {
      const keySet = TaskProgressKeys.FINANCE_REPORT;
      const channel = keySet.getProgressChannel(taskId);
      let subClient: Redis | null = null;

      const init = async () => {
        try {
          const cached = (await this.redisService.getTaskProgressCache(
            keySet,
            taskId,
          )) as TaskProgressPayload | null;

          if (cached) {
            observer.next({ data: cached });
            // 使用常量值判断完成状态
            if (
              cached.status === FinanceReportProgressPhase.COMPLETED ||
              cached.status === FinanceReportProgressPhase.FAILED
            ) {
              observer.complete();
              return;
            }
          }

          subClient = this.redisService.createSubscriber();
          void subClient.subscribe(channel, (err: Error | null) => {
            if (err) {
              this.logger.error(
                `报表 SSE 订阅失败 [${taskId}]: ${err.message}`,
              );
              observer.error(err);
            }
          });

          subClient.on('message', (_: string, message: string) => {
            try {
              const data = JSON.parse(message) as TaskProgressPayload;
              observer.next({ data });
              // 使用常量值判断完成状态
              if (
                data.status === FinanceReportProgressPhase.COMPLETED ||
                data.status === FinanceReportProgressPhase.FAILED
              ) {
                observer.complete();
                if (subClient) {
                  subClient.unsubscribe(channel).catch(() => {});
                }
              }
            } catch {
              observer.next({ data: message });
            }
          });
        } catch (err) {
          observer.error(err);
        }
      };

      void init();

      return () => {
        if (subClient) {
          subClient.unsubscribe(channel).catch(() => {});
          subClient.quit().catch(() => {});
        }
      };
    });
  };
}
