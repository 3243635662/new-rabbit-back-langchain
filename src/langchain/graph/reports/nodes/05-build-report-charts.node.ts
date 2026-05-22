import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import { buildReportChartsPrompt } from '../prompts/build-report-charts.prompt';
import {
  getChartMode,
  buildChartLLMInput,
  type ChartMode,
} from '../utils/chart-input.util';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';

/**
 * 调用 LLM 生成图表配置原始字符串
 * - 不做任何 JSON 解析或校验
 * - 原样返回 response.content 字符串
 */
const generateRawChartJson = async (
  state: FinanceReportGraphState,
  deps: FinanceReportNodeDeps,
  chartMode: ChartMode,
): Promise<string> => {
  const input = buildChartLLMInput(state, chartMode);

  console.log(
    '[generateRawChartJson] LLM 输入数据长度：',
    JSON.stringify(input).length,
  );
  console.log('[generateRawChartJson] chartMode：', chartMode);

  const model = deps.getModel();

  console.log('[generateRawChartJson] 开始调用 model.invoke');
  const response = await model.invoke([
    new SystemMessage(buildReportChartsPrompt),
    new HumanMessage(
      `当前输入数据如下：\n${JSON.stringify(input, null, 2)}\n\n请严格输出 JSON，不要输出 Markdown，不要解释。`,
    ),
  ]);
  console.log('[generateRawChartJson] model.invoke 返回');

  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  console.log('[generateRawChartJson] LLM 返回内容长度：', content.length);
  console.log(
    '[generateRawChartJson] LLM 返回内容前 300 字符：',
    content.slice(0, 300),
  );

  return content;
};

/* ---------- 节点入口 ---------- */

export const buildReportChartsNode = (deps: FinanceReportNodeDeps) => {
  return async (
    state: FinanceReportGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<FinanceReportGraphState>> => {
    console.log('[Node 5] 进入节点：生成报表图表（原始字符串模式）');

    if (!state.metrics) {
      throw new Error('缺少报表指标数据，无法生成图表');
    }
    if (!state.normalizedData) {
      throw new Error('缺少归一化报表数据，无法生成图表');
    }

    const chartMode = getChartMode(state);

    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;
    const extendLock = config?.configurable?.extendLock as
      | (() => Promise<void>)
      | undefined;

    try {
      await pushProgress?.(
        65,
        FinanceReportProgressPhase.BUILDING_CHARTS,
        '正在使用 AI 生成报表图表...',
      );
      await extendLock?.();

      const rawChartJson = await generateRawChartJson(state, deps, chartMode);

      console.log(
        `[Node 5] 离开节点，原始图表 JSON 长度：${rawChartJson.length}`,
      );

      return {
        rawChartJson,
        logs: [`LLM 图表原始 JSON 生成完成，长度 ${rawChartJson.length} 字符`],
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[Node 5] 节点执行失败：${error.message}`);
      throw new Error(`节点五：LLM 图表配置生成失败 - ${error.message}`);
    }
  };
};
