import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { ReportMetrics } from '../../../../types/reports/report-metrics.type';
import type { NormalizedReportData } from '../../../../types/reports/normalized-report-data.type';
import type {
  ReportChart,
  ReportChartResult,
} from '../../../../types/reports/report-chart.type';
import { withDefaultEchartsStyle } from './echarts-style.util';
import type { ChartMode } from './chart-input.util';

/* ---------- 辅助函数 ---------- */

const round2 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

const makeChart = (
  id: string,
  title: string,
  type: 'bar' | 'line' | 'pie',
  description: string,
  option: Record<string, unknown>,
): ReportChart => ({
  id,
  title,
  type,
  description,
  echartsOption: withDefaultEchartsStyle(option),
});

const dedupeCharts = (charts: ReportChart[]): ReportChart[] => {
  return Array.from(new Map(charts.map((c) => [c.id, c])).values());
};

/* ---------- Fallback 图表 ---------- */

const buildCoreMetricsFallbackChart = (metrics: ReportMetrics): ReportChart => {
  return makeChart(
    'core-business-metrics',
    '核心经营指标',
    'bar',
    '展示收入、成本、费用、毛利润和净利润等核心指标',
    {
      title: { text: '核心经营指标', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 56, right: 32, top: 60, bottom: 48 },
      xAxis: {
        type: 'category',
        data: ['总收入', '总成本', '总费用', '毛利润', '净利润'],
      },
      yAxis: { type: 'value', name: '金额' },
      series: [
        {
          name: '金额',
          type: 'bar',
          data: [
            round2(metrics.totalRevenue),
            round2(metrics.totalCost),
            round2(metrics.totalExpense),
            round2(metrics.grossProfit),
            round2(metrics.netProfit),
          ],
          label: { show: true, position: 'top' },
        },
      ],
    },
  );
};

const buildProfitFallbackChart = (metrics: ReportMetrics): ReportChart => {
  return makeChart(
    'profit-structure',
    '利润构成',
    'bar',
    '展示毛利润、费用和净利润的构成关系',
    {
      title: { text: '利润构成', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 56, right: 32, top: 60, bottom: 48 },
      xAxis: { type: 'category', data: ['毛利润', '总费用', '净利润'] },
      yAxis: { type: 'value', name: '金额' },
      series: [
        {
          name: '金额',
          type: 'bar',
          data: [
            round2(metrics.grossProfit),
            round2(metrics.totalExpense),
            round2(metrics.netProfit),
          ],
          label: { show: true, position: 'top' },
        },
      ],
    },
  );
};

const buildCashflowFallbackChart = (metrics: ReportMetrics): ReportChart => {
  return makeChart(
    'cashflow-overview',
    '现金流概览',
    'bar',
    '展示现金流入、现金流出和净现金流',
    {
      title: { text: '现金流概览', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 56, right: 32, top: 60, bottom: 48 },
      xAxis: { type: 'category', data: ['现金流入', '现金流出', '净现金流'] },
      yAxis: { type: 'value', name: '金额' },
      series: [
        {
          name: '金额',
          type: 'bar',
          data: [
            round2(metrics.cashInflow),
            round2(metrics.cashOutflow),
            round2(metrics.netCashflow),
          ],
          label: { show: true, position: 'top' },
        },
      ],
    },
  );
};

const buildRateFallbackChart = (metrics: ReportMetrics): ReportChart => {
  return makeChart(
    'business-rates',
    '利润率与经营比率',
    'bar',
    '展示毛利率、净利率、成本收入比和费用收入比等关键比率',
    {
      title: { text: '利润率与经营比率', left: 'center' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: '{b}: {c}',
      },
      grid: { left: 56, right: 32, top: 60, bottom: 48 },
      xAxis: {
        type: 'category',
        data: ['毛利率', '净利率', '成本收入比', '费用收入比'],
      },
      yAxis: { type: 'value', name: '比率' },
      series: [
        {
          name: '比率',
          type: 'bar',
          data: [
            round2(metrics.grossProfitRate),
            round2(metrics.netProfitRate),
            round2(metrics.costToRevenueRate || 0),
            round2(metrics.expenseToRevenueRate || 0),
          ],
          label: { show: true, position: 'top' },
        },
      ],
    },
  );
};

