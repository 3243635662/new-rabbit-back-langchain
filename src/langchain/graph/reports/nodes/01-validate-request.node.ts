import { FinanceReportStateAnnotation } from '../finance-report.annotation';

export const validateRequestNode = async (
  state: typeof FinanceReportStateAnnotation.State,
) => {
  // TODO: 验证请求参数合法性
  // - 校验日期范围
  // - 校验 dataScopes 非空
  // - 校验 reportType 合法
  return {};
};
