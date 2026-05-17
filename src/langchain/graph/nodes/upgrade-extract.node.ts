// 升级抽取节点（低置信度自动重试）
import * as fsp from 'fs/promises';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { visionExtractSchema } from '../vision/schemas/vision-extract.schema';
import { visionExtractSystemPrompt } from '../../prompts/vision-extract.prompt';
import type {
  VisionStateType,
  VisionPageResult,
} from '../vision/vision-state.annotation';

export const buildUpgradeExtractNode = (
  getStrongModel: () => BaseChatModel,
) => {
  return async (state: VisionStateType) => {
    const llm = getStrongModel();
    const structured = llm.withStructuredOutput(visionExtractSchema, {
      name: 'vision_extract_upgrade',
    });

    const results: VisionPageResult[] = [];

    for (const page of state.pages) {
      if (page.source !== 'image' || !page.imagePath) continue;
      const buf = await fsp.readFile(page.imagePath);
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      const data = (await structured.invoke([
        new SystemMessage(visionExtractSystemPrompt),
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: `请重新仔细识别第 ${page.pageNo} 页图片，给出更准确的结构化结果。`,
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }),
      ])) as import('../vision/schemas/vision-extract.schema').VisionExtractRecord;
      results.push({ pageNo: page.pageNo, data });
    }

    return {
      pageResults: results,
      upgraded: true,
      warnings: ['low_confidence_upgraded'],
    };
  };
};
