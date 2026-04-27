import { Injectable, Logger } from '@nestjs/common';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { RagService } from '../rag.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { Document } from '@langchain/core/documents';
import {
  RetrievalTrace,
  ProgressCallback,
  SupportedDocumentType,
} from '../../../types/rag.type';

@Injectable()
export class MerchantRagService {
  private readonly logger = new Logger(MerchantRagService.name);

  constructor(private readonly ragService: RagService) {}

  ingestDocument = async (
    filePath: string,
    mimeType: string,
    merchantId: string,
    fileName: string,
    onProgress?: ProgressCallback,
  ) => {
    await fs.access(filePath);

    const documentType = this.detectDocumentType(fileName, mimeType);

    void onProgress?.(25, 'parsing', '正在解析文档...');
    const rawDocs = await this.loadDocument(filePath, mimeType, documentType);

    if (rawDocs.length === 0) {
      throw new Error('文档为空或格式无效');
    }

    void onProgress?.(35, 'cleaning', '正在清理历史向量...');
    await this.deleteDocumentsBySourceFile(merchantId, fileName);

    void onProgress?.(45, 'preparing', '正在整理文档内容...');
    const preparedDocs = this.prepareDocuments(rawDocs, {
      merchantId,
      fileName,
      mimeType,
      documentType,
    });

    if (preparedDocs.length === 0) {
      throw new Error('文档没有可入库的有效文本');
    }

    void onProgress?.(55, 'splitting', '正在切分文本...');
    const chunks = await this.splitDocumentsForRag(preparedDocs, {
      merchantId,
      fileName,
      mimeType,
      documentType,
    });

    if (chunks.length === 0) {
      throw new Error('文档切分后没有有效片段');
    }

    void onProgress?.(70, 'embedding', '正在向量化并入库...');
    const count = await this.ragService.addDocuments(chunks);

    this.logger.log(
      `商户 ${merchantId} 文件 ${fileName} 入库成功，共 ${count} 个片段`,
    );

    void onProgress?.(100, 'completed', '知识库入库完成');

    return {
      count,
      documentType,
      rawDocumentCount: rawDocs.length,
      chunkCount: chunks.length,
    };
  };

  private detectDocumentType = (
    fileName: string,
    mimeType: string,
  ): SupportedDocumentType => {
    const ext = path.extname(fileName).toLowerCase();

    if (mimeType.includes('pdf') || ext === '.pdf') {
      return 'pdf';
    }

    if (
      mimeType.includes('docx') ||
      mimeType.includes('wordprocessingml') ||
      ext === '.docx'
    ) {
      return 'docx';
    }

    if (mimeType.includes('csv') || ext === '.csv') {
      return 'csv';
    }

    if (
      mimeType.includes('spreadsheetml') ||
      mimeType.includes('excel') ||
      ext === '.xlsx' ||
      ext === '.xls'
    ) {
      return 'excel';
    }

    if (mimeType.includes('json') || ext === '.json') {
      return 'json';
    }

    if (
      mimeType.includes('text') ||
      mimeType.includes('plain') ||
      ext === '.txt' ||
      ext === '.md'
    ) {
      return 'txt';
    }

    throw new Error(`不支持的文件类型: ${mimeType}`);
  };

  private loadDocument = async (
    filePath: string,
    mimeType: string,
    documentType: SupportedDocumentType,
  ): Promise<Document[]> => {
    switch (documentType) {
      case 'pdf': {
        const loader = new PDFLoader(filePath);
        return loader.load();
      }

      case 'docx': {
        const loader = new DocxLoader(filePath);
        return loader.load();
      }

      case 'csv': {
        const loader = new CSVLoader(filePath);
        return loader.load();
      }

      case 'excel': {
        return this.loadExcel(filePath);
      }

      case 'txt': {
        return this.loadPlainText(filePath);
      }

      case 'json': {
        return this.loadJson(filePath);
      }

      default:
        throw new Error(`不支持的文件类型: ${mimeType}`);
    }
  };

  private loadPlainText = async (filePath: string): Promise<Document[]> => {
    const content = await fs.readFile(filePath, 'utf-8');

    if (!content.trim()) {
      return [];
    }

    return [
      new Document({
        pageContent: content,
        metadata: {
          source: path.basename(filePath),
          documentType: 'txt',
        },
      }),
    ];
  };

