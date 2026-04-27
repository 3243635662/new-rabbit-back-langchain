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
