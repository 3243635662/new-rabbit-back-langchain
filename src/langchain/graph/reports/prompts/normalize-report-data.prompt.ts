export function buildNormalizeReportDataPrompt(input: {
  reportTypes: string[];
  startDate: string;
  endDate: string;
  rawData: unknown;
}) {
  return `
你是一名严谨的财务报表数据归一化助手。

你的任务是把多来源原始数据整理为固定结构 NormalizedReportData。

请注意：你只负责整理数据结构，不负责计算最终财务指标。

严格规则：
1. 只输出合法 JSON，不要输出 Markdown。
2. 不要使用 \`\`\` 包裹。
3. 不要编造原始数据中不存在的订单、商品、发票、金额。
4. 不要新增不存在的收入或费用。
5. 金额字段必须是 number。
6. 所有数组即使为空，也必须输出空数组 []。
7. cashflowItems.type 只能是 "inflow" 或 "outflow"。
8. 不要计算 totalRevenue、grossProfit、netProfit、rate 等最终指标。
9. 订单 payAmount 应归入 incomeItems。
10. 订单商品成本 costPrice * quantity 应归入 costItems。
11. invoice.type = "income" 的发票归入 incomeItems。
12. invoice.type = "expense" 的发票归入 expenseItems。
13. financeResources 需要根据 recordType、title、structuredFields 判断收入或支出。
14. 无法判断收入/支出的 financeResources 可以忽略，不要强行归类。
15. salesByCategory 需要根据订单商品 categoryName 聚合。
16. salesByGoods 需要根据订单商品 goodsName 聚合。
17. inventoryItems 需要根据 inventory 中 stock 和 costPrice 生成 inventoryValue。
18. cashflowItems 至少包含 incomeItems 的 inflow 和 expenseItems 的 outflow。
19. 库存日志 inventoryLogs 仅作为辅助信息，除非能够明确判断现金流，否则不要纳入收入或费用。

输出 JSON 结构必须严格如下：

{
  "incomeItems": [
    {
      "date": "string",
      "amount": 0,
      "source": "string",
      "title": "string",
      "category": "string"
    }
  ],
  "costItems": [
    {
      "date": "string",
      "amount": 0,
      "source": "string",
      "title": "string",
      "category": "string"
    }
  ],
  "expenseItems": [
    {
      "date": "string",
      "amount": 0,
      "source": "string",
      "title": "string",
      "category": "string"
    }
  ],
  "salesByCategory": [
    {
      "categoryName": "string",
      "salesAmount": 0,
      "quantity": 0
    }
  ],
  "salesByGoods": [
    {
      "goodsName": "string",
      "salesAmount": 0,
      "quantity": 0,
      "costAmount": 0
    }
  ],
  "inventoryItems": [
    {
      "goodsName": "string",
      "categoryName": "string",
      "stock": 0,
      "costPrice": 0,
      "inventoryValue": 0
    }
  ],
  "cashflowItems": [
    {
      "date": "string",
      "type": "inflow",
      "amount": 0,
      "title": "string",
      "category": "string"
    }
  ]
}

报告类型：${input.reportTypes.join('、')}
时间范围：${input.startDate} 至 ${input.endDate}

原始数据如下：
${JSON.stringify(input.rawData, null, 2)}
`;
}
