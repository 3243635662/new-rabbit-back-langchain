import { Job } from 'bullmq';
import { RedisService } from '../modules/db/redis/redis.service';
import {
  TaskProgressPayload,
  TaskProgressRedisKeySet,
} from '../types/task-progress.type';

/**
 * 统一推送异步任务进度（BullMQ + Redis Pub/Sub + Cache）
 * 适用于 RAG 知识库、财务资源解析、报表生成等异步任务
 *
 * @param job - BullMQ Job 对象
 * @param redisService - Redis 服务实例
 * @param progress - 进度百分比 (0-100)
 * @param status - 任务状态（如 RagIngestProgressPhase 或 FinanceSourceProgressPhase 的枚举值）
 * @param message - 进度描述信息
 * @param taskProgressKey - 任务进度 Redis Key 集合（如 TaskProgressKeys.RAG）
 */
export const pushTaskProgress = async (
  job: Job,
  redisService: RedisService,
  progress: number,
  status: string,
  message: string,
  taskProgressKey: TaskProgressRedisKeySet,
): Promise<void> => {
  const taskId = String(job.id);
  const payload: TaskProgressPayload = { progress, status, message };
  await job.updateProgress(progress);
  await redisService.publishTaskProgress(taskProgressKey, taskId, payload);
  await redisService.setTaskProgressCache(taskProgressKey, taskId, payload);
};
