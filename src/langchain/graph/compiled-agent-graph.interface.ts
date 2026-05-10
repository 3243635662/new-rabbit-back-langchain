/**
 * @file compiled-agent-graph.interface.ts
 * @description 编译后 Agent 图的类型接口定义
 * @作用 为编译后的 StateGraph 提供简化的 TypeScript 接口，避免直接依赖 LangGraph 复杂的泛型类型
 * @背景 LangGraph 的 CompiledStateGraph 类型非常复杂（包含多个泛型参数），
 *   直接导致 ESLint 类型解析器连锁报错，影响开发体验
 * @解决方案 定义一个简化的接口，仅声明 AgentsService 实际需要调用的方法（stream/invoke）
 * @好处
 *   - 避免 TypeScript 泛型复杂度暴露给 ESLint
 *   - 解耦业务代码与 LangGraph 内部类型
 *   - 方便后续迁移或替换图执行引擎
 */

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
