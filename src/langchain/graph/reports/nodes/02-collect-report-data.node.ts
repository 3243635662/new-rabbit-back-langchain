import { FinanceReportStateAnnotation } from '../finance-report.annotation';

export const collectReportDataNode = async (
  state: typeof FinanceReportStateAnnotation.State,
) => {
  // TODO: 根据 dataScopes 从数据库收集原始数据
  // - 查询订单数据
  // - 查询库存数据
  // - 查询发票数据
  // - 查询财务资源数据
  return {};
};
