import { Logger } from '@nestjs/common';
import { ToolMessage, AIMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AgentStateType } from '../agent-state.annotation';
import { AgentToolTrace } from '../../../types/agent.type';
import { TOOL_ERROR } from '../../prompts/agent.prompt';
import { AgentStreamHub } from '../agent-stream.hub';

/**
 * 工具执行节点
 *
 * 职责：解析最后一条 AIMessage 的 tool_calls，并行执行工具，返回 ToolMessage 列表。
 * 复用现有工具实例，不重建工具逻辑。
 * 通过 AgentStreamHub 推送工具执行状态，避免 SSE 长空闲超时。
 */
export const createExecuteToolsNode = (streamHub: AgentStreamHub) => {
  const logger = new Logger('ExecuteToolsNode');

  return async (
    state: AgentStateType,
    config?: RunnableConfig,
  ): Promise<Partial<AgentStateType>> => {
    const sessionId = (config?.configurable?.thread_id as string) || 'default';
    const lastMessage = state.messages[state.messages.length - 1];
    if (!(lastMessage instanceof AIMessage)) {
      logger.log('[executeToolsNode] 最后一条不是 AIMessage, 跳过');
      return {};
    }

    const toolCalls =
      (
        lastMessage as AIMessage & {
          tool_calls?: { id: string; name: string; args: unknown }[];
        }
      ).tool_calls || [];
    if (toolCalls.length === 0) {
      logger.log('[executeToolsNode] 无 tool_calls, 跳过');
      return {};
    }

    logger.log(
      `[executeToolsNode] 执行 ${toolCalls.length} 个工具调用: ${toolCalls.map((t) => t.name).join(', ')}`,
    );

    // 推送工具执行开始状态
    streamHub.emitStatus(
      sessionId,
      `正在调用 ${toolCalls.map((t) => t.name).join(', ')}...`,
    );

    const toolMap = new Map(
      (state.availableTools || []).map((t) => [t.name, t]),
    );

    // 并行执行所有工具，但按原始 toolCalls 顺序收集结果
    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const toolCallId = toolCall.id;
        const toolName = toolCall.name;

        if (!toolCallId) {
          return {
            toolTrace: {
              toolName,
              args: toolCall.args,
              resultPreview: TOOL_ERROR.missingId,
              success: false,
              errorMessage: TOOL_ERROR.missingId,
            } as AgentToolTrace,
            toolMessage: new ToolMessage({
              content: TOOL_ERROR.missingId,
              tool_call_id: 'unknown',
            }),
          };
        }

        const targetTool = toolMap.get(toolName);
        let toolResult: string;
        let success = false;
        let errorMessage: string | undefined;

        if (!targetTool) {
          toolResult = TOOL_ERROR.notFound(toolName);
          errorMessage = '工具不存在或无权限';
        } else {
          try {
            const rawResult = (await targetTool.invoke(
              toolCall.args,
            )) as unknown;
            toolResult =
              typeof rawResult === 'string'
                ? rawResult
                : JSON.stringify(rawResult);
            success = true;
          } catch (err) {
            errorMessage = err instanceof Error ? err.message : String(err);
            toolResult = TOOL_ERROR.executionFailed(errorMessage);
          }
        }

        return {
          toolTrace: {
            toolName,
            args: toolCall.args,
            resultPreview: toolResult.slice(0, 500),
            success,
            errorMessage,
          } as AgentToolTrace,
          toolMessage: new ToolMessage({
            content: toolResult,
            tool_call_id: toolCallId,
          }),
        };
      }),
    );

    const toolTraces = toolResults.map((r) => r.toolTrace);
    const toolMessages = toolResults.map((r) => r.toolMessage);

    // 推送工具执行完成状态
    streamHub.emitStatus(sessionId, '已获取参考资料，正在生成回答...');

    return {
      messages: toolMessages,
      toolTraces: [...(state.toolTraces || []), ...toolTraces],
      step: (state.step || 0) + 1,
    };
  };
};
