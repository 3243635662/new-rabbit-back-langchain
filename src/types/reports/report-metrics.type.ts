export type ReportMetrics = {
  // 收入/成本/毛利
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossProfitRate: number;

  // 费用/净利润
  totalExpense: number;
  netProfit: number;
  netProfitRate: number;

  // 新增：经营比率
  orderRevenue?: number; // 订单收入（不含发票/财务资源收入）
  costToRevenueRate?: number; // 成本收入比
  expenseToRevenueRate?: number; // 费用收入比
  inventoryTurnover?: number; // 库存周转率（简化）
  cashflowToProfitRatio?: number; // 现金流利润比

  // 订单指标
  orderCount: number;
  averageOrderValue: number;

  // 库存指标
  inventoryValue: number;
  inventoryQuantity: number;

  // 现金流
  cashInflow: number;
  cashOutflow: number;
  netCashflow: number;

  // TOP 分类/商品
  topCategory?: {
    name: string;
    amount: number;
  };

  topGoods?: {
    name: string;
    amount: number;
    quantity: number;
  };

  // 成本结构
  costStructure?: Array<{
    name: string;
    value: number;
  }>;

  // 同比/环比变化率（扩展字段）
  comparison?: {
    compareMode: 'day' | 'month' | 'year';
    totalRevenueChangeRate?: number;
    totalRevenueChangeAmount?: number;
    grossProfitChangeRate?: number;
    grossProfitChangeAmount?: number;
    grossProfitRateChange?: number; // 毛利率百分点变化
    totalExpenseChangeRate?: number;
    totalExpenseChangeAmount?: number;
    netProfitChangeRate?: number;
    netProfitChangeAmount?: number;
    orderCountChangeRate?: number;
    orderCountChangeAmount?: number;
    cashInflowChangeRate?: number;
    cashOutflowChangeRate?: number;
    netCashflowChangeRate?: number;
  };

  // 趋势预测
  forecast?: {
    summary: string;
  };

  // 预警信息
  warnings: string[];
};
