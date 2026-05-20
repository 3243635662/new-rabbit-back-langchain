import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { buildFullReportHtmlInput } from '../utils/html-input.util';
import { buildGenerateReportHtmlPrompt } from '../prompts/generate-report-html.prompt';
import {
  extractHtmlFromModelResponse,
  validateGeneratedHtml,
  sanitizeGeneratedHtml,
} from '../utils/html-sanitize.util';
import { buildFallbackHtml } from '../utils/html-fallback.util';

const getErrorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

/**
 * 节点七：根据全量报表数据生成完整 HTML 报表
 *
 * 职责：
 * - 组装全量数据输入（request、normalizedData、metrics、chartResult、narrative）
 * - 根据 request.options.trendForecast 决定是否在 Prompt 中注入趋势预测要求
 * - 调用 LLM 生成完整单文件 HTML
 * - 校验 HTML 完整性（DOCTYPE、CDN、ECharts 渲染）
 * - 清洗危险内容（不允许 iframe、fetch 等）
 * - LLM 失败或校验不通过时使用 fallback HTML 模板
 *
 * 输入：state.request, state.normalizedData, state.metrics, state.chartResult, state.narrative
 * 输出：state.html, state.htmlContext, state.logs
 */
export const generateReportHtmlNode = async (
  state: FinanceReportGraphState,
  config?: { configurable?: FinanceReportNodeDeps },
): Promise<Partial<FinanceReportGraphState>> => {
  const input = buildFullReportHtmlInput(state);
  const trendForecast = state.request?.options?.trendForecast ?? false;

  const deps = config?.configurable;

  // 没有 LLM 模型时直接使用 fallback
  if (!deps?.getModel) {
    const fallbackHtml = buildFallbackHtml(input);
    return {
      html: fallbackHtml,
      htmlContext: input,
      logs: ['节点七：未提供 LLM 模型，已使用 fallback HTML 模板生成报表。'],
    };
  }

  try {
    const model = deps.getModel();
    const prompt = buildGenerateReportHtmlPrompt(input);

    const response = await model.invoke(prompt);
    const rawHtml = extractHtmlFromModelResponse(response);
    const validatedHtml = validateGeneratedHtml(rawHtml);
    const sanitizedHtml = sanitizeGeneratedHtml(validatedHtml);

    const trendLog = trendForecast
      ? '节点七：LLM 已生成完整 HTML 报表（含趋势预测分析）。'
      : '节点七：LLM 已生成完整 HTML 报表。';

    return {
      html: sanitizedHtml,
      htmlContext: input,
      logs: [trendLog],
    };
  } catch (err) {
    const fallbackHtml = buildFallbackHtml(input);
    const errorMsg = `节点七：LLM HTML 生成失败，已降级 fallback。错误：${getErrorMessage(err)}`;
    return {
      html: fallbackHtml,
      htmlContext: input,
      logs: [errorMsg],
    };
  }
};
