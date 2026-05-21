import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type FinanceReportNodeDeps = {
  getModel: () => BaseChatModel;

  orderRepo?: any;
  inventoryRepo?: any;
  invoiceRepo?: any;
  financeRecordRepo?: any;

  /** 七牛云上传服务 */
  qiniuService?: {
    uploadBuffer: (
      buffer: Buffer,
      key: string,
      mimeType: string,
    ) => Promise<string>;
  };

  /** Playwright 渲染服务（PDF/图片导出） */
  reportRenderService?: {
    htmlToPdfBuffer: (html: string) => Promise<Buffer>;
    htmlToImageBuffer: (html: string) => Promise<Buffer>;
  };
};
