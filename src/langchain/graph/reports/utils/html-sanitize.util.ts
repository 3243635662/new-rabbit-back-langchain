import {
  TAILWIND_CDN,
  ECHARTS_CDN,
} from '../prompts/generate-report-html.prompt';

const extractHtmlFromModelResponse = (response: unknown): string => {
  if (typeof response === 'string') return response;

  const obj = response as Record<string, unknown>;
  if (obj?.content && typeof obj.content === 'string') return obj.content;

  return JSON.stringify(response);
};

const validateGeneratedHtml = (html: string): string => {
  if (!html || typeof html !== 'string') {
    throw new Error('LLM 输出为空');
  }

  const cleaned = html
    .replace(/^```html?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  if (cleaned.length < 500) {
    throw new Error('LLM 生成的 HTML 过短，可能不是完整页面');
  }

  const requiredFragments = [
    '<!DOCTYPE html',
    '<html',
    '<head',
    '<body',
    TAILWIND_CDN,
    ECHARTS_CDN,
    'echarts.init',
    'setOption',
    '__REPORT_CHARTS_RENDERED__',
  ];

  for (const fragment of requiredFragments) {
    if (!cleaned.includes(fragment)) {
      throw new Error(`LLM 生成的 HTML 缺少必要片段：${fragment}`);
    }
  }

  return cleaned;
};

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
  [/<iframe[\s>]/gi, 'iframe 标签不允许'],
  [/<object[\s>]/gi, 'object 标签不允许'],
  [/<embed[\s>]/gi, 'embed 标签不允许'],
  [/<form[\s>]/gi, 'form 标签不允许'],
  [/<input[\s>]/gi, 'input 标签不允许'],
  [/\bfetch\s*\(/gi, 'fetch 调用不允许'],
  [/\bXMLHttpRequest\b/gi, 'XMLHttpRequest 不允许'],
  [/\beval\s*\(/gi, 'eval 不允许'],
  [/\bnew\s+Function\b/gi, 'new Function 不允许'],
  [/\bdocument\.write\b/gi, 'document.write 不允许'],
  [/\bwindow\.open\b/gi, 'window.open 不允许'],
];

const sanitizeGeneratedHtml = (html: string): string => {
  for (const [pattern, label] of DANGEROUS_PATTERNS) {
    if (pattern.test(html)) {
      throw new Error(`HTML 包含危险内容：${label}`);
    }
  }

  return html;
};

export {
  extractHtmlFromModelResponse,
  validateGeneratedHtml,
  sanitizeGeneratedHtml,
};
