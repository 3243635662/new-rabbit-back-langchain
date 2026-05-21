import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Repository } from 'typeorm';
import type { Order } from '../../modules/order/entities/orders.entity';
import type { Inventory } from '../../modules/inventory/entities/inventory.entity';
import type { FinanceExtractedRecord } from '../../modules/finance/entities/finance-extracted-record.entity';
import type { QiniuService } from '../../modules/qiniu/qiniu.service';
import type { ReportRenderService } from '../../modules/report-render/report-render.service';

export type ReportProgressCallback = (
  progress: number,
  status: string,
  message: string,
) => Promise<void>;

export type FinanceReportNodeDeps = {
  getModel: () => BaseChatModel;

  orderRepo: Repository<Order>;
  inventoryRepo: Repository<Inventory>;
  financeRecordRepo: Repository<FinanceExtractedRecord>;

  /** 进度上报回调（由 Processor 注入） */
  onProgress?: ReportProgressCallback;

  /** 七牛云上传服务 */
  qiniuService: QiniuService;

  /** Playwright 渲染服务（PDF/图片导出） */
  reportRenderService: ReportRenderService;
};
