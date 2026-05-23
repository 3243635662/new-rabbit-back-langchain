import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import { buildFullReportHtmlInput } from '../utils/html-input.util';
import {
  buildGenerateReportHtmlPrompt,
  TAILWIND_CDN,
  ECHARTS_CDN,
} from '../prompts/generate-report-html.prompt';
import {
  extractHtmlFromModelResponse,
  validateGeneratedHtml,
  sanitizeGeneratedHtml,
} from '../utils/html-sanitize.util';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';

/**
 * 固定的 HTML 外壳模板（优化版）
 *
 * 优化说明：
 * - LLM 只输出 body 内容片段，不再生成 DOCTYPE、head、CDN 等重复模板
 * - 宿主代码负责包裹完整 HTML 外壳，减少 LLM 输出 token 约 30-50%
 * - 外壳包含 Tailwind CDN、ECharts CDN、meta 标签、打印样式等固定配置
 */
const buildHtmlShell = (title: string, bodyContent: string): string => {
  const s = '</script>';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<script src="${TAILWIND_CDN}">${s}
<script src="${ECHARTS_CDN}">${s}
<style>
  @page { margin: 15mm; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .break-inside-avoid { break-inside: avoid; }
  }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
};

/**
 * 节点六：根据全量报表数据生成完整 HTML 报表（优化版）
 *
 * 优化说明：
 * - 输入数据精简：只传 Top N 聚合摘要，减少 LLM 上下文读取时间
 * - Prompt 精简：LLM 只输出 body 内容片段，不输出固定 HTML 外壳
 * - 宿主代码注入固定外壳（Tailwind CDN、ECharts CDN、meta 标签等）
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
    console.log('[Node 6] 进入节点：生成 HTML 报表（优化版）');
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

      // 校验 LLM 输出的 body 内容（适配新的输出格式）
      const validatedHtml = validateGeneratedHtml(rawHtml);
      const sanitizedHtml = sanitizeGeneratedHtml(validatedHtml);

      // 用固定 HTML 外壳包裹 LLM 输出的 body 内容
      const fullHtml = buildHtmlShell(input.title, sanitizedHtml);

      const trendLog = trendForecast
        ? '节点六：LLM 已生成报表主体内容（含趋势预测分析），已注入固定 HTML 外壳。'
        : '节点六：LLM 已生成报表主体内容，已注入固定 HTML 外壳。';

      console.log('[Node 6] 离开节点，返回数据');
      return {
        html: fullHtml,
        htmlContext: input,
        logs: [trendLog],
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`节点六：LLM HTML 生成失败 - ${error.message}`);
    }
  };
};
