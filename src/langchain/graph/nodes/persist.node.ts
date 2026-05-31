// 持久化节点（保存到数据库）
import type { Repository } from 'typeorm';
import type { VisionStateType } from '../vision/vision-state.annotation';
import { FinanceExtractedRecord } from '../../../modules/finance/entities/finance-extracted-record.entity';

export const buildPersistNode = (repo: Repository<FinanceExtractedRecord>) => {
  return async (
    state: VisionStateType,
    config?: { configurable?: Record<string, unknown> },
  ) => {
    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;

    const r = state.merged;
    if (!r) return {};

    await pushProgress?.(80, 'persisting', '正在写入数据库...');

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
      document_date: r.document_date || null,
      structured_fields: r.structured_fields || [],
      confidence: avgConfidence,
    };

    // 提取 LLM 识别的资源实际日期，并转成 MySQL DATE 格式（YYYY-MM-DD）
    const toMysqlDate = (raw: string): string | null => {
      if (!raw) return null;
      const s = raw.trim();
      // 已经是 YYYY-MM-DD 格式，直接返回
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // 解析中文日期：2026年05月22日 / 2026年5月22日
      const cnMatch = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
      if (cnMatch) {
        const y = cnMatch[1];
        const m = cnMatch[2].padStart(2, '0');
        const d = cnMatch[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      // 尝试 Date 对象解析
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
      return null;
    };
    const extractedDate = toMysqlDate(r.document_date as string);

    const entity = repo.create({
      sourceFileId: state.sourceFileId,
      recordType: jsonOutput.document_type,
      raw: jsonOutput,
      extractedDate,
    });

    await repo.save(entity);
    return {};
  };
};
