/**
 * @file agents.service.ts
 * @description Agent 服务 Facade（统一入口）
 * @职责 作为对外统一入口，根据 useLangGraph 标识路由到对应的 Runner
 * @设计
 *   - LangGraph 路径：不传 history，由 Checkpointer 从 PG 自动恢复执行状态
 *   - 旧版路径：仍需传入 history（ChatService 负责）
 *   - ChatService 只负责展示层记忆（会话列表、消息回放）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  AgentRunResult,
  AgentRuntimeContext,
  AgentStreamChunk,
} from '../../types/agent.type';
import { LangGraphConfigService } from '../persistence/langgraph-config.service';
import { LegacyAgentRunner } from './runners/legacy-agent.runner';
import { LangGraphAgentRunner } from './runners/langgraph-agent.runner';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly legacyAgentRunner: LegacyAgentRunner,
    private readonly langGraphAgentRunner: LangGraphAgentRunner,
    private readonly langGraphConfig: LangGraphConfigService,
  ) {}

  /** 流式 Agent 统一入口 */
  async *runAgentStream(
    prompt: string,
    context: AgentRuntimeContext,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<AgentStreamChunk> {
    const useLangGraph = this.langGraphConfig.useLangGraph;
    this.logger.log(
      `[Agent] 流式调用, useLangGraph=${useLangGraph}, session=${context.sessionId}`,
    );

    if (useLangGraph) {
      // LangGraph：不传 history，Checkpointer 自动从 PG 恢复状态
      yield* this.langGraphAgentRunner.runStream(prompt, context, abortSignal);
    } else {
      // 旧版 Runner：传入 abortSignal 以支持中断
      yield* this.legacyAgentRunner.runStream(prompt, context, [], abortSignal);
    }
  }

  /** 非流式 Agent 统一入口 */
  async runAgent(
    prompt: string,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult> {
    const useLangGraph = this.langGraphConfig.useLangGraph;
    this.logger.log(
      `[Agent] 非流式调用, useLangGraph=${useLangGraph}, session=${context.sessionId}`,
    );

    if (useLangGraph) {
      // LangGraph：不传 history，Checkpointer 自动从 PG 恢复状态
      return this.langGraphAgentRunner.run(prompt, context);
    }
    return this.legacyAgentRunner.run(prompt, context);
  }
}
