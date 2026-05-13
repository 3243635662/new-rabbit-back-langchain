import { DocType } from './file.type';

export interface FinanceSourceFileJobData {
  qiniuKey: string;
  merchantId: string;
  fileName: string;
  sourceFileId: number;
  docType: DocType;
}

/**
 * 财务源文件在库表中的解析流水线状态
 */
export enum FinanceSourceParseStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 财务解析 SSE / Redis 进度 payload 的 status 阶段
 */
export const FinanceSourceProgressPhase = {
  RECEIVED: 'received',
  PARSING: 'parsing',
  EXTRACTING: 'extracting',
  PERSISTING: 'persisting',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type FinanceSourceProgressPhaseValue =
  (typeof FinanceSourceProgressPhase)[keyof typeof FinanceSourceProgressPhase];

/** GET /finance/task/:id 无 Bull Job 且无库记录时的 status */
export const FinanceTaskPollStatus = {
  NOT_FOUND: 'not_found',
} as const;
