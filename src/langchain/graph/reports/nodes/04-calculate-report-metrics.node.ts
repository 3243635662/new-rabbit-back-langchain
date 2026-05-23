import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { ReportMetrics } from '../../../../types/reports/report-metrics.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { buildCalculateAllMetricsPrompt } from '../prompts/calculate-all-metrics.prompt';

/* ---------- 辅助：从 LLM 响应中提取 JSON ---------- */

const extractJson = (content: string): Record<string, unknown> => {
  const trimmed = content.trim();
  // 先尝试直接 parse
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    /* 继续 */
  }
  // 去掉 markdown 包裹
  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  }
  throw new Error('LLM 未返回合法 JSON');
};

const num = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return fallback;
};

const round2 = (v: number): number => Number(v.toFixed(2));
const round4 = (v: number): number => Number(v.toFixed(4));

/* ---------- 解析 LLM 返回的 JSON → ReportMetrics ---------- */

const parseLLMMetrics = (
  json: Record<string, unknown>,
  rawDataSummary: { orderCount: number },
): ReportMetrics => {
  const totalRevenue = round2(num(json.totalRevenue));
  const totalCost = round2(num(json.totalCost));
  const totalExpense = round2(num(json.totalExpense));
  const orderRevenue = round2(num(json.orderRevenue));
  const grossProfit = round2(num(json.grossProfit));
  const netProfit = round2(num(json.netProfit));

  const cashInflow = round2(num(json.cashInflow));
  const cashOutflow = round2(num(json.cashOutflow));
  const netCashflow = round2(num(json.netCashflow));

  const orderCount = num(json.orderCount, rawDataSummary.orderCount);
  const inventoryValue = round2(num(json.inventoryValue));
  const inventoryQuantity = round2(num(json.inventoryQuantity));

  const topCat = json.topCategory as Record<string, unknown> | undefined;
  const topGoods = json.topGoods as Record<string, unknown> | undefined;
  const compRaw = json.comparison as Record<string, unknown> | null | undefined;
  const warningsRaw = Array.isArray(json.warnings)
    ? json.warnings.map(String)
    : [];
  const costStructure = Array.isArray(json.costStructure)
    ? (json.costStructure as Array<Record<string, unknown>>).map((c) => ({
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        name: String(c.name || ''),
        value: round2(num(c.value)),
      }))
    : [];

  const metrics: ReportMetrics = {
    totalRevenue,
    totalCost,
    grossProfit,
    grossProfitRate: round4(num(json.grossProfitRate)),
    totalExpense,
    netProfit,
    netProfitRate: round4(num(json.netProfitRate)),
    orderRevenue,
    costToRevenueRate: round4(num(json.costToRevenueRate)),
    expenseToRevenueRate: round4(num(json.expenseToRevenueRate)),
    inventoryTurnover: round4(num(json.inventoryTurnover)),
    cashflowToProfitRatio: round4(num(json.cashflowToProfitRatio)),
    orderCount,
    averageOrderValue: round2(num(json.averageOrderValue)),
    inventoryValue,
    inventoryQuantity,
    cashInflow,
    cashOutflow,
    netCashflow,
    topCategory: topCat?.name
      ? {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          name: String(topCat.name),
          amount: round2(num(topCat.amount)),
        }
      : undefined,
    topGoods: topGoods?.name
      ? {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          name: String(topGoods.name),
          amount: round2(num(topGoods.amount)),
          quantity: num(topGoods.quantity),
        }
      : undefined,
    costStructure,
    comparison: undefined,
    warnings: warningsRaw,
  };

  // 对比分析
  if (compRaw && compRaw.compareMode) {
    metrics.comparison = {
      compareMode: compRaw.compareMode as 'year' | 'month' | 'day',
      totalRevenueChangeRate: num(compRaw.totalRevenueChangeRate),
      totalRevenueChangeAmount: round2(num(compRaw.totalRevenueChangeAmount)),
      grossProfitChangeRate: num(compRaw.grossProfitChangeRate),
      grossProfitChangeAmount: round2(num(compRaw.grossProfitChangeAmount)),
      grossProfitRateChange: num(compRaw.grossProfitRateChange),
      totalExpenseChangeRate: num(compRaw.totalExpenseChangeRate),
      totalExpenseChangeAmount: round2(num(compRaw.totalExpenseChangeAmount)),
      netProfitChangeRate: num(compRaw.netProfitChangeRate),
      netProfitChangeAmount: round2(num(compRaw.netProfitChangeAmount)),
      orderCountChangeRate: num(compRaw.orderCountChangeRate),
      orderCountChangeAmount: round2(num(compRaw.orderCountChangeAmount)),
      cashInflowChangeRate: num(compRaw.cashInflowChangeRate),
      cashOutflowChangeRate: num(compRaw.cashOutflowChangeRate),
      netCashflowChangeRate: num(compRaw.netCashflowChangeRate),
    };
  }

  return metrics;
};

