/**
 * @file stream-emit.node.ts
 * @description LangGraph 图节点 - 流式事件收集节点（扩展点）
 * @作用 作为图执行过程中的流式事件收集点，供外层 SSE 适配层消费
 * @当前状态 占位实现，实际流式转换在 AgentsService.transformToStreamChunk 中完成
 * @未来扩展 如需在图中持久化 streamChunks，可在此节点中实现
 * @注意 此节点不是图结构中的必需节点，当前仅作为扩展点保留
 */

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
