import { Injectable, Logger } from '@nestjs/common';
import {
  HumanMessage,
  BaseMessage,
  ToolMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { LangChainService } from '../langchain.service';
import { MerchantKbTool } from '../tools/merchant-kb.tool';
import { ProductListTool } from '../tools/product-list.tool';
import { OrderListTool } from '../tools/order-list.tool';
import { InventoryListTool } from '../tools/inventory-list.tool';
import { InventoryLogsTool } from '../tools/inventory-logs.tool';
import { InventoryStockChangeTool } from '../tools/inventory-stock-change.tool';
import { UserInfoTool } from '../tools/user-info.tool';
import { ShipOrderTool } from '../tools/ship-order.tool';
import { MerchantCategoriesTool } from '../tools/merchant-categories.tool';
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
import { AgentGraphBuilder } from '../graph/agent-graph.builder';
import { CompiledAgentGraph } from '../graph/compiled-agent-graph.interface';
import { LangGraphConfigService } from '../persistence/langgraph-config.service';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly langChainService: LangChainService,
    private readonly merchantKbTool: MerchantKbTool,
    private readonly productListTool: ProductListTool,
    private readonly orderListTool: OrderListTool,
    private readonly inventoryListTool: InventoryListTool,
    private readonly inventoryLogsTool: InventoryLogsTool,
    private readonly inventoryStockChangeTool: InventoryStockChangeTool,
    private readonly userInfoTool: UserInfoTool,
    private readonly shipOrderTool: ShipOrderTool,
    private readonly merchantCategoriesTool: MerchantCategoriesTool,
    private readonly agentGraphBuilder: AgentGraphBuilder,
    private readonly langGraphConfig: LangGraphConfigService,
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
  private createTools = (
    context: AgentRuntimeContext,
  ): DynamicStructuredTool[] => {
    return [
      this.merchantKbTool.create(context),
      this.productListTool.create(context),
      this.orderListTool.create(context),
      this.inventoryListTool.create(context),
      this.inventoryLogsTool.create(context),
      this.inventoryStockChangeTool.create(context),
      this.userInfoTool.create(context),
      this.shipOrderTool.create(context),
      this.merchantCategoriesTool.create(context),
    ];
  };

  // ══════════════════════════════════════════════════════
  // LangGraph 版本（新增）
  // ══════════════════════════════════════════════════════

  /**
   * LangGraph 流式 Agent
   *
   * 使用 StateGraph 接管状态流转与持久化，
   * 将 graph.stream() 输出转换为现有 AgentStreamChunk 格式，保持 SSE 协议兼容。
   */
  async *runAgentStreamWithLangGraph(
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): AsyncGenerator<AgentStreamChunk> {
    const graph: CompiledAgentGraph = this.agentGraphBuilder.getGraph();
    const tools = this.createTools(context);

    const input = {
      messages: [
        new SystemMessage(buildAgentSystemPrompt()),
        ...history,
        new HumanMessage(prompt),
      ],
      availableTools: tools,
      toolTraces: [],
      streamChunks: [],
    };

    const config = {
      configurable: {
        thread_id: context.sessionId,
        user_id: context.id,
        merchantId: context.merchantId,
      },
      recursionLimit: this.langGraphConfig.recursionLimit,
    };

    this.logger.log(
      `[LangGraph] invoke 开始, messages: ${input.messages.length}`,
    );

    // 使用 invoke 获取完整结果（stream() 在图结束后有 stream 不关闭的 bug）
    const finalState = await graph.invoke(input, config);

    this.logger.log(`[LangGraph] invoke 完成, 开始流式输出`);

    const messages = (finalState.messages || []) as BaseMessage[];
    const toolTraces = (finalState.toolTraces || []) as AgentToolTrace[];

    // 找到 input 中最后一条 HumanMessage 的位置，其后的消息就是本次新增
    const lastHumanIndex = messages.findLastIndex(
      (m) => m instanceof HumanMessage && m.content === prompt,
    );
    const newMessages =
      lastHumanIndex >= 0 ? messages.slice(lastHumanIndex + 1) : [];

    this.logger.log(
      `[LangGraph] 新增消息数: ${newMessages.length}, toolTraces: ${toolTraces.length}`,
    );

    let traceIndex = 0;

    for (const msg of newMessages) {
      if (msg instanceof AIMessage) {
        // yield reasoning
        const reasoning =
          (msg.additional_kwargs?.reasoning_content as string) || '';
        if (reasoning) {
          for (const char of reasoning) {
            yield { type: 'content', content: '', reasoning: char };
          }
        }

        // yield content（打字机效果）
        const content = this.normalizeModelContent(msg.content);
        if (content) {
          for (const char of content) {
            yield { type: 'content', content: char, reasoning: '' };
          }
        }

        // yield tool_start
        const toolCalls =
          (
            msg as AIMessage & {
              tool_calls?: { id: string; name: string; args: unknown }[];
            }
          ).tool_calls || [];
        for (const tc of toolCalls) {
          yield {
            type: 'tool_start',
            toolName: tc.name,
            args: tc.args,
            content: STREAM_TOOL.start(tc.name),
          };
        }
      } else if (msg instanceof ToolMessage) {
        // yield tool_end：按顺序匹配 toolTraces
        const trace = toolTraces[traceIndex++];
        if (trace) {
          yield {
            type: 'tool_end',
            toolName: trace.toolName,
            resultPreview: trace.resultPreview,
            content: STREAM_TOOL.end(trace.toolName),
          };
        } else {
          // 无 trace，用 ToolMessage 反推
          const toolName = 'unknown';
          yield {
            type: 'tool_end',
            toolName,
            resultPreview: this.normalizeModelContent(msg.content).slice(
              0,
              500,
            ),
            content: STREAM_TOOL.end(toolName),
          };
        }
      }
    }
  }

  /**
   * LangGraph 非流式 Agent
   *
   * 使用 graph.invoke() 获取最终状态，提取回答内容和工具痕迹。
   */
  runAgentWithLangGraph = async (
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): Promise<AgentRunResult> => {
    const graph: CompiledAgentGraph = this.agentGraphBuilder.getGraph();
    const tools = this.createTools(context);

    const input = {
      messages: [
        new SystemMessage(buildAgentSystemPrompt()),
        ...history,
        new HumanMessage(prompt),
      ],
      availableTools: tools,
      toolTraces: [],
      streamChunks: [],
    };

    const config = {
      configurable: {
        thread_id: context.sessionId,
        user_id: context.id,
        merchantId: context.merchantId,
      },
      recursionLimit: this.langGraphConfig.recursionLimit,
    };

    const finalState = await graph.invoke(input, config);

    const messages = (finalState.messages || []) as BaseMessage[];
    const lastMessage = messages[messages.length - 1];

    const content =
      lastMessage instanceof AIMessage
        ? this.normalizeModelContent(lastMessage.content)
        : '';

    return {
      content,
      toolTraces: (finalState.toolTraces || []) as AgentToolTrace[],
    };
  };

  // ══════════════════════════════════════════════════════
  // 原有版本（保留，双轨运行）
  // ══════════════════════════════════════════════════════

  /** 流式 Agent：支持多轮工具调用，思考过程与回答均流式输出 */
  async *runAgentStream(
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): AsyncGenerator<AgentStreamChunk> {
    const tools = this.createTools(context);

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

  runAgent = async (
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): Promise<AgentRunResult> => {
    const tools = this.createTools(context);
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

    // 最大循环次数
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
}
