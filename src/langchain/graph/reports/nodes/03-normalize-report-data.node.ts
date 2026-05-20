import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import type { ReportRawData } from '../../../../types/reports/report-raw-data.type';
import type { NormalizedReportData } from '../../../../types/reports/normalized-report-data.type';
import { normalizedReportDataSchema } from '../schemas/normalized-report.schema';
import { buildNormalizeReportDataPrompt } from '../prompts/normalize-report-data.prompt';

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
};

const normalizeDate = (value: string | Date | undefined): string => {
  if (!value) return new Date().toISOString();

  if (value instanceof Date) {
    return value.toISOString();
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString();
  }

  return d.toISOString();
};

const extractJson = (text: string): unknown => {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('LLM 未返回合法 JSON');
  }

  return JSON.parse(match[0]);
};

/**
 * 将 rawData 精简后交给 LLM。
 * 保留所有归一化所需字段，去掉 LLM 不需要的冗余信息。
 * 注意：structuredFields 完整保留，不裁剪。
 */
const compactRawDataForLLM = (rawData: ReportRawData) => ({
  orders: (rawData.orders || []).map((order) => ({
    orderNo: order.orderNo,
    createdAt: order.createdAt,
    payAmount: order.payAmount,
    items: (order.items || []).map((item) => ({
      goodsName: item.goodsName,
      categoryName: item.categoryName,
      quantity: item.quantity,
      costPrice: item.costPrice,
      totalAmount: item.totalAmount,
    })),
  })),

  inventory: (rawData.inventory || []).map((item) => ({
    goodsName: item.goodsName,
    categoryName: item.categoryName,
    stock: item.stock,
    costPrice: item.costPrice,
  })),

  // inventoryLogs 传给 LLM，用于生成人性化的库存管理建议
  inventoryLogs: (rawData.inventoryLogs || []).map((item) => ({
    goodsName: item.goodsName,
    categoryName: item.categoryName,
    change: item.change,
    currentStock: item.currentStock,
    type: item.type,
    createdAt: item.createdAt,
  })),

  invoices: (rawData.invoices || []).map((item) => ({
    invoiceNo: item.invoiceNo,
    invoiceDate: item.invoiceDate,
    amount: item.amount,
    type: item.type,
    title: item.title,
    category: item.category,
  })),

  financeResources: (rawData.financeResources || []).map((item) => ({
    recordType: item.recordType,
    createdAt: item.createdAt,
    amount: item.amount,
    title: item.title,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    structuredFields: item.structuredFields,
  })),
});

/**
 * 对 LLM 输出做二次清洗。
 * 作用：
 * 1. 避免日期非法
 * 2. 避免 amount 是字符串
 * 3. 避免 cashflow type 非法
 * 4. 保证数组存在
 */
const sanitizeNormalizedData = (
  data: Record<string, unknown>,
): NormalizedReportData => {
  const toStr = (v: unknown, fallback: string): string => {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(v);
  };

  return {
    incomeItems: ((data.incomeItems || []) as Record<string, unknown>[]).map(
      (item) => ({
        date: normalizeDate(item.date as string | Date | undefined),
        amount: toNumber(item.amount),
        source: toStr(item.source, 'unknown'),
        title: toStr(item.title, '收入项'),
        category: item.category
          ? toStr(item.category, '') || undefined
          : undefined,
      }),
    ),

    costItems: ((data.costItems || []) as Record<string, unknown>[]).map(
      (item) => ({
        date: normalizeDate(item.date as string | Date | undefined),
        amount: toNumber(item.amount),
        source: toStr(item.source, 'unknown'),
        title: toStr(item.title, '成本项'),
        category: item.category
          ? toStr(item.category, '') || undefined
          : undefined,
      }),
    ),

    expenseItems: ((data.expenseItems || []) as Record<string, unknown>[]).map(
      (item) => ({
        date: normalizeDate(item.date as string | Date | undefined),
        amount: toNumber(item.amount),
        source: toStr(item.source, 'unknown'),
        title: toStr(item.title, '费用项'),
        category: item.category
          ? toStr(item.category, '') || undefined
          : undefined,
      }),
    ),

    salesByCategory: (
      (data.salesByCategory || []) as Record<string, unknown>[]
    ).map((item) => ({
      categoryName: toStr(item.categoryName, '未分类'),
      salesAmount: toNumber(item.salesAmount),
      quantity: toNumber(item.quantity),
    })),

    salesByGoods: ((data.salesByGoods || []) as Record<string, unknown>[]).map(
      (item) => ({
        goodsName: toStr(item.goodsName, '未知商品'),
        salesAmount: toNumber(item.salesAmount),
        quantity: toNumber(item.quantity),
        costAmount: toNumber(item.costAmount),
      }),
    ),

    inventoryItems: (
      (data.inventoryItems || []) as Record<string, unknown>[]
    ).map((item) => ({
      goodsName: toStr(item.goodsName, '未知商品'),
      categoryName: toStr(item.categoryName, '未分类'),
      stock: toNumber(item.stock),
      costPrice: toNumber(item.costPrice),
      inventoryValue: toNumber(item.inventoryValue),
    })),

    cashflowItems: (
      (data.cashflowItems || []) as Record<string, unknown>[]
    ).map((item) => ({
      date: normalizeDate(item.date as string | Date | undefined),
      type: item.type === 'outflow' ? 'outflow' : 'inflow',
      amount: toNumber(item.amount),
      title: toStr(item.title, '现金流项目'),
      category: item.category
        ? toStr(item.category, '') || undefined
        : undefined,
    })),
  };
};

