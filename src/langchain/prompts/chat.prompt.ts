import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  AIMessagePromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';

// 电商助手提示模板 - 通过变量动态控制角色和业务规则
export const ecomAssistantPrompt = ChatPromptTemplate.fromMessages([
  // 系统人设
  SystemMessagePromptTemplate.fromTemplate(
    `你是一个电商{role}助手。
你的职责是：{duty}
回答风格：情感丰富，知识专业，严格基于知识库回答，不要编造数据。

以下是你的业务规则：
{rules}

以下是从知识库检索到的参考资料，请严格基于这些资料回答用户问题：
{knowledgeBase}

重要：如果上述参考资料中没有足够依据或本轮回合未检索到相关资料，请明确说明"当前知识库没有相关信息"，不要猜测或编造。
你必须记住用户在对话中主动提供的所有信息（如姓名、偏好、订单号等），并在后续对话中准确引用。不要拒绝记录或声称无法获取用户信息。`,
  ),

  // AI 开场白（仅在没有历史时显示，避免每轮重复注入干扰上下文）
  AIMessagePromptTemplate.fromTemplate('{greeting}'),
  new MessagesPlaceholder('history'),
  // 用户提问
  HumanMessagePromptTemplate.fromTemplate('{question}'),
]);

// 预设角色配置
export const ROLE_CONFIG = {
  merchant: {
    role: '商家后台',
    duty: '解答商家在后台操作中遇到的问题，包括商品管理、订单处理、资金结算等',
    rules: `- 商品审核期：3个工作日之内完成审核
- 商家提现：T+1到账，节假日顺延
- 商品上架被拒：需根据驳回原因修改后重新提交`,
    greeting:
      '你好！我是商家后台助手，可以帮你解答商品管理、订单处理、资金结算等问题。',
  },
  user: {
    role: '用户端',
    duty: '解答用户在购物、售后中遇到的问题，包括退款、退货、物流查询等',
    rules: `- 退货退款：审核通过后24小时内原路退回
- 换货周期：收到退货后3个工作日内发出新商品
- 物流查询：下单后48小时内发货，可在订单详情查看物流`,
    greeting: '你好！我是用户端助手，可以帮你解答退款退货、物流查询等问题。',
  },
  admin: {
    role: '管理员',
    duty: '解答平台管理、运营数据、财务对账等专业问题',
    rules: `- 对账周期：每月5日出上月完整对账单
- 结算周期：每月10日结算上月确认收货的订单
- 发票开具：确认收货后可申请，5个工作日内开出`,
    greeting: '你好！我是管理员助手，可以帮你解答运营管理、对账结算等问题。',
  },
} as const;

export type RoleType = keyof typeof ROLE_CONFIG;

// roleId 与 RoleType 的映射: 1:Admin 2:MerchantAdmin 3:User
export const ROLE_ID_MAP: Record<number, RoleType> = {
  1: 'admin', // Admin → 管理员助手
  2: 'merchant', // MerchantAdmin → 商家后台助手
  3: 'user', // User → 用户端助手
};

// 根据 roleId 获取 RoleType，默认 merchant
export const getRoleTypeByRoleId = (roleId: number): RoleType => {
  return ROLE_ID_MAP[roleId] || 'merchant';
};

/**
 * 查询改写 Prompt：调用 LLM 自动生成同义查询，提升向量检索召回率。
 * 要求模型返回 JSON 数组格式，便于程序解析。
 */
export const buildExpandQueryPrompt = (query: string): string =>
  `你是一位电商客服领域的查询改写专家。\n\n` +
  `任务：将用户的查询改写为 3-5 个语义等价但用词不同的搜索查询，用于向量知识库检索。\n` +
  `要求：\n` +
  `1. 保持原意不变，但使用不同的关键词或表述方式\n` +
  `2. 对于核心名词必须尝试使用其常见同义词替换，例如：\n` +
  `   - "制度"可替换为"规则"、"政策"、"条款"、"规定"\n` +
  `   - "权益"可替换为"福利"、"特权"、"优惠"\n` +
  `   - "发货"可替换为"配送"、"物流"、"快递"\n` +
  `   - "售后"可替换为"保修"、"质保"、"退换"\n` +
  `3. 每个查询尽量简短，适合作为检索关键词\n` +
  `4. 必须包含原始查询本身\n` +
  `5. 直接返回 JSON 数组，不要有任何解释\n\n` +
  `用户查询："${query}"\n\n` +
  `输出格式示例：["原始查询", "同义改写1", "同义改写2", "相关概念3"]`;

/**
 * 格式化知识库文本，用于注入到 System Prompt 中。
 * 有检索结果时保留原始内容；无结果时显式提示未检索到资料，避免模型编造。
 */
export const formatKnowledgeBase = (rawKnowledgeBase = ''): string => {
  const trimmed = rawKnowledgeBase.trim();
  if (!trimmed) {
    return '本轮未检索到相关知识库资料。';
  }
  return trimmed;
};
