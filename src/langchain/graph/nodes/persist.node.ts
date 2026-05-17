// 持久化节点（保存到数据库）
import type { Repository } from 'typeorm';
import type { VisionStateType } from '../vision/vision-state.annotation';
import { FinanceExtractedRecord } from '../../../modules/finance/entities/finance-extracted-record.entity';

export const buildPersistNode = (repo: Repository<FinanceExtractedRecord>) => {
  return async (state: VisionStateType) => {
    const r = state.merged;
    if (!r) return {};

    const entity = repo.create({
      sourceFileId: state.sourceFileId,
      recordType: r.documentType || 'image_scan',
      occurredAt: r.occurredAt ? new Date(r.occurredAt) : undefined,
      amount: r.amount != null ? String(r.amount) : undefined,
      totalAmount: r.totalAmount != null ? String(r.totalAmount) : undefined,
      currency: r.currency || 'CNY',
      counterparty: r.counterparty || '',
      category: r.category || '通用图片',
      confidence: String(r.confidence ?? 0),
      raw: { ...r, _upgraded: state.upgraded, _warnings: state.warnings },
    });

    await repo.save(entity);
    return {};
  };
};
