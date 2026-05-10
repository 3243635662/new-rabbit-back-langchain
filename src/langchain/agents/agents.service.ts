/**
 * @file agents.service.ts
 * @description Agent 服务 Facade（统一入口）
 * @职责 作为对外统一入口，根据 useLangGraph 标识路由到对应的 Runner
 * @设计
 *   - 所有业务逻辑已下沉至 Runner / Factory / Util
 *   - 此文件仅保留路由调度，便于未来平滑移除旧版逻辑
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseMessage } from '@langchain/core/messages';
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
    history: BaseMessage[] = [],
  ): AsyncGenerator<AgentStreamChunk> {
    const useLangGraph = this.langGraphConfig.useLangGraph;
    this.logger.log(
      `[Agent] 流式调用, useLangGraph=${useLangGraph}, session=${context.sessionId}`,
    );

    if (useLangGraph) {
      yield* this.langGraphAgentRunner.runStream(prompt, context, history);
    } else {
      yield* this.legacyAgentRunner.runStream(prompt, context, history);
    }
  }

  /** 非流式 Agent 统一入口 */
  async runAgent(
    prompt: string,
    context: AgentRuntimeContext,
    history: BaseMessage[] = [],
  ): Promise<AgentRunResult> {
    const useLangGraph = this.langGraphConfig.useLangGraph;
    this.logger.log(
      `[Agent] 非流式调用, useLangGraph=${useLangGraph}, session=${context.sessionId}`,
    );

    if (useLangGraph) {
      return this.langGraphAgentRunner.run(prompt, context, history);
    }
    return this.legacyAgentRunner.run(prompt, context, history);
  }
}
