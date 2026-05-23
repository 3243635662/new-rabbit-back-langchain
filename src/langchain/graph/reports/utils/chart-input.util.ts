import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { ReportMetrics } from '../../../../types/reports/report-metrics.type';
import type { NormalizedReportData } from '../../../../types/reports/normalized-report-data.type';

/* ---------- 工具函数 ---------- */

const round2 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

/* ---------- 模式与数量 ---------- */

export type ChartMode = 'basic' | 'rich';

export const getChartMode = (state: FinanceReportGraphState): ChartMode => {
  return state.request.options?.chartEnabled === true ? 'rich' : 'basic';
};

export const getChartCountRange = (
  chartMode: ChartMode,
): { min: number; max: number } => {
  return chartMode === 'rich' ? { min: 4, max: 5 } : { min: 2, max: 3 };
};

/* ---------- 现金流日聚合 ---------- */

type CashflowDailyRow = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
};

const buildCashflowDailyRows = (
  data: NormalizedReportData,
): CashflowDailyRow[] => {
  const map = new Map<string, CashflowDailyRow>();

  for (const item of data.cashflowItems || []) {
    const date = item.date || '未知日期';
    if (!map.has(date)) {
      map.set(date, { date, inflow: 0, outflow: 0, net: 0 });
    }
    const row = map.get(date)!;
    const amount = Number(item.amount || 0);
    if (item.type === 'inflow') {
      row.inflow += amount;
    } else {
      row.outflow += amount;
    }
    row.net = row.inflow - row.outflow;
  }

  return [...map.values()]
    .map((row) => ({
      date: row.date,
      inflow: round2(row.inflow),
      outflow: round2(row.outflow),
      net: round2(row.net),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/* ---------- 压缩 metrics ---------- */

export const compactMetricsForChart = (metrics: ReportMetrics) => {
  return {
    totalRevenue: metrics.totalRevenue,
    orderRevenue: metrics.orderRevenue,
    totalCost: metrics.totalCost,
    grossProfit: metrics.grossProfit,
    grossProfitRate: metrics.grossProfitRate,
    totalExpense: metrics.totalExpense,
    netProfit: metrics.netProfit,
    netProfitRate: metrics.netProfitRate,

    costToRevenueRate: metrics.costToRevenueRate,
    expenseToRevenueRate: metrics.expenseToRevenueRate,
    inventoryTurnover: metrics.inventoryTurnover,
    cashflowToProfitRatio: metrics.cashflowToProfitRatio,

    orderCount: metrics.orderCount,
    averageOrderValue: metrics.averageOrderValue,

    inventoryValue: metrics.inventoryValue,
    inventoryQuantity: metrics.inventoryQuantity,

    cashInflow: metrics.cashInflow,
    cashOutflow: metrics.cashOutflow,
    netCashflow: metrics.netCashflow,

    topCategory: metrics.topCategory,
    topGoods: metrics.topGoods,
    costStructure: metrics.costStructure,
    comparison: metrics.comparison,
    warnings: metrics.warnings,
  };
};

/* ---------- 压缩 normalizedData ---------- */

export const compactNormalizedDataForChart = (data: NormalizedReportData) => {
  return {
    salesByCategory: [...(data.salesByCategory || [])]
      .sort((a, b) => (b.salesAmount || 0) - (a.salesAmount || 0))
      .slice(0, 10),

    salesByGoods: [...(data.salesByGoods || [])]
      .sort((a, b) => (b.salesAmount || 0) - (a.salesAmount || 0))
      .slice(0, 10),

    inventoryItems: [...(data.inventoryItems || [])]
      .sort((a, b) => (b.inventoryValue || 0) - (a.inventoryValue || 0))
      .slice(0, 10),

    cashflowDaily: buildCashflowDailyRows(data).slice(0, 31),

    incomeItemsCount: data.incomeItems?.length || 0,
    costItemsCount: data.costItems?.length || 0,
    expenseItemsCount: data.expenseItems?.length || 0,
    cashflowItemsCount: data.cashflowItems?.length || 0,
  };
};

/* ---------- 构造 LLM 输入 ---------- */

export const buildChartLLMInput = (
  state: FinanceReportGraphState,
  chartMode: ChartMode,
) => {
  const range = getChartCountRange(chartMode);

  return {
    chartMode,
    chartEnabled: state.request.options?.chartEnabled === true,
    chartCountRule: range,
    reportTypes: state.request.reportTypes || [],
    metrics: compactMetricsForChart(state.metrics!),
    normalizedData: compactNormalizedDataForChart(state.normalizedData!),
  };
};
