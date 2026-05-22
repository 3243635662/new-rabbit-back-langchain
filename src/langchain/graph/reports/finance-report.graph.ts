import { END, START, StateGraph } from '@langchain/langgraph';
import { FinanceReportStateAnnotation } from './finance-report.annotation';

import { buildValidateRequestNode } from './nodes/01-validate-request.node';
import { buildCollectReportDataNode } from './nodes/02-collect-report-data.node';
import { buildNormalizeReportDataNode } from './nodes/03-normalize-report-data.node';
import { buildCalculateReportMetricsNode } from './nodes/04-calculate-report-metrics.node';
import { buildGenerateReportNarrativeNode } from './nodes/05-generate-report-narrative.node';
import { buildGenerateReportHtmlNode } from './nodes/06-generate-report-html.node';
import { buildExportReportNode } from './nodes/07-export-report.node';

import type { FinanceReportNodeDeps } from '../../../types/reports/finance-report-node-deps.type';

export const buildFinanceReportGraph = (deps: FinanceReportNodeDeps) => {
  const wrapNode = <T extends string>(
    name: T,
    fn: (state: unknown, config?: unknown) => Promise<unknown>,
  ) => {
    return async (state: unknown, config?: unknown): Promise<unknown> => {
      console.log(`[Graph] 开始执行节点: ${name}`);
      const startTime = Date.now();
      try {
        const result = await fn(state, config);
        console.log(
          `[Graph] 节点执行完成: ${name}，耗时 ${Date.now() - startTime}ms`,
        );
        return result;
      } catch (err) {
        console.error(
          `[Graph] 节点执行失败: ${name}，耗时 ${Date.now() - startTime}ms，错误: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    };
  };

  const workflow = new StateGraph(FinanceReportStateAnnotation)
    .addNode(
      'validateRequest',
      wrapNode('validateRequest', buildValidateRequestNode(deps)),
    )
    .addNode(
      'collectReportData',
      wrapNode('collectReportData', buildCollectReportDataNode(deps)),
    )
    .addNode(
      'normalizeReportData',
      wrapNode('normalizeReportData', buildNormalizeReportDataNode(deps)),
    )
    .addNode(
      'calculateReportMetrics',
      wrapNode('calculateReportMetrics', buildCalculateReportMetricsNode(deps)),
    )
    .addNode(
      'generateReportNarrative',
      wrapNode(
        'generateReportNarrative',
        buildGenerateReportNarrativeNode(deps),
      ),
    )
    .addNode(
      'generateReportHtml',
      wrapNode('generateReportHtml', buildGenerateReportHtmlNode(deps)),
    )
    .addNode(
      'exportReport',
      wrapNode('exportReport', buildExportReportNode(deps)),
    )
    .addEdge(START, 'validateRequest')
    .addEdge('validateRequest', 'collectReportData')
    .addEdge('collectReportData', 'normalizeReportData')
    .addEdge('normalizeReportData', 'calculateReportMetrics')
    .addEdge('calculateReportMetrics', 'generateReportNarrative')
    .addEdge('generateReportNarrative', 'generateReportHtml')
    .addEdge('generateReportHtml', 'exportReport')
    .addEdge('exportReport', END);

  return workflow.compile();
};
