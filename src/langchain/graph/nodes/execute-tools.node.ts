import { Logger } from '@nestjs/common';
import { ToolMessage, AIMessage } from '@langchain/core/messages';
import type { AgentStateType } from '../agent-state.annotation';
import { AgentToolTrace } from '../../../types/agent.type';
import { TOOL_ERROR } from '../../prompts/agent.prompt';

/**
 * 工具执行节点
 *
 * 职责：解析最后一条 AIMessage 的 tool_calls，并行执行工具，返回 ToolMessage 列表。
 * 复用现有工具实例，不重建工具逻辑。
 */
const logger = new Logger('ExecuteToolsNode');

export const executeToolsNode = async (
  state: AgentStateType,
): Promise<Partial<AgentStateType>> => {
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

  logger.log(`[executeToolsNode] 执行 ${toolCalls.length} 个工具调用: ${toolCalls.map((t) => t.name).join(', ')}`);

  const toolMap = new Map((state.availableTools || []).map((t) => [t.name, t]));

  const toolTraces: AgentToolTrace[] = [];
  const toolMessages: ToolMessage[] = [];

  await Promise.all(
    toolCalls.map(async (toolCall) => {
      const toolCallId = toolCall.id;
      const toolName = toolCall.name;

      if (!toolCallId) {
        toolTraces.push({
          toolName,
          args: toolCall.args,
          resultPreview: TOOL_ERROR.missingId,
          success: false,
          errorMessage: TOOL_ERROR.missingId,
        });
        toolMessages.push(
          new ToolMessage({
            content: TOOL_ERROR.missingId,
            tool_call_id: toolCallId || 'unknown',
          }),
        );
        return;
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
          const rawResult = (await targetTool.invoke(toolCall.args)) as unknown;
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

      toolTraces.push({
        toolName,
        args: toolCall.args,
        resultPreview: toolResult.slice(0, 500),
        success,
        errorMessage,
      });

      toolMessages.push(
        new ToolMessage({
          content: toolResult,
          tool_call_id: toolCallId,
        }),
      );
    }),
  );

  return {
    messages: toolMessages,
    toolTraces: [...(state.toolTraces || []), ...toolTraces],
  };
};