  private loadJson = async (filePath: string): Promise<Document[]> => {
    const raw = await fs.readFile(filePath, 'utf-8');

    if (!raw.trim()) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    const fileName = path.basename(filePath);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item, index) => {
          const text = this.jsonToBusinessText(item);

          return new Document({
            pageContent: text,
            metadata: {
              source: fileName,
              documentType: 'json',
              recordIndex: index,
            },
          });
        })
        .filter((doc) => doc.pageContent.trim().length > 0);
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const docs: Document[] = [];

      for (const [key, value] of Object.entries(record)) {
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            const text = this.jsonToBusinessText(item);

            if (text.trim()) {
              docs.push(
                new Document({
                  pageContent: `模块：${key}\n记录序号：${index}\n${text}`,
                  metadata: {
                    source: fileName,
                    documentType: 'json',
                    section: key,
                    recordIndex: index,
                  },
                }),
              );
            }
          });

          continue;
        }

        if (typeof value === 'object' && value !== null) {
          const text = this.jsonToBusinessText(value);

          if (text.trim()) {
            docs.push(
              new Document({
                pageContent: `模块：${key}\n${text}`,
                metadata: {
                  source: fileName,
                  documentType: 'json',
                  section: key,
                },
              }),
            );
          }
        }
      }

      if (docs.length > 0) {
        return docs;
      }
    }

    const text = this.jsonToBusinessText(parsed);

    if (!text.trim()) {
      return [];
    }

    return [
      new Document({
        pageContent: text,
        metadata: {
          source: fileName,
          documentType: 'json',
        },
      }),
    ];
  };

  private loadExcel = (filePath: string): Document[] => {
    const workbook = XLSX.readFile(filePath, {
      cellDates: true,
    });

    const fileName = path.basename(filePath);
    const docs: Document[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        continue;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });

      rows.forEach((row, index) => {
        const text = this.rowToBusinessText(row);

        if (!text.trim()) {
          return;
        }

        docs.push(
          new Document({
            pageContent: `工作表：${sheetName}\n行号：${index + 2}\n${text}`,
            metadata: {
              source: fileName,
              documentType: 'excel',
              sheetName,
              rowIndex: index + 2,
            },
          }),
        );
      });
    }

    return docs;
  };

  private prepareDocuments = (
    docs: Document[],
    options: {
      merchantId: string;
      fileName: string;
      mimeType: string;
      documentType: SupportedDocumentType;
    },
  ): Document[] => {
    const { merchantId, fileName, mimeType, documentType } = options;

    return docs
      .map((doc, index) => {
        const metadata = this.sanitizeMetadata(doc.metadata || {});
        const content = this.normalizeText(doc.pageContent);

        return new Document({
          pageContent: content,
          metadata: {
            ...metadata,
            tenantType: 'merchant',
            merchantId,
            sourceFile: fileName,
            mimeType,
            documentType,
            recordIndex:
              typeof metadata.recordIndex === 'number'
                ? metadata.recordIndex
                : index,
          },
        });
      })
      .filter((doc) => doc.pageContent.trim().length > 0);
  };

  private splitDocumentsForRag = async (
    docs: Document[],
    options: {
      merchantId: string;
      fileName: string;
      mimeType: string;
      documentType: SupportedDocumentType;
    },
  ): Promise<Document[]> => {
    const { merchantId, fileName, documentType } = options;

    const isStructured = ['csv', 'excel', 'json'].includes(documentType);

    const splitter = this.createSplitter(documentType);

    const docsWithHeader = docs.map((doc) =>
      this.addDocumentHeader(doc, fileName),
    );

    const rawChunks = isStructured
      ? await this.splitStructuredDocuments(docsWithHeader, splitter)
      : await splitter.splitDocuments(docsWithHeader);

    return rawChunks
      .map((chunk, index) => {
        const normalizedContent = this.normalizeText(chunk.pageContent);
        const metadata = this.sanitizeMetadata(chunk.metadata || {});
        const contentHash = this.createContentHash(normalizedContent);

        return new Document({
          pageContent: normalizedContent,
          metadata: {
            ...metadata,
            tenantType: 'merchant',
            merchantId,
            sourceFile: fileName,
            documentType,
            chunkIndex: index,
            chunkLength: normalizedContent.length,
            contentHash,
          },
        });
      })
      .filter((chunk) => chunk.pageContent.trim().length > 0);
  };

  private splitStructuredDocuments = async (
    docs: Document[],
    splitter: RecursiveCharacterTextSplitter,
  ): Promise<Document[]> => {
    const result: Document[] = [];

    for (const doc of docs) {
      if (doc.pageContent.length <= 1200) {
        result.push(doc);
        continue;
      }

      const chunks = await splitter.splitDocuments([doc]);
      result.push(...chunks);
    }

    return result;
  };

  private createSplitter = (
    documentType: SupportedDocumentType,
  ): RecursiveCharacterTextSplitter => {
    if (documentType === 'csv' || documentType === 'excel') {
      return new RecursiveCharacterTextSplitter({
        chunkSize: 1200,
        chunkOverlap: 80,
        separators: [
          '\n\n',
          '\n',
          '。本文',
          '。 ',
          '。',
          '！',
          '？',
          '；',
          '，',
          ' ',
          '',
        ],
      });
    }

    if (documentType === 'json') {
      return new RecursiveCharacterTextSplitter({
        chunkSize: 1200,
        chunkOverlap: 100,
        separators: [
          '\n\n',
          '\n',
          '。本文',
          '。 ',
          '。',
          '！',
          '？',
          '；',
          '，',
          ' ',
          '',
        ],
      });
    }

    if (documentType === 'pdf') {
      return new RecursiveCharacterTextSplitter({
        chunkSize: 900,
        chunkOverlap: 120,
        separators: [
          '\n\n',
          '\n',
          '。本文',
          '。 ',
          '。',
          '！',
          '？',
          '；',
          '，',
          ' ',
          '',
        ],
      });
    }

    if (documentType === 'docx' || documentType === 'txt') {
      return new RecursiveCharacterTextSplitter({
        chunkSize: 800,
        chunkOverlap: 120,
        separators: [
          '\n# ',
          '\n## ',
          '\n### ',
          '\n\n',
          '\n',
          '。本文',
          '。 ',
          '。',
          '！',
          '？',
          '；',
          '，',
          ' ',
          '',
        ],
      });
    }

    return new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 100,
      separators: ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', ''],
    });
  };

  private addDocumentHeader = (doc: Document, fileName: string): Document => {
    const metadata = doc.metadata || {};
    const headerParts: string[] = [];

    headerParts.push(`来源文件：${fileName}`);

    if (metadata.documentType != null) {
      headerParts.push(`文件类型：${String(metadata.documentType)}`);
    }

    if (metadata.page != null) {
      headerParts.push(`页码：${String(metadata.page)}`);
    }

    if (metadata.loc != null) {
      headerParts.push(`位置：${String(metadata.loc)}`);
    }

    if (metadata.section != null) {
      headerParts.push(`模块：${String(metadata.section)}`);
    }

    if (metadata.sheetName != null) {
      headerParts.push(`工作表：${String(metadata.sheetName)}`);
    }

    if (metadata.rowIndex != null) {
      headerParts.push(`行号：${String(metadata.rowIndex)}`);
    }

    if (metadata.recordIndex != null) {
      headerParts.push(`记录序号：${String(metadata.recordIndex)}`);
    }

    return new Document({
      pageContent:
        headerParts.join('\n') + '\n\n正文：\n' + doc.pageContent.trim(),
      metadata: doc.metadata,
    });
  };

  private jsonToBusinessText = (value: unknown): string => {
    const lines: string[] = [];

    const walk = (current: unknown, pathParts: string[]) => {
      if (current == null) {
        return;
      }

      if (
        typeof current === 'string' ||
        typeof current === 'number' ||
        typeof current === 'boolean'
      ) {
        const key = pathParts.join('.');
        const text = String(current).trim();

        if (text) {
          lines.push(key ? `${key}：${text}` : text);
        }

        return;
      }

      if (Array.isArray(current)) {
        const isPrimitiveArray = current.every(
          (item) =>
            item == null ||
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean',
        );

        if (isPrimitiveArray) {
          const key = pathParts.join('.');
          const text = current
            .filter((item) => item != null && String(item).trim())
            .map((item) => String(item).trim())
            .join('、');

          if (text) {
            lines.push(`${key}：${text}`);
          }

          return;
        }

        current.forEach((item, index) => {
          walk(item, [...pathParts, String(index + 1)]);
        });

        return;
      }

      if (typeof current === 'object') {
        for (const [key, val] of Object.entries(
          current as Record<string, unknown>,
        )) {
          walk(val, [...pathParts, key]);
        }
      }
    };

    walk(value, []);

    return lines.join('\n');
  };

  private rowToBusinessText = (row: Record<string, unknown>): string => {
    return Object.entries(row)
      .map(([key, value]) => {
        const normalizedKey = String(key).trim();
        const normalizedValue =
          value == null
            ? ''
            : String(value as string | number | boolean)
                .replace(/\s+/g, ' ')
                .trim();

        if (!normalizedKey || !normalizedValue) {
          return '';
        }

        return `${normalizedKey}：${normalizedValue}`;
      })
      .filter(Boolean)
      .join('\n');
  };

  private normalizeText = (text: string): string => {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  private sanitizeMetadata = (
    metadata: Record<string, unknown>,
  ): Record<string, string | number | boolean> => {
    const result: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        result[key] = value;
      }
    }

    return result;
  };

  private createContentHash = (content: string): string => {
    return createHash('sha256').update(content).digest('hex');
  };

  retrieveContext = (query: string, merchantId: string, k = 5) => {
    return this.ragService.retrieveContext(query, 'merchant', merchantId, k);
  };

  retrieveContextWithTrace = (
    query: string,
    merchantId: string,
    k = 5,
  ): Promise<{ context: string; trace: RetrievalTrace }> => {
    return this.ragService.retrieveContextWithTrace(
      query,
      'merchant',
      merchantId,
      k,
    );
  };

  deleteDocumentsBySourceFile = async (
    merchantId: string,
    sourceFile: string,
  ): Promise<void> => {
    await this.ragService.deleteDocuments({
      $and: [
        { tenantType: 'merchant' },
        { merchantId: { $eq: merchantId } },
        { sourceFile: { $eq: sourceFile } },
      ],
    } as unknown as import('chromadb').Where);

    this.logger.log(`商户 ${merchantId} 文件 ${sourceFile} 的历史向量已清理`);
  };

  cleanupTemp = async (filePath: string) => {
    await fs.unlink(filePath).catch(() => {});
  };
}
