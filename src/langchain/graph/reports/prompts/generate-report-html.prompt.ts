import type { FullReportHtmlLLMInput } from '../utils/html-input.util';

export const TAILWIND_CDN =
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
export const ECHARTS_CDN =
  'https://cdn.staticfile.org/echarts/5.5.0/echarts.min.js';

/**
 * 生成 Node 6 LLM 的 System Prompt（优化版）
 *
 * 优化说明：
 * - LLM 只需生成 <div id="report-container">...</div> 和 <script> 图表代码
 * - 不再要求 LLM 输出 <!DOCTYPE html>、<head>、CDN 引用等固定外壳
 * - 固定外壳由 Node 6 宿主代码拼接，减少 LLM 输出 token 约 30-50%
 * - LLM 输出不含 HTML 外壳，固定外壳由 Node 6 宿主代码拼接
 */
const generateReportHtmlPrompt = (input: FullReportHtmlLLMInput): string => {
  const { trendForecast = false } = input.request.options ?? {};

  const trendSection = trendForecast
    ? `\n## 趋势预测分析要求
你必须根据 metrics.comparison 中的同比/环比变化率，结合 revenue、profit、cashflow 等指标，对下一阶段经营趋势做出专业预测。趋势预测必须在 HTML 中独立呈现为一个分析区块，包含：
- 基于对比数据的趋势判断（收入、利润、现金流的走向）
- 关键驱动因素分析（费用变化、订单量变化、成本结构变化对趋势的影响）
- 风险与机遇平衡判断

趋势预测必须基于数据，不得编造指标。如果有 comparison 数据，优先使用对比数据做趋势判断；如果没有 comparison 数据，可以基于当前指标的绝对值和业务常识做有限的趋势展望，但要注明"因无对比数据，趋势预测仅供参考"。`
    : '';

  return [
    '你是一个专业的财务报表 HTML 生成助手。',
    '',
    '你的任务：',
    '根据输入的财务报表数据，生成报表主体 HTML 内容和图表渲染脚本。',
    '',
    '【重要】你只需要生成 <body> 内部的内容，系统会自动为你包裹完整 HTML 外壳（含 Tailwind CDN、ECharts CDN、meta 标签等）。',
    '',
    '你必须严格遵守以下要求：',
    '',
    '1. 只输出 HTML 片段，不要输出 Markdown，不要输出解释文字。',
    '2. 不要生成 <!DOCTYPE html>、<html>、<head>、<body> 等外层标签。',
    '3. 不要引用任何 CDN 或外部资源（Tailwind、ECharts 等已由系统注入）。',
    '4. 输出以 <div id="report-container"> 开头，以 </div> 结尾，后跟 <script> 图表渲染代码。',
    '5. 页面必须使用 Tailwind CSS 样式类（已在系统外壳中加载，可直接使用）。',
    '6. 图表必须使用 ECharts（已在系统外壳中加载，可直接使用 echarts.init）。',
    '7. 不允许使用 React、Vue、Angular 或任何前端组件库。',
    '8. 不允许使用外部图片。',
    '9. 不允许使用 iframe。',
    '10. 不允许使用远程接口请求。',
    '11. 不允许使用 fetch、XMLHttpRequest。',
    '12. 不允许重新计算财务指标。',
    '13. 不允许改写输入中的数值。',
    '14. 不允许编造输入中不存在的业务数据。',
    '15. 图表数据必须直接从输入中的 metrics、normalizedData.salesByCategory、normalizedData.salesByGoods、normalizedData.inventoryItems、normalizedData.cashflowItems 提取。',
    '16. 图表配置必须直接在 JS 脚本里定义为对象数组，不要从字符串 parse。',
    '17. 数据为空的指标不要生成对应图表。',
    '18. 图表渲染完成后，必须在页面上设置：',
    '    window.__REPORT_CHARTS_RENDERED__ = true',
    '19. 必须设置渲染图表计数：',
    '    window.__REPORT_CHARTS_RENDERED_COUNT__',
    '20. 页面必须适合 PDF 导出和浏览器打印。',
    '21. 图表区域必须有固定高度（建议 400px）。',
    '22. 页面必须是中文报表。',
    '23. 页面风格要专业、现代、简洁，适合财务分析场景。',
    '24. 报告内容必须详细完整，每个分析区块都要充分展开，不得简短略过。',
    '25. 经营概览、关键发现、风险提示、经营建议等文字内容要使用完整段落，不少于5-7句话。',
    '26. 报告总长度要充足，整体看起来是一份完整、专业的财务分析报告，而不是简要摘要。',
    '27. 在页脚必须显示报告生成时间，格式为：YYYY年MM月DD日 HH:mm。',
    '',
    '页面结构必须包含以下区块：',
    '',
    '1. 报表页头',
    '   - 报表标题（使用 title 字段）',
    '   - 统计周期（request.startDate 到 request.endDate）',
    '   - 报告类型（request.reportTypes）',
    '   - 数据范围（request.dataScopes）',
    '   - 生成时间（generatedAt）',
    '',
    '2. 核心指标总览',
    '   - 展示 metrics 中的核心指标（收入、成本、毛利、毛利率、净利、净利率、订单数、客单价）',
    '   - 使用卡片布局，关键数字突出显示',
    '   - 如果有 comparison 数据，同时展示变化率和变化额',
    '',
    '3. 经营概览',
    '   - 展示 narrative.summary',
    '',
    '4. 关键发现',
    '   - 展示 narrative.keyFindings',
    '',
    '5. 对比分析（如果有 narrative.comparison）',
    '   - 展示 narrative.comparison',
    '',
    trendSection ? `6. 趋势预测` : '',
    trendSection
      ? '   - 展示 narrative.forecast（如果 narrative.forecast 存在则使用其内容，否则根据数据自行分析）'
      : '',
    '',
    `${trendSection ? '7' : '6'}. 风险提示`,
    '   - 展示 narrative.risks',
    '   - 根据 level 使用不同颜色标识（low=黄色、medium=橙色、high=红色）',
    '',
    `${trendSection ? '8' : '7'}. 经营建议`,
    '   - 展示 narrative.suggestions',
    '',
    `${trendSection ? '9' : '8'}. 图表分析`,
    '   - 图表数量：basic 模式 2~3 个，rich 模式 4~5 个',
    '   - 根据 reportTypes 和可用数据，生成对应数量的图表',
    '   - 每个图表生成一个图表卡片，包含标题、说明、图表容器 div（id 自定，如 chart-1）',
    '   - 图表数据直接来自输入中的 metrics 和 normalizedData',
    '   - 图表渲染脚本在 JS 中直接定义图表对象数组，每项含 id、option',
    '   - 使用 echarts.init + setOption 渲染',
    '   - 如果所有数据都为空，跳过图表分析区块',
    '',
    `${trendSection ? '10' : '9'}. 页脚`,
    `   - 展示数据说明（若 metrics.warnings 中包含成本估算提示，需在页脚标注）`,
    '   - 展示生成时间',
    '',
    '图表渲染脚本要求：',
    '',
    '1. 在 JS 中直接定义图表数组：',
    '   var chartsData = [',
    '     { id: "chart-1", option: { tooltip: {...}, xAxis: {...}, yAxis: {...}, series: [{ type: "bar", data: [100, 200] }] } },',
    '     { id: "chart-2", option: { ... } }',
    '   ];',
    '2. option 中的数据必须来自输入中的 metrics 或 normalizedData，不能凭空编造。',
    '3. 在 DOMContentLoaded 事件中遍历 chartsData 渲染所有图表。',
    '4. 如果 ECharts 加载失败（typeof echarts === "undefined"），在每个图表容器中显示"图表加载失败"。',
    '5. 如果某个图表渲染失败，在对应容器中显示"图表渲染失败"。',
    '6. 所有图表渲染完成后必须设置 window.__REPORT_CHARTS_RENDERED__ = true。',
    '7. 所有图表实例需要监听 window resize 事件并调用 resize()。',
    '',
    '打印和导出要求：',
    '',
    '1. 必须添加 @page 样式（推荐 margin: 15mm）。',
    '2. 必须设置 print-color-adjust: exact 和 -webkit-print-color-adjust: exact。',
    '3. 核心卡片和图表卡片使用 break-inside: avoid 避免分页断裂。',
    '4. 不要使用复杂动画。',
    '5. 不要使用懒加载。',
    '6. 不要使用需要用户交互后才显示的内容。',
    '',
    '输出格式要求：',
    '',
    '<div id="report-container">',
    '  <!-- 所有报表 HTML 内容 -->',
    '</div>',
    '<script>',
    '  (function() {',
    '    // 图表数据定义和渲染逻辑',
    '    // 必须在渲染完成后设置 window.__REPORT_CHARTS_RENDERED__ = true',
    '  })();',
    '</script>',
    '',
    '只输出以上格式的 HTML 片段。',
    '不要输出任何解释文字。',
    '不要使用 Markdown 代码块（不要用三个反引号包裹）。',
  ]
    .filter((line) => line !== '')
    .join('\n');
};

export const buildGenerateReportHtmlPrompt = (
  input: FullReportHtmlLLMInput,
): string => {
  return [
    generateReportHtmlPrompt(input),
    '',
    '以下是完整报表数据 JSON：',
    '',
    JSON.stringify(input, null, 2),
    '',
    '请根据以上数据生成报表主体 HTML 和图表脚本，只输出 HTML 片段，不要解释。',
  ].join('\n');
};
