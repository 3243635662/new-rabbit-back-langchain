import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
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

/* ---------- 辅助函数 ---------- */

/**
 * 从 LLM 响应内容中提取 JSON 对象
 * - 先尝试直接解析
 * - 失败时尝试从 Markdown 或包裹文本中提取 { 到 } 的内容
 */
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

/**
 * 调用 LLM 生成 ECharts 图表配置
 * - 使用 buildReportChartsPrompt 作为系统提示
 * - 将压缩后的指标和归一化数据作为输入传递给 LLM
 * - Zod 校验 LLM 输出结构
 */
const generateChartsByLLM = async (
  state: FinanceReportGraphState,
  deps: FinanceReportNodeDeps,
  chartMode: ChartMode,
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

  const model = deps.getModel();
  const response = await model.invoke(prompt);

  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const json = extractJsonObject(content);
  const parsed = LLMReportChartResultSchema.parse(json);

  return parsed.charts;
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
export const buildReportChartsNode = async (
  state: FinanceReportGraphState,
  config?: { configurable?: FinanceReportNodeDeps },
): Promise<Partial<FinanceReportGraphState>> => {
  const metrics = state.metrics;
  const normalizedData = state.normalizedData;

  if (!metrics) {
    throw new Error('缺少报表指标数据，无法生成图表');
  }

  if (!normalizedData) {
    throw new Error('缺少归一化报表数据，无法生成图表');
  }

  const deps = config?.configurable;
  const chartMode = getChartMode(state);

  // 检查 LLM 模型是否可用
  if (!deps?.getModel) {
    throw new Error('节点五：未提供 LLM 模型，无法生成图表配置');
  }

  try {
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
