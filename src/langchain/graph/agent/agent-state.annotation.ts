/**
 * @file agent-state.annotation.ts
 * @description LangGraph Agent State 定义（状态注解）
 *
 * 基于 MessagesAnnotation 扩展业务字段，管理 Agent 工作流状态。
 *
 * 字段说明：
 * - messages: 对话历史（LangGraph 内置，自动追加）
 * - availableTools: 当前可用工具（覆盖模式）
 * - toolTraces: 工具调用记录（追加模式，用于前端展示）
 * - step: 执行步数计数器（覆盖模式，防止无限循环）
 *
 * Reducer 行为：
 *   messages        → 追加（LangGraph 内置）
 *   availableTools  → 覆盖（每次替换）
 *   toolTraces     → 追加（累积历史）
 *   step           → 覆盖（更新步数）
 */

import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentToolTrace } from '../../../types/agent.type';

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 当前可用工具列表（覆盖模式）
  availableTools: Annotation<DynamicStructuredTool[]>({
    reducer: (_curr, update) => update,
    default: () => [],
  }),

  // 工具调用记录（追加模式，用于前端展示）
  toolTraces: Annotation<AgentToolTrace[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),

  // 执行步数计数器（覆盖模式，防止无限循环）
  step: Annotation<number>({
    reducer: (_curr, update) => update,
    default: () => 0,
  }),
});

export type AgentStateType = typeof AgentState.State;
