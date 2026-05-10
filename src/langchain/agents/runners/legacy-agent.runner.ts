/**
 * @file legacy-agent.runner.ts
 * @description 旧版 LangChain 手动循环 Agent Runner
 * @职责 通过手动循环实现多轮工具调用和流式输出
 * @注意 保留以兼容旧版逻辑，未来计划下线
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  HumanMessage,
  BaseMessage,
  ToolMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import { LangChainService } from '../../langchain.service';
import {
  buildAgentSystemPrompt,
  FORCE_FINAL_ANSWER_PROMPT,
  STREAM_STATUS,
  STREAM_TOOL,
  TOOL_ERROR,
} from '../../prompts/agent.prompt';
import {
  AgentRunResult,
  AgentRuntimeContext,
  AgentToolTrace,
  AgentStreamChunk,
} from '../../../types/agent.type';
import { AgentToolsFactory } from '../factories/agent-tools.factory';
import {
  normalizeModelContent,
  compressToolResult,
} from '../utils/agent-message.util';

@Injectable()
export class LegacyAgentRunner {
  private readonly logger = new Logger(LegacyAgentRunner.name);

  constructor(
    private readonly langChainService: LangChainService,
    private readonly toolsFactory: AgentToolsFactory,
  ) {}

  /** 流式 Agent：支持多轮工具调用，思考过程与回答均流式输出 */
  async *runStream(
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
    abortSignal?: AbortSignal,
  ): AsyncGenerator<AgentStreamChunk> {
    const tools = this.toolsFactory.createTools(context);

    const toolMap = new Map<
      string,
      { name: string; invoke: (args: unknown) => Promise<unknown> }
    >(tools.map((item) => [item.name, item]));

    const model = this.langChainService.getModel();
    const modelWithTools = model.bindTools(tools);

    const messages: BaseMessage[] = [
      new SystemMessage(buildAgentSystemPrompt()),
      ...history,
      new HumanMessage(prompt),
    ];

    const maxSteps = 3;

    for (let i = 0; i < maxSteps; i++) {
      // 检查 abortSignal，如果已中断则停止
      if (abortSignal?.aborted) {
        this.logger.warn('[LegacyAgent] 检测到 abortSignal，停止执行');
        return;
      }

      const stream = await modelWithTools.stream(messages, {
        ...(abortSignal && { signal: abortSignal }),
      });

      let fullContent = '';
      const toolCallMap = new Map<
        string,
        { id: string; name: string; args: unknown }
      >();

      for await (const chunk of stream) {
        const content = normalizeModelContent(chunk.content);
        const reasoning =
          (chunk.additional_kwargs?.reasoning_content as string) || '';

        if (content) {
          fullContent += content;
          yield { type: 'content', content, reasoning: '' };
        }

        if (reasoning) {
          yield { type: 'content', content: '', reasoning };
        }

        const tc = (
          chunk as unknown as {
            tool_calls?: { id: string; name: string; args: unknown }[];
          }
        ).tool_calls;
        if (tc && tc.length > 0) {
          for (const t of tc) {
            if (t.id) toolCallMap.set(t.id, t);
          }
        }
      }

      const toolCalls = Array.from(toolCallMap.values());

      const aiMessage = new AIMessage(fullContent);
      if (toolCalls.length > 0) {
        (aiMessage as unknown as { tool_calls: typeof toolCalls }).tool_calls =
          toolCalls;
      }
      messages.push(aiMessage);

      if (toolCalls.length === 0) {
        return;
      }

      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id;
        const toolName = toolCall.name;
        const toolArgs = toolCall.args;

        if (!toolCallId) {
          this.logger.warn(
            `[Agent] ${TOOL_ERROR.missingId}: ${JSON.stringify(toolCall)}`,
          );
          continue;
        }

        const targetTool = toolMap.get(toolName);

        yield {
          type: 'tool_start',
          toolName,
          toolCallId: toolCallId || 'unknown',
          args: toolArgs,
          content: STREAM_TOOL.start(toolName),
        };

        let toolResult: string;

        if (!targetTool) {
          toolResult = TOOL_ERROR.notFound(toolName);
        } else {
          try {
            const rawResult = await targetTool.invoke(toolArgs);
            toolResult =
              typeof rawResult === 'string'
                ? rawResult
                : JSON.stringify(rawResult);
            toolResult = compressToolResult(toolResult);
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            toolResult = TOOL_ERROR.executionFailed(errorMessage);
          }
        }

        yield {
          type: 'tool_end',
          toolName,
          toolCallId: toolCallId || 'unknown',
          resultPreview: toolResult.slice(0, 500),
          content: STREAM_TOOL.end(toolName),
        };

        messages.push(
          new ToolMessage({
            content: toolResult,
            tool_call_id: toolCallId,
          }),
        );
      }
    }

    yield { type: 'status', content: STREAM_STATUS.generating };

    // 检查 abortSignal，如果已中断则停止
    if (abortSignal?.aborted) {
      this.logger.warn('[LegacyAgent] 检测到 abortSignal，停止最终生成');
      return;
    }

    const finalStream = await model.stream(
      [...messages, new HumanMessage(FORCE_FINAL_ANSWER_PROMPT)],
      { ...(abortSignal && { signal: abortSignal }) },
    );

    for await (const chunk of finalStream) {
      const content = normalizeModelContent(chunk.content);
      const reasoning =
        (chunk.additional_kwargs?.reasoning_content as string) || '';

      if (content || reasoning) {
        yield {
          type: 'content',
          content: content || '',
          reasoning: reasoning || '',
        };
      }
    }
  }

  /** 非流式 Agent */
  async run(
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): Promise<AgentRunResult> {
    const tools = this.toolsFactory.createTools(context);
    const toolMap = new Map<
      string,
      { name: string; invoke: (args: unknown) => Promise<unknown> }
    >(tools.map((item) => [item.name, item]));

    const model = this.langChainService.getModel();
    const modelWithTools = model.bindTools(tools);

    const toolTraces: AgentToolTrace[] = [];

    const messages: BaseMessage[] = [
      new SystemMessage(buildAgentSystemPrompt()),
      ...history,
      new HumanMessage(prompt),
    ];

    const maxSteps = 3;

    for (let i = 0; i < maxSteps; i++) {
      const response = await modelWithTools.invoke(messages);
      messages.push(response);

      const toolCalls = response.tool_calls || [];

      if (toolCalls.length === 0) {
        return {
          content: normalizeModelContent(response.content),
          toolTraces,
        };
      }

      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id;

        if (!toolCallId) {
          this.logger.warn(
            `[Agent] ${TOOL_ERROR.missingId}: ${JSON.stringify(toolCall)}`,
          );
          continue;
        }

        const targetTool = toolMap.get(toolCall.name);
        let toolResult: string;

        if (!targetTool) {
          toolResult = TOOL_ERROR.notFound(toolCall.name);
          toolTraces.push({
            toolName: toolCall.name,
            args: toolCall.args,
            resultPreview: toolResult,
            success: false,
            errorMessage: '工具不存在或无权限',
          });
        } else {
          try {
            const rawResult = await targetTool.invoke(toolCall.args);
            toolResult =
              typeof rawResult === 'string'
                ? rawResult
                : JSON.stringify(rawResult);
            toolResult = compressToolResult(toolResult);

            toolTraces.push({
              toolName: toolCall.name,
              args: toolCall.args,
              resultPreview: toolResult.slice(0, 500),
              success: true,
            });
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            toolResult = TOOL_ERROR.executionFailed(errorMessage);
            toolTraces.push({
              toolName: toolCall.name,
              args: toolCall.args,
              resultPreview: errorMessage,
              success: false,
              errorMessage,
            });
          }
        }

        messages.push(
          new ToolMessage({
            content: toolResult,
            tool_call_id: toolCallId,
          }),
        );
      }
    }

    const finalResponse = await model.invoke([
      ...messages,
      new HumanMessage(FORCE_FINAL_ANSWER_PROMPT),
    ]);

    return {
      content: normalizeModelContent(finalResponse.content),
      toolTraces,
    };
  }
}
