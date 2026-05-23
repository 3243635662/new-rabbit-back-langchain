/**
 * AI 全量计算报表指标 Prompt
 *
 * LLM 拿到：normalizedData（订单+库存，来自 DB 固定 schema）+
 * financeRecords（发票/合同/通用资源，raw JSON 中的 structured_fields 需 LLM 自行解析）
 *
 * 不硬编码计算公式，由 AI 根据数据语义自行理解和计算。
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
    '你是一个资深的电商财务分析师。你的任务是根据输入的财务数据，全面分析并计算财务指标。',
    '',
    '报告类型：' + input.reportTypes.join('、'),
    '统计周期：' + input.startDate + ' 至 ' + input.endDate,
    compSection,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '## 数据说明',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '系统给你两类数据，它们共同描述了这个统计周期内的完整财务状况：',
    '',
    '### A. normalizedData — 数据库中的订单与库存数据',
    '这部分来自数据库的订单系统和库存系统，是结构化的业务数据：',
    '- incomeItems：订单产生的收入记录，每笔包含日期、金额、来源、标题、分类',
    '- costItems：订单对应商品的成本记录，每笔包含日期、金额、来源、标题、分类',
    '- salesByCategory：按商品分类汇总的销售数据（分类名、销售金额、数量）',
    '- salesByGoods：按具体商品汇总的销售数据（商品名、销售金额、数量、成本金额）',
    '- inventoryItems：当前库存明细（商品名、分类、库存量、成本单价、库存价值）',
    '- cashflowItems：基于订单的现金流入流出记录（日期、类型 inflow/outflow、金额、标题）',
    '',
    '### B. financeRecords — OCR 解析的财务凭证数据',
    '这部分来自发票、合同、通用财务资源的 OCR 识别结果。每条记录可能代表一笔收入或支出。',
    '你需要逐条阅读和理解每条记录的内容，从中提取有效的财务信息。',
    '记录的关键字段包括：recordType（invoice/contract/general_image）、extractedDate、以及 raw 中的 summary 和 structured_fields。',
    'structured_fields 是 OCR 解析出的结构化字段数组，字段名和含义因文档类型而异，常见的有：totalAmount、amount、buyer、seller、invoiceNo、date 等。',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '## 你需要做的事情',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '**不要机械地套用公式。请你像一个真正的财务分析师一样，先读懂所有数据，再根据你对财务的理解来计算指标。**',
    '',
    '具体步骤：',
    '',
    '**第一步：理解 financeRecords**',
    '逐条阅读每一条 financeRecord，根据结构化字段和摘要内容，判断它是收入相关还是支出相关，并提取出有意义的金额。',
    '提示：看买卖方关系判断收支方向（买方→支出，卖方→收入）；没有买卖方则根据记录类型和摘要语义判断；无法确定则标注为 neutral。',
    '',
    '**第二步：整体理解财务状况**',
    '综合 normalizedData 和 financeRecords，形成对这家企业在本周期内财务状况的整体认识：',
    '它通过订单卖了多少货？通过发票/合同还有哪些其他收入或支出？成本和费用结构是怎样的？现金流动情况如何？',
    '',
    '**第三步：根据你的理解，计算以下所有指标。如何计算由你根据数据实际情况自行决定。**',
    '',
    '输出 JSON 格式（不要 Markdown 包裹，不要解释文字）：',
    '',
    '```json',
    '{',
    '  "totalRevenue": 0,',
    '  // 含义：本周期所有收入的总和，包括订单收入和从财务凭证中识别的收入',
    '',
    '  "orderRevenue": 0,',
    '  // 含义：仅来自订单系统的收入',
    '',
    '  "totalCost": 0,',
    '  // 含义：与收入对应的直接成本，包括订单商品成本以及财务凭证中识别的直接成本',
    '',
    '  "grossProfit": 0,',
    '  "grossProfitRate": 0,',
    '  // 含义：毛利润 = 总收入 - 总成本，毛利率 = 毛利润/总收入',
    '',
    '  "totalExpense": 0,',
    '  // 含义：期间费用，即不直接对应产品的运营支出（如从财务凭证中识别的管理费用、办公费用等）',
    '',
    '  "netProfit": 0,',
    '  "netProfitRate": 0,',
    '  // 含义：净利润 = 毛利润 - 总费用，净利率 = 净利润/总收入',
    '',
    '  "costToRevenueRate": 0,',
    '  "expenseToRevenueRate": 0,',
    '  // 含义：成本占收入比、费用占收入比',
    '',
    '  "inventoryTurnover": 0,',
    '  // 含义：库存周转率，反映库存周转效率',
    '',
    '  "cashflowToProfitRatio": 0,',
    '  // 含义：现金流与利润的匹配程度',
    '',
    '  "orderCount": 0,',
    '  "averageOrderValue": 0,',
    '  // 含义：订单总数、平均每单金额',
    '',
    '  "inventoryValue": 0,',
    '  "inventoryQuantity": 0,',
    '  // 含义：期末库存总价值、期末库存总数量',
    '',
    '  "cashInflow": 0,',
    '  "cashOutflow": 0,',
    '  "netCashflow": 0,',
    '  // 含义：本周期现金总流入、总流出、净现金流',
    '',
    '  "topCategory": { "name": "分类名", "amount": 0 },',
    '  // 含义：销售额最高的商品分类',
    '',
    '  "topGoods": { "name": "商品名", "amount": 0, "quantity": 0 },',
    '  // 含义：销售额最高的单品',
    '',
    '  "costStructure": [{ "name": "分类名", "value": 0 }],',
    '  // 含义：成本与费用的构成分布',
    '',
    '  "comparison": { ... } 或 null,',
    '',
    '  "warnings": ["预警信息"],',
    '  // 含义：根据数据发现的风险预警，如收入异常、亏损、现金流问题等',
    '',
    '  "financeRecordAnalysis": [',
    '    {',
    '      "id": 123,',
    '      "recordType": "invoice",',
    '      "direction": "income | expense | neutral",',
    '      "amount": 5000,',
    '      "reason": "简要说明判断依据"',
    '    }',
    '  ]',
    '  // 含义：每条财务凭证的解析结果，用于验证你的计算过程',
    '}',
    '```',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '## 基本约束',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '1. 金额保留 2 位小数，比率保留 4 位小数',
    '2. 分母为 0 时对应比率返回 0',
    '3. 对比变化率：有对比数据时，(当期 - 对比期) / 对比期 的绝对值',
    '4. 所有数据必须来自输入数据，不得编造',
    '5. 注意不要重复计算：同一笔业务可能在订单和发票中都有体现，需要有去重意识',
    '6. 如果某条 financeRecord 无法确定金额或方向，标注为 neutral 并在警告中说明',
    '',
    '## 数据摘要',
    JSON.stringify(input.rawDataSummary, null, 2),
    '',
    '## 当前区间 normalizedData',
    JSON.stringify(input.normalizedData, null, 2),
    '',
    '## 当前区间 financeRecords',
    JSON.stringify(input.financeRecords, null, 2),
    compDataSection,
    '',
    '请只输出 JSON，不要输出 Markdown，不要解释。',
  ].join('\n');
};
