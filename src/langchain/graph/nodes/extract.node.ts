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

export const buildExtractNode = (getModel: () => BaseChatModel) => {
  return async (state: VisionStateType) => {
    const llm = getModel();
    const structured = llm.withStructuredOutput(visionExtractSchema, {
      name: 'vision_extract',
    });

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

      const data = (await structured.invoke([
        new SystemMessage(visionExtractSystemPrompt),
        humanMessage,
      ])) as VisionExtractRecord;

      results.push({ pageNo: page.pageNo, data });
    }

    return { pageResults: results };
  };
};
