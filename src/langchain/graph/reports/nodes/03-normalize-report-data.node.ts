import { FinanceReportStateAnnotation } from '../finance-report.annotation';

export const normalizeReportDataNode = async (
  state: typeof FinanceReportStateAnnotation.State,
) => {
  // TODO: 将 rawData 归一化为 normalizedData
  // - 统一收入/成本/费用结构
  // - 统一销售分类汇总
  // - 统一现金流结构
  return {};
};
