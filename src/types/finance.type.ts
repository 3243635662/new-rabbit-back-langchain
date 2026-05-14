import { DocType } from './file.type';

/**
 * 财务源文件处理 Job 的入参数据
 */
export interface FinanceSourceFileJobData {
  /** 七牛云文件 Key */
  qiniuKey: string;
  /** 商户 ID */
  merchantId: string;
  /** 原始文件名 */
  fileName: string;
  /** 数据库中的 FinanceSourceFile ID */
  sourceFileId: number;
  /** 文件格式类型 (pdf/img/docx) */
  docType: DocType;
  /** 业务逻辑类型 (img/invoice/contract) */
  sourceType: string;
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

/**
 * 【业务核心数据】
 * 资源解析好的结构化记录。
 * 该接口只包含清洗后的核心业务字段，通常直接映射到数据库的 FinanceExtractedRecord 表。
 */
export interface FinanceVatInvoiceRecord {
  recordType: 'invoice';

  /**
   * 开票日期，格式：YYYY-MM-DD
   */
  date: string | null;

  /**
   * 不含税金额
   */
  amount: number | null;

  /**
   * 税额
   */
  taxAmount: number | null;

  /**
   * 价税合计
   */
  totalAmount: number | null;

  /**
   * 销售方名称
   */
  seller: string | null;

  /**
   * 购买方名称
   */
  buyer: string | null;

  /**
   * 发票业务分类：商品采购 / 物流费用 / 办公设备 / 办公用品 / 其他费用
   */
  category: string | null;

  /**
   * 发票号码
   */
  invoiceNo: string | null;

  /**
   * 交易对方。对于商家进项发票，通常是销售方。
   */
  counterparty: string | null;

  /**
   * 当前先给固定值，后续可以根据 OCR 字段完整度动态计算
   */
  confidence: number;

  /**
   * 简短摘要
   */
  summary: string;
}

/**
 * 【服务交互全量数据】
 * 腾讯云 OCR 服务识别后的完整返回包装。
 *
 * ---
 * 💡 区别说明：
 * 1. FinanceVatInvoiceRecord: 纯粹的业务“结果”，只含核心字段，用于入库。
 * 2. FinanceVatInvoiceOcrResult: 包含 Record 在内的完整“报告”，含原始响应、明细项、警告等。
 */
export interface FinanceVatInvoiceOcrResult {
  /**
   * 单张发票识别结果。
   * 第一版只处理单张发票，所以这里不是数组。
   */
  record: FinanceVatInvoiceRecord | null;

  /**
   * OCR 原始文本，适合放入 raw.rawText
   */
  rawText: string;

  /**
   * 识别过程中的提示或字段缺失警告
   */
  warnings: string[];

  /**
   * 发票字段 Map，例如：
   * {
   *   发票号码: '12345678',
   *   销售方名称: 'xxx公司'
   * }
   */
  fields: Record<string, string>;

  /**
   * 发票明细项。
   * 腾讯 OCR 返回的 Items。
   */
  items: Array<Record<string, any>>;

  /**
   * 腾讯 OCR 原始响应。
   * 生产环境如果担心 raw 过大，可以不入库。
   */
  rawResponse?: unknown;
}
