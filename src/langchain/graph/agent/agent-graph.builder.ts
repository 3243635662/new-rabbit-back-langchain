/**
 * @file agent-graph.builder.ts
 * @description LangGraph StateGraph 构建器（核心编排文件）
 * @作用 定义 Agent 的工作流图结构，并编译为可执行的 CompiledAgentGraph
 * @图结构
 *   __start__
 *      ↓
 *   agent（调用模型，内部注入系统提示词）
 *      ↓
 *   [shouldContinue 条件判断]
 *      ├→ tools（执行工具）→ agent（循环）
 *      └→ __end__（结束）
 * @职责
 *   1. 定义图的节点（Node）和边（Edge）
 *   2. 接入 PostgresSaver 实现执行状态持久化
 *   3. 使用懒加载 + 单例模式，避免重复编译图
 * @使用 通过 getGraph() 获取编译后的图实例，供 AgentsService 调用
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { PostgresCheckpointerProvider } from '../../persistence/postgres-checkpointer.provider';
import { LangGraphConfigService } from '../../persistence/langgraph-config.service';
import { LangChainService } from '../../langchain.service';
import { AgentState, AgentStateType } from './agent-state.annotation';
import { createCallModelNode } from '../nodes/call-model.node';
import { createExecuteToolsNode } from '../nodes/execute-tools.node';
import { createShouldContinue } from '../edges/should-continue.edge';
import { CompiledAgentGraph } from './compiled-agent-graph.interface';
import { AgentStreamHub } from './agent-stream.hub';

/**
 * Agent Graph Builder
 *
 * 职责：定义并编译 StateGraph，接入 PostgresSaver 实现持久化。
 * 图结构：
 *   __start__ → agent → [conditional] → tools → agent
 *                              └→ __end__
 */
@Injectable()
export class AgentGraphBuilder {
  private readonly logger = new Logger(AgentGraphBuilder.name);
  private compiledGraph?: CompiledAgentGraph;

  constructor(
    @Inject(forwardRef(() => LangChainService))
    private readonly langChainService: LangChainService,
    private readonly checkpointerProvider: PostgresCheckpointerProvider,
    private readonly configService: LangGraphConfigService,
    private readonly streamHub: AgentStreamHub,
  ) {}

  /**
   * 获取编译后的图实例（懒加载 + 单例）
   */
  getGraph(): CompiledAgentGraph {
    if (!this.compiledGraph) {
      this.compiledGraph = this.buildGraph();
    }
    return this.compiledGraph;
  }

  private buildGraph = (): CompiledAgentGraph => {
    const callModelNode = createCallModelNode(
      this.langChainService,
      this.streamHub,
    );
    const executeToolsNode = createExecuteToolsNode(this.streamHub) as (
      state: AgentStateType,
      config?: unknown,
    ) => Promise<Partial<AgentStateType>>;
    const shouldContinue = createShouldContinue(this.configService.maxSteps);

    // 工作流：__start__ → agent → [conditional] → tools → agent
    const workflow = new StateGraph(AgentState.spec)
      .addNode('agent', callModelNode)
      .addNode('tools', executeToolsNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', shouldContinue, {
        tools: 'tools',
        __end__: '__end__',
      })
      .addEdge('tools', 'agent');

    const checkpointer = this.checkpointerProvider.getCheckpointer();

    const compileOptions: {
      checkpointer?: ReturnType<
        PostgresCheckpointerProvider['getCheckpointer']
      >;
    } = {};
    if (checkpointer) {
      compileOptions.checkpointer = checkpointer;
      this.logger.log('StateGraph 编译完成，已接入 PostgresSaver');
    } else {
      this.logger.warn('StateGraph 编译完成，未接入 Checkpointer（内存模式）');
    }

    return workflow.compile(compileOptions) as unknown as CompiledAgentGraph;
  };
}
