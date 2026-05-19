import type {
  VisionStateType,
  VisionPage,
} from '../vision/vision-state.annotation';
// 这里就是“文本通道和视觉通道并存”的实现位置。PDF 优先抽文本，文本不足再转图片；DOCX 抽段落，图片单独入栈；图片直接当一页。

const TEXT_MIN_LEN = 200;

export const buildNormalizeNode = (deps: {
  pdfToText: (file: string) => Promise<{ pageNo: number; text: string }[]>;
  pdfToImages: (file: string) => Promise<string[]>;
  docxToText: (file: string) => Promise<string>;
  docxToImages: (file: string) => Promise<string[]>;
}) => {
  return async (state: VisionStateType) => {
    const pages: VisionPage[] = [];

    if (state.docType === 'image') {
      pages.push({
        pageNo: 1,
        source: 'image',
        imagePath: state.localFilePath,
      });
      return { pages };
    }

    if (state.docType === 'pdf') {
      const texts = await deps.pdfToText(state.localFilePath);
      const totalLen = texts.reduce((s, p) => s + p.text.length, 0);

      if (totalLen >= TEXT_MIN_LEN) {
        for (const p of texts) {
          pages.push({ pageNo: p.pageNo, source: 'text', text: p.text });
        }
      } else {
        const images = await deps.pdfToImages(state.localFilePath);
        images.forEach((p, i) => {
          pages.push({ pageNo: i + 1, source: 'image', imagePath: p });
        });
      }
      return { pages };
    }

    if (state.docType === 'docx') {
      const text = await deps.docxToText(state.localFilePath);
      if (text.length >= TEXT_MIN_LEN) {
        pages.push({ pageNo: 1, source: 'text', text });
      }
      const images = await deps.docxToImages(state.localFilePath);
      images.forEach((p) => {
        pages.push({ pageNo: pages.length + 1, source: 'image', imagePath: p });
      });
      return { pages };
    }

    return { pages };
  };
};
// pdfToText / pdfToImages 这些工具方法你可以放到 DocumentNormalizerService 里，比如基于 pdf-parse 和 pdf-poppler / pdf2pic 实现，DOCX 用 mammoth 抽文本、用 jszip 抽内嵌图片。这部分是工程实现细节，节点只关心契约
