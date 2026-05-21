import { END, START, StateGraph } from '@langchain/langgraph';
import { FinanceReportStateAnnotation } from './finance-report.annotation';

import { buildValidateRequestNode } from './nodes/01-validate-request.node';
import { buildCollectReportDataNode } from './nodes/02-collect-report-data.node';
import { buildNormalizeReportDataNode } from './nodes/03-normalize-report-data.node';
import { buildCalculateReportMetricsNode } from './nodes/04-calculate-report-metrics.node';
import { buildReportChartsNode } from './nodes/05-build-report-charts.node';
import { buildGenerateReportNarrativeNode } from './nodes/06-generate-report-narrative.node';
import { buildGenerateReportHtmlNode } from './nodes/07-generate-report-html.node';
import { buildExportReportNode } from './nodes/08-export-report.node';

import type { FinanceReportNodeDeps } from '../../../types/reports/finance-report-node-deps.type';

export const buildFinanceReportGraph = (deps: FinanceReportNodeDeps) => {
  const workflow = new StateGraph(FinanceReportStateAnnotation)
    .addNode('validateRequest', buildValidateRequestNode(deps))
    .addNode('collectReportData', buildCollectReportDataNode(deps))
    .addNode('normalizeReportData', buildNormalizeReportDataNode(deps))
    .addNode('calculateReportMetrics', buildCalculateReportMetricsNode(deps))
    .addNode('buildReportCharts', buildReportChartsNode(deps))
    .addNode('generateReportNarrative', buildGenerateReportNarrativeNode(deps))
    .addNode('generateReportHtml', buildGenerateReportHtmlNode(deps))
    .addNode('exportReport', buildExportReportNode(deps))
    .addEdge(START, 'validateRequest')
    .addEdge('validateRequest', 'collectReportData')
    .addEdge('collectReportData', 'normalizeReportData')
    .addEdge('normalizeReportData', 'calculateReportMetrics')
    .addEdge('calculateReportMetrics', 'buildReportCharts')
    .addEdge('buildReportCharts', 'generateReportNarrative')
    .addEdge('generateReportNarrative', 'generateReportHtml')
    .addEdge('generateReportHtml', 'exportReport')
    .addEdge('exportReport', END);

  return workflow.compile();
};
