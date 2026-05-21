import type { VisionStateType } from '../vision/vision-state.annotation';
import type { VisionExtractRecord } from '../vision/schemas/vision-extract.schema';

export const buildMergeNode = () => {
  return (state: VisionStateType) => {
    if (state.pageResults.length === 0) {
      return { merged: null };
    }
    if (state.pageResults.length === 1) {
      return { merged: state.pageResults[0].data };
    }

    const list = state.pageResults.map((r) => r.data);

    // 智能合并多页的 structured_fields，进行同键名去重
    const mergedFields: Array<{
      name: string;
      desc: string;
      value: any;
      confidence: number;
    }> = [];

    for (const d of list) {
      if (Array.isArray(d.structured_fields)) {
        for (const f of d.structured_fields) {
          if (
            f &&
            f.name &&
            !mergedFields.some((existing) => existing.name === f.name)
          ) {
            mergedFields.push(f);
          }
        }
      }
    }

    const merged: VisionExtractRecord = {
      document_type: list[0].document_type || 'general_image',
      summary: list
        .map((d) => d.summary)
        .filter(Boolean)
        .join('\n'),
      process_time: new Date().toISOString(),
      document_date: null,
      structured_fields: mergedFields,
    };

    return { merged };
  };
};
