import { FinanceReportStateAnnotation } from '../finance-report.annotation';

export const exportReportNode = async (
  state: typeof FinanceReportStateAnnotation.State,
) => {
  // TODO: 根据 exportFormat 导出报告文件
  // - PDF 导出
  // - Image 导出
  // - HTML 导出
  return {};
};
