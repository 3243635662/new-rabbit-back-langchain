import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { NormalizedReportData } from '../../../../types/reports/normalized-report-data.type';
import type { ReportMetrics } from '../../../../types/reports/report-metrics.type';
import type { ComparisonRange } from '../../../../types/reports/comparison-range.type';

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
};

const round2 = (value: number): number => {
  return Number((value || 0).toFixed(2));
};

const round4 = (value: number): number => {
  return Number((value || 0).toFixed(4));
};

/** 比率计算：numerator / denominator，分母为 0 时返回 0 */
const calcRate = (numerator: number, denominator: number): number => {
  if (!denominator) return 0;
  return round4(numerator / denominator);
};

/**
 * 变化率计算：(current - previous) / previous
 * - previous = 0 且 current > 0 → 返回 1（从 0 到有值）
 * - 两者都为 0 → 返回 0
 */
const calcChangeRate = (current: number, previous: number): number => {
  if (!previous) {
    return current > 0 ? 1 : 0;
  }
  return round4((current - previous) / previous);
};

/** 变化额计算 */
const calcChangeAmount = (current: number, previous: number): number => {
  return round2(current - previous);
};

const sumAmount = <T extends { amount: number }>(items: T[] = []): number => {
  return round2(items.reduce((sum, item) => sum + toNumber(item.amount), 0));
};

/**
 * 只计算订单来源的收入（不含发票/财务资源收入）
 * 用于 correct 口径的客单价计算
 */
const getOrderRevenue = (data: NormalizedReportData): number => {
  return round2(
    (data.incomeItems || [])
      .filter((item) => item.source === 'order')
      .reduce((sum, item) => sum + toNumber(item.amount), 0),
  );
};

/**
 * 构建成本费用结构（用于饼图）
 * 合并 costItems + expenseItems，按 category/title 聚合
 */
