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
  invoices: InvoiceReportRecord[];
  financeResources: FinanceResourceRecord[];
};
