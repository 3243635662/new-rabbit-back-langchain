import { Injectable, Logger } from '@nestjs/common';
import {
  HumanMessage,
  BaseMessage,
  ToolMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import { LangChainService } from '../langchain.service';
import { MerchantKbTool } from '../tools/merchant-kb.tool';
import {
  buildAgentSystemPrompt,
  FORCE_FINAL_ANSWER_PROMPT,
  STREAM_STATUS,
  STREAM_TOOL,
  TOOL_ERROR,
} from '../prompts/agent.prompt';
import {
  AgentRunResult,
  AgentRuntimeContext,
  AgentToolTrace,
  AgentStreamChunk,
} from '../../types/agent.type';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly langChainService: LangChainService,
    private readonly merchantKbTool: MerchantKbTool,
  ) {}

  /** 规范化模型返回的 content（处理字符串或数组格式） */
  private normalizeModelContent = (content: unknown): string => {
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
      return content
        .map((item: unknown) => {
          if (typeof item === 'string') return item;
          if (
            item &&
            typeof item === 'object' &&
            'text' in item &&
            typeof (item as Record<string, unknown>).text === 'string'
          ) {
            return (item as Record<string, unknown>).text as string;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    return content === null || content === undefined
      ? ''
      : JSON.stringify(content);
  };

  /** 压缩工具结果，避免撑爆上下文窗口 */
  private compressToolResult = (text: string, maxLength = 6000): string => {
    if (text.length <= maxLength) return text;
    return (
      text.slice(0, maxLength) +
      '\n\n[工具结果过长，已截断。请基于以上资料回答，不要编造未提供的信息。]'
    );
  };

  /** 组装当前 Agent 可用的 Tool 列表 */
  private createTools = (merchantId?: string) => {
    return [this.merchantKbTool.create(merchantId)];
  };

  runAgent = async (
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): Promise<AgentRunResult> => {
    const tools = this.createTools(context.merchantId);
    const toolMap = new Map<
      string,
      { name: string; invoke: (args: unknown) => Promise<unknown> }
    >(tools.map((item) => [item.name as string, item]));

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
          content: this.normalizeModelContent(response.content),
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
            toolResult = this.compressToolResult(toolResult);

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

    // 达到最大循环次数，强制用不带 tools 的模型生成最终回答
    const finalResponse = await model.invoke([
      ...messages,
      new HumanMessage(FORCE_FINAL_ANSWER_PROMPT),
    ]);

    return {
      content: this.normalizeModelContent(finalResponse.content),
      toolTraces,
    };
  };

  /** 流式 Agent：支持多轮工具调用，思考过程与回答均流式输出 */
  async *runAgentStream(
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): AsyncGenerator<AgentStreamChunk> {
    const tools = this.createTools(context.merchantId);
    const toolMap = new Map<
      string,
      { name: string; invoke: (args: unknown) => Promise<unknown> }
    >(tools.map((item) => [item.name as string, item]));

    const model = this.langChainService.getModel();
    const modelWithTools = model.bindTools(tools);

    const messages: BaseMessage[] = [
      new SystemMessage(buildAgentSystemPrompt()),
      ...history,
      new HumanMessage(prompt),
    ];

    const maxSteps = 3;

    for (let i = 0; i < maxSteps; i++) {
      // 流式收集模型响应，过程中实时推送 reasoning
      const stream = await modelWithTools.stream(messages);

      let fullContent = '';
      // 用 Map 收集 tool_calls，避免同一工具在多个 chunk 中重复出现
      const toolCallMap = new Map<
        string,
        { id: string; name: string; args: unknown }
      >();

      for await (const chunk of stream) {
        const content = this.normalizeModelContent(chunk.content);
        const reasoning =
          (chunk.additional_kwargs?.reasoning_content as string) || '';

        if (content) {
          fullContent += content;
          // content 也要实时流式推送，不能攒到最后（避免连接空闲断开）
          yield { type: 'content', content, reasoning: '' };
        }

        // 实时推送 reasoning（思考过程流式透出）
        if (reasoning) {
          yield { type: 'content', content: '', reasoning };
        }

        // 收集 tool_calls（LangChain 格式为 { id, name, args }，不是 OpenAI 的 function 嵌套）
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

      // 构造完整的 AIMessage 放入消息历史
      const aiMessage = new AIMessage(fullContent);
      if (toolCalls.length > 0) {
        (aiMessage as unknown as { tool_calls: typeof toolCalls }).tool_calls =
          toolCalls;
      }
      messages.push(aiMessage);

      if (toolCalls.length === 0) {
        // 无工具调用：content 已在循环内实时推送，直接结束
        return;
      }

      // 有工具调用：执行工具
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
            toolResult = this.compressToolResult(toolResult);
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            toolResult = TOOL_ERROR.executionFailed(errorMessage);
          }
        }

        yield {
          type: 'tool_end',
          toolName,
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

    // 达到最大轮次，强制流式生成最终回答
    yield { type: 'status', content: STREAM_STATUS.generating };

    const finalStream = await model.stream([
      ...messages,
      new HumanMessage(FORCE_FINAL_ANSWER_PROMPT),
    ]);

    for await (const chunk of finalStream) {
      const content = this.normalizeModelContent(chunk.content);
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
}
