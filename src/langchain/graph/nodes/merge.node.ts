import type { VisionStateType } from '../vision/vision-state.annotation';
import type { VisionExtractRecord } from '../vision/schemas/vision-extract.schema';
// 多页时按字段优先级合并，并算整体置信度。
const pickFirst = <T>(values: (T | null | undefined)[]): T | null => {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
};

export const buildMergeNode = () => {
  return (state: VisionStateType) => {
    if (state.pageResults.length === 0) {
      return { merged: null };
    }
    if (state.pageResults.length === 1) {
      return { merged: state.pageResults[0].data };
    }

    const list = state.pageResults.map((r) => r.data);

    const merged: VisionExtractRecord = {
      documentType: list[0].documentType,
      title: pickFirst(list.map((d) => d.title)),
      summary: list
        .map((d) => d.summary)
        .filter(Boolean)
        .join('\n'),
      occurredAt: pickFirst(list.map((d) => d.occurredAt)),
      amount: pickFirst(list.map((d) => d.amount)),
      totalAmount: pickFirst(list.map((d) => d.totalAmount)),
      currency: list[0].currency || 'CNY',
      counterparty: pickFirst(list.map((d) => d.counterparty)),
      category: pickFirst(list.map((d) => d.category)),
      keyFields: Object.assign(
        {},
        ...list.map((d) => d.keyFields || {}),
      ) as Record<string, any>,
      warnings: list.flatMap((d) => d.warnings || []),
      confidence:
        list.reduce((s, d) => s + (d.confidence ?? 0), 0) / list.length,
    };

    return { merged };
  };
};