const buildCostStructureFallbackChart = (
  metrics: ReportMetrics,
): ReportChart => {
  const items = (metrics.costStructure || []).slice(0, 8);
  return makeChart(
    'cost-structure',
    '成本费用结构',
    'pie',
    '展示成本与费用的构成占比',
    {
      title: { text: '成本费用结构', left: 'center' },
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left' },
      series: [
        {
          name: '成本费用结构',
          type: 'pie',
          radius: '55%',
          center: ['50%', '60%'],
          data: items.map((item) => ({
            name: item.name,
            value: round2(item.value),
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          label: { formatter: '{b}: {d}%' },
        },
      ],
    },
  );
};

const buildSalesCategoryFallbackChart = (
  data: NormalizedReportData,
): ReportChart => {
  const items = [...(data.salesByCategory || [])]
    .sort((a, b) => (b.salesAmount || 0) - (a.salesAmount || 0))
    .slice(0, 10);
  return makeChart(
    'sales-category-ranking',
    '分类销售排行',
    'bar',
    '按商品分类展示销售额排行',
    {
      title: { text: '分类销售排行', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 32, top: 60, bottom: 48 },
      xAxis: { type: 'value', name: '销售额' },
      yAxis: {
        type: 'category',
        data: items.map((item) => item.categoryName).reverse(),
      },
      series: [
        {
          name: '销售额',
          type: 'bar',
          data: items.map((item) => round2(item.salesAmount)).reverse(),
          label: { show: true, position: 'right' },
        },
      ],
    },
  );
};

const buildSalesGoodsFallbackChart = (
  data: NormalizedReportData,
): ReportChart => {
  const items = [...(data.salesByGoods || [])]
    .sort((a, b) => (b.salesAmount || 0) - (a.salesAmount || 0))
    .slice(0, 10);
  return makeChart(
    'sales-goods-ranking',
    '商品销售排行',
    'bar',
    '按商品展示销售额排行',
    {
      title: { text: '商品销售排行', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 32, top: 60, bottom: 48 },
      xAxis: { type: 'value', name: '销售额' },
      yAxis: {
        type: 'category',
        data: items.map((item) => item.goodsName).reverse(),
      },
      series: [
        {
          name: '销售额',
          type: 'bar',
          data: items.map((item) => round2(item.salesAmount)).reverse(),
          label: { show: true, position: 'right' },
        },
      ],
    },
  );
};

const buildCashflowTrendFallbackChart = (
  data: NormalizedReportData,
): ReportChart => {
  const dates: string[] = [];
  const inflows: number[] = [];
  const outflows: number[] = [];
  const nets: number[] = [];

  for (const item of [...(data.cashflowItems || [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 31)) {
    if (!dates.includes(item.date)) {
      dates.push(item.date);
      inflows.push(0);
      outflows.push(0);
      nets.push(0);
    }
  }

  for (const item of data.cashflowItems || []) {
    const idx = dates.indexOf(item.date);
    if (idx >= 0) {
      const amount = Number(item.amount || 0);
      if (item.type === 'inflow') {
        inflows[idx] += amount;
      } else {
        outflows[idx] += amount;
      }
    }
  }

  return makeChart(
    'cashflow-trend',
    '现金流趋势',
    'line',
    '展示每日现金流入、流出和净现金流变化趋势',
    {
      title: { text: '现金流趋势', left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { data: ['现金流入', '现金流出', '净现金流'], top: 30 },
      grid: { left: 56, right: 32, top: 80, bottom: 48 },
      xAxis: { type: 'category', data: dates, boundaryGap: false },
      yAxis: { type: 'value', name: '金额' },
      series: [
        {
          name: '现金流入',
          type: 'line',
          data: inflows.map(round2),
          smooth: true,
        },
        {
          name: '现金流出',
          type: 'line',
          data: outflows.map(round2),
          smooth: true,
        },
        {
          name: '净现金流',
          type: 'line',
          data: nets.map(round2),
          smooth: true,
          lineStyle: { type: 'dashed' },
        },
      ],
    },
  );
};

const buildComparisonFallbackChart = (metrics: ReportMetrics): ReportChart => {
  const c = metrics.comparison;
  return makeChart(
    'comparison-changes',
    '对比变化',
    'bar',
    '展示核心指标对比变化率',
    {
      title: { text: '对比变化', left: 'center' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: '{b}: {c}',
      },
      grid: { left: 56, right: 32, top: 60, bottom: 48 },
      xAxis: {
        type: 'category',
        data: ['收入变化率', '毛利变化率', '净利润变化率', '费用变化率'],
      },
      yAxis: { type: 'value', name: '变化率' },
      series: [
        {
          name: '变化率',
          type: 'bar',
          data: [
            round2(c?.totalRevenueChangeRate || 0),
            round2(c?.grossProfitChangeRate || 0),
            round2(c?.netProfitChangeRate || 0),
            round2(c?.totalExpenseChangeRate || 0),
          ],
          label: { show: true, position: 'top' },
        },
      ],
    },
  );
};

/* ---------- Fallback 入口 ---------- */

/**
 * LLM 失败、数据不足或没有模型依赖时，生成默认图表配置
 * - basic 模式：3 张图（核心指标、利润构成、现金流概览）
 * - rich 模式：有数据就尽量多生成（最多 10 张）
 */
export const buildFallbackCharts = (
  state: FinanceReportGraphState,
  chartMode: ChartMode,
): ReportChartResult => {
  const metrics = state.metrics!;
  const data = state.normalizedData!;
  const charts: ReportChart[] = [];

  charts.push(buildCoreMetricsFallbackChart(metrics));
  charts.push(buildProfitFallbackChart(metrics));
  charts.push(buildCashflowFallbackChart(metrics));

  if (chartMode === 'rich') {
    charts.push(buildRateFallbackChart(metrics));

    if ((metrics.costStructure || []).length > 0) {
      charts.push(buildCostStructureFallbackChart(metrics));
    }

    if ((data.salesByCategory || []).length > 0) {
      charts.push(buildSalesCategoryFallbackChart(data));
    }

    if ((data.salesByGoods || []).length > 0) {
      charts.push(buildSalesGoodsFallbackChart(data));
    }

    if ((data.cashflowItems || []).length > 0) {
      charts.push(buildCashflowTrendFallbackChart(data));
    }

    if (metrics.comparison) {
      charts.push(buildComparisonFallbackChart(metrics));
    }
  }

  const max = chartMode === 'rich' ? 10 : 5;

  return {
    charts: dedupeCharts(charts).slice(0, max),
  };
};
