/** 异步任务进度（Pub/Sub 消息体 + SSE 载荷） */
export interface TaskProgressPayload {
  progress: number;
  status: string;
  message?: string;
  failReason?: string;
}

/**
 * 某业务模块在 Redis 上的进度维度：
 * - channel：Pub/Sub，实时推送
 * - dataKey：字符串缓存，SSE 连接时先读兜底
 */
export type TaskProgressRedisKeySet = {
  getProgressChannel: (taskId: string) => string;
  getProgressDataKey: (taskId: string) => string;
};
