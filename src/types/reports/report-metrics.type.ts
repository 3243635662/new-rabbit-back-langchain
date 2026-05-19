export type ReportMetrics = {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossProfitRate: number;

  totalExpense: number;
  netProfit: number;
  netProfitRate: number;

  orderCount: number;
  averageOrderValue: number;

  inventoryValue: number;
  inventoryQuantity: number;

  cashInflow: number;
  cashOutflow: number;
  netCashflow: number;

  topCategory?: {
    name: string;
    amount: number;
  };

  topGoods?: {
    name: string;
    amount: number;
    quantity: number;
  };

  costStructure?: Array<{
    name: string;
    value: number;
  }>;

  comparison?: {
    compareMode: 'day' | 'month' | 'year';
    totalRevenueChangeRate?: number;
    netProfitChangeRate?: number;
    orderCountChangeRate?: number;
  };

  forecast?: {
    summary: string;
  };

  warnings: string[];
};
