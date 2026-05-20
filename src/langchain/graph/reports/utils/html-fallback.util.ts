import type { FullReportHtmlLLMInput } from './html-input.util';
import {
  TAILWIND_CDN,
  ECHARTS_CDN,
} from '../prompts/generate-report-html.prompt';

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const riskColors: Record<string, string> = {
  low: '#fef3c7',
  medium: '#fed7aa',
  high: '#fecaca',
};

const riskBorderColors: Record<string, string> = {
  low: '#f59e0b',
  medium: '#f97316',
  high: '#ef4444',
};

const riskTextColors: Record<string, string> = {
  low: '#92400e',
  medium: '#9a3412',
  high: '#991b1b',
};

export const buildFallbackHtml = (input: FullReportHtmlLLMInput): string => {
  const { title, generatedAt, metrics, narrative, chartResult, request } =
    input;

  const hasCharts = chartResult.charts && chartResult.charts.length > 0;

  const toPercent = (rate: number | undefined): string => {
    if (rate === undefined || rate === null) return '--';
    return `${(rate * 100).toFixed(2)}%`;
  };

  const formatMoney = (value: number): string => {
    if (Math.abs(value) >= 10000) {
      return `${(value / 10000).toFixed(2)} 万`;
    }
    return value.toFixed(2);
  };

  const comparisonHtml = metrics.comparison
    ? `<div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
        <h2 class="text-lg font-bold text-gray-800 mb-3">📊 对比分析</h2>
        <table class="w-full text-sm">
          <thead><tr class="border-b"><th class="text-left py-2">指标</th><th class="text-right py-2">变化率</th><th class="text-right py-2">变化额</th></tr></thead>
          <tbody>
            ${metrics.comparison.totalRevenueChangeRate !== undefined ? `<tr class="border-b"><td class="py-2">收入</td><td class="text-right ${metrics.comparison.totalRevenueChangeRate >= 0 ? 'text-green-600' : 'text-red-600'}">${toPercent(metrics.comparison.totalRevenueChangeRate)}</td><td class="text-right">${formatMoney(metrics.comparison.totalRevenueChangeAmount ?? 0)}</td></tr>` : ''}
            ${metrics.comparison.netProfitChangeRate !== undefined ? `<tr class="border-b"><td class="py-2">净利润</td><td class="text-right ${metrics.comparison.netProfitChangeRate >= 0 ? 'text-green-600' : 'text-red-600'}">${toPercent(metrics.comparison.netProfitChangeRate)}</td><td class="text-right">${formatMoney(metrics.comparison.netProfitChangeAmount ?? 0)}</td></tr>` : ''}
          </tbody>
        </table>
      </div>`
    : '';

  const narrativeRiskHtml =
    (narrative.risks || []).length > 0
      ? `<div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
        <h2 class="text-lg font-bold text-gray-800 mb-3">⚠️ 风险提示</h2>
        ${narrative.risks
          .map(
            (
              r,
            ) => `<div class="mb-3 p-3 rounded" style="background:${riskColors[r.level]};border-left:4px solid ${riskBorderColors[r.level]}">
          <div class="font-semibold" style="color:${riskTextColors[r.level]}">${escapeHtml(r.title)}</div>
          <div class="text-sm text-gray-700 mt-1">${escapeHtml(r.description)}</div>
        </div>`,
          )
          .join('')}
      </div>`
      : '';

  const chartsHtml = hasCharts
    ? `<div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
        <h2 class="text-lg font-bold text-gray-800 mb-4">📈 图表分析</h2>
        ${chartResult.charts
          .map(
            (chart) => `
        <div class="mb-8">
          <h3 class="text-base font-semibold text-gray-700 mb-2">${escapeHtml(chart.title)}</h3>
          ${chart.description ? `<p class="text-sm text-gray-500 mb-2">${escapeHtml(chart.description)}</p>` : ''}
          <div id="${escapeHtml(chart.id)}" style="width:100%;height:400px;"></div>
        </div>`,
          )
          .join('')}
      </div>`
    : '';

  const chartsDataJson = hasCharts
    ? JSON.stringify(
        chartResult.charts.map((c) => {
          const option: unknown = c.echartsOption;
          return {
            id: c.id,
            title: c.title,
            type: c.type,
            description: c.description,
            echartsOption: option,
          };
        }),
      )
    : '[]';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="${TAILWIND_CDN}"></script>
  <script src="${ECHARTS_CDN}"></script>
  <style>
    @page { margin: 15mm; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .print\\:break-inside-avoid { break-inside: avoid; }
    }
  </style>
</head>
<body class="bg-gray-50 text-gray-900 font-sans">
  <header class="bg-white shadow-sm border-b">
    <div class="max-w-5xl mx-auto px-6 py-8">
      <h1 class="text-2xl font-bold text-gray-900">${escapeHtml(title)}</h1>
      <div class="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
        <span>周期：${request.startDate} 至 ${request.endDate}</span>
        <span>报告类型：${(request.reportTypes || []).join('、')}</span>
        <span>数据范围：${(request.dataScopes || []).join('、')}</span>
        <span>生成时间：${generatedAt}</span>
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-6 py-8 space-y-6">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 print:break-inside-avoid">
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">总收入</div>
        <div class="text-xl font-bold text-blue-600">${formatMoney(metrics.totalRevenue)}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">总成本</div>
        <div class="text-xl font-bold text-orange-600">${formatMoney(metrics.totalCost)}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">净利润</div>
        <div class="text-xl font-bold ${metrics.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}">${formatMoney(metrics.netProfit)}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">订单数</div>
        <div class="text-xl font-bold text-purple-600">${metrics.orderCount}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">毛利率</div>
        <div class="text-xl font-bold text-teal-600">${toPercent(metrics.grossProfitRate)}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">净利率</div>
        <div class="text-xl font-bold text-teal-600">${toPercent(metrics.netProfitRate)}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">客单价</div>
        <div class="text-xl font-bold text-indigo-600">${formatMoney(metrics.averageOrderValue)}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-sm text-gray-500">净现金流</div>
        <div class="text-xl font-bold ${metrics.netCashflow >= 0 ? 'text-green-600' : 'text-red-600'}">${formatMoney(metrics.netCashflow)}</div>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
      <h2 class="text-lg font-bold text-gray-800 mb-3">📋 经营概览</h2>
      <p class="text-gray-700 leading-relaxed">${escapeHtml(narrative.summary)}</p>
    </div>

    ${
      (narrative.keyFindings || []).length > 0
        ? `<div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
      <h2 class="text-lg font-bold text-gray-800 mb-3">🔍 关键发现</h2>
      <ul class="space-y-2">
        ${narrative.keyFindings.map((f: string) => `<li class="flex items-start gap-2"><span class="text-blue-500 mt-1">•</span><span class="text-gray-700">${escapeHtml(f)}</span></li>`).join('')}
      </ul>
    </div>`
        : ''
    }

    ${
      narrative.comparison
        ? `<div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
      <h2 class="text-lg font-bold text-gray-800 mb-3">📊 对比分析</h2>
      <p class="text-gray-700 leading-relaxed">${escapeHtml(narrative.comparison)}</p>
    </div>`
        : comparisonHtml
    }

    ${
      narrative.forecast
        ? `<div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
      <h2 class="text-lg font-bold text-gray-800 mb-3">🔮 趋势预测</h2>
      <p class="text-gray-700 leading-relaxed">${escapeHtml(narrative.forecast)}</p>
    </div>`
        : ''
    }

    ${narrativeRiskHtml}

    ${
      (narrative.suggestions || []).length > 0
        ? `<div class="bg-white rounded-lg shadow p-6 print:break-inside-avoid">
      <h2 class="text-lg font-bold text-gray-800 mb-3">💡 经营建议</h2>
      <ul class="space-y-2">
        ${narrative.suggestions.map((s: string) => `<li class="flex items-start gap-2"><span class="text-green-500 mt-1">✓</span><span class="text-gray-700">${escapeHtml(s)}</span></li>`).join('')}
      </ul>
    </div>`
        : ''
    }

    ${chartsHtml}

    ${
      metrics.warnings.length > 0
        ? `<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 print:break-inside-avoid">
      <div class="text-sm font-semibold text-yellow-800 mb-2">⚠️ 数据说明</div>
      ${metrics.warnings.map((w: string) => `<div class="text-sm text-yellow-700">• ${escapeHtml(w)}</div>`).join('')}
    </div>`
        : ''
    }
  </main>

  <footer class="bg-white border-t mt-12">
    <div class="max-w-5xl mx-auto px-6 py-4 text-center text-sm text-gray-400">
      本报告由系统自动生成 · 生成时间：${generatedAt} · 仅供经营分析参考
    </div>
  </footer>

  <script>
    const CHART_DATA = ${chartsDataJson};
    let renderedCount = 0;
    const totalCharts = CHART_DATA.length;

    const renderCharts = () => {
      if (totalCharts === 0) {
        window.__REPORT_CHARTS_RENDERED__ = true;
        window.__REPORT_CHARTS_RENDERED_COUNT__ = 0;
        return;
      }

      if (typeof echarts === 'undefined') {
        CHART_DATA.forEach((c) => {
          const el = document.getElementById(c.id);
          if (el) el.innerHTML = '<div class="text-red-500 text-center py-20">图表加载失败</div>';
        });
        window.__REPORT_CHARTS_RENDERED__ = true;
        window.__REPORT_CHARTS_RENDERED_COUNT__ = 0;
        return;
      }

      CHART_DATA.forEach((c) => {
        const el = document.getElementById(c.id);
        if (!el) return;

        try {
          const chart = echarts.init(el);
          chart.setOption(c.echartsOption);
          renderedCount++;
          window.addEventListener('resize', () => chart.resize());
        } catch {
          el.innerHTML = '<div class="text-red-500 text-center py-20">图表渲染失败</div>';
        }
      });

      window.__REPORT_CHARTS_RENDERED__ = true;
      window.__REPORT_CHARTS_RENDERED_COUNT__ = renderedCount;
    };

    document.addEventListener('DOMContentLoaded', renderCharts);
  </script>
</body>
</html>`;
};