/* ========== 节点入口 ========== */

/**
 * 节点四：AI 全量计算报表指标
 *
 * 职责：
 * - 将 normalizedData + rawData 摘要 + 可选对比数据一并交给 LLM
 * - LLM 根据数据直接计算出所有财务指标
 * - 解析 LLM 返回的 JSON，写入 state.metrics
 *
 * 输入：state.normalizedData, state.rawData, state.comparisonNormalizedData, state.comparisonRange
 * 输出：state.metrics
 */
export const buildCalculateReportMetricsNode = (
  deps: FinanceReportNodeDeps,
) => {
  return async (
    state: FinanceReportGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<FinanceReportGraphState>> => {
    console.log('[Node 4] 进入节点：AI 计算报表指标');
    if (!state.normalizedData) {
      throw new Error('缺少 normalizedData，无法计算报表指标');
    }

    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;
    const extendLock = config?.configurable?.extendLock as
      | (() => Promise<void>)
      | undefined;

    await pushProgress?.(
      50,
      FinanceReportProgressPhase.CALCULATING,
      '正在使用 AI 计算全部财务指标...',
    );
    await extendLock?.();

    const allFinanceRecords = state.rawData?.financeRecords || [];
    const financeRecordsCount = allFinanceRecords.length;

    const rawDataSummary = {
      orderCount: state.rawData?.orders?.length || 0,
      inventoryItemCount: state.rawData?.inventory?.length || 0,
      inventoryLogCount: state.rawData?.inventoryLogs?.length || 0,
      financeRecordsCount,
    };

    const hasComparison =
      state.request?.options?.comparisonAnalysis &&
      state.comparisonNormalizedData &&
      state.comparisonRange;

    const prompt = buildCalculateAllMetricsPrompt({
      reportTypes: state.request.reportTypes || [],
      startDate: state.request.startDate,
      endDate: state.request.endDate,
      comparisonMode: hasComparison
        ? state.comparisonRange!.compareMode
        : undefined,
      normalizedData: state.normalizedData,
      comparisonNormalizedData: hasComparison
        ? state.comparisonNormalizedData
        : undefined,
      financeRecords: allFinanceRecords,
      comparisonFinanceRecords: hasComparison
        ? state.comparisonRawData?.financeRecords || []
        : undefined,
      rawDataSummary,
      comparisonRawDataSummary: hasComparison
        ? {
            orderCount: state.comparisonRawData?.orders?.length || 0,
            inventoryItemCount: state.comparisonRawData?.inventory?.length || 0,
            financeRecordsCount: (state.comparisonRawData?.financeRecords || [])
              .length,
          }
        : undefined,
    });

    const model = deps.getModel();
    const response = await model.invoke(prompt);
    const text =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    const json = extractJson(text);

    const metrics = parseLLMMetrics(json, rawDataSummary);

    const logs = [
      `AI 全量指标计算完成：收入 ${metrics.totalRevenue}，成本 ${metrics.totalCost}，净利润 ${metrics.netProfit}`,
    ];
    if (metrics.comparison) {
      logs.push(
        `对比指标计算完成：收入变化率 ${metrics.comparison.totalRevenueChangeRate ?? 0}`,
      );
    }
    if (metrics.warnings.length > 0) {
      logs.push(`生成 ${metrics.warnings.length} 条预警信息`);
    }

    console.log('[Node 4] 离开节点，返回数据（AI 全量计算）');
    return { metrics, logs };
  };
};
