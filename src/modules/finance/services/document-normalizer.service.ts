import { Injectable } from '@nestjs/common';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import { pdfToImg } from 'pdftoimg-js';
import JSZip from 'jszip';

const TMP_DIR = path.resolve(process.cwd(), '.vision-tmp');

@Injectable()
export class DocumentNormalizerService {
  /**
   * PDF 转文本 (按页尝试，如果 pdf-parse 不支持则返回整段)
   */
  async pdfToText(file: string) {
    const buf = await fsp.readFile(file);
    const pdfFunc = ((pdf as unknown as Record<string, unknown>)['default'] ||
      pdf) as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfFunc(buf);
    // pdf-parse 不容易直接分页，这里返回单页数组，后续如果是长文档建议用更强力的库
    return [{ pageNo: 1, text: data.text }];
  }

  /**
   * PDF 转图片 (每页转一张 PNG)
   * pdftoimg-js 返回 base64 DataURL 数组，需要解码后写入文件
   */
  async pdfToImages(file: string): Promise<string[]> {
    // pdfToImg 支持 'all' pages，返回 string[]（base64 DataURL）
    const result = await pdfToImg(file, { pages: 'all', imgType: 'png' });
    // result 可能是单个字符串或字符串数组
    const dataUrls: string[] = Array.isArray(result) ? result : [result];

    const outputPaths: string[] = [];
    const dir = path.join(TMP_DIR, `pdf-${Date.now()}`);
    await fsp.mkdir(dir, { recursive: true });

    for (let i = 0; i < dataUrls.length; i++) {
      const imgPath = path.join(dir, `page-${i + 1}.png`);
      // DataURL 格式：data:image/png;base64,<base64data>
      const base64 = dataUrls[i].replace(/^data:image\/\w+;base64,/, '');
      await fsp.writeFile(imgPath, Buffer.from(base64, 'base64'));
      outputPaths.push(imgPath);
    }
    return outputPaths;
  }

  /**
   * DOCX 转文本
   */
  async docxToText(file: string) {
    const r = await mammoth.extractRawText({ path: file });
    return r.value;
  }

  /**
   * DOCX 提取内嵌图片
   */
  async docxToImages(file: string): Promise<string[]> {
    const buf = await fsp.readFile(file);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const zip = await JSZip.loadAsync(buf);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const mediaDir = zip.folder('word/media');
    if (!mediaDir) return [];

    const outputPaths: string[] = [];
    const dir = path.join(TMP_DIR, `docx-${Date.now()}`);
    await fsp.mkdir(dir, { recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    const files = Object.keys(zip.files || {}).filter((f) =>
      f.startsWith('word/media/'),
    );

    for (const f of files) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const zipFile = zip.file(f);
      if (zipFile) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const fileData = (await zipFile.async('nodebuffer')) as Buffer;
        const imgPath = path.join(dir, path.basename(f));
        await fsp.writeFile(imgPath, fileData);
        outputPaths.push(imgPath);
      }
    }
    return outputPaths;
  }
}
