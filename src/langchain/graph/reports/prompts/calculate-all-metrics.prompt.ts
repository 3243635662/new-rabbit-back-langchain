/**
 * AI 全量计算报表指标 Prompt
 *
 * LLM 拿到：normalizedData（订单+库存，来自 DB 固定 schema）+
 * financeRecords（发票/合同/通用资源，raw JSON 中的 structured_fields 需 LLM 自行解析）
 *
 * 程序化不插手金额提取和收支判断，全部由 AI 完成。
 */
export const buildCalculateAllMetricsPrompt = (input: {
  reportTypes: string[];
  startDate: string;
  endDate: string;
  comparisonMode?: string;
  normalizedData: unknown;
  comparisonNormalizedData?: unknown;
  /** 发票/合同/通用资源的原始 JSON 数组（含 raw.structured_fields） */
  financeRecords: unknown[];
  comparisonFinanceRecords?: unknown[];
  rawDataSummary: {
    orderCount: number;
    inventoryItemCount: number;
    inventoryLogCount: number;
    financeRecordsCount: number;
  };
  comparisonRawDataSummary?: {
    orderCount: number;
    inventoryItemCount: number;
    financeRecordsCount: number;
  };
}): string => {
  const compSection = input.comparisonMode
    ? `\n\n对比数据也一并提供，你需要同时计算对比区间的指标，并输出变化率/变化额。对比模式：${input.comparisonMode}`
    : '';

  const compDataSection = input.comparisonNormalizedData
    ? `\n\n## 对比区间 normalizedData\n${JSON.stringify(input.comparisonNormalizedData, null, 2)}\n\n## 对比区间 financeRecords\n${JSON.stringify(input.comparisonFinanceRecords, null, 2)}\n\n## 对比区间摘要\n${JSON.stringify(input.comparisonRawDataSummary, null, 2)}`
    : '';

  return [
    '你是一个资深的电商财务分析师。你的任务是根据输入的财务数据，计算完整的财务指标。',
    '',
    '报告类型：' + input.reportTypes.join('、'),
    '统计周期：' + input.startDate + ' 至 ' + input.endDate,
    compSection,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '## 数据说明（重要）',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '系统给你两类数据：',
    '',
    '### A. normalizedData（来自数据库固定 schema 的订单+库存）',
    '- incomeItems：仅含订单收入（source="order"，从 order.payAmount 而来），不含发票/合同收入',
    '- costItems：订单商品成本（costPrice × quantity）',
    '- expenseItems：**始终为空数组** —— 费用数据在下面的 financeRecords 里',
    '- salesByCategory / salesByGoods：订单商品的分类/商品聚合',
    '- inventoryItems：库存明细（goodsName/categoryName/stock/costPrice/inventoryValue）',
    '- cashflowItems：仅基于订单的现金流（不含发票/合同）',
    '',
    '### B. financeRecords（发票/合同/通用资源的原始 OCR 解析结果）',
    '每条记录的 raw 字段是 OCR 解析后的 JSON，结构为：',
    '```json',
    '{',
    '  "id": 123,',
    '  "recordType": "invoice | contract | general_image",',
    '  "extractedDate": "2026-05-15 或 null",',
    '  "raw": {',
    '    "summary": "OCR 摘要",',
    '    "structured_fields": [',
    '      { "name": "totalAmount", "desc": "价税合计", "value": "3819400.00" },',
    '      { "name": "amount", "desc": "金额", "value": 3500000 },',
    '      { "name": "buyer", "desc": "购买方", "value": "XX公司" },',
    '      { "name": "seller", "desc": "销售方", "value": "YY公司" },',
    '      { "name": "invoiceNo", "desc": "发票号码", "value": "12345678" },',
    '      { "name": "date", "desc": "开票日期", "value": "2026-05-15" },',
    '      ... 不同文档类型的字段名各不相同',
    '    ]',
    '  }',
    '}',
    '```',
    '',
    '**你需要逐条解析 financeRecords，从中提取金额和收支方向：**',
    '',
    '1. **找金额**：在 structured_fields 中搜索 name 或 desc 包含以下关键词的字段：',
    '   "金额"、"合计金额"、"价税合计"、"总额"、"金额(大写)"、"amount"、"totalAmount"、"total"、"money"、"price" 等',
    '   取其中最有业务含义的主金额（通常是 totalAmount 或 价税合计）',
    '2. **判收支**：',
    '   - 如果 structured_fields 中有 buyer/seller 字段：商户是买方→支出，商户是卖方→收入',
    '   - 如果没有买卖方：综合 recordType、summary、其他字段语义判断',
    '   - recordType="invoice" 且有 "购买方"=商户名 → 支出发票；有 "销售方"=商户名 → 收入发票',
    '   - recordType="contract" 通常需要看合同内容判断应付/应收',
    '   - 无法判断的记录保守处理为中性，不纳入收入或支出',
    '3. **日期**：优先取 record.extractedDate，为空则用 structured_fields 中的 date 字段',
    '4. **不重复计算**：发票和对应订单可能是同一笔交易，不要重复累加',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '## 你需要计算的指标',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '请严格计算以下所有指标，输出 JSON（不要 Markdown 包裹，不要解释文字）：',
    '',
    '```json',
    '{',
    '  "totalRevenue": 0,        // 订单收入 + 从 financeRecords 中解析出的所有收入',
    '  "orderRevenue": 0,        // incomeItems 中 source="order" 的 amount 之和',
    '  "totalCost": 0,           // costItems 中所有 amount 之和',
    '  "grossProfit": 0,        // totalRevenue - totalCost',
    '  "grossProfitRate": 0,    // grossProfit / totalRevenue',
    '',
    '  "totalExpense": 0,       // 从 financeRecords 中解析出的所有支出/费用',
    '  "netProfit": 0,          // grossProfit - totalExpense',
    '  "netProfitRate": 0,      // netProfit / totalRevenue',
    '',
    '  "costToRevenueRate": 0,  // totalCost / totalRevenue',
    '  "expenseToRevenueRate": 0,// totalExpense / totalRevenue',
    '  "inventoryTurnover": 0,  // totalCost / inventoryValue',
    '  "cashflowToProfitRatio": 0,// netCashflow / netProfit',
    '',
    '  "orderCount": 0,          // rawDataSummary.orderCount',
    '  "averageOrderValue": 0,   // orderRevenue / orderCount',
    '',
    '  "inventoryValue": 0,      // inventoryItems 的 inventoryValue 之和',
    '  "inventoryQuantity": 0,   // inventoryItems 的 stock 之和',
    '',
    '  "cashInflow": 0,          // 总收入对应的现金流入',
    '  "cashOutflow": 0,         // 总成本+总费用对应的现金流出',
    '  "netCashflow": 0,         // cashInflow - cashOutflow',
    '',
    '  "topCategory": { "name": "分类名", "amount": 0 },',
    '  "topGoods": { "name": "商品名", "amount": 0, "quantity": 0 },',
    '',
    '  "costStructure": [{ "name": "分类名", "value": 0 }],',
    '  // costStructure = costItems 按 category 聚合 + expenseItems（从 financeRecords 解析的支出）按类型聚合',
    '',
    '  "comparison": { ... } 或 null,',
    '',
    '  "warnings": ["预警信息"],',
    '',
    '  // 输出你从 financeRecords 中逐条解析的结果，便于调试',
    '  "financeRecordAnalysis": [',
    '    {',
    '      "id": 123,',
    '      "recordType": "invoice",',
    '      "direction": "income | expense | neutral",',
    '      "amount": 5000,',
    '      "reason": "简短说明判断依据"',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    '计算规则：',
    '1. 金额保留 2 位小数，比率保留 4 位小数',
    '2. 分母为 0 时比率返回 0',
    '3. 对比变化率 = (current - comparison) / comparison',
    '4. 预警至少含：收入为0、毛利为负、净利为负、现金流为负、成本估算提示',
    '5. 数据均来自输入，不得编造',
    '6. **关键：收入/费用必须从 financeRecords 中逐条解析得出，不能只看 normalizedData**',
    '',
    '## 摘要',
    JSON.stringify(input.rawDataSummary, null, 2),
    '',
    '## 当前区间 normalizedData（订单+库存）',
    JSON.stringify(input.normalizedData, null, 2),
    '',
    '## 当前区间 financeRecords（发票/合同/其他资源 —— 由你从中提取金额和收支方向）',
    JSON.stringify(input.financeRecords, null, 2),
    compDataSection,
    '',
    '请只输出 JSON，不要输出 Markdown，不要解释。',
  ].join('\n');
};
