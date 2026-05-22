import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { GenerateFinanceReportDto } from '../../../../modules/reports/dto/generate-finance-report.dto';
import type { ReportMetrics } from '../../../../types/reports/report-metrics.type';
import type { ReportChartResult } from '../../../../types/reports/report-chart.type';
import type { ReportNarrative } from '../../../../types/reports/report-narrative.type';

export interface FullReportHtmlLLMInput {
  request: GenerateFinanceReportDto;
  title: string;
  generatedAt: string;
  normalizedData?: unknown;
  metrics: ReportMetrics;
  chartResult?: ReportChartResult;
  narrative: ReportNarrative;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  overview: '经营概览',
  profit: '利润分析',
  cost: '成本分析',
  sales: '销售分析',
  cashflow: '现金流分析',
};

const buildReportTitle = (request: GenerateFinanceReportDto): string => {
  const types = (request.reportTypes || [])
    .map((t: string) => REPORT_TYPE_LABELS[t] || t)
    .join('、');

  return [
    '财务报表',
    types ? `（${types}）` : '',
    ` ${request.startDate} 至 ${request.endDate}`,
  ].join('');
};

export const buildFullReportHtmlInput = (
  state: FinanceReportGraphState,
): FullReportHtmlLLMInput => {
  if (!state.request) {
    throw new Error('缺少 request，无法生成 HTML 报表');
  }

  if (!state.metrics) {
    throw new Error('缺少 metrics，无法生成 HTML 报表');
  }

  if (!state.narrative) {
    throw new Error('缺少 narrative，无法生成 HTML 报表');
  }

  return {
    request: state.request,
    title: buildReportTitle(state.request),
    generatedAt: new Date().toISOString(),
    normalizedData: state.normalizedData,
    metrics: state.metrics,
    chartResult: state.chartResult,
    narrative: state.narrative,
  };
};
