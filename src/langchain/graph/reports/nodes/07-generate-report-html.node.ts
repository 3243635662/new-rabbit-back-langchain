import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { buildFullReportHtmlInput } from '../utils/html-input.util';
import { buildGenerateReportHtmlPrompt } from '../prompts/generate-report-html.prompt';
import {
  extractHtmlFromModelResponse,
  validateGeneratedHtml,
  sanitizeGeneratedHtml,
} from '../utils/html-sanitize.util';

/**
 * 节点七：根据全量报表数据生成完整 HTML 报表
 *
 * 职责：
 * - 组装全量数据输入（request、normalizedData、metrics、chartResult、narrative）
 * - 根据 request.options.trendForecast 决定是否在 Prompt 中注入趋势预测要求
 * - 调用 LLM 生成完整单文件 HTML
 * - 校验 HTML 完整性（DOCTYPE、CDN、ECharts 渲染）
 * - 清洗危险内容（不允许 iframe、fetch 等）
 *
 * 输入：state.request, state.normalizedData, state.metrics, state.chartResult, state.narrative
 * 输出：state.html, state.htmlContext, state.logs
 * 异常：LLM 不可用或生成失败时将直接抛出错误
 */
export const generateReportHtmlNode = async (
  state: FinanceReportGraphState,
  config?: { configurable?: FinanceReportNodeDeps },
): Promise<Partial<FinanceReportGraphState>> => {
  const input = buildFullReportHtmlInput(state);
  const trendForecast = state.request?.options?.trendForecast ?? false;

  const deps = config?.configurable;

  // 检查 LLM 模型是否可用
  if (!deps?.getModel) {
    throw new Error('节点七：未提供 LLM 模型，无法生成 HTML 报表');
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
    const error = err instanceof Error ? err : new Error(String(err));
    throw new Error(`节点七：LLM HTML 生成失败 - ${error.message}`);
  }
};
