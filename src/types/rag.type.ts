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

/** 文档入库进度回调 */
export type ProgressCallback = (
  progress: number,
  status: string,
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
