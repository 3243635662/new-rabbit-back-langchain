import { JwtPayloadType } from './auth.type';

// 从jwt中继承过来token
export interface AgentRuntimeContext extends JwtPayloadType {
  sessionId: string;
  merchantId?: string;
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
      args: unknown;
      content: string;
    }
  | {
      type: 'tool_end';
      toolName: string;
      resultPreview: string;
      content: string;
    }
  | {
      type: 'content';
      content: string;
      reasoning?: string;
    };
