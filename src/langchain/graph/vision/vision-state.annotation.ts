import { Annotation } from '@langchain/langgraph';
import type { VisionExtractRecord } from './schemas/vision-extract.schema';

export interface VisionPage {
  pageNo: number;
  source: 'image' | 'text';
  imagePath?: string;
  text?: string;
}

export interface VisionPageResult {
  pageNo: number;
  data: VisionExtractRecord;
}

export const VisionStateAnnotation = Annotation.Root({
  sourceFileId: Annotation<number>(),
  qiniuKey: Annotation<string>(),
  docType: Annotation<'image' | 'pdf' | 'docx'>(),

  localFilePath: Annotation<string>(),
  pages: Annotation<VisionPage[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  pageResults: Annotation<VisionPageResult[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  merged: Annotation<VisionExtractRecord | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  warnings: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...(next || [])],
    default: () => [],
  }),

  // LLM 提取的资源实际日期
  extractedDate: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});
// upgraded 标记是否已经升级过模型，避免无限循环。pageResults 用累积 reducer。
export type VisionStateType = typeof VisionStateAnnotation.State;
