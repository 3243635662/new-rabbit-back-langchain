import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { PostgresCheckpointerProvider } from '../persistence/postgres-checkpointer.provider';
import { LangGraphConfigService } from '../persistence/langgraph-config.service';
import { LangChainService } from '../langchain.service';
import { AgentState } from './agent-state.annotation';
import { dynamicPromptNode } from './nodes/dynamic-prompt.node';
import { createCallModelNode } from './nodes/call-model.node';
import { executeToolsNode } from './nodes/execute-tools.node';
import { createShouldContinue } from './edges/should-continue.edge';
import { CompiledAgentGraph } from './compiled-agent-graph.interface';
import { AgentStreamHub } from './agent-stream.hub';

/**
 * Agent Graph Builder
 *
 * 职责：定义并编译 StateGraph，接入 PostgresSaver 实现持久化。
 * 图结构：
 *   __start__ → dynamicPrompt → agent → [conditional] → tools → agent
 *                                      └→ __end__
 */
@Injectable()
export class AgentGraphBuilder {
  private readonly logger = new Logger(AgentGraphBuilder.name);
  private compiledGraph?: CompiledAgentGraph;

  constructor(
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
    const shouldContinue = createShouldContinue(this.configService.maxSteps);

    const workflow = new StateGraph(AgentState.spec)
      .addNode('dynamicPrompt', dynamicPromptNode)
      .addNode('agent', callModelNode)
      .addNode('tools', executeToolsNode)
      .addEdge('__start__', 'dynamicPrompt')
      .addEdge('dynamicPrompt', 'agent')
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
