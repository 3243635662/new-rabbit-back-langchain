import type { ReportNarrative } from '../../../../types/reports/report-narrative.type';
import type { LLMReportNarrative } from '../schemas/report-narrative.schema';

/* ---------- 辅助函数 ---------- */

const trimText = (value?: string, max = 500): string => {
  return String(value || '')
    .trim()
    .slice(0, max);
};

const uniqueNonEmpty = (items: string[], max: number): string[] => {
  return Array.from(
    new Set(items.map((item) => item.trim()).filter(Boolean)),
  ).slice(0, max);
};

/* ---------- 清洗入口 ---------- */

/**
 * 清洗 LLM 输出的 ReportNarrative
 * - 截断过长文本
 * - 去重 keyFindings / suggestions
 * - 过滤空 risk
 * - keyFindings 和 suggestions 兜底不为空
 */
export const sanitizeNarrative = (
  narrative: LLMReportNarrative,
): ReportNarrative => {
  const keyFindings = uniqueNonEmpty(narrative.keyFindings || [], 8);
  const suggestions = uniqueNonEmpty(narrative.suggestions || [], 8);

  return {
    summary: trimText(narrative.summary, 800),

    keyFindings:
      keyFindings.length > 0
        ? keyFindings
        : [
            '本期报表已完成核心经营指标统计，可结合图表查看收入、利润、现金流和销售结构表现。',
          ],

    comparison: narrative.comparison
      ? trimText(narrative.comparison, 600)
      : undefined,

    forecast: narrative.forecast
      ? trimText(narrative.forecast, 600)
      : undefined,

    risks: (narrative.risks || [])
      .filter((risk) => risk.title && risk.description)
      .slice(0, 6)
      .map((risk) => ({
        title: trimText(risk.title, 80),
        level: risk.level,
        description: trimText(risk.description, 300),
      })),

    suggestions:
      suggestions.length > 0
        ? suggestions
        : ['建议持续跟踪收入、利润、费用和现金流变化，定期复盘经营数据。'],
  };
};
