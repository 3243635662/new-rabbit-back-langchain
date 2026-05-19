import { FinanceReportStateAnnotation } from '../finance-report.annotation';

export const buildReportChartsNode = async (
  state: typeof FinanceReportStateAnnotation.State,
) => {
  // TODO: 基于 metrics 生成 ECharts 图表配置
  // - 收入趋势图（line）
  // - 成本结构图（pie）
  // - 销售分类图（bar/pie）
  return {};
};
