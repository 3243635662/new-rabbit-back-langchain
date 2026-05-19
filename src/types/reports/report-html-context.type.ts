import { GenerateFinanceReportDto } from '../../modules/reports/dto//generate-finance-report.dto';
import { ReportChartResult } from './report-chart.type';
import { ReportMetrics } from './report-metrics.type';
import { ReportNarrative } from './report-narrative.type';

export type ReportHtmlContext = {
  request: GenerateFinanceReportDto;
  title: string;
  metrics: ReportMetrics;
  chartResult: ReportChartResult;
  narrative: ReportNarrative;
};
