/**
 * @file should-continue.edge.ts
 * @description LangGraph 条件边（Conditional Edge）定义
 * @作用 作为 StateGraph 的条件路由函数，决定 Agent 执行完模型节点后的下一步走向
 * @返回 'tools' | '__end__'
 *   - 返回 'tools'：模型发起了工具调用，需要路由到 tools 节点执行工具
 *   - 返回 '__end__'：模型已给出最终回答，结束图执行
 * @注意 通过 maxSteps 参数防止无限循环，超过最大步数后强制结束
 */

import { AIMessage } from '@langchain/core/messages';
import type { AgentStateType } from '../agent-state.annotation';

/**
 * 条件边：判断是否继续调用工具
 *
 * 若最后一条消息包含 tool_calls 且未超过最大步数，则进入 tools 节点；
 * 否则结束图执行。
 */
export const createShouldContinue = (maxSteps = 3) => {
  return (state: AgentStateType): 'tools' | '__end__' => {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!(lastMessage instanceof AIMessage)) {
      return '__end__';
    }

    const toolCalls =
      (
        lastMessage as AIMessage & {
          tool_calls?: { id: string; name: string; args: unknown }[];
        }
      ).tool_calls || [];

    const step = state.step || 0;

    if (toolCalls.length > 0 && step < maxSteps) {
      return 'tools';
    }

    return '__end__';
  };
};
