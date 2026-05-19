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

  expenseItems: Array<{
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