/**
 * 规则兜底：当 LLM 不可用或失败时，使用硬编码规则归一化。
 */
const normalizeReportRawDataByRule = (
  raw: ReportRawData,
): NormalizedReportData => {
  const safeText = (value: unknown, fallback = ''): string => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (typeof value === 'object' && value !== null)
      return JSON.stringify(value);
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value);
  };

  const inferFinanceResourceDirection = (
    recordType: string | undefined,
    title: string | undefined,
  ): 'inflow' | 'outflow' | 'neutral' => {
    const text = `${recordType || ''} ${title || ''}`.toLowerCase();

    if (
      text.includes('income') ||
      text.includes('receipt') ||
      text.includes('receivable') ||
      text.includes('收款') ||
      text.includes('收入') ||
      text.includes('回款')
    ) {
      return 'inflow';
    }

    if (
      text.includes('expense') ||
      text.includes('payment') ||
      text.includes('payable') ||
      text.includes('cost') ||
      text.includes('支出') ||
      text.includes('付款') ||
      text.includes('费用') ||
      text.includes('成本')
    ) {
      return 'outflow';
    }

    return 'neutral';
  };

  // 1. 收入项
  const orderIncomeItems = (raw.orders || []).map((order) => ({
    date: normalizeDate(order.createdAt),
    amount: toNumber(order.payAmount),
    source: 'order',
    title: safeText(order.orderNo, '订单收入'),
    category: '订单收入',
  }));

  const invoiceIncomeItems = (raw.invoices || [])
    .filter((invoice) => invoice.type === 'income')
    .map((invoice) => ({
      date: normalizeDate(invoice.invoiceDate),
      amount: toNumber(invoice.amount),
      source: 'invoice',
      title: safeText(invoice.title || invoice.invoiceNo, '收入发票'),
      category: invoice.category || '发票收入',
    }));

  const resourceIncomeItems = (raw.financeResources || [])
    .filter(
      (resource) =>
        toNumber(resource.amount) > 0 &&
        inferFinanceResourceDirection(resource.recordType, resource.title) ===
          'inflow',
    )
    .map((resource) => ({
      date: normalizeDate(resource.createdAt),
      amount: toNumber(resource.amount),
      source: 'finance_resource',
      title: safeText(resource.title, '财务资源收入'),
      category: resource.recordType || '财务资源收入',
    }));

  const incomeItems = [
    ...orderIncomeItems,
    ...invoiceIncomeItems,
    ...resourceIncomeItems,
  ];

  // 2. 成本项
  const costItems = (raw.orders || []).flatMap((order) =>
    (order.items || []).map((item) => ({
      date: normalizeDate(order.createdAt),
      amount: toNumber(item.costPrice) * toNumber(item.quantity),
      source: 'order',
      title: safeText(item.goodsName, '商品成本'),
      category: safeText(item.categoryName, '未分类商品'),
    })),
  );

  // 3. 费用项
  const invoiceExpenseItems = (raw.invoices || [])
    .filter((invoice) => invoice.type === 'expense')
    .map((invoice) => ({
      date: normalizeDate(invoice.invoiceDate),
      amount: toNumber(invoice.amount),
      source: 'invoice',
      title: safeText(invoice.title || invoice.invoiceNo, '费用发票'),
      category: invoice.category || '发票费用',
    }));

  const resourceExpenseItems = (raw.financeResources || [])
    .filter(
      (resource) =>
        toNumber(resource.amount) > 0 &&
        inferFinanceResourceDirection(resource.recordType, resource.title) ===
          'outflow',
    )
    .map((resource) => ({
      date: normalizeDate(resource.createdAt),
      amount: toNumber(resource.amount),
      source: 'finance_resource',
      title: safeText(resource.title, '财务资源支出'),
      category: resource.recordType || '财务资源支出',
    }));

  const expenseItems = [...invoiceExpenseItems, ...resourceExpenseItems];

  // 4. 销售分类聚合
  const salesCategoryMap = new Map<
    string,
    { salesAmount: number; quantity: number }
  >();

  (raw.orders || []).forEach((order) => {
    (order.items || []).forEach((item) => {
      const categoryName = safeText(item.categoryName, '未分类');
      const old = salesCategoryMap.get(categoryName) || {
        salesAmount: 0,
        quantity: 0,
      };

      salesCategoryMap.set(categoryName, {
        salesAmount: old.salesAmount + toNumber(item.totalAmount),
        quantity: old.quantity + toNumber(item.quantity),
      });
    });
  });

  const salesByCategory = Array.from(salesCategoryMap.entries()).map(
    ([categoryName, value]) => ({
      categoryName,
      salesAmount: Number(value.salesAmount.toFixed(2)),
      quantity: value.quantity,
    }),
  );

  // 5. 商品销售聚合
  const salesGoodsMap = new Map<
    string,
    { salesAmount: number; quantity: number; costAmount: number }
  >();

  (raw.orders || []).forEach((order) => {
    (order.items || []).forEach((item) => {
      const goodsName = safeText(item.goodsName, '未知商品');
      const old = salesGoodsMap.get(goodsName) || {
        salesAmount: 0,
        quantity: 0,
        costAmount: 0,
      };

      salesGoodsMap.set(goodsName, {
        salesAmount: old.salesAmount + toNumber(item.totalAmount),
        quantity: old.quantity + toNumber(item.quantity),
        costAmount:
          old.costAmount + toNumber(item.costPrice) * toNumber(item.quantity),
      });
    });
  });

  const salesByGoods = Array.from(salesGoodsMap.entries()).map(
    ([goodsName, value]) => ({
      goodsName,
      salesAmount: Number(value.salesAmount.toFixed(2)),
      quantity: value.quantity,
      costAmount: Number(value.costAmount.toFixed(2)),
    }),
  );

  // 6. 库存明细
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

  // 7. 现金流明细
  const cashflowItems = [
    ...incomeItems.map((item) => ({
      date: item.date,
      type: 'inflow' as const,
      amount: item.amount,
      title: item.title,
      category: item.category,
    })),
    ...expenseItems.map((item) => ({
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
    expenseItems,
    salesByCategory,
    salesByGoods,
    inventoryItems,
    cashflowItems,
  };
};

/**
 * 使用 LLM 将 rawData 归一化为固定 NormalizedReportData。
 */
const normalizeByLLM = async (
  rawData: ReportRawData,
  state: FinanceReportGraphState,
  deps: FinanceReportNodeDeps,
): Promise<NormalizedReportData> => {
  const llm = deps.getModel();

  const prompt = buildNormalizeReportDataPrompt({
    rawData: compactRawDataForLLM(rawData),
    reportTypes: state.request.reportTypes,
    startDate: state.request.startDate,
    endDate: state.request.endDate,
  });

  try {
    const structured = llm.withStructuredOutput(normalizedReportDataSchema, {
      name: 'normalized_report_data',
    });

    const result = (await structured.invoke([
      new SystemMessage('你是一个严谨的财务报表数据归一化助手。'),
      new HumanMessage(prompt),
    ])) as Record<string, unknown>;

    return sanitizeNormalizedData(result);
  } catch {
    const response = await llm.invoke([
      new SystemMessage(
        '你是一个严谨的财务报表数据归一化助手。请只输出合法 JSON。',
      ),
      new HumanMessage(prompt),
    ]);

    const text =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    const parsed = extractJson(text);
    const checked = normalizedReportDataSchema.parse(parsed);

    return sanitizeNormalizedData(checked as Record<string, unknown>);
  }
};

export const normalizeReportDataNode = async (
  state: FinanceReportGraphState,
  config?: { configurable?: FinanceReportNodeDeps },
): Promise<Partial<FinanceReportGraphState>> => {
  if (!state.rawData) {
    throw new Error('缺少 rawData，无法进行报表数据归一化');
  }

  const deps = config?.configurable;
  const logs: string[] = [];

  let normalizedData: NormalizedReportData;

  if (!deps?.getModel) {
    normalizedData = normalizeReportRawDataByRule(state.rawData);
    logs.push('未提供 LLM 模型，已使用规则归一化当前区间数据');
  } else {
    try {
      normalizedData = await normalizeByLLM(state.rawData, state, deps);
      logs.push('当前区间数据已通过 LLM 完成智能归一化');
    } catch (err) {
      normalizedData = normalizeReportRawDataByRule(state.rawData);
      logs.push(
        `当前区间 LLM 归一化失败，已使用规则归一化兜底：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  let comparisonNormalizedData: NormalizedReportData | undefined;

  if (state.comparisonRawData) {
    if (!deps?.getModel) {
      comparisonNormalizedData = normalizeReportRawDataByRule(
        state.comparisonRawData,
      );
      logs.push('未提供 LLM 模型，已使用规则归一化对比区间数据');
    } else {
      try {
        comparisonNormalizedData = await normalizeByLLM(
          state.comparisonRawData,
          state,
          deps,
        );
        logs.push('对比区间数据已通过 LLM 完成智能归一化');
      } catch (err) {
        comparisonNormalizedData = normalizeReportRawDataByRule(
          state.comparisonRawData,
        );
        logs.push(
          `对比区间 LLM 归一化失败，已使用规则归一化兜底：${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  return {
    normalizedData,
    comparisonNormalizedData,
    logs,
  };
};
