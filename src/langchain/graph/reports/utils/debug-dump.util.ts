import type { FinanceReportGraphState } from '../finance-report.annotation';
import * as fsp from 'fs/promises';
import * as path from 'path';

/**
 * 格式化金额
 */
const formatMoney = (value: number | undefined | null): string => {
  if (value === undefined || value === null || !Number.isFinite(value))
    return '—';
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * 格式化比率
 */
const formatRate = (value: number | undefined | null): string => {
  if (value === undefined || value === null || !Number.isFinite(value))
    return '—';
  return `${(value * 100).toFixed(2)}%`;
};

/**
 * 将对象转为 markdown 表格行
 */
const tableRow = (...cells: (string | number | undefined | null)[]): string => {
  return `| ${cells.map((c) => String(c ?? '—')).join(' | ')} |`;
};

/**
 * 构建 metrics 区域的 markdown
 */
const buildMetricsSection = (state: FinanceReportGraphState): string => {
  const m = state.metrics;
  if (!m) return '';

  const lines: string[] = ['## 核心指标 (metrics)', ''];
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push(tableRow('总收入', formatMoney(m.totalRevenue)));
  lines.push(tableRow('订单收入', formatMoney(m.orderRevenue)));
  lines.push(tableRow('总成本', formatMoney(m.totalCost)));
  lines.push(tableRow('毛利润', formatMoney(m.grossProfit)));
  lines.push(tableRow('毛利率', formatRate(m.grossProfitRate)));
  lines.push(tableRow('总费用', formatMoney(m.totalExpense)));
  lines.push(tableRow('净利润', formatMoney(m.netProfit)));
  lines.push(tableRow('净利率', formatRate(m.netProfitRate)));
  lines.push(tableRow('成本收入比', formatRate(m.costToRevenueRate)));
  lines.push(tableRow('费用收入比', formatRate(m.expenseToRevenueRate)));
  lines.push(tableRow('订单数', m.orderCount));
  lines.push(tableRow('客单价', formatMoney(m.averageOrderValue)));
  lines.push(tableRow('库存金额', formatMoney(m.inventoryValue)));
  lines.push(tableRow('库存数量', m.inventoryQuantity));
  lines.push(tableRow('库存周转率', formatRate(m.inventoryTurnover)));
  lines.push(tableRow('现金流入', formatMoney(m.cashInflow)));
  lines.push(tableRow('现金流出', formatMoney(m.cashOutflow)));
  lines.push(tableRow('净现金流', formatMoney(m.netCashflow)));
  lines.push(tableRow('现金流利润比', formatRate(m.cashflowToProfitRatio)));

  if (m.topCategory) {
    lines.push('');
    lines.push(
      '**Top 分类**：' +
        m.topCategory.name +
        '（' +
        formatMoney(m.topCategory.amount) +
        '）',
    );
  }
  if (m.topGoods) {
    lines.push(
      '**Top 商品**：' +
        m.topGoods.name +
        '（' +
        formatMoney(m.topGoods.amount) +
        '，数量：' +
        m.topGoods.quantity +
        '）',
    );
  }

  if (m.comparison) {
    lines.push('');
    lines.push('### 对比分析');
    lines.push('| 指标 | 数值 |');
    lines.push('|------|------|');
    lines.push(tableRow('对比模式', m.comparison.compareMode));
    lines.push(
      tableRow('收入变化率', formatRate(m.comparison.totalRevenueChangeRate)),
    );
    lines.push(
      tableRow(
        '收入变化额',
        formatMoney(m.comparison.totalRevenueChangeAmount),
      ),
    );
    lines.push(
      tableRow('毛利变化率', formatRate(m.comparison.grossProfitChangeRate)),
    );
    lines.push(
      tableRow('费用变化率', formatRate(m.comparison.totalExpenseChangeRate)),
    );
    lines.push(
      tableRow('净利变化率', formatRate(m.comparison.netProfitChangeRate)),
    );
    lines.push(
      tableRow('订单数变化率', formatRate(m.comparison.orderCountChangeRate)),
    );
  }

  if (m.costStructure && m.costStructure.length > 0) {
    lines.push('');
    lines.push('### 成本结构');
    lines.push('| 名称 | 金额 |');
    lines.push('|------|------|');
    for (const item of m.costStructure) {
      lines.push(tableRow(item.name, formatMoney(item.value)));
    }
  }

  if (m.warnings && m.warnings.length > 0) {
    lines.push('');
    lines.push('### 预警信息');
    for (const w of m.warnings) {
      lines.push('- ' + w);
    }
  }

  return lines.join('\n');
};

/**
 * 构建 normalizedData 区域
 */
const buildNormalizedSection = (
  title: string,
  data: Record<string, unknown> | undefined,
): string => {
  if (!data) return '';
  const lines: string[] = ['## ' + title, ''];
  lines.push('```json');
  lines.push(JSON.stringify(data, null, 2));
  lines.push('```');
  return lines.join('\n');
};

/**
 * 构建 rawData 摘要区域
 */
const buildRawDataSummary = (
  title: string,
  data: Record<string, unknown> | undefined,
): string => {
  if (!data) return '## ' + title + '\n\n无数据';
  const lines: string[] = ['## ' + title, ''];

  const summary: Record<string, number> = {};
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) {
      summary[key] = val.length;
    }
  }

  if (Object.keys(summary).length > 0) {
    lines.push('| 数据类型 | 条数 |');
    lines.push('|----------|------|');
    for (const [key, count] of Object.entries(summary)) {
      lines.push(tableRow(key, String(count)));
    }
  }

  lines.push('');
  lines.push('<details>');
  lines.push('<summary>展开查看完整数据</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(data, null, 2));
  lines.push('```');
  lines.push('</details>');

  return lines.join('\n');
};

