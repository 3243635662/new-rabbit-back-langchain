import type { AgentStateType } from '../agent-state.annotation';

/**
 * 流式事件收集节点（占位）
 *
 * 职责：在 StateGraph 执行过程中收集状态变化，供外层 SSE 适配层消费。
 * 由于 LangGraph 的 stream() 已经返回 AsyncIterable，本节点当前仅作为扩展点，
 * 实际流式转换在 AgentsService 的 transformToStreamChunk 中完成。
 */
export const streamEmitNode = (): Partial<AgentStateType> => {
  // 扩展点：如需在图中持久化 streamChunks，可在此实现
  return {};
};
