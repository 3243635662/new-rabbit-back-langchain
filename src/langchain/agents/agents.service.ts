import { Injectable, Logger } from '@nestjs/common';
import {
  HumanMessage,
  BaseMessage,
  ToolMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangChainService } from '../langchain.service';
import { MerchantRagService } from '../rag/merchant-rag/merchant-rag.service';
import { buildExpandQueryPrompt } from '../prompts/chat.prompt';
import { SEARCH_MERCHANT_KB_DESC } from '../prompts/agent.des';
import {
  buildAgentSystemPrompt,
  FORCE_FINAL_ANSWER_PROMPT,
  STREAM_STATUS,
  STREAM_TOOL,
  TOOL_ERROR,
  RAG_MESSAGES,
  INVALID_RAG_MARKERS,
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
    private readonly merchantRagService: MerchantRagService,
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

  /** 判断 RAG 检索结果是否有效 */
  private isValidRagContext = (context?: string): boolean => {
    if (!context || !context.trim()) return false;
    return !INVALID_RAG_MARKERS.some((marker) => context.includes(marker));
  };

  /** 合并多个检索结果并去重 */
  private mergeContexts = (contexts: string[]): string => {
    const lines = contexts
      .join('\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return [...new Set(lines)].join('\n');
  };

  /** 压缩工具结果，避免撑爆上下文窗口 */
  private compressToolResult = (text: string, maxLength = 6000): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + RAG_MESSAGES.truncated;
  };

  /** 查询改写：调用 LLM 自动生成同义查询，提升召回率 */
  private expandQuery = async (query: string): Promise<string[]> => {
    const model = this.langChainService.getModel();
    const prompt = buildExpandQueryPrompt(query);

    try {
      const response = await model.invoke(prompt);
      let text = this.normalizeModelContent(response.content).trim();

      // 清理 thinking 标签（enable_thinking 模型会输出 <think>...</think>）
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // 尝试从响应中提取 JSON 数组
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const expanded = JSON.parse(match[0]) as string[];
        const unique = [
          query,
          ...expanded.filter(
            (q) => q !== query && typeof q === 'string' && q.trim().length > 0,
          ),
        ];
        const result = [...new Set(unique.map((q) => q.trim()))].slice(0, 6);
        this.logger.log(
          `[expandQuery] 原查询: "${query}" → 扩展: ${JSON.stringify(result)}`,
        );
        return result;
      }

      this.logger.warn(
        `[expandQuery] 未匹配到 JSON 数组，原始响应: ${text.slice(0, 200)}`,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[expandQuery] LLM 改写失败: ${errorMessage}，降级为原查询: ${query}`,
      );
    }

    return [query];
  };

  private createTools = (merchantId?: string) => {
    const searchMerchantKnowledgeBase = tool(
      async ({ query }) => {
        if (!merchantId) {
          return RAG_MESSAGES.noMerchant;
        }

        // 阶段一：直接检索原始查询，命中则直接返回
        const { context: directContext, trace: directTrace } =
          await this.merchantRagService.retrieveContextWithTrace(
            query,
            merchantId,
            5,
          );
        this.logger.log(
          `[Agent-RAG-Trace] direct query=${query}, trace=${JSON.stringify(directTrace)}`,
        );

        if (this.isValidRagContext(directContext)) {
          return this.compressToolResult(directContext);
        }

        // 阶段二：原始查询未命中，调用 LLM 扩展同义查询后并行检索
        const expandedQueries = await this.expandQuery(query);
        const results = await Promise.all(
          expandedQueries.map((q) =>
            this.merchantRagService
              .retrieveContextWithTrace(q, merchantId, 3)
              .then(({ context, trace }) => {
                this.logger.log(
                  `[Agent-RAG-Trace] expanded query=${q}, trace=${JSON.stringify(trace)}`,
                );
                return this.isValidRagContext(context) ? context : '';
              }),
          ),
        );

        const validContexts = results.filter((ctx) => ctx.trim().length > 0);
        if (validContexts.length === 0) {
          return RAG_MESSAGES.noResults;
        }

        return this.compressToolResult(this.mergeContexts(validContexts));
      },
      {
        name: 'searchMerchantKnowledgeBase',
        description: SEARCH_MERCHANT_KB_DESC,
        schema: z.object({
          query: z.string().describe('需要在商家知识库中检索的问题或关键词'),
        }),
      },
    );

    return [searchMerchantKnowledgeBase];
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
