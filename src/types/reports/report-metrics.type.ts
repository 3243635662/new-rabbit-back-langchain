/**
 * 报表指标
 *
 * 只有前 4 个字段为必填核心指标，其余全部可选。
 * 通过 [key: string]: unknown 索引签名，LLM 可以自由输出任何个性化指标，
 * 这些额外字段会被透传到下游（叙事生成、图表生成、HTML 渲染）。
 */
export interface ReportMetrics {
  /** 总收入（必填） */
  totalRevenue: number;
  /** 净利润（必填） */
  netProfit: number;
  /** 订单数（必填） */
  orderCount: number;
  /** 预警信息（必填） */
  warnings: string[];

  /** LLM 可以自由输出以下常用指标，也可以输出任意其他字段 */
  totalCost?: number;
  grossProfit?: number;
  grossProfitRate?: number;
  totalExpense?: number;
  netProfitRate?: number;
  orderRevenue?: number;
  costToRevenueRate?: number;
  expenseToRevenueRate?: number;
  inventoryTurnover?: number;
  cashflowToProfitRatio?: number;
  averageOrderValue?: number;
  inventoryValue?: number;
  inventoryQuantity?: number;
  cashInflow?: number;
  cashOutflow?: number;
  netCashflow?: number;
  topCategory?: { name: string; amount: number };
  topGoods?: { name: string; amount: number; quantity: number };
  costStructure?: Array<{ name: string; value: number }>;
  comparison?: {
    compareMode: 'day' | 'month' | 'year';
    totalRevenueChangeRate?: number;
    totalRevenueChangeAmount?: number;
    grossProfitChangeRate?: number;
    grossProfitChangeAmount?: number;
    grossProfitRateChange?: number;
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
  forecast?: { summary: string };

  /** LLM 个性化指标完全开放 */
  [key: string]: unknown;
}
