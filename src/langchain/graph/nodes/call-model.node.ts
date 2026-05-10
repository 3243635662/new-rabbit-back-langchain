/**
 * @file call-model.node.ts
 * @description LangGraph 图节点 - 模型调用节点（agent 节点）
 * @作用 作为 StateGraph 的核心节点，负责调用 LLM 并处理返回结果
 * @职责
 *   1. 从 LangChainService 获取模型实例
 *   2. 将当前可用工具绑定到模型（bindTools）
 *   3. 以流式方式调用模型，实时推送 token 到 AgentStreamHub
 *   4. 处理模型返回的 tool_calls，构造标准的 AIMessage 返回
 * @流式输出 通过 AgentStreamHub.emit() 实时推送 content、reasoning、toolCallChunks
 * @tool_calls 处理 优先使用 fullChunk.tool_calls，回退到 collapseToolCallChunks 聚合
 */

import { Logger } from '@nestjs/common';
import {
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  collapseToolCallChunks,
} from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { LangChainService } from '../../langchain.service';
import { buildAgentSystemPrompt } from '../../prompts/agent.prompt';
import type { AgentStateType } from '../agent-state.annotation';
import { AgentStreamHub } from '../agent-stream.hub';

/**
 * 调用模型节点
 *
 * 职责：调用 LLM，使用真正的流式输出，实时推送 token 到 AgentStreamHub。
 * 复用 LangChainService.getModel() 获取模型实例。
 */
export const createCallModelNode = (
  langChainService: LangChainService,
  streamHub: AgentStreamHub,
) => {
  const logger = new Logger('CallModelNode');

  return async (
    state: AgentStateType,
    config?: RunnableConfig,
  ): Promise<Partial<AgentStateType>> => {
    const model = langChainService.getModel();
    const modelWithTools = model.bindTools(state.availableTools || []);
    const sessionId = (config?.configurable?.thread_id as string) || 'default';

    logger.log(
      `[callModelNode] 调用模型 (stream), messages 数量: ${state.messages.length}`,
    );

    try {
      // 临时拼接 SystemMessage，不污染 state.messages
      const systemPrompt = buildAgentSystemPrompt();
      const messagesWithSystem = [
        new SystemMessage(systemPrompt),
        ...state.messages,
      ];

      const stream = await modelWithTools.stream(messagesWithSystem);
      let fullChunk: AIMessageChunk | undefined;

      for await (const chunk of stream) {
        if (!fullChunk) {
          fullChunk = chunk;
        } else {
          fullChunk = fullChunk.concat(chunk);
        }
        streamHub.emit(sessionId, AgentStreamHub.fromMessageChunk(chunk));
      }

      if (!fullChunk) {
        throw new Error('模型流式输出为空');
      }

      // AIMessageChunk.concat() 已经通过 collapseToolCallChunks 聚合了 tool_call_chunks
      // 优先信任 fullChunk.tool_calls，如果为空则回退到 tool_call_chunks
      const rawToolCalls =
        (
          fullChunk as AIMessageChunk & {
            tool_calls?: { id: string; name: string; args: unknown }[];
          }
        ).tool_calls || [];

      const toolCalls =
        rawToolCalls.length > 0
          ? rawToolCalls
          : fullChunk.tool_call_chunks?.length
            ? (collapseToolCallChunks(fullChunk.tool_call_chunks)
                .tool_calls as {
                id: string;
                name: string;
                args: unknown;
              }[])
            : [];

      const contentStr =
        typeof fullChunk.content === 'string'
          ? fullChunk.content
          : JSON.stringify(fullChunk.content);
      logger.log(
        `[callModelNode] 模型返回, content 长度: ${contentStr.length}, tool_calls 数量: ${toolCalls.length}`,
      );

      const aiMessage = new AIMessage({
        content: fullChunk.content,
        tool_calls:
          toolCalls.length > 0
            ? (toolCalls as unknown as {
                id: string;
                name: string;
                args: Record<string, unknown>;
              }[])
            : undefined,
        additional_kwargs: fullChunk.additional_kwargs,
      });

      return { messages: [aiMessage] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[callModelNode] 模型调用失败: ${msg}`);
      throw err;
    }
  };
};
