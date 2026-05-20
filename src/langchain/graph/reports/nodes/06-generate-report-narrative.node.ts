import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import type { ReportNarrative } from '../../../../types/reports/report-narrative.type';
import { generateReportNarrativePrompt } from '../prompts/generate-report-narrative.prompt';
import { LLMReportNarrativeSchema } from '../schemas/report-narrative.schema';
import { buildNarrativeLLMInput } from '../utils/narrative-input.util';
import { sanitizeNarrative } from '../utils/narrative-sanitize.util';

/* ---------- 辅助函数 ---------- */

const extractJsonObject = (content: string): unknown => {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('LLM 未返回合法 JSON');
  }
};

/* ---------- LLM 调用 ---------- */

const generateNarrativeByLLM = async (
  state: FinanceReportGraphState,
  deps: FinanceReportNodeDeps,
): Promise<ReportNarrative> => {
  const input = buildNarrativeLLMInput(state);

  const prompt = [
    generateReportNarrativePrompt,
    '',
    '当前输入数据如下：',
    JSON.stringify(input, null, 2),
    '',
    '请严格输出 JSON，不要输出 Markdown，不要解释。',
  ].join('\n');

  const model = deps.getModel();
  const response = await model.invoke(prompt);

  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const json = extractJsonObject(content);
  const parsed = LLMReportNarrativeSchema.parse(json);

  return sanitizeNarrative(parsed);
};

/* ---------- 节点入口 ---------- */

/**
 * 节点六：AI 财务报表文字解读节点
 *
 * 职责：
 * - 基于 metrics、normalizedData、chartResult、warnings 生成 ReportNarrative
 * - 不重新计算指标，所有数字以 metrics 为准
 * - 不修改图表配置，chartResult 只作为图表摘要参考
 * - 适配节点五的自由图表类型，不假设图表只包含 bar/line/pie
 * - 优先参考 metrics.warnings 生成风险点
 * - 趋势预测由节点七独立生成，此处不再参考 metrics.forecast
 *
 * 输入：state.metrics, state.normalizedData, state.chartResult, state.request
 * 输出：state.narrative (ReportNarrative)
 * 异常：LLM 不可用或生成失败时将直接抛出错误
 */
export const generateReportNarrativeNode = async (
  state: FinanceReportGraphState,
  config?: { configurable?: FinanceReportNodeDeps },
): Promise<Partial<FinanceReportGraphState>> => {
  if (!state.metrics) {
    throw new Error('缺少报表指标数据，无法生成报表解读');
  }

  if (!state.normalizedData) {
    throw new Error('缺少归一化报表数据，无法生成报表解读');
  }

  const deps = config?.configurable;

  // 检查 LLM 模型是否可用
  if (!deps?.getModel) {
    throw new Error('节点六：未提供 LLM 模型，无法生成报表文字解读');
  }

  try {
    const narrative = await generateNarrativeByLLM(state, deps);
    return {
      narrative,
      logs: ['AI 报表文字解读生成完成'],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new Error(`节点六：AI 报表文字解读生成失败 - ${error.message}`);
  }
};
