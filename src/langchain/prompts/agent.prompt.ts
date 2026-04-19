import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  AIMessagePromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { CommaSeparatedListOutputParser } from '@langchain/core/output_parsers';

// 电商助手提示模板 - 通过变量动态控制角色和业务规则
export const ecomAssistantPrompt = ChatPromptTemplate.fromMessages([
  // 系统人设
  SystemMessagePromptTemplate.fromTemplate(
    `你是一个电商{role}助手。
你的职责是：{duty}
回答风格：精简专业，不要编造数据。

以下是你的业务知识库，请严格遵守：
{rules}`,
  ),

  // AI 开场白
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
export function getRoleTypeByRoleId(roleId: number): RoleType {
  return ROLE_ID_MAP[roleId] || 'merchant';
}

// Few-Shot 提示模板 - 通过示例教 AI 按固定格式回答
// 对比：没有 few-shot 时 AI 自由发挥；有 few-shot 时 AI 模仿示例的格式
export const fewShotPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    `你是一个电商数据分析助手。
用户会问你业务问题，你必须严格按照以下 JSON 格式回答：
{{"answer": "你的回答", "confidence": "高/中/低", "source": "数据来源"}}

以下是几个示例，请严格照此格式回答。`,
  ),

  // 示例1：Few-Shot - 教 AI 什么是期望的输出格式
  HumanMessagePromptTemplate.fromTemplate('{example1_question}'),
  AIMessagePromptTemplate.fromTemplate('{example1_answer}'),

  // 示例2
  HumanMessagePromptTemplate.fromTemplate('{example2_question}'),
  AIMessagePromptTemplate.fromTemplate('{example2_answer}'),

  // 示例3
  HumanMessagePromptTemplate.fromTemplate('{example3_question}'),
  AIMessagePromptTemplate.fromTemplate('{example3_answer}'),

  // 用户真正的问题
  HumanMessagePromptTemplate.fromTemplate('{question}'),
]);

// Few-Shot 示例数据
export const FEW_SHOT_EXAMPLES = {
  example1_question: '上个月销售额多少？',
  example1_answer:
    '{"answer": "上月销售额为128.5万元，环比增长12.3%", "confidence": "高", "source": "月度销售报表"}',

  example2_question: '退货率高吗？',
  example2_answer:
    '{"answer": "本月退货率为5.2%，略高于行业平均4.8%", "confidence": "中", "source": "售后数据统计"}',

  example3_question: '哪个商品卖得最好？',
  example3_answer:
    '{"answer": "商品A本月销量3200件，为全平台TOP1", "confidence": "高", "source": "商品销量排行"}',
};

// ========== Chain 链式模板 ==========

// 1. 翻译链提示模板 - 将 {input_language} 翻译为 {output_language}
export const translatePrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    '你是一个专业的翻译助手，请将用户提供的文本从{input_language}翻译为{output_language}。只输出翻译结果，不要添加解释。',
  ),
  HumanMessagePromptTemplate.fromTemplate('{text}'),
]);

// 2. 产品命名链提示模板 - 生成创意产品名
export const productNamingPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    '你是一个品牌命名专家。根据产品描述，给出5个有创意的产品名称，用逗号分隔。',
  ),
  HumanMessagePromptTemplate.fromTemplate('产品描述：{product}'),
]);

// 3. 输出解析器
export const stringOutputParser = new StringOutputParser();
export const listOutputParser = new CommaSeparatedListOutputParser();

// ========== 自定义函数链模板 ==========

// RAG 提示模板 - {context} 是检索到的文档内容，{question} 是用户问题
export const ragPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    `你是一个电商知识库助手。请根据以下参考资料回答用户的问题。

参考资料：
{context}

要求：
- 只基于参考资料回答，不要编造
- 如果参考资料中没有相关内容，回答"知识库中暂无相关信息"
- 回答要精简准确`,
  ),
  HumanMessagePromptTemplate.fromTemplate('{question}'),
]);
