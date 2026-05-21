import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';

export const buildValidateRequestNode = (_deps: FinanceReportNodeDeps) => {
  void _deps; //  intentionally unused – kept for interface consistency
  return async (state: FinanceReportGraphState, config?: RunnableConfig) => {
    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;

    await pushProgress?.(
      5,
      FinanceReportProgressPhase.VALIDATING,
      '正在校验报表请求参数...',
    );
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
};
