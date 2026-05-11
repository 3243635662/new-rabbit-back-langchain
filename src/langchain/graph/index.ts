/**
 * @file graph/index.ts
 * @description LangGraph 图模块的统一导出入口
 * @导出内容
 *   - AgentGraphBuilder：图构建器（核心编排类）
 *   - AgentState：Agent 状态定义（Annotation.Root）
 *   - AgentStateType：Agent 状态类型（TypeScript 类型）
 *   - AgentStreamHub：Agent 流式事件中心
 *   - createCallModelNode：创建模型调用节点（工厂函数）
 *   - createExecuteToolsNode：创建工具执行节点（工厂函数）
 *   - streamEmitNode：流式事件收集节点（占位）
 *   - createShouldContinue：创建条件边函数（工厂函数）
 * @作用 集中导出图相关的所有模块，方便其他模块引入
 */

// Agent 相关模块
export { AgentGraphBuilder } from './agent/agent-graph.builder';
export { AgentState } from './agent/agent-state.annotation';
export type { AgentStateType } from './agent/agent-state.annotation';
export { AgentStreamHub } from './agent/agent-stream.hub';

// 通用节点和边
export { createCallModelNode } from './nodes/call-model.node';
export { createExecuteToolsNode } from './nodes/execute-tools.node';
export { streamEmitNode } from './nodes/stream-emit.node';
export { createShouldContinue } from './edges/should-continue.edge';
