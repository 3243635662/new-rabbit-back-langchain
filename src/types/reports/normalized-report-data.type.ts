/**
 * 归一化报表数据
 * Node 3 只负责订单和库存的结构化汇总。
 * 费用和现金流由 Node 4 的 LLM 从 financeRecords 中自行计算，不在此类型中体现。
 */
export type NormalizedReportData = {
  incomeItems: Array<{
    date: string;
    amount: number;
    source: string;
    title: string;
    category?: string;
  }>;

  costItems: Array<{
    date: string;
    amount: number;
    source: string;
    title: string;
    category?: string;
  }>;

  salesByCategory: Array<{
    categoryName: string;
    salesAmount: number;
    quantity: number;
  }>;

  salesByGoods: Array<{
    goodsName: string;
    salesAmount: number;
    quantity: number;
    costAmount: number;
  }>;

  inventoryItems: Array<{
    goodsName: string;
    categoryName: string;
    stock: number;
    costPrice: number;
    inventoryValue: number;
  }>;

  cashflowItems: Array<{
    date: string;
    type: 'inflow' | 'outflow';
    amount: number;
    title: string;
    category?: string;
  }>;
};
