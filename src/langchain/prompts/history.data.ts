import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

// 模拟历史对话数据
// 实际项目中这些数据应该从数据库/Redis中读取
export const MOCK_HISTORY: BaseMessage[] = [
  new HumanMessage('商品审核要多久？'),
  new AIMessage('商品审核期为3个工作日之内，请耐心等待。'),
  new HumanMessage('可以加急审核吗？'),
  new AIMessage('目前不支持加急审核，但您可以在商品管理页面查看审核进度。'),
];
