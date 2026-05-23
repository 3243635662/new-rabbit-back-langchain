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
import { UserContextType } from '../../../types/reports/report-userContext.type';

export const FinanceReportStateAnnotation = Annotation.Root({
  /** 前端请求参数（时间范围、数据范围、报告类型、导出格式等） */
  request: Annotation<GenerateFinanceReportDto>(),

  /** 当前登录用户上下文（id、username、merchantId 等） */
  user: Annotation<UserContextType>(),

  /** Node 2 产出：当前区间从 DB 拉取的原始业务数据（订单/库存/发票/财务资源） */
  rawData: Annotation<ReportRawData | undefined>(),

  /** Node 2 产出：对比区间原始业务数据（开启同比环比时填充） */
  comparisonRawData: Annotation<ReportRawData | undefined>(),

  /** Node 3 产出：当前区间数据经规则引擎归一化后的结构化数据 */
  normalizedData: Annotation<NormalizedReportData | undefined>(),

  /** Node 3 产出：对比区间归一化数据 */
  comparisonNormalizedData: Annotation<NormalizedReportData | undefined>(),

  /** Node 2 产出：对比区间的时间范围描述（模式：同比/环比） */
  comparisonRange: Annotation<ComparisonRange | undefined>(),

  /** Node 4 产出：AI 计算的全部财务指标（收入/成本/利润/现金流/库存/对比/预警） */
  metrics: Annotation<ReportMetrics | undefined>(),

  /** 图表配置结果（当前版本由 Node 6 内联生成，此字段预留） */
  chartResult: Annotation<ReportChartResult | undefined>(),

  /** Node 5 产出：AI 生成的报表文字解读（经营概览/关键发现/风险/建议） */
  narrative: Annotation<ReportNarrative | undefined>(),

  /** Node 6 产出：传给 LLM 的输入上下文快照（用于调试回溯） */
  htmlContext: Annotation<ReportHtmlContext | undefined>(),

  /** Node 6 产出：最终完整 HTML 报表（含固定外壳 + LLM 生成的主体内容） */
  html: Annotation<string | undefined>(),

  /** Node 7 产出：导出结果（文件 buffer / 七牛 URL / 格式等） */
  exportResult: Annotation<ReportExportResult | undefined>(),

  /** 各节点追加的执行日志，reducer 合并为数组，便于全流程追踪 */
  logs: Annotation<string[]>({
    reducer: (left, right) => [...(left || []), ...(right || [])],
    default: () => [],
  }),
});

export type FinanceReportGraphState = typeof FinanceReportStateAnnotation.State;
