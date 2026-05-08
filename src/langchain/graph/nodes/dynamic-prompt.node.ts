import { Logger } from '@nestjs/common';
import { SystemMessage } from '@langchain/core/messages';
import { buildAgentSystemPrompt } from '../../prompts/agent.prompt';
import type { AgentStateType } from '../agent-state.annotation';

/**
 * 动态 Prompt 节点
 *
 * 职责：根据 runtime context 构建 SystemMessage，注入到消息列表开头。
 * 复用现有的 buildAgentSystemPrompt() 逻辑。
 */
const logger = new Logger('DynamicPromptNode');

export const dynamicPromptNode = (
  state: AgentStateType,
): Partial<AgentStateType> => {
  const systemPrompt = buildAgentSystemPrompt();
  const systemMessage = new SystemMessage(systemPrompt);

  // 若第一条不是 SystemMessage，则插入；否则替换
  const messages = state.messages.slice();
  if (messages.length > 0 && messages[0] instanceof SystemMessage) {
    messages[0] = systemMessage;
  } else {
    messages.unshift(systemMessage);
  }

  logger.log(`[dynamicPromptNode] 注入 SystemMessage, messages 数量: ${messages.length}`);
  return { messages };
};
