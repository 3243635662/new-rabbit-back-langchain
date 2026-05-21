import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import { buildFullReportHtmlInput } from '../utils/html-input.util';
import { buildGenerateReportHtmlPrompt } from '../prompts/generate-report-html.prompt';
import {
  extractHtmlFromModelResponse,
  validateGeneratedHtml,
  sanitizeGeneratedHtml,
} from '../utils/html-sanitize.util';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';

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
export const buildGenerateReportHtmlNode = (deps: FinanceReportNodeDeps) => {
  return async (
    state: FinanceReportGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<FinanceReportGraphState>> => {
    const input = buildFullReportHtmlInput(state);
    const trendForecast = state.request?.options?.trendForecast ?? false;

    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;

    try {
      const model = deps.getModel();
      const prompt = buildGenerateReportHtmlPrompt(input);

      await pushProgress?.(
        90,
        FinanceReportProgressPhase.GENERATING_HTML,
        '正在使用 AI 生成 HTML 报表...',
      );
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
};
