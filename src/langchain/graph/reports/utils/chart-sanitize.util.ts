import type { ReportChart } from '../../../../types/reports/report-chart.type';
import type { LLMReportChart } from '../schemas/report-chart-result.schema';
import { getChartCountRange, type ChartMode } from './chart-input.util';
import { withDefaultEchartsStyle } from './echarts-style.util';

/* ---------- 危险模式检测 ---------- */

const unsafePatterns = [
  '<script',
  '</script',
  'function',
  '=>',
  'eval(',
  'new Function',
  'document.',
  'window.',
  'globalThis',
  'process.',
  'require(',
  'import(',
  'fetch(',
  'XMLHttpRequest',
  'localStorage',
  'sessionStorage',
];

/**
 * 检查 ECharts option JSON 是否包含危险字符串
 * 不是为了"绝对安全"，而是防止明显的 HTML / JS 注入进入节点六
 */
const assertSafeJsonObject = (value: unknown): void => {
  const json = JSON.stringify(value);
  for (const pattern of unsafePatterns) {
    if (json.includes(pattern)) {
      throw new Error('ECharts option 包含不安全内容：' + pattern);
    }
  }
};

/* ---------- 图表 ID 清洗 ---------- */

const sanitizeChartId = (id: string): string => {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
};

/* ---------- ECharts 基本可渲染校验 ---------- */

/* 需要坐标轴的系列类型（无坐标轴时 ECharts 也能渲染，但图表会不完整） */
const coordinateBasedSeriesTypes = new Set([
  'bar',
  'line',
  'area',
  'scatter',
  'effectScatter',
  'candlestick',
  'heatmap',
  'boxplot',
]);

const assertRenderableEchartsOption = (chart: LLMReportChart): void => {
  const { echartsOption: option } = chart;

  if (!option || typeof option !== 'object') {
    throw new Error('echartsOption 必须是对象');
  }

  if (
    !Array.isArray((option as Record<string, unknown>).series) ||
    ((option as Record<string, unknown>).series as unknown[]).length === 0
  ) {
    throw new Error('echartsOption 缺少 series');
  }

  const seriesArr = (option as Record<string, unknown>).series as Array<
    Record<string, unknown>
  >;

  // 检查是否有 series 需要坐标轴
  let needsCoord = false;
  for (const seriesItem of seriesArr) {
    if (!seriesItem || typeof seriesItem !== 'object') continue;
    if (!seriesItem.type) {
      seriesItem.type = chart.type;
    }

    if (coordinateBasedSeriesTypes.has(String(seriesItem.type))) {
      needsCoord = true;
    }
  }

  // 当存在需要坐标轴的系列时，检查 xAxis/yAxis
  if (needsCoord) {
    if (
      !(option as Record<string, unknown>).xAxis ||
      !(option as Record<string, unknown>).yAxis
    ) {
      throw new Error('图表存在需要坐标轴的 series，但缺少 xAxis 或 yAxis');
    }
  }

  // 检查每个 series 的 data
  for (const seriesItem of seriesArr) {
    if (!seriesItem || typeof seriesItem !== 'object') continue;

    if (!Array.isArray(seriesItem.data)) {
      throw new Error('series.data 必须是数组');
    }
  }
};

/* ---------- 清洗单条图表 ---------- */

const sanitizeReportChart = (chart: LLMReportChart): ReportChart => {
  assertSafeJsonObject(chart.echartsOption);
  assertRenderableEchartsOption(chart);

  const id = sanitizeChartId(chart.id || chart.title);
  if (!id) {
    throw new Error('图表 id 为空');
  }

  return {
    id,
    title: chart.title.trim(),
    type: chart.type,
    description: chart.description?.trim(),
    echartsOption: withDefaultEchartsStyle(
      chart.echartsOption as Record<string, unknown>,
    ),
  };
};

/* ---------- 去重 ---------- */

const dedupeCharts = (charts: ReportChart[]): ReportChart[] => {
  return Array.from(new Map(charts.map((chart) => [chart.id, chart])).values());
};

/* ---------- 数量控制 ---------- */

const normalizeChartCount = (
  charts: ReportChart[],
  chartMode: ChartMode,
): ReportChart[] => {
  const { min, max } = getChartCountRange(chartMode);
  const sliced = charts.slice(0, max);

  if (sliced.length < min) {
    throw new Error(
      chartMode +
        ' 模式图表数量不足，至少需要 ' +
        min +
        ' 个，当前只有 ' +
        sliced.length +
        ' 个',
    );
  }

  return sliced;
};

/* ---------- 入口：清洗 LLM 输出的全部图表 ---------- */

export const sanitizeLLMCharts = (
  charts: LLMReportChart[],
  chartMode: ChartMode,
): ReportChart[] => {
  const sanitized = charts.map(sanitizeReportChart);
  const deduped = dedupeCharts(sanitized);
  return normalizeChartCount(deduped, chartMode);
};
