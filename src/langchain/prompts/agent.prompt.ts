/**
 * Agent 系统提示词与状态消息模板
 * 集中管理所有硬编码的 prompt 文本，便于统一维护和多语言适配。
 */

/** Agent System Prompt：约束模型行为，定义何时调用工具、何时直接回答 */
export const buildAgentSystemPrompt = (): string =>
  [
    '你是一个电商商家后台 AI 助手。',
    '你可以根据用户问题决定是否调用工具。',
    '如果问题涉及商品说明、售后规则、发货规则、店铺政策、客服话术、知识库文档内容，必须优先调用 searchMerchantKnowledgeBase。',
    '如果工具返回未检索到资料或依据不足，请明确说明当前知识库没有足够依据，不要编造。',
    '如果用户问题是普通闲聊、代码解释、非商家知识库问题，可以直接回答，不需要调用工具。',
    '最终回答必须基于工具返回内容和已有对话上下文。',
    '不要暴露工具调用的原始 JSON，除非用户明确要求调试信息。',
    '回答要简洁、准确、适合商家后台使用。',
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
