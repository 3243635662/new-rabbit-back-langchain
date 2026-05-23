export type OrderReportItem = {
  goodsId: number;
  goodsName: string;
  categoryName: string;
  quantity: number;
  salePrice: number;
  costPrice: number;
  totalAmount: number;
};

export type OrderReportRecord = {
  id: number;
  orderNo: string;
  createdAt: string;
  payAmount: number;
  items: OrderReportItem[];
};

export type InventoryReportRecord = {
  goodsId: number;
  goodsName: string;
  categoryName: string;
  stock: number;
  costPrice: number;
};

/**
 * 财务提取记录（发票 + 合同 + 通用图片等，统一类型）
 * 与 FinanceExtractedRecord 实体一一对应，只保留 id / recordType / extractedDate / raw
 * 不再在 Node 2 中程序化提取 amount / type / title 等字段 —— 全部交给 AI 从 raw 解析
 */
export type FinanceExtractedRecordReport = {
  id: number;
  /** 解析后的实际业务类型：invoice / contract / general_image 等 */
  recordType: string;
  /** 资源实际日期（LLM 提取），用于报表按日期过滤 */
  extractedDate: string | null;
  /** 原始 OCR/解析结果 JSON（含 structured_fields 等），AI 负责从中提取财务数据 */
  raw: Record<string, unknown>;
};

export type ReportRawData = {
  orders: OrderReportRecord[];
  inventory: InventoryReportRecord[];
  inventoryLogs: InventoryLogReportItem[];
  /** 所有财务提取记录（发票 + 其他资源），由 Node 3/4 的 AI 根据 recordType + raw 分类和计算 */
  financeRecords: FinanceExtractedRecordReport[];
};

// 库存变动日志的报表展示类型
export type InventoryLogReportItem = {
  id: number;
  goodsName: string;
  categoryName: string;
  change: number; // 变动数量（正=入库，负=出库）
  currentStock: number; // 变动后快照
  type: string; // ORDER / REFUND / MANUAL_ADD / MANUAL_REDUCE
  createdAt: string;
};
