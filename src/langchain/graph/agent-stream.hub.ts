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
    };
    this.channels.set(sessionId, channel);
    return channel;
  };

  /** 向指定 session 推送流式 chunk */
  emit = (sessionId: string, chunk: StreamChunk): void => {
    const channel = this.channels.get(sessionId);
    if (!channel) return;
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
    const channel = this.channels.get(sessionId);
    if (!channel) return;
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