const buildCostStructure = (data: NormalizedReportData) => {
  const map = new Map<string, number>();

  const add = (name: string | undefined, value: number) => {
    const key = name || '未分类';
    map.set(key, round2((map.get(key) || 0) + toNumber(value)));
  };

  for (const item of data.costItems || []) {
    add(item.category || item.title || '商品成本', item.amount);
  }

  for (const item of data.expenseItems || []) {
    add(item.category || item.title || '期间费用', item.amount);
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: round2(value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
};

/**
 * 基于 NormalizedReportData 计算一组基础指标
 * 新增：orderRevenue、costToRevenueRate、expenseToRevenueRate、inventoryTurnover、cashflowToProfitRatio
 */
const calculateMetricsFromNormalizedData = (
  data: NormalizedReportData,
  orderCount = 0,
): ReportMetrics => {
  const totalRevenue = sumAmount(data.incomeItems);
  const totalCost = sumAmount(data.costItems);
  const totalExpense = sumAmount(data.expenseItems);

  // 新增：订单专属收入（用于正确计算客单价）
  const orderRevenue = getOrderRevenue(data);

  const grossProfit = round2(totalRevenue - totalCost);
  const grossProfitRate = calcRate(grossProfit, totalRevenue);

  const netProfit = round2(grossProfit - totalExpense);
  const netProfitRate = calcRate(netProfit, totalRevenue);

  // 新增经营比率
  const costToRevenueRate = calcRate(totalCost, totalRevenue);
  const expenseToRevenueRate = calcRate(totalExpense, totalRevenue);

  // averageOrderValue 使用 orderRevenue（不含发票/财务资源收入）
  const averageOrderValue =
    orderCount > 0 ? round2(orderRevenue / orderCount) : 0;

  const inventoryValue = round2(
    (data.inventoryItems || []).reduce((sum, item) => {
      return sum + toNumber(item.inventoryValue);
    }, 0),
  );

  const inventoryQuantity = round2(
    (data.inventoryItems || []).reduce((sum, item) => {
      return sum + toNumber(item.stock);
    }, 0),
  );

  // 新增：简化库存周转率 = 销售成本 / 当前库存价值
  const inventoryTurnover =
    inventoryValue > 0 ? calcRate(totalCost, inventoryValue) : 0;

  const cashInflow = round2(
    (data.cashflowItems || [])
      .filter((item) => item.type === 'inflow')
      .reduce((sum, item) => sum + toNumber(item.amount), 0),
  );

  const cashOutflow = round2(
    (data.cashflowItems || [])
      .filter((item) => item.type === 'outflow')
      .reduce((sum, item) => sum + toNumber(item.amount), 0),
  );

  const netCashflow = round2(cashInflow - cashOutflow);

  // 新增：现金流利润比
  const cashflowToProfitRatio =
    netProfit !== 0 ? calcRate(netCashflow, netProfit) : 0;

  // Top 分类（按销售额排序取第一）
  const topCategory = [...(data.salesByCategory || [])].sort(
    (a, b) => toNumber(b.salesAmount) - toNumber(a.salesAmount),
  )[0];
  const topCategoryResult = topCategory
    ? {
        name: topCategory.categoryName || '未分类',
        amount: round2(topCategory.salesAmount),
      }
    : undefined;

  // Top 商品（按销售额排序取第一）
  const topGoods = [...(data.salesByGoods || [])].sort(
    (a, b) => toNumber(b.salesAmount) - toNumber(a.salesAmount),
  )[0];
  const topGoodsResult = topGoods
    ? {
        name: topGoods.goodsName || '未知商品',
        amount: round2(topGoods.salesAmount),
        quantity: toNumber(topGoods.quantity),
      }
    : undefined;

  return {
    totalRevenue,
    totalCost,
    grossProfit,
    grossProfitRate,

    totalExpense,
    netProfit,
    netProfitRate,

    // 新增经营比率
    orderRevenue,
    costToRevenueRate,
    expenseToRevenueRate,
    inventoryTurnover,
    cashflowToProfitRatio,

    orderCount,
    averageOrderValue,

    inventoryValue,
    inventoryQuantity,

    cashInflow,
    cashOutflow,
    netCashflow,

    topCategory: topCategoryResult,
    topGoods: topGoodsResult,

    costStructure: buildCostStructure(data),

    // 对比/预警在后续函数中填充，趋势预测由节点七独立处理
    comparison: undefined,
    warnings: [],
  };
};

/**
 * 计算同比/环比变化率（扩展字段）
 * 新增：grossProfitChangeRate/Amount、grossProfitRateChange、totalExpenseChangeRate/Amount、netCashflowChangeRate
 */
const buildComparison = (
  current: ReportMetrics,
  previous: ReportMetrics,
  comparisonRange: ComparisonRange,
): ReportMetrics['comparison'] => {
  return {
    compareMode: comparisonRange.compareMode,

    totalRevenueChangeRate: calcChangeRate(
      current.totalRevenue,
      previous.totalRevenue,
    ),
    totalRevenueChangeAmount: calcChangeAmount(
      current.totalRevenue,
      previous.totalRevenue,
    ),

    grossProfitChangeRate: calcChangeRate(
      current.grossProfit,
      previous.grossProfit,
    ),
    grossProfitChangeAmount: calcChangeAmount(
      current.grossProfit,
      previous.grossProfit,
    ),
    grossProfitRateChange: round4(
      (current.grossProfitRate || 0) - (previous.grossProfitRate || 0),
    ),

    totalExpenseChangeRate: calcChangeRate(
      current.totalExpense,
      previous.totalExpense,
    ),
    totalExpenseChangeAmount: calcChangeAmount(
      current.totalExpense,
      previous.totalExpense,
    ),

    netProfitChangeRate: calcChangeRate(current.netProfit, previous.netProfit),
    netProfitChangeAmount: calcChangeAmount(
      current.netProfit,
      previous.netProfit,
    ),

    orderCountChangeRate: calcChangeRate(
      current.orderCount,
      previous.orderCount,
    ),
    orderCountChangeAmount: calcChangeAmount(
      current.orderCount,
      previous.orderCount,
    ),

    cashInflowChangeRate: calcChangeRate(
      current.cashInflow,
      previous.cashInflow,
    ),
    cashOutflowChangeRate: calcChangeRate(
      current.cashOutflow,
      previous.cashOutflow,
    ),
    netCashflowChangeRate: calcChangeRate(
      current.netCashflow,
      previous.netCashflow,
    ),
  };
};

/**
 * 利用 inventoryLogs 生成库存异常预警
 * TODO.md 第七节：inventoryLogs 现在几乎没用，建议至少用于预警
 */
const buildInventoryLogWarnings = (
  state: FinanceReportGraphState,
): string[] => {
  const warnings: string[] = [];

  // 只在前端选了库存数据时才检查
  const dataScopes = state.request?.dataScopes || [];
  if (!dataScopes.includes('inventory')) {
    return warnings;
  }

  const logs = state.rawData?.inventoryLogs || [];

  if (logs.length === 0) {
    // 选了库存但没有日志，可能不是错误，不预警
    return warnings;
  }

  // 手动调整库存次数
  const manualLogs = logs.filter((log) =>
    ['MANUAL_ADD', 'MANUAL_REDUCE'].includes(log.type),
  );

  if (manualLogs.length >= 5) {
    warnings.push(
      '当前区间存在较多手动库存调整记录，建议核查库存盘点或人工操作原因',
    );
  }

  // 手动减少库存次数
  const reduceLogs = logs.filter((log) => log.type === 'MANUAL_REDUCE');

  if (reduceLogs.length >= 3) {
    warnings.push(
      '当前区间存在多次手动减少库存记录，可能存在损耗、盘亏或库存修正情况',
    );
  }

  // 大额库存变动（单次变动 ≥ 50）
  const bigChangeLog = logs.find((log) => Math.abs(toNumber(log.change)) >= 50);

  if (bigChangeLog) {
    warnings.push(
      `商品「${bigChangeLog.goodsName || '未知商品'}」存在较大库存变动，请关注库存异常`,
    );
  }

  return warnings;
};

/**
 * 生成预警信息（基于指标规则，非 LLM）
 * 扩展：新增收入重复计量预警、成本估算提示、使用 dataScopes 判断库存
 */
const buildWarnings = (
  metrics: ReportMetrics,
  dataScopes: string[],
  state?: FinanceReportGraphState,
): string[] => {
  const warnings: string[] = [];

  // 1. 基础预警（原有逻辑）
  if (metrics.totalRevenue <= 0) {
    warnings.push('当前区间未形成有效收入，请检查订单、发票或财务资源数据');
  }

  if (metrics.grossProfit < 0) {
    warnings.push('毛利润为负，销售成本高于收入，需要关注商品成本或定价策略');
  } else if (metrics.grossProfitRate > 0 && metrics.grossProfitRate < 0.2) {
    warnings.push('毛利率偏低，建议关注商品成本、促销折扣或售价策略');
  }

  if (metrics.netProfit < 0) {
    warnings.push('净利润为负，当前区间存在亏损风险');
  }

  if (metrics.totalExpense > metrics.grossProfit && metrics.grossProfit > 0) {
    warnings.push('期间费用高于毛利润，费用支出对净利润形成明显压力');
  }

  if (metrics.netCashflow < 0) {
    warnings.push('净现金流为负，需要关注现金流入和支出节奏');
  }

  // 2. 使用 dataScopes 而非 reportTypes 判断库存数据
  if (dataScopes.includes('inventory') && metrics.inventoryQuantity <= 0) {
    warnings.push('库存数量为 0，请检查库存数据是否完整');
  }

  if (metrics.inventoryValue > 0 && metrics.totalRevenue > 0) {
    const inventoryRevenueRatio = metrics.inventoryValue / metrics.totalRevenue;
    if (inventoryRevenueRatio > 2) {
      warnings.push('库存价值相对收入偏高，可能存在库存积压风险');
    }
  }

  // 3. 新增：收入重复计量预警（TODO.md 第二节）
  const hasOrderIncome = (metrics.orderRevenue || 0) > 0;
  const hasInvoiceIncome = (state?.normalizedData?.incomeItems || []).some(
    (item) => item.source === 'invoice',
  );
  if (hasOrderIncome && hasInvoiceIncome) {
    warnings.push(
      '当前收入同时包含订单收入和发票收入，可能存在同一交易重复计入的风险，请以业务口径核对',
    );
  }

  // 4. 新增：成本估算提示（TODO.md 第八节）
  // 节点二里 costPrice 是 salePrice * 0.7 兜底估算
  warnings.push(
    '当前成本数据使用系统估算成本价，毛利、净利和利润率仅供经营分析参考',
  );

  // 5. 对比预警
  if (metrics.comparison?.totalRevenueChangeRate !== undefined) {
    if (metrics.comparison.totalRevenueChangeRate < -0.3) {
      warnings.push('收入较对比区间下降超过 30%，需要关注销售波动原因');
    }
  }

  if (metrics.comparison?.netProfitChangeRate !== undefined) {
    if (metrics.comparison.netProfitChangeRate < -0.3) {
      warnings.push('净利润较对比区间下降超过 30%，需要关注成本或费用变化');
    }
  }

  // 6. 库存日志预警（TODO.md 第七节）
  if (state) {
    const inventoryWarnings = buildInventoryLogWarnings(state);
    warnings.push(...inventoryWarnings);
  }

  // 去重
  return Array.from(new Set(warnings));
};

export const calculateReportMetricsNode = (
  state: FinanceReportGraphState,
): Partial<FinanceReportGraphState> => {
  if (!state.normalizedData) {
    throw new Error('缺少 normalizedData，无法计算报表指标');
  }

  const dataScopes = state.request?.dataScopes || [];

  // 当前区间指标
  const currentOrderCount = state.rawData?.orders?.length || 0;
  const metrics = calculateMetricsFromNormalizedData(
    state.normalizedData,
    currentOrderCount,
  );

  // 对比区间指标
  if (
    state.request?.options?.comparisonAnalysis &&
    state.comparisonNormalizedData &&
    state.comparisonRange
  ) {
    const comparisonOrderCount = state.comparisonRawData?.orders?.length || 0;
    const comparisonMetrics = calculateMetricsFromNormalizedData(
      state.comparisonNormalizedData,
      comparisonOrderCount,
    );
    metrics.comparison = buildComparison(
      metrics,
      comparisonMetrics,
      state.comparisonRange,
    );
  }

  // 预警（传入 dataScopes 和 state，支持库存日志预警）
  metrics.warnings = buildWarnings(metrics, dataScopes, state);

  const logs = [
    `报表核心指标计算完成：收入 ${metrics.totalRevenue}，成本 ${metrics.totalCost}，净利润 ${metrics.netProfit}`,
  ];

  if (metrics.comparison) {
    logs.push(
      `对比指标计算完成：收入变化率 ${metrics.comparison.totalRevenueChangeRate ?? 0}，净利润变化率 ${metrics.comparison.netProfitChangeRate ?? 0}`,
    );
  }

  if (metrics.warnings.length > 0) {
    logs.push(`生成 ${metrics.warnings.length} 条预警信息`);
  }

  return {
    metrics,
    logs,
  };
};
