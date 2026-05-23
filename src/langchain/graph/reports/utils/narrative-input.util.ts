import type { FinanceReportGraphState } from '../finance-report.annotation';

/**
 * 压缩 metrics、normalizedData、chartResult，构造 LLM 输入
 * - 传入完整 metrics 指标
 * - 归一化数据只传摘要（前 5 条排行 + 计数）
 * - 图表只传摘要（id、title、type、description），不传 echartsOption
 */
export const buildNarrativeLLMInput = (state: FinanceReportGraphState) => {
  const metrics = state.metrics!;
  const normalizedData = state.normalizedData!;
  const chartResult = state.chartResult;

  return {
    request: {
      startDate: state.request.startDate,
      endDate: state.request.endDate,
      dataScopes: state.request.dataScopes,
      reportTypes: state.request.reportTypes,
      options: state.request.options,
    },

    comparisonRange: state.comparisonRange,

    metrics: { ...metrics },

    dataSummary: {
      incomeItemsCount: normalizedData.incomeItems?.length || 0,
      costItemsCount: normalizedData.costItems?.length || 0,
      cashflowItemsCount: normalizedData.cashflowItems?.length || 0,

      topSalesByCategory: [...(normalizedData.salesByCategory || [])]
        .sort((a, b) => (b.salesAmount || 0) - (a.salesAmount || 0))
        .slice(0, 5),

      topSalesByGoods: [...(normalizedData.salesByGoods || [])]
        .sort((a, b) => (b.salesAmount || 0) - (a.salesAmount || 0))
        .slice(0, 5),

      topInventoryItems: [...(normalizedData.inventoryItems || [])]
        .sort((a, b) => (b.inventoryValue || 0) - (a.inventoryValue || 0))
        .slice(0, 5),
    },

    chartSummary: (chartResult?.charts || []).map((chart) => ({
      id: chart.id,
      title: chart.title,
      type: chart.type,
      description: chart.description,
    })),
  };
};
