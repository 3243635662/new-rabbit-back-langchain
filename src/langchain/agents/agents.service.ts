import { Injectable, Logger } from '@nestjs/common';
import {
  HumanMessage,
  BaseMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { DynamicTool } from '@langchain/core/tools';
import { LangChainService } from '../langchain.service';
import { MerchantRagService } from '../rag/merchant-rag/merchant-rag.service';
import { buildExpandQueryPrompt } from '../prompts/chat.prompt';
import { SEARCH_MERCHANT_KB_DESC } from '../prompts/agent.des';
import {
  AgentRunResult,
  AgentRuntimeContext,
  AgentToolTrace,
} from '../../types/agent.type';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly langChainService: LangChainService,
    private readonly merchantRagService: MerchantRagService,
  ) {}

  /** 查询改写：调用 LLM 自动生成同义查询，提升召回率 */
  private expandQuery = async (query: string): Promise<string[]> => {
    const model = this.langChainService.getModel();
    const prompt = buildExpandQueryPrompt(query);

    try {
      const response = await model.invoke(prompt);
      let text = (response.content as string).trim();

      // 清理 thinking
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // 尝试从响应中提取 JSON 数组
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const expanded = JSON.parse(match[0]) as string[];
        const unique = [
          query,
          ...expanded.filter(
            (q) => q !== query && typeof q === 'string' && q.length > 0,
          ),
        ];
        const result = [...new Set(unique)].slice(0, 6);
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
    //  RAG 检索
    const searchMerchantKnowledgeBase = new DynamicTool({
      name: 'searchMerchantKnowledgeBase',
      description: SEARCH_MERCHANT_KB_DESC,
      func: async (query: string) => {
        if (!merchantId) {
          return '当前用户未关联商户，无法检索知识库。';
        }

        // 阶段一：直接检索原始查询，命中则直接返回（避免不必要的 expandQuery）
        const { context: directContext, trace: directTrace } =
          await this.merchantRagService.retrieveContextWithTrace(
            query,
            merchantId,
            5,
          );
        this.logger.log(`[Agent-RAG-Trace] ${JSON.stringify(directTrace)}`);

        if (directContext && !directContext.includes('没有足够依据')) {
          return directContext;
        }

        // 阶段二：原始查询未命中，调用 LLM 扩展同义查询后并行检索
        const expandedQueries = await this.expandQuery(query);
        const results = await Promise.all(
          expandedQueries.map((q) =>
            this.merchantRagService
              .retrieveContextWithTrace(q, merchantId, 3)
              .then(({ context, trace }) => {
                this.logger.log(`[Agent-RAG-Trace] ${JSON.stringify(trace)}`);
                return context && !context.includes('没有足够依据')
                  ? context
                  : '';
              }),
          ),
        );

        const validContexts = results.filter((ctx) => ctx.length > 0);
        if (validContexts.length === 0) {
          return '未检索到相关知识库资料。';
        }

        // 去重合并：按行分割后去重
        const lines = validContexts
          .join('\n')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        return [...new Set(lines)].join('\n');
      },
    });

    return [searchMerchantKnowledgeBase];
  };

  runAgent = async (
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): Promise<AgentRunResult> => {
    const tools = this.createTools(context.merchantId);
    const modelWithTools = this.langChainService.getModel().bindTools(tools);

    const toolTraces: AgentToolTrace[] = [];
    const messages: BaseMessage[] = [...history, new HumanMessage(prompt)];

    // Agent 循环：最多执行 3 轮 tool call，防止无限循环
    for (let i = 0; i < 3; i++) {
      const response = await modelWithTools.invoke(messages);

      if (!response.tool_calls || response.tool_calls.length === 0) {
        messages.push(response);
        return {
          content: response.content as string,
          toolTraces,
        };
      }

      messages.push(response);
      for (const toolCall of response.tool_calls) {
        const targetTool = tools.find((t) => t.name === toolCall.name);
        let toolResult: string;

        if (!targetTool) {
          toolResult = `工具 ${toolCall.name} 不存在。`;
        } else {
          try {
            toolResult = await targetTool.invoke(toolCall.args);
            toolTraces.push({
              toolName: toolCall.name,
              args: toolCall.args,
              resultPreview: toolResult.slice(0, 500),
              success: true,
            });
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            toolResult = `工具执行失败: ${errorMessage}`;
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
            tool_call_id: toolCall.id!,
          }),
        );
      }
    }

    // 达到最大循环次数，强制生成最终回答
    const finalResponse = await modelWithTools.invoke(messages);
    return {
      content: finalResponse.content as string,
      toolTraces,
    };
  };

  /** 流式 Agent：工具调用在后台完成，最终回答以流式输出 */
  async *runAgentStream(
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ) {
    const tools = this.createTools(context.merchantId);
    const modelWithTools = this.langChainService.getModel().bindTools(tools);

    const messages: BaseMessage[] = [...history, new HumanMessage(prompt)];

    // 先告诉前端：AI 正在思考
    yield { type: 'status', content: '思考中...' };

    // 第一轮：非流式判断是否需要工具调用
    const response = await modelWithTools.invoke(messages);

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push(response);

      for (const toolCall of response.tool_calls) {
        const targetTool = tools.find((t) => t.name === toolCall.name);
        if (!targetTool) continue;

        // 告诉前端：正在调用某个工具
        yield {
          type: 'status',
          content: `正在调用 ${targetTool.name}...`,
        };

        let toolResult: string;
        try {
          toolResult = await targetTool.invoke(toolCall.args);
        } catch (err) {
          toolResult = `工具执行失败: ${err instanceof Error ? err.message : String(err)}`;
        }

        messages.push(
          new ToolMessage({
            content: toolResult,
            tool_call_id: toolCall.id!,
          }),
        );
      }

      // 工具全部执行完毕，告诉前端准备生成回答
      yield { type: 'status', content: '已获取参考资料，正在生成回答...' };
    } else {
      messages.push(response);
    }

    // 第二轮：流式生成最终回答
    const stream = await modelWithTools.stream(messages);
    for await (const chunk of stream) {
      const content = chunk.content as string;
      const reasoning = chunk.additional_kwargs?.reasoning_content as
        | string
        | undefined;

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
