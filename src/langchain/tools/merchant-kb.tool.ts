import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangChainService } from '../langchain.service';
import { MerchantRagService } from '../rag/merchant-rag/merchant-rag.service';
import { buildExpandQueryPrompt } from '../prompts/chat.prompt';
import { SEARCH_MERCHANT_KB_DESC } from '../prompts/agent.des';
import { RAG_MESSAGES, INVALID_RAG_MARKERS } from '../prompts/agent.prompt';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 商户知识库检索 Tool
 *
 * 职责：封装 RAG 检索的全部业务逻辑（查询改写、多轮检索、结果验证与合并）。
 * Agent 层只负责调用 create(context) 获取 Tool 实例，不感知内部实现。
 */
@Injectable()
export class MerchantKbTool {
  private readonly logger = new Logger(MerchantKbTool.name);

  constructor(
    private readonly langChainService: LangChainService,
    private readonly merchantRagService: MerchantRagService,
  ) {}

  /**
   * 创建 searchMerchantKnowledgeBase Tool 实例
   * @param context Agent 运行时上下文，未关联商户时工具会直接返回提示
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { merchantId } = context;
    return tool(
      async ({ query }: { query: string }) => {
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
          return this.compressResult(directContext);
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

        return this.compressResult(this.mergeContexts(validContexts));
      },
      {
        name: 'searchMerchantKnowledgeBase',
        description: SEARCH_MERCHANT_KB_DESC,
        schema: z.object({
          query: z.string().describe('需要在商家知识库中检索的问题或关键词'),
        }),
      },
    );
  }

  /** 查询改写：调用 LLM 自动生成同义查询，提升召回率 */
  private expandQuery = async (query: string): Promise<string[]> => {
    const model = this.langChainService.getModel();
    const prompt = buildExpandQueryPrompt(query);

    try {
      const response = await model.invoke(prompt);
      let text = this.normalizeContent(response.content).trim();

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
  private compressResult = (text: string, maxLength = 6000): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + RAG_MESSAGES.truncated;
  };

  /** 规范化模型返回的 content（处理字符串或数组格式） */
  private normalizeContent = (content: unknown): string => {
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
}
