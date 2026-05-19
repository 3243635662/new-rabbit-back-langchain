import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type FinanceReportNodeDeps = {
  getModel: () => BaseChatModel;

  orderRepo?: any;
  inventoryRepo?: any;
  invoiceRepo?: any;
  financeRecordRepo?: any;

  qiniuService?: any;
};
