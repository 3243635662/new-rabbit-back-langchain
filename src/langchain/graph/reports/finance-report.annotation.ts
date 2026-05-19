import { Annotation } from '@langchain/langgraph';
import { GenerateFinanceReportDto } from '../../../modules/reports/dto/generate-finance-report.dto';
import { ReportRawData } from '../../../types/reports/report-raw-data.type';
import { NormalizedReportData } from '../../../types/reports/normalized-report-data.type';
import { ComparisonRange } from '../../../types/reports/comparison-range.type';
import { ReportMetrics } from '../../../types/reports/report-metrics.type';
import { ReportChartResult } from '../../../types/reports/report-chart.type';
import { ReportNarrative } from '../../../types/reports/report-narrative.type';
import { ReportHtmlContext } from '../../../types/reports/report-html-context.type';
import { ReportExportResult } from '../../../types/reports/report-export-result.type';

export const FinanceReportStateAnnotation = Annotation.Root({
  request: Annotation<GenerateFinanceReportDto>(),
  user: Annotation<unknown>(),

  rawData: Annotation<ReportRawData | undefined>(),
  normalizedData: Annotation<NormalizedReportData | undefined>(),
  comparisonRange: Annotation<ComparisonRange | undefined>(),
  metrics: Annotation<ReportMetrics | undefined>(),
  chartResult: Annotation<ReportChartResult | undefined>(),
  narrative: Annotation<ReportNarrative | undefined>(),
  htmlContext: Annotation<ReportHtmlContext | undefined>(),
  html: Annotation<string | undefined>(),
  exportResult: Annotation<ReportExportResult | undefined>(),

  logs: Annotation<string[]>({
    reducer: (left, right) => [...(left || []), ...(right || [])],
    default: () => [],
  }),
});

export type FinanceReportGraphState = typeof FinanceReportStateAnnotation.State;
