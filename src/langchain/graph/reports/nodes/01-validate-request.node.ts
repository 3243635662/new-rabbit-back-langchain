import type { FinanceReportGraphState } from '../finance-report.annotation';

export const validateRequestNode = (state: FinanceReportGraphState) => {
  const request = { ...state.request };

  if (!request.startDate || !request.endDate) {
    throw new Error('请选择报表时间范围');
  }

  const start = new Date(request.startDate);
  const end = new Date(request.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('日期格式不合法');
  }

  if (start.getTime() > end.getTime()) {
    throw new Error('开始时间不能晚于结束时间');
  }

  if (!request.dataScopes || request.dataScopes.length === 0) {
    throw new Error('请至少选择一个数据范围');
  }

  request.options = {
    comparisonAnalysis: request.options?.comparisonAnalysis ?? false,
    trendForecast: request.options?.trendForecast ?? false,
    chartEnabled: request.options?.chartEnabled ?? true, // 默认开启图表
  };

  return {
    request,
    logs: ['报表请求参数校验完成'],
  };
};
