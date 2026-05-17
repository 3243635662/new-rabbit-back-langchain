// 持久化节点（保存到数据库）
import type { Repository } from 'typeorm';
import type { VisionStateType } from '../vision/vision-state.annotation';
import { FinanceExtractedRecord } from '../../../modules/finance/entities/finance-extracted-record.entity';

export const buildPersistNode = (repo: Repository<FinanceExtractedRecord>) => {
  return async (state: VisionStateType) => {
    const r = state.merged;
    if (!r) return {};

    // 计算整体置信度平均值
    const avgConfidence =
      r.structured_fields.length > 0
        ? r.structured_fields.reduce(
            (sum, f) => sum + (f.confidence ?? 0.9),
            0,
          ) / r.structured_fields.length
        : 0.95;

    // 组装完美的统一 JSON 对象并落库
    const jsonOutput = {
      document_type: r.document_type || 'general_image',
      summary: r.summary || '',
      process_time: r.process_time || new Date().toISOString(),
      structured_fields: r.structured_fields || [],
      confidence: avgConfidence,
    };

    // ❌ 不再设置 fields，raw.structured_fields 已包含
    const entity = repo.create({
      sourceFileId: state.sourceFileId,
      recordType: jsonOutput.document_type,
      raw: jsonOutput,
    });

    await repo.save(entity);
    return {};
  };
};
