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

    // 简单步数控制：通过消息中 HumanMessage 数量估算步数
    const stepCount = state.messages.filter(
      (m) => m._getType() === 'human',
    ).length;

    if (toolCalls.length > 0 && stepCount <= maxSteps) {
      return 'tools';
    }

    return '__end__';
  };
};
