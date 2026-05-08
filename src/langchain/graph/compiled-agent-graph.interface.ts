/**
 * 编译后 Agent 图的类型接口
 *
 * 仅声明 AgentsService 实际需要调用的 stream / invoke 方法签名，
 * 避免直接依赖 LangGraph 内部复杂的 CompiledStateGraph 泛型类型。
 * 独立文件定义，防止 ESLint 类型解析器因 @langchain/langgraph 泛型复杂性而连锁报错。
 */
export interface CompiledAgentGraph {
  stream(
    input: unknown,
    config?: unknown,
    options?: unknown,
  ): Promise<AsyncIterable<Record<string, unknown>>>;
  invoke(input: unknown, config?: unknown): Promise<Record<string, unknown>>;
}
