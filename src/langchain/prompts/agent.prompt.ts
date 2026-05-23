/**
 * @file agent.prompt.ts
 * @description Agent 系统提示词与状态消息模板集中管理
 * @作用 统一管理 Agent 的 System Prompt、流式状态消息、工具错误提示等
 * @内容分类
 *   - buildAgentSystemPrompt()：构建系统提示词，约束模型行为
 *   - FORCE_FINAL_ANSWER_PROMPT：强制生成最终回答的提示词
 *   - STREAM_STATUS：流式输出状态消息（如"思考中..."）
 *   - STREAM_TOOL：工具执行状态消息模板
 *   - TOOL_ERROR：工具调用异常提示
 *   - RAG_MESSAGES：RAG 检索相关提示消息
 *   - INVALID_RAG_MARKERS：无效 RAG 结果的判断标记词
 * @好处 集中管理便于统一修改、多语言适配、A/B 测试不同提示词策略
 */

/**
 * Agent 系统提示词与状态消息模板
 * 集中管理所有硬编码的 prompt 文本，便于统一维护和多语言适配。
 */

/** Agent System Prompt：约束模型行为，定义何时调用工具、何时直接回答 */
export const buildAgentSystemPrompt = (currentTime?: string): string =>
  [
    '你是一个电商商家后台 AI 助手。',
    '你可以根据用户问题决定是否调用工具。',
    '如果问题涉及商品说明、售后规则、发货规则、店铺政策、客服话术、知识库文档内容，必须优先调用 searchMerchantKnowledgeBase。',
    '如果工具返回未检索到资料或依据不足，请明确说明当前知识库没有足够依据，不要编造。',
    '如果用户问题是普通闲聊、代码解释、非商家知识库问题，可以直接回答，不需要调用工具。',
    '最终回答必须基于工具返回内容和已有对话上下文。',
    '不要暴露工具调用的原始 JSON，除非用户明确要求调试信息。',
    '回答要简洁、准确、适合商家后台使用。',
    '',
    '【订单查询与统计指南】',
    '1. 分页翻页：每次 getOrderList 返回 totalPage 和 hasMore。用户要"下一页"时 page 设为当前页+1；要"上一页"时 page-1；要"最后一页"时 page=totalPage。',
    '2. 发货状态对应关系：0=待发货（未发货），1=已发货，2=已收货，3=售后中。',
    '3. 退款/售后查询：用户问"退款""售后""退货"时，用 shippingStatus=3 筛选售后中的订单。统计退款金额时直接累加这些订单的 payAmount。',
    '4. 待发货/已发货统计：用 shippingStatus 参数分别查询不同状态，然后汇总统计数量和金额。',
    '5. 查询全部：不设 shippingStatus 参数，分页拉取所有订单，自己累加统计。',
    '6. 避免重复调用：如果同一个工具连续两次返回相同或空结果，不要再调第三次，直接告诉用户当前数据情况。',
    ...(currentTime
      ? [
          '',
          `【当前时间】${currentTime}。当用户使用"今天""昨天""本周""本月""最近"等相对时间表述时，请基于此当前时间计算具体日期。例如用户说"今天的订单"，startTime 应为当前日期。`,
        ]
      : []),
  ].join('\n');

/** 强制生成最终回答的 HumanMessage 提示（避免模型继续调用工具） */
export const FORCE_FINAL_ANSWER_PROMPT =
  '请基于以上对话和工具结果生成最终回答。不要再调用工具。如果资料不足，请明确说明缺少依据。';

/** 流式状态消息 */
export const STREAM_STATUS = {
  thinking: '思考中...',
  generating: '已获取参考资料，正在生成回答...',
} as const;

/** 流式工具消息模板 */
export const STREAM_TOOL = {
  start: (toolName: string): string => `正在调用 ${toolName}...`,
  end: (toolName: string): string => `${toolName} 调用完成`,
} as const;

/** 工具异常提示 */
export const TOOL_ERROR = {
  notFound: (toolName: string): string =>
    `工具 ${toolName} 不存在或当前用户无权使用。`,
  executionFailed: (errorMessage: string): string =>
    `工具执行失败: ${errorMessage}`,
  missingId: 'toolCall 缺少 id',
} as const;

/** RAG 检索异常提示 */
export const RAG_MESSAGES = {
  noMerchant: '当前用户未关联商户，无法检索知识库。',
  noResults: '未检索到相关知识库资料。',
  truncated:
    '\n\n[工具结果过长，已截断。请基于以上资料回答，不要编造未提供的信息。]',
} as const;

/** 无效 RAG 结果标记词（用于 isValidRagContext 判断） */
export const INVALID_RAG_MARKERS = [
  '没有足够依据',
  '未检索到相关知识库资料',
  '相关性均低于有效阈值',
] as const;
