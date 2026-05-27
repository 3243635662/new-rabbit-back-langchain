import { JwtPayloadType } from './auth.type';

// 从jwt中继承过来token
export interface AgentRuntimeContext extends JwtPayloadType {
  sessionId: string;
  merchantId?: string;
  goodsId?: string; // 当前浏览的商品ID（客户端用户咨询时传入）
  /** 当前对话时间，用于 LLM 理解时间上下文（如"今天""本月"等） */
  currentTime: string;
}

export interface AgentRunResult {
  content: string;
  toolTraces: AgentToolTrace[];
}

export interface AgentToolTrace {
  toolName: string;
  args: unknown;
  resultPreview: string;
  success: boolean;
  errorMessage?: string;
}

/** 流式输出消息类型 */
export type AgentStreamChunk =
  | {
      type: 'status';
      content: string;
    }
  | {
      type: 'tool_start';
      toolName: string;
      toolCallId: string;
      args: unknown;
      content: string;
    }
  | {
      type: 'tool_end';
      toolName: string;
      toolCallId: string;
      resultPreview: string;
      content: string;
    }
  | {
      type: 'content';
      content: string;
      reasoning?: string;
    }
  | {
      type: 'stopped';
      content: string;
    };
