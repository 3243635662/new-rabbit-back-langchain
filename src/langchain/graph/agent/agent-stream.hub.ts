/**
 * @file agent-stream.hub.ts
 * @description Agent 流式事件中心（发布订阅模式）
 * @作用 在 callModelNode（模型流式输出）和 AgentsService（SSE 推送）之间传递流式 token
 * @核心设计
 *   - 每个 session 独立一条流通道（Channel），避免并发会话互相干扰
 *   - 使用 AsyncGenerator（listen）实现流式消费，避免轮询
 *   - 支持缓冲：如果还没有消费者监听，事件会暂存在 queue 中
 * @方法说明
 *   - emit(sessionId, chunk)：向指定 session 推送流式 chunk
 *   - emitStatus(sessionId, status)：向指定 session 推送状态消息
 *   - end(sessionId)：结束指定 session 的流，清理资源
 *   - listen(sessionId)：监听指定 session 的流，返回 AsyncGenerator
 *   - fromMessageChunk(chunk)：静态方法，将 AIMessageChunk 转换为 StreamChunk
 * @StreamChunk 结构
 *   - content：模型输出的文本内容
 *   - reasoning：模型的推理过程（如 DeepSeek-R1 的 thinking_content）
 *   - toolCallChunks：工具调用片段（用于流式构建 tool_calls）
 *   - status：状态消息（如"思考中..."）
 */

import { Injectable } from '@nestjs/common';
import { AIMessageChunk } from '@langchain/core/messages';

interface StreamChunk {
  content: string;
  reasoning: string;
  toolCallChunks: {
    index?: number;
    id?: string;
    name?: string;
    args?: string;
  }[];
  status?: string;
}

interface StreamChannel {
  queue: (StreamChunk | null)[];
  resolveNext: ((value: IteratorResult<StreamChunk | null>) => void) | null;
  thinkBuffer: string;
  inThinkMode: boolean;
}

/**
 * Agent 流式事件中心
 *
 * 用于在 callModelNode（内部）和 AgentsService（外部）之间传递模型流式 token。
 * 每个 session 独立一条流通道，避免并发会话互相干扰。
 */
@Injectable()
export class AgentStreamHub {
  private readonly channels = new Map<string, StreamChannel>();

  private getOrCreateChannel = (sessionId: string): StreamChannel => {
    const existing = this.channels.get(sessionId);
    if (existing) return existing;
    const channel: StreamChannel = {
      queue: [],
      resolveNext: null,
      thinkBuffer: '',
      inThinkMode: false,
    };
    this.channels.set(sessionId, channel);
    return channel;
  };

  /** 向指定 session 推送流式 chunk */
  emit = (sessionId: string, chunk: StreamChunk): void => {
    const channel = this.getOrCreateChannel(sessionId);

    if (chunk.content) {
      let remaining = chunk.content;
      let contentToSend = '';

      while (remaining.length > 0) {
        if (!channel.inThinkMode) {
          const thinkStart = remaining.indexOf('<think>');
          if (thinkStart === -1) {
            contentToSend += remaining;
            break;
          }

          contentToSend += remaining.substring(0, thinkStart);
          remaining = remaining.substring(thinkStart + 7);
          channel.inThinkMode = true;
        } else {
          const thinkEnd = remaining.indexOf('</think>');
          if (thinkEnd === -1) {
            channel.thinkBuffer += remaining;
            remaining = '';
          } else {
            channel.thinkBuffer += remaining.substring(0, thinkEnd);

            const reasoningChunk: StreamChunk = {
              content: '',
              reasoning: channel.thinkBuffer,
              toolCallChunks: [],
            };
            this.sendChunk(channel, reasoningChunk);

            channel.thinkBuffer = '';
            channel.inThinkMode = false;
            remaining = remaining.substring(thinkEnd + 8);
          }
        }
      }

      if (contentToSend) {
        this.sendChunk(channel, {
          content: contentToSend,
          reasoning: '',
          toolCallChunks: [],
        });
      }
    } else if (chunk.reasoning) {
      this.sendChunk(channel, chunk);
    }
  };

  private sendChunk = (channel: StreamChannel, chunk: StreamChunk): void => {
    if (channel.resolveNext) {
      channel.resolveNext({ value: chunk, done: false });
      channel.resolveNext = null;
    } else {
      channel.queue.push(chunk);
    }
  };

  /** 向指定 session 推送状态消息 */
  emitStatus = (sessionId: string, status: string): void => {
    this.emit(sessionId, {
      content: '',
      reasoning: '',
      toolCallChunks: [],
      status,
    });
  };

  /** 结束指定 session 的流 */
  end = (sessionId: string): void => {
    // 使用 getOrCreateChannel，确保即使没有 listener 也能正确结束
    const channel = this.getOrCreateChannel(sessionId);
    if (channel.resolveNext) {
      channel.resolveNext({
        value: undefined as unknown as StreamChunk,
        done: true,
      });
      channel.resolveNext = null;
    } else {
      channel.queue.push(null);
    }
    this.channels.delete(sessionId);
  };

  /** 监听指定 session 的流 */
  listen = (sessionId: string): AsyncGenerator<StreamChunk> => {
    const channel = this.getOrCreateChannel(sessionId);

    return (async function* () {
      while (true) {
        const item = channel.queue.shift();
        if (item !== undefined) {
          if (item === null) return;
          yield item;
          continue;
        }
        const result: IteratorResult<StreamChunk | null> = await new Promise(
          (resolve) => {
            channel.resolveNext = resolve;
          },
        );
        if (result.done || result.value === null) return;
        yield result.value;
      }
    })();
  };

  /** 将 AIMessageChunk 转换为 hub chunk */
  static fromMessageChunk = (chunk: AIMessageChunk): StreamChunk => {
    let content = '';
    if (typeof chunk.content === 'string') {
      content = chunk.content;
    } else if (Array.isArray(chunk.content)) {
      content = chunk.content
        .map((item: unknown) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'text' in item) {
            return String((item as Record<string, unknown>).text);
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    const reasoning =
      (chunk.additional_kwargs?.reasoning_content as string) || '';

    const toolCallChunks =
      (
        chunk as AIMessageChunk & {
          tool_call_chunks?: {
            index?: number;
            id?: string;
            name?: string;
            args?: string;
          }[];
        }
      ).tool_call_chunks || [];
    return { content, reasoning, toolCallChunks };
  };
}
