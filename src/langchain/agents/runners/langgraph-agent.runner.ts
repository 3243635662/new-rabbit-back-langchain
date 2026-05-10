/**
 * @file langgraph-agent.runner.ts
 * @description LangGraph 图执行 Agent Runner
 * @职责 通过 LangGraph StateGraph 编排模型调用和工具执行
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  HumanMessage,
  BaseMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  AgentRunResult,
  AgentRuntimeContext,
  AgentToolTrace,
  AgentStreamChunk,
} from '../../../types/agent.type';
import { AgentGraphBuilder } from '../../graph/agent-graph.builder';
import { CompiledAgentGraph } from '../../graph/compiled-agent-graph.interface';
import { LangGraphConfigService } from '../../persistence/langgraph-config.service';
import { AgentStreamHub } from '../../graph/agent-stream.hub';
import { AgentToolsFactory } from '../factories/agent-tools.factory';
import { normalizeModelContent } from '../utils/agent-message.util';
import { STREAM_TOOL } from '../../prompts/agent.prompt';

@Injectable()
export class LangGraphAgentRunner {
  private readonly logger = new Logger(LangGraphAgentRunner.name);

  constructor(
    private readonly agentGraphBuilder: AgentGraphBuilder,
    private readonly langGraphConfig: LangGraphConfigService,
    private readonly streamHub: AgentStreamHub,
    private readonly toolsFactory: AgentToolsFactory,
  ) {}

  /** LangGraph 流式 Agent（真正 token 级同步流式） */
  async *runStream(
    prompt: string,
    context: AgentRuntimeContext,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<AgentStreamChunk> {
    const graph: CompiledAgentGraph = this.agentGraphBuilder.getGraph();
    const tools = this.toolsFactory.createTools(context);
    const sessionId = context.sessionId;

    // 只传新消息，Checkpointer 自动从 PG 恢复历史状态
    const input = {
      messages: [new HumanMessage(prompt)],
      availableTools: tools,
      toolTraces: [],
    };

    const config = {
      configurable: {
        thread_id: sessionId,
        user_id: context.id,
        merchantId: context.merchantId,
      },
      recursionLimit: this.langGraphConfig.recursionLimit,
      // 传递 abortSignal 到执行链，中断 LLM / tool 执行
      ...(abortSignal && { signal: abortSignal }),
    };

    this.logger.log(
      `[LangGraph] stream 开始, messages: ${input.messages.length}`,
    );

    const listener = this.streamHub.listen(sessionId);

    const invokePromise = graph
      .invoke(input, config)
      .catch((err) => {
        this.streamHub.end(sessionId);
        throw err;
      })
      .finally(() => {
        this.streamHub.end(sessionId);
      });

    for await (const chunk of listener) {
      if (chunk.content) {
        for (const char of chunk.content) {
          yield { type: 'content', content: char, reasoning: '' };
        }
      }
      if (chunk.reasoning) {
        for (const char of chunk.reasoning) {
          yield { type: 'content', content: '', reasoning: char };
        }
      }
      if (chunk.status) {
        yield { type: 'status', content: chunk.status };
      }
    }

    const finalState = await invokePromise;

    this.logger.log(`[LangGraph] invoke 完成, 处理后续状态`);

    const messages = (finalState.messages || []) as BaseMessage[];
    const toolTraces = (finalState.toolTraces || []) as AgentToolTrace[];

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
            toolCallId: tc.id,
            args: tc.args,
            content: STREAM_TOOL.start(tc.name),
          };
        }
      } else if (msg instanceof ToolMessage) {
        const trace = toolTraces[traceIndex++];
        const toolCallId = (msg as unknown as { tool_call_id: string })
          .tool_call_id;
        if (trace) {
          yield {
            type: 'tool_end',
            toolName: trace.toolName,
            toolCallId: toolCallId || 'unknown',
            resultPreview: trace.resultPreview,
            content: STREAM_TOOL.end(trace.toolName),
          };
        } else {
          const toolName = 'unknown';
          yield {
            type: 'tool_end',
            toolName,
            toolCallId: toolCallId || 'unknown',
            resultPreview: normalizeModelContent(msg.content).slice(0, 500),
            content: STREAM_TOOL.end(toolName),
          };
        }
      }
    }
  }

  /** LangGraph 非流式 Agent */
  async run(
    prompt: string,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult> {
    const graph: CompiledAgentGraph = this.agentGraphBuilder.getGraph();
    const tools = this.toolsFactory.createTools(context);

    // 只传新消息，Checkpointer 自动从 PG 恢复历史状态
    const input = {
      messages: [new HumanMessage(prompt)],
      availableTools: tools,
      toolTraces: [],
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
        ? normalizeModelContent(lastMessage.content)
        : '';

    return {
      content,
      toolTraces: (finalState.toolTraces || []) as AgentToolTrace[],
    };
  }
}
