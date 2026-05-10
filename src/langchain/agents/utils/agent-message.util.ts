/**
 * @file agent-message.util.ts
 * @description Agent 消息处理工具函数
 * @职责 规范化模型返回的 content、压缩工具结果等纯函数逻辑
 */

/** 规范化模型返回的 content（处理字符串或数组格式） */
export const normalizeModelContent = (content: unknown): string => {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof (item as Record<string, unknown>).text === 'string'
        ) {
          return (item as Record<string, unknown>).text as string;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return content === null || content === undefined
    ? ''
    : JSON.stringify(content);
};

/** 压缩工具结果，避免撑爆上下文窗口 */
export const compressToolResult = (text: string, maxLength = 6000): string => {
  if (text.length <= maxLength) return text;
  return (
    text.slice(0, maxLength) +
    '\n\n[工具结果过长，已截断。请基于以上资料回答，不要编造未提供的信息。]'
  );
};