/**
 * 构建 narrative 区域
 */
const buildNarrativeSection = (state: FinanceReportGraphState): string => {
  const n = state.narrative;
  if (!n) return '';

  const lines: string[] = ['## 报表解读 (narrative)', ''];

  lines.push('### 经营概览');
  lines.push(n.summary || '—');
  lines.push('');

  if (n.keyFindings && n.keyFindings.length > 0) {
    lines.push('### 关键发现');
    for (const f of n.keyFindings) lines.push('- ' + f);
    lines.push('');
  }

  if (n.comparison) {
    lines.push('### 对比分析');
    lines.push(n.comparison);
    lines.push('');
  }

  if (n.forecast) {
    lines.push('### 趋势预测');
    lines.push(n.forecast);
    lines.push('');
  }

  if (n.risks && n.risks.length > 0) {
    lines.push('### 风险提示');
    for (const r of n.risks) {
      const levelLabel =
        r.level === 'high' ? '🔴 高' : r.level === 'medium' ? '🟡 中' : '🟢 低';
      lines.push(`- **${levelLabel}** ${r.title}：${r.description}`);
    }
    lines.push('');
  }

  if (n.suggestions && n.suggestions.length > 0) {
    lines.push('### 经营建议');
    for (let i = 0; i < n.suggestions.length; i++) {
      lines.push(`${i + 1}. ${n.suggestions[i]}`);
    }
  }

  return lines.join('\n');
};

/**
 * 构建 chartResult 区域
 */
const buildChartSection = (state: FinanceReportGraphState): string => {
  const cr = state.chartResult;
  if (!cr || !cr.charts || cr.charts.length === 0) return '';

  const lines: string[] = ['## 图表配置 (chartResult)', ''];
  lines.push('共 ' + cr.charts.length + ' 个图表');
  lines.push('');

  for (const chart of cr.charts) {
    lines.push('### ' + chart.title);
    lines.push('- ID：' + chart.id);
    lines.push('- 类型：' + chart.type);
    if (chart.description) lines.push('- 说明：' + chart.description);
    lines.push('');
  }

  return lines.join('\n');
};

/**
 * 构建导出结果区域
 */
const buildExportSection = (state: FinanceReportGraphState): string => {
  const e = state.exportResult;
  if (!e) return '';

  const lines: string[] = ['## 导出结果 (exportResult)', ''];
  lines.push('| 字段 | 值 |');
  lines.push('|------|------|');
  lines.push(tableRow('格式', e.format));
  lines.push(tableRow('文件名', e.fileName));
  lines.push(tableRow('Content-Type', e.contentType));
  lines.push(
    tableRow('文件大小', e.size ? `${(e.size / 1024).toFixed(2)} KB` : '—'),
  );
  lines.push(tableRow('URL', e.url || '—'));
  lines.push(tableRow('七牛 Key', e.key || '—'));

  return lines.join('\n');
};

/**
 * 构建日志区域
 */
const buildLogsSection = (state: FinanceReportGraphState): string => {
  const logs = state.logs;
  if (!logs || logs.length === 0) return '';
  const lines: string[] = ['## 执行日志 (logs)', ''];
  for (const log of logs) {
    lines.push('- ' + log);
  }
  return lines.join('\n');
};

/**
 * 将完整 State 写入调试 markdown 文件
 */
export const dumpStateToMarkdown = async (
  state: FinanceReportGraphState,
  outputDir: string,
): Promise<string> => {
  const title = buildReportTitle(state);
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `debug-report-${ts}.md`;
  const filePath = path.join(outputDir, fileName);

  const sections = [
    `# ${title} — 调试数据`,
    '',
    `> 生成时间：${now.toLocaleString('zh-CN')}`,
    `> 任务状态：已完成`,
    '',
    '---',
    '',
    '## 请求参数 (request)',
    '',
    '```json',
    JSON.stringify(state.request, null, 2),
    '```',
    '',
    '---',
    '',
    buildRawDataSummary(
      '原始数据 (rawData)',
      state.rawData as unknown as Record<string, unknown> | undefined,
    ),
    '',
    '---',
    '',
    buildRawDataSummary(
      '对比原始数据 (comparisonRawData)',
      state.comparisonRawData as unknown as Record<string, unknown> | undefined,
    ),
    '',
    '---',
    '',
    buildNormalizedSection(
      '归一化数据 (normalizedData)',
      state.normalizedData as unknown as Record<string, unknown> | undefined,
    ),
    '',
    '---',
    '',
    buildNormalizedSection(
      '对比归一化数据 (comparisonNormalizedData)',
      state.comparisonNormalizedData as unknown as
        | Record<string, unknown>
        | undefined,
    ),
    '',
    '---',
    '',
    buildMetricsSection(state),
    '',
    '---',
    '',
    buildChartSection(state),
    '',
    '---',
    '',
    buildNarrativeSection(state),
    '',
    '---',
    '',
    buildExportSection(state),
    '',
    '---',
    '',
    buildLogsSection(state),
    '',
    '---',
    '',
    '## HTML 报表（前 2000 字符预览）',
    '',
    '```html',
    (state.html || '').slice(0, 2000),
    '```',
  ];

  const content = sections.join('\n');
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.writeFile(filePath, content, 'utf-8');

  return filePath;
};

/**
 * 根据 state 生成报告标题
 */
const buildReportTitle = (state: FinanceReportGraphState): string => {
  const req = state.request;
  if (!req) return '财务分析报告';
  const start = new Date(req.startDate);
  const y = start.getFullYear();
  const m = start.getMonth() + 1;
  const types = (req.reportTypes || []).join('、');
  return `${y}年${m}月财务分析报告${types ? `（${types}）` : ''}`;
};
