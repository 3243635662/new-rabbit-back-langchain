import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { ReportChartResult } from '../../../../types/reports/report-chart.type';
import {
  LLMReportChartResultSchema,
  type LLMReportChart,
} from '../schemas/report-chart-result.schema';
import { buildReportChartsPrompt } from '../prompts/build-report-charts.prompt';
import {
  getChartMode,
  buildChartLLMInput,
  type ChartMode,
} from '../utils/chart-input.util';
import { sanitizeLLMCharts } from '../utils/chart-sanitize.util';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';

/* ---------- 辅助函数 ---------- */

/**
 * 从 LLM 响应内容中提取 JSON 对象
 * - 先尝试直接解析
 * - 失败时尝试自动修复常见 JSON 格式问题
 * - 再失败时尝试从 Markdown 或包裹文本中提取 { 到 } 的内容
 */
const extractJsonObject = (content: string): unknown => {
  const trimmed = content.trim();

  // 辅助函数：尝试解析 JSON
  const tryParse = (str: string, label: string): unknown => {
    try {
      return JSON.parse(str);
    } catch (error) {
      console.error(
        `[extractJsonObject] ${label} 解析失败：`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  };

  // 方法1：直接解析
  const result1 = tryParse(trimmed, '直接解析');
  if (result1) return result1;

  // 方法2：自动修复常见 JSON 格式问题
  try {
    let fixed = trimmed;

    // 移除 Markdown 代码块
    fixed = fixed.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // 移除开头和结尾的解释性文字（找到第一个 { 和最后一个 }）
    const start = fixed.indexOf('{');
    const end = fixed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      fixed = fixed.slice(start, end + 1);
    }

    // 修复单引号为双引号（仅修复属性名的引号）
    fixed = fixed.replace(/'([^']+)'\s*:/g, '"$1":');

    // 修复尾随逗号
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

    // 修复未加引号的属性名
    fixed = fixed.replace(
      /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
      '$1"$2":',
    );

    console.error('[extractJsonObject] 尝试解析修复后的 JSON：');
    console.error(fixed.slice(0, 500));

    const result2 = tryParse(fixed, '修复后解析');
    if (result2) {
      console.log('[extractJsonObject] JSON 自动修复成功！');
      return result2;
    }
  } catch (fixError) {
    console.error(
      '[extractJsonObject] JSON 自动修复失败：',
      fixError instanceof Error ? fixError.message : String(fixError),
    );
  }

  // 方法3：记录原始内容并抛出错误
  console.error('[extractJsonObject] JSON 解析失败，原始内容：');
  console.error('--- LLM 原始返回开始 ---');
  console.error(trimmed.slice(0, 1000));
  console.error('--- LLM 原始返回结束 ---');

  throw new Error(`LLM 未返回合法 JSON：${trimmed.slice(0, 200)}`);
};

/**
 * 调用 LLM 生成 ECharts 图表配置
 * - 使用 buildReportChartsPrompt 作为系统提示
 * - 将压缩后的指标和归一化数据作为输入传递给 LLM
 * - Zod 校验 LLM 输出结构
 * - 遇到 502/503 等临时错误时自动重试（指数退避）
 */
const generateChartsByLLM = async (
  state: FinanceReportGraphState,
  deps: FinanceReportNodeDeps,
  chartMode: ChartMode,
  maxRetries = 3,
): Promise<LLMReportChart[]> => {
  const input = buildChartLLMInput(state, chartMode);

  const prompt = [
    buildReportChartsPrompt,
    '',
    '当前输入数据如下：',
    JSON.stringify(input, null, 2),
    '',
    '请严格输出 JSON，不要输出 Markdown，不要解释。',
  ].join('\n');

  // 记录输入（调试用）
  console.log('[generateChartsByLLM] LLM 输入 prompt 长度：', prompt.length);
  console.log('[generateChartsByLLM] chartMode：', chartMode);

  const model = deps.getModel();
  const isRetryableError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('busy') ||
      msg.includes('rate limit') ||
      msg.includes('timeout') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND')
    );
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await model.invoke(prompt);

      const content =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      // 记录输出（调试用）
      console.log('[generateChartsByLLM] LLM 返回内容长度：', content.length);
      console.log(
        '[generateChartsByLLM] LLM 返回内容前 500 字符：',
        content.slice(0, 500),
      );

      const json = extractJsonObject(content);
      const parsed = LLMReportChartResultSchema.parse(json);

      console.log(
        '[generateChartsByLLM] JSON 解析成功，生成图表数量：',
        parsed.charts.length,
      );

      return parsed.charts;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt >= maxRetries;

      if (isRetryableError(err) && !isLastAttempt) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.warn(
          `[generateChartsByLLM] 第 ${attempt + 1} 次尝试失败（可重试）：${err instanceof Error ? err.message : String(err)}，` +
            `等待 ${delayMs}ms 后重试...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // 不可重试的错误，或已用完所有重试次数
      throw err;
    }
  }

  // 理论上不会走到这里，但为了类型安全保留
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

/* ---------- 节点入口 ---------- */

/**
 * 节点五：AI 图表配置生成节点
 *
 * 职责：
 * - 根据 metrics / normalizedData / reportTypes / chartEnabled
 * - 调用 LLM 直接生成 ECharts option
 * - 校验、清洗、安全过滤、数量控制
 *
 * 输入：state.metrics, state.normalizedData, state.request.reportTypes, state.request.options.chartEnabled
 * 输出：state.chartResult (ReportChartResult)
 * 异常：LLM 不可用或生成失败时将直接抛出错误
 */
export const buildReportChartsNode = (deps: FinanceReportNodeDeps) => {
  return async (
    state: FinanceReportGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<FinanceReportGraphState>> => {
    const metrics = state.metrics;
    const normalizedData = state.normalizedData;

    if (!metrics) {
      throw new Error('缺少报表指标数据，无法生成图表');
    }

    if (!normalizedData) {
      throw new Error('缺少归一化报表数据，无法生成图表');
    }

    const chartMode = getChartMode(state);

    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;

    try {
      await pushProgress?.(
        65,
        FinanceReportProgressPhase.BUILDING_CHARTS,
        '正在使用 AI 生成报表图表...',
      );
      const llmCharts = await generateChartsByLLM(state, deps, chartMode);
      const charts = sanitizeLLMCharts(llmCharts, chartMode);

      const chartResult: ReportChartResult = { charts };

      return {
        chartResult,
        logs: [
          `LLM 图表配置生成完成，模式：${chartMode}，共生成 ${charts.length} 个图表`,
        ],
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`节点五：LLM 图表配置生成失败 - ${error.message}`);
    }
  };
};
