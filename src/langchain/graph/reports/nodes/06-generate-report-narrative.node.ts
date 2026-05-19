import { FinanceReportStateAnnotation } from '../finance-report.annotation';

export const generateReportNarrativeNode = async (
  state: typeof FinanceReportStateAnnotation.State,
) => {
  // TODO: 调用 LLM 生成文字解读
  // - 生成总体摘要
  // - 提取关键发现
  // - 识别风险点
  // - 给出建议
  return {};
};
