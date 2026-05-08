import { Logger } from '@nestjs/common';
import { LangChainService } from '../../langchain.service';
import type { AgentStateType } from '../agent-state.annotation';

/**
 * 调用模型节点
 *
 * 职责：调用 LLM，支持流式输出，返回 AIMessage。
 * 复用 LangChainService.getModel() 获取模型实例。
 */
export const createCallModelNode = (langChainService: LangChainService) => {
  const logger = new Logger('CallModelNode');

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const model = langChainService.getModel();
    const modelWithTools = model.bindTools(state.availableTools || []);

    logger.log(`[callModelNode] 调用模型, messages 数量: ${state.messages.length}`);
    try {
      const response = await modelWithTools.invoke(state.messages);
      logger.log(`[callModelNode] 模型返回, content 长度: ${String(response.content).length}, tool_calls 数量: ${(response as { tool_calls?: unknown[] }).tool_calls?.length || 0}`);
      return { messages: [response] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[callModelNode] 模型调用失败: ${msg}`);
      throw err;
    }
  };
};
