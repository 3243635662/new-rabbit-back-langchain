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

export type InvoiceReportRecord = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  amount: number;
  type: 'income' | 'expense';
  title: string;
  category?: string;
};

export type FinanceResourceRecord = {
  id: number;
  recordType: string;
  createdAt: string;
  amount?: number;
  title?: string;
  structuredFields?: any;
};

export type ReportRawData = {
  orders: OrderReportRecord[];
  inventory: InventoryReportRecord[];
  inventoryLogs: InventoryLogReportItem[];
  invoices: InvoiceReportRecord[];
  financeResources: FinanceResourceRecord[];
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
