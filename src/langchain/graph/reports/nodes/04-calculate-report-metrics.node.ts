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

/* ---------- 解析 LLM 返回的 JSON → ReportMetrics ---------- */

/**
 * 宽松解析：只校验核心必填字段，其余字段全部透传。
 * LLM 可以自由输出个性化指标，不做格式转换和强制覆盖。
 */
const parseLLMMetrics = (
  json: Record<string, unknown>,
  rawDataSummary: { orderCount: number },
): ReportMetrics => {
  const warningsRaw = Array.isArray(json.warnings)
    ? json.warnings.map(String)
    : [];

  // 核心必填字段（使用 num 容错，不强制 round2，信任 LLM 输出精度）
  const metrics: ReportMetrics = {
    totalRevenue: num(json.totalRevenue),
    netProfit: num(json.netProfit),
    orderCount: num(json.orderCount, rawDataSummary.orderCount),
    warnings: warningsRaw,
  };

  // 其他字段全部透传（LLM 输出什么就保留什么）
  for (const [key, val] of Object.entries(json)) {
    if (
      key === 'totalRevenue' ||
      key === 'netProfit' ||
      key === 'orderCount' ||
      key === 'warnings'
    ) {
      continue;
    }
    metrics[key] = val;
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
