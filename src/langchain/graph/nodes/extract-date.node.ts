// 从 LLM 提取结果中读取资源实际日期，写入状态
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { VisionStateType } from '../vision/vision-state.annotation';

const SYSTEM_PROMPT = `你是一个专业的财务文档日期识别助手。
请从用户提供的文档解析结果（JSON 格式）中，识别出该资源对应的**实际业务日期**。
实际业务日期是指：发票开票日期、合同签署日期、付款日期、收据日期等，而不是文件上传或创建的时间。

只输出一个纯日期字符串，格式为 YYYY-MM-DD。
如果无法从内容中识别出任何业务日期，只输出 null，不要做任何解释。`;

export const buildExtractDateNode = (getModel: () => BaseChatModel) => {
  return async (state: VisionStateType) => {
    // extract-date 在 merge 之前执行，应读取最新的 pageResult 而非 state.merged
    const latestResult = state.pageResults?.[state.pageResults.length - 1];
    if (!latestResult) {
      return { extractedDate: null };
    }
    const data = latestResult.data;

    // 优先使用结构化字段中识别出的日期
    const fields = Array.isArray(data.structured_fields)
      ? data.structured_fields
      : [];
    const dateField = fields.find(
      (f) =>
        f.name?.includes('date') ||
        f.name?.includes('时间') ||
        f.name?.includes('日期'),
    );
    if (dateField && dateField.value) {
      const val = String(dateField.value).trim();
      // 简单校验 YYYY-MM-DD 格式
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        return { extractedDate: val };
      }
    }

    // 兜底：调用 LLM 从 data 中识别
    try {
      const model = getModel();
      const raw = JSON.stringify(data);
      const response = await model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(`请识别以下文档解析结果中的实际业务日期：\n${raw}`),
      ]);
      const text =
        typeof response.content === 'string' ? response.content.trim() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return { extractedDate: text };
      }
    } catch (err) {
      console.warn('[ExtractDate] LLM 日期识别失败，跳过：', err);
    }

    return { extractedDate: null };
  };
};
