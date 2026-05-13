/** 单次检索的可观测文档元信息 */
export interface RetrievalTraceDoc {
  fileName: string;
  documentType?: string;
  score: number;
  rerankScore?: number;
  chunkIndex: number;
  page?: number;
  sheetName?: string;
  rowIndex?: number;
  section?: string;
  contentHash?: string;
  contentPreview: string;
}

/** 单次检索的可观测 trace */
export interface RetrievalTrace {
  query: string;
  retrievedCount: number;
  rerankedCount: number;
  finalContextCount: number;
  finalDocs: RetrievalTraceDoc[];
}

/** RAG 队列任务数据 */
export interface RAGJobData {
  qiniuKey: string;
  merchantId: string;
  fileName: string;
}

/** RAG 入库 SSE / Redis 进度 payload 的 status 阶段（禁止手写魔法字符串） */
export const RagIngestProgressPhase = {
  DOWNLOADING: 'downloading',
  PERSISTING: 'persisting',
  PARSING: 'parsing',
  CLEANING: 'cleaning',
  PREPARING: 'preparing',
  SPLITTING: 'splitting',
  EMBEDDING: 'embedding',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type RagIngestProgressPhaseValue =
  (typeof RagIngestProgressPhase)[keyof typeof RagIngestProgressPhase];

/** GET /knowledge-base/task/:id 在 BullMQ 中已无 Job 且库中无记录时的 status */
export const RagTaskPollStatus = {
  NOT_FOUND: 'not_found',
} as const;

export type RagTaskPollStatusValue =
  (typeof RagTaskPollStatus)[keyof typeof RagTaskPollStatus];

/** 文档入库进度回调 */
export type ProgressCallback = (
  progress: number,
  status: RagIngestProgressPhaseValue,
  message: string,
) => void | Promise<void>;

/** 支持的文档类型 */
export type SupportedDocumentType =
  | 'pdf'
  | 'docx'
  | 'csv'
  | 'excel'
  | 'txt'
  | 'json';

/** 向量化状态枚举 */
export enum IngestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
/** key → MIME 映射（从 qiniuKey 的扩展名推断） */
export const EXT_MIME_MAP: Record<string, string> = {
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};
