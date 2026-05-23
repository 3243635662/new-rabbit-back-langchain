import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';
import type { ReportRawData } from '../../../../types/reports/report-raw-data.type';
import type { NormalizedReportData } from '../../../../types/reports/normalized-report-data.type';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
};

const normalizeDate = (value: string | Date | undefined): string => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
};

const safeText = (value: unknown, fallback = ''): string => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
};

/**
 * 规则引擎汇总（纯 DB 表数据，不做财务指标计算）
 *
 * 只处理来自数据库固定 schema 的数据：
 * - orders → incomeItems（订单收入）、costItems（商品成本）、salesByCategory、salesByGoods
 * - inventory → inventoryItems（库存明细）
 *
 * financeRecords（发票/合同/通用资源）不做任何硬性提取，
 * 它们的 raw JSON 由 Node 4 的 LLM 语义理解并计算金额和收支方向。
 */
const normalizeReportRawDataByRule = (
  raw: ReportRawData,
): NormalizedReportData => {
  // 1. 订单收入（仅 payAmount，不含发票/财务资源）
  const incomeItems = (raw.orders || []).map((order) => ({
    date: normalizeDate(order.createdAt),
    amount: toNumber(order.payAmount),
    source: 'order' as const,
    title: safeText(order.orderNo, '订单收入'),
    category: '订单收入',
  }));

  // 2. 商品成本（订单商品 costPrice * quantity）
  const costItems = (raw.orders || []).flatMap((order) =>
    (order.items || []).map((item) => ({
      date: normalizeDate(order.createdAt),
      amount: toNumber(item.costPrice) * toNumber(item.quantity),
      source: 'order' as const,
      title: safeText(item.goodsName, '商品成本'),
      category: safeText(item.categoryName, '未分类商品'),
    })),
  );

  // 3. 销售分类 + 商品聚合（单次遍历）
  const salesCategoryMap = new Map<
    string,
    { salesAmount: number; quantity: number }
  >();
  const salesGoodsMap = new Map<
    string,
    { salesAmount: number; quantity: number; costAmount: number }
  >();

  for (const order of raw.orders || []) {
    for (const item of order.items || []) {
      const catName = safeText(item.categoryName, '未分类');
      const goodsName = safeText(item.goodsName, '未知商品');
      const salesAmount = toNumber(item.totalAmount);
      const qty = toNumber(item.quantity);
      const costAmt = toNumber(item.costPrice) * qty;

      const catEntry = salesCategoryMap.get(catName);
      if (catEntry) {
        catEntry.salesAmount += salesAmount;
        catEntry.quantity += qty;
      } else {
        salesCategoryMap.set(catName, { salesAmount, quantity: qty });
      }

      const goodsEntry = salesGoodsMap.get(goodsName);
      if (goodsEntry) {
        goodsEntry.salesAmount += salesAmount;
        goodsEntry.quantity += qty;
        goodsEntry.costAmount += costAmt;
      } else {
        salesGoodsMap.set(goodsName, {
          salesAmount,
          quantity: qty,
          costAmount: costAmt,
        });
      }
    }
  }

  const salesByCategory = Array.from(salesCategoryMap.entries()).map(
    ([name, v]) => ({
      categoryName: name,
      salesAmount: Number(v.salesAmount.toFixed(2)),
      quantity: v.quantity,
    }),
  );

  const salesByGoods = Array.from(salesGoodsMap.entries()).map(([name, v]) => ({
    goodsName: name,
    salesAmount: Number(v.salesAmount.toFixed(2)),
    quantity: v.quantity,
    costAmount: Number(v.costAmount.toFixed(2)),
  }));

  // 5. 库存明细
  const inventoryItems = (raw.inventory || []).map((item) => {
    const stock = toNumber(item.stock);
    const costPrice = toNumber(item.costPrice);
    return {
      goodsName: safeText(item.goodsName, '未知商品'),
      categoryName: safeText(item.categoryName, '未分类'),
      stock,
      costPrice,
      inventoryValue: Number((stock * costPrice).toFixed(2)),
    };
  });

  // 6. 现金流（仅基于订单 income + cost）
  const cashflowItems = [
    ...incomeItems.map((item) => ({
      date: item.date,
      type: 'inflow' as const,
      amount: item.amount,
      title: item.title,
      category: item.category,
    })),
    ...costItems.map((item) => ({
      date: item.date,
      type: 'outflow' as const,
      amount: item.amount,
      title: item.title,
      category: item.category,
    })),
  ];

  return {
    incomeItems,
    costItems,
    salesByCategory,
    salesByGoods,
    inventoryItems,
    cashflowItems,
  };
};

/**
 * 节点三：归一化报表数据
 *
 * 只汇总来自 DB 固定 schema 的数据（订单/库存/商品），不碰 financeRecords。
 * 发票/合同/通用资源的 raw JSON 留在 state.rawData.financeRecords 中，
 * 由 Node 4 的 LLM 做语义理解和金额计算。
 */
export const buildNormalizeReportDataNode = (_deps: FinanceReportNodeDeps) => {
  void _deps;
  return async (
    state: FinanceReportGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<FinanceReportGraphState>> => {
    console.log('[Node 3] 进入节点：归一化报表数据（仅订单+库存）');
    if (!state.rawData) throw new Error('缺少 rawData，无法进行报表数据归一化');

    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;
    const logs: string[] = [];

    await pushProgress?.(
      35,
      FinanceReportProgressPhase.NORMALIZING,
      '正在汇总订单和库存数据...',
    );

    const normalizedData = normalizeReportRawDataByRule(state.rawData);
    logs.push('订单和库存数据已汇总归一化');

    let comparisonNormalizedData: NormalizedReportData | undefined;
    if (state.comparisonRawData) {
      comparisonNormalizedData = normalizeReportRawDataByRule(
        state.comparisonRawData,
      );
      logs.push('对比区间订单和库存数据已汇总归一化');
    }

    console.log('[Node 3] 离开节点');
    return { normalizedData, comparisonNormalizedData, logs };
  };
};
