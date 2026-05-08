import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentToolTrace, AgentStreamChunk } from '../../types/agent.type';

/**
 * Agent State 定义
 *
 * 复用 MessagesAnnotation 作为基础 State，扩展业务字段。
 * - messages: 对话消息列表（带官方 Reducer）
 * - tools: 当前可用的工具实例列表
 * - toolTraces: 工具调用痕迹，用于追踪和展示
 * - streamChunks: 流式输出块（扩展字段）
 */
export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  availableTools: Annotation<DynamicStructuredTool[]>({
    reducer: (_curr, update) => update,
    default: () => [],
  }),
  toolTraces: Annotation<AgentToolTrace[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  streamChunks: Annotation<AgentStreamChunk[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  step: Annotation<number>({
    reducer: (_curr, update) => update,
    default: () => 0,
  }),
});

export type AgentStateType = typeof AgentState.State;
