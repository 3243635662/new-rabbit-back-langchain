import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { ReportNarrative } from '../../../../types/reports/report-narrative.type';
import type { ReportMetrics } from '../../../../types/reports/report-metrics.type';

/* ---------- 辅助函数 ---------- */

const money = (value?: number): string => {
  const num = Number(value || 0);
  return num.toFixed(2);
};

const percent = (value?: number): string => {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
};

/* ---------- 风险分级 ---------- */

const inferRiskLevel = (warning: string): 'low' | 'medium' | 'high' => {
  if (
    warning.includes('亏损') ||
    warning.includes('毛利润为负') ||
    warning.includes('现金流风险') ||
    warning.includes('大幅下降')
  ) {
    return 'high';
  }

  if (
    warning.includes('偏低') ||
    warning.includes('费用压力') ||
    warning.includes('库存') ||
    warning.includes('重复计入')
  ) {
    return 'medium';
  }

  return 'low';
};

/* ---------- Fallback 对比分析 ---------- */

const buildFallbackComparison = (metrics: ReportMetrics): string | undefined => {
  const comparison = metrics.comparison;
  if (!comparison) return undefined;

  const revenueRate = comparison.totalRevenueChangeRate;
  const netProfitRate = comparison.netProfitChangeRate;

  const revenueText =
    revenueRate === undefined
      ? '收入变化率暂无有效数据'
      : `收入变化率为 ${percent(revenueRate)}`;

  const profitText =
    netProfitRate === undefined
      ? '净利润变化率暂无有效数据'
      : `净利润变化率为 ${percent(netProfitRate)}`;

  return `本期对比分析模式为 ${comparison.compareMode}，${revenueText}，${profitText}。`;
};

/* ---------- Fallback 经营建议 ---------- */

const buildFallbackSuggestions = (metrics: ReportMetrics): string[] => {
  const suggestions: string[] = [];

  if (metrics.grossProfitRate < 0.2) {
    suggestions.push('建议复核商品定价和成本结构，优先关注毛利率较低的商品或分类。');
  }

  if (metrics.totalExpense > metrics.grossProfit) {
    suggestions.push(
      '建议控制期间费用增长，重点检查营销、人工、管理等费用支出是否与收入增长匹配。',
    );
  }

  if (metrics.netCashflow < 0) {
    suggestions.push('建议加强现金流管理，关注应收款回收、库存采购节奏和大额支出安排。');
  }

  if ((metrics.inventoryTurnover || 0) < 0.5 && metrics.inventoryValue > 0) {
    suggestions.push('建议关注库存周转效率，优先处理库存金额较高且销售贡献较低的商品。');
  }

  if (metrics.cashflowToProfitRatio !== undefined && metrics.cashflowToProfitRatio < 0.5) {
    suggestions.push('建议关注利润质量，检查净利润是否能够转化为稳定现金流。');
  }

  if (suggestions.length === 0) {
    suggestions.push('建议持续跟踪收入、利润、费用和现金流变化，保持经营数据的定期复盘。');
  }

  return suggestions.slice(0, 6);
};

/* ---------- Fallback 入口 ---------- */

/**
 * LLM 不可用或 aiInsight=false 时，基于指标生成基础文字解读
 * - summary：用指标数据拼装总体概括
 * - keyFindings：4 条核心数据描述 + Top 商品/分类
 * - risks：基于 warnings 推断风险等级
 * - suggestions：基于指标异常触发条件
 */
export const buildFallbackNarrative = (state: FinanceReportGraphState): ReportNarrative => {
  const metrics = state.metrics!;
  const chartCount = state.chartResult?.charts?.length || 0;

  const summary =
    `本期报表期间内，总收入为 ${money(metrics.totalRevenue)}，` +
    `总成本为 ${money(metrics.totalCost)}，毛利润为 ${money(metrics.grossProfit)}，` +
    `净利润为 ${money(metrics.netProfit)}。` +
    `毛利率为 ${percent(metrics.grossProfitRate)}，净利率为 ${percent(metrics.netProfitRate)}。` +
    `本期净现金流为 ${money(metrics.netCashflow)}。` +
    (chartCount > 0
      ? `系统已生成 ${chartCount} 个可视化图表，用于辅助查看经营指标、利润结构、销售表现和现金流情况。`
      : '');

  const keyFindings: string[] = [
    `本期总收入为 ${money(metrics.totalRevenue)}，其中订单收入为 ${money(metrics.orderRevenue || 0)}。`,
    `本期毛利润为 ${money(metrics.grossProfit)}，毛利率为 ${percent(metrics.grossProfitRate)}。`,
    `本期净利润为 ${money(metrics.netProfit)}，净利率为 ${percent(metrics.netProfitRate)}。`,
    `本期现金流入为 ${money(metrics.cashInflow)}，现金流出为 ${money(metrics.cashOutflow)}，净现金流为 ${money(metrics.netCashflow)}。`,
  ];

  if (metrics.topGoods) {
    keyFindings.push(
      `销售额最高的商品为「${metrics.topGoods.name}」，销售额为 ${money(metrics.topGoods.amount)}。`,
    );
  }

  if (metrics.topCategory) {
    keyFindings.push(
      `销售额最高的分类为「${metrics.topCategory.name}」，销售额为 ${money(metrics.topCategory.amount)}。`,
    );
  }

  const risks = (metrics.warnings || [])
    .slice(0, 5)
    .map((warning) => ({
      title: '经营风险提示',
      level: inferRiskLevel(warning),
      description: warning,
    }));

  return {
    summary,
    keyFindings: keyFindings.slice(0, 6),
    comparison: buildFallbackComparison(metrics),
    forecast: metrics.forecast?.summary,
    risks,
    suggestions: buildFallbackSuggestions(metrics),
  };
};
