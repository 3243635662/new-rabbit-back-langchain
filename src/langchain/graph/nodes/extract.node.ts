// 每页独立调用，分别走文本或视觉。文本页便宜，视觉页带图
import * as fsp from 'fs/promises';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { visionExtractSchema } from '../vision/schemas/vision-extract.schema';
import { visionExtractSystemPrompt } from '../../prompts/vision-extract.prompt';
import type {
  VisionStateType,
  VisionPageResult,
} from '../vision/vision-state.annotation';
import type { VisionExtractRecord } from '../vision/schemas/vision-extract.schema';
import { normalizeExtractedFields } from '../../../modules/finance/utils/extracted-fields-normalizer.util';

// 安全地转字符串，避免 unknown 触发 no-base-to-string
const safeStr = (val: unknown, fallback: string): string =>
  val != null && typeof val !== 'object'
    ? String(val as string | number | boolean)
    : fallback;

// 兜底归一化函数：防止大模型返回中文扁平发票结构或任意未知图片结构导致 Zod 崩溃
function normalizeRawOutput(
  data: Record<string, unknown>,
): VisionExtractRecord {
  // 1. document_type 归一化
  const documentType = safeStr(
    data.document_type ?? data.documentType ?? data['发票号码'],
    'general_image',
  );

  // 2. summary 归一化
  const summary = safeStr(
    data.summary ?? data['内容摘要'] ?? data['描述'],
    '要素提取结果',
  );

  // 3. process_time 归一化
  const processTime = safeStr(
    data.process_time ?? data.processTime,
    new Date().toISOString(),
  );

  // 4. structured_fields 归一化
  interface RawField {
    name?: unknown;
    desc?: unknown;
    value?: unknown;
    confidence?: unknown;
  }

  const toStructured = (f: RawField) => ({
    name: safeStr(f.name, ''),
    desc: safeStr(f.desc, ''),
    value: f.value,
    confidence: typeof f.confidence === 'number' ? f.confidence : 0.95,
  });

  let structuredFields: ReturnType<typeof toStructured>[] = [];

  if (Array.isArray(data.structured_fields)) {
    structuredFields = data.structured_fields.map(toStructured);
  } else if (Array.isArray(data.fields)) {
    structuredFields = data.fields.map(toStructured);
  } else {
    // 自动降级解析平面中文键值对
    const normalized = normalizeExtractedFields(data);
    structuredFields = normalized.map((f) => ({
      name: f.name,
      desc: f.desc,
      value: f.value,
      confidence: 0.95,
    }));
  }

  return {
    document_type: documentType,
    summary,
    process_time: processTime,
    document_date: null,
    structured_fields: structuredFields,
  };
}

export const buildExtractNode = (getModel: () => BaseChatModel) => {
  return async (
    state: VisionStateType,
    config?: { configurable?: Record<string, unknown> },
  ) => {
    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;

    const llm = getModel();
    const structured = llm.withStructuredOutput(visionExtractSchema, {
      name: 'vision_extract',
    });

    await pushProgress?.(50, 'extracting', '正在使用 AI 提取财务信息...');

    const results: VisionPageResult[] = [];

    for (const page of state.pages) {
      let humanMessage: HumanMessage;

      if (page.source === 'text' && page.text) {
        humanMessage = new HumanMessage(
          `以下是文档第 ${page.pageNo} 页文本，请抽取财务相关信息：\n\n${page.text}`,
        );
      } else if (page.source === 'image' && page.imagePath) {
        const buf = await fsp.readFile(page.imagePath);
        const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
        humanMessage = new HumanMessage({
          content: [
            {
              type: 'text',
              text: `这是文档第 ${page.pageNo} 页图片，请抽取财务相关信息。`,
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        });
      } else {
        continue;
      }

      let data: VisionExtractRecord;
      try {
        data = (await structured.invoke([
          new SystemMessage(visionExtractSystemPrompt),
          humanMessage,
        ])) as VisionExtractRecord;
      } catch (err) {
        // 🚨 触发高可用结构化提取兜底机制 🚨
        console.warn(
          `[StructuredOutput] 默认结构化提取失败，启动中文单据格式智能兼容兜底！`,
          err,
        );
        try {
          const response = await llm.invoke([
            new SystemMessage(
              `${visionExtractSystemPrompt}\n请务必只输出一个合法的 JSON 对象，不要做任何解释。`,
            ),
            humanMessage,
          ]);

          const text =
            typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content);
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Record<string, any>;
            data = normalizeRawOutput(parsed);
          } else {
            throw err;
          }
        } catch (innerErr) {
          console.error(`[FallbackNormalizer] 兜底提取依然失败:`, innerErr);
          throw err; // 抛出原始的 Zod 异常以进入重试或报警
        }
      }

      results.push({ pageNo: page.pageNo, data });
    }

    return { pageResults: results };
  };
};
