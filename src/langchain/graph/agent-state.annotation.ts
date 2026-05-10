/**
 * @file agent-state.annotation.ts
 * @description LangGraph Agent State 定义（状态注解）
 * @作用 定义 Agent 工作流的状态结构，包括对话历史、可用工具、执行痕迹等
 * @基础 State 复用 MessagesAnnotation（LangChain 官方消息状态），并在此基础上扩展业务字段
 * @字段说明
 *   - messages：对话消息列表（History），使用 LangChain 内置 Reducer 自动合并
 *   - availableTools：当前可用工具列表，每次覆盖更新
 *   - toolTraces：工具调用记录，追加更新（用于前端展示工具执行过程）
 *   - streamChunks：流式输出片段，追加更新（用于 SSE 推送）
 *   - step：执行步数计数器，每次覆盖更新（用于防止无限循环）
 * @Reducer 行为
 *   - messages：LangChain 内置，自动追加新消息
 *   - availableTools：覆盖（每次传入新的工具列表）
 *   - toolTraces：追加（保留历史记录）
 *   - streamChunks：追加（保留历史记录）
 *   - step：覆盖（每次更新为最新步数）
 */

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
/**
 * 字段	         作用	         reducer 行为
messages	    对话历史	        LangGraph 内置
availableTools	当前可用工具	     覆盖
toolTraces	    工具调用记录	     追加
streamChunks	流式输出片段	     追加
step	        执行步数	        覆盖
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
