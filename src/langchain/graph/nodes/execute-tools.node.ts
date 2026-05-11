/**
 * @file execute-tools.node.ts
 * @description LangGraph 图节点 - 工具执行节点（tools 节点）
 * @作用 解析模型返回的 tool_calls，执行对应的工具，并返回 ToolMessage 结果
 * @职责
 *   1. 从最后一条 AIMessage 中解析 tool_calls
 *   2. 根据工具名称从 state.availableTools 中查找对应工具实例
 *   3. 并行执行所有工具调用（Promise.all）
 *   4. 将工具执行结果封装为 ToolMessage，关联到对应的 tool_call_id
 *   5. 记录工具调用痕迹（toolTraces）用于追踪和展示
 *   6. 通过 AgentStreamHub 推送执行状态，防止 SSE 连接超时
 * @错误处理
 *   - 工具不存在：返回友好错误提示
 *   - 工具执行异常：捕获异常，返回错误信息
 *   - tool_call 缺少 id：记录错误并跳过
 * @state 更新 step 计数器，防止无限循环
 */

import { Logger } from '@nestjs/common';
import { ToolMessage, AIMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AgentStateType } from '../agent/agent-state.annotation';
import { AgentToolTrace } from '../../../types/agent.type';
import { TOOL_ERROR } from '../../prompts/agent.prompt';
import { AgentStreamHub } from '../agent/agent-stream.hub';

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

    // 检查 abortSignal，如果已中断则停止工具执行
    const signal = config?.signal;
    if (signal?.aborted) {
      logger.warn('[executeToolsNode] 检测到 abortSignal，停止工具执行');
      return {
        messages: [
          new ToolMessage({
            content: '操作已被用户中断',
            tool_call_id: toolCalls[0]?.id || 'unknown',
          }),
        ],
      };
    }

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
      toolTraces, // 只返回增量，reducer 负责 [...curr, ...update]
      step: (state.step || 0) + 1,
    };
  };
};
