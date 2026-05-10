/**
 * @file agent.des.ts
 * @description Agent 工具描述词（Tool Descriptions）集中管理
 * @作用 为 LangChain 工具提供标准化、可维护的 description
 * @好处
 *   - 集中管理：所有工具描述在一个文件中，便于统一修改
 *   - 多语言适配：未来可轻松扩展为多语言版本
 *   - 描述优化：可以针对不同场景调整工具描述，提升模型调用准确率
 * @使用场景 在定义 DynamicStructuredTool 时，从本文件引入对应的描述词
 */

/**
 * Agent 工具描述词（Tool Descriptions）
 * 集中管理各工具的 description，便于统一维护和多语言适配。
 */

/** 商户知识库检索工具描述 */
export const SEARCH_MERCHANT_KB_DESC =
  '当用户询问与商户业务相关的具体问题时，调用此工具检索商户知识库。' +
  '适用场景包括：商品信息、价格库存、订单规则、退换货政策、配送方式、' +
  '会员权益、积分规则、优惠活动、店铺运营政策等。' +
  '如果问题与商户业务无关，请勿调用。' +
  '输入应为简洁的搜索关键词或问题描述。';
