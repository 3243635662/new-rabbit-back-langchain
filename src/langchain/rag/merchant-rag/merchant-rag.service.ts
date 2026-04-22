import { Injectable, Logger } from '@nestjs/common';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { RagService } from '../rag.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Document } from '@langchain/core/documents';

@Injectable()
export class MerchantRagService {
  private readonly logger = new Logger(MerchantRagService.name);

  constructor(private readonly ragService: RagService) {}

  /**
   * 根据 MIME 类型选择 Loader 解析文档
   * → 注入商户元数据 → 文本切分 → 存入 ChromaDB
   */
  ingestDocument = async (
    filePath: string,
    mimeType: string,
    merchantId: string,
    onProgress?: (
      progress: number,
      status: string,
      message: string,
    ) => void | Promise<void>,
  ) => {
    await fs.access(filePath);

    // 1. 根据 MIME 选择 Loader
    void onProgress?.(30, 'parsing', '正在解析文档...');
    const docs = await this.loadDocument(filePath, mimeType);

    if (docs.length === 0) {
      throw new Error('文档为空或格式无效');
    }

    // 2. 注入商户元数据（实现数据隔离）
    docs.forEach((doc, idx) => {
      doc.metadata = {
        ...doc.metadata,
        tenantType: 'merchant',
        merchantId,
        sourceFile: path.basename(filePath),
        rowIndex: idx,
      };
    });

    // 3. 文本切分
    void onProgress?.(50, 'splitting', '正在切分文本...');
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 100,
      separators: ['\n', '。', '；', '，', ''],
    });
    const chunks = await splitter.splitDocuments(docs);

    // 4. 调用 RagService 存入向量库
    void onProgress?.(70, 'embedding', '正在向量化并入库...');
    const count = await this.ragService.addDocuments(chunks);

    this.logger.log(`商户 ${merchantId} 知识库入库成功: ${count} 个片段`);

    return { count };
  };

  /**
   * 根据 MIME 类型加载文档
   */
  private loadDocument = async (
    filePath: string,
    mimeType: string,
  ): Promise<Document[]> => {
    if (mimeType.includes('pdf')) {
      const loader = new PDFLoader(filePath);
      return loader.load();
    }
    if (mimeType.includes('docx') || mimeType.includes('wordprocessingml')) {
      const loader = new DocxLoader(filePath);
      return loader.load();
    }
    if (mimeType.includes('csv')) {
      const loader = new CSVLoader(filePath);
      return loader.load();
    }
    if (mimeType.includes('text') || mimeType.includes('plain')) {
      return this.loadPlainText(filePath);
    }
    if (mimeType.includes('json')) {
      return this.loadJson(filePath);
    }
    throw new Error(`不支持的文件类型: ${mimeType}`);
  };

  /**
   * 加载纯文本文件
   */
  private loadPlainText = async (filePath: string): Promise<Document[]> => {
    const content = await fs.readFile(filePath, 'utf-8');
    if (!content.trim()) return [];
    return [
      new Document({
        pageContent: content,
        metadata: { source: path.basename(filePath) },
      }),
    ];
  };

  /**
   * 加载 JSON 文件 — 提取业务语义文本，而非直接塞 JSON 结构
   * 支持数组/对象/嵌套结构，自动递归提取有意义的文本内容
   */
  private loadJson = async (filePath: string): Promise<Document[]> => {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (!raw.trim()) return [];

    const parsed: unknown = JSON.parse(raw);
    const fileName = path.basename(filePath);

    // 数组格式：每个元素生成一个 Document
    if (Array.isArray(parsed)) {
      return (parsed as unknown[])
        .filter((item) => item != null)
        .map((item, idx) => {
          const text = this.extractJsonText(item);
          return new Document({
            pageContent: text,
            metadata: { source: fileName, line: idx + 1 },
          });
        })
        .filter((doc) => doc.pageContent.trim().length > 0);
    }

    // 单个对象
    const text = this.extractJsonText(parsed);
    if (!text.trim()) return [];
    return [
      new Document({
        pageContent: text,
        metadata: { source: fileName },
      }),
    ];
  };

  /**
   * 从 JSON 值中提取有意义的文本
   * 优先提取常见语义字段（content/text/description/name/title/question/answer），
   * 其次拼接所有字符串值，避免把 {} 结构塞进向量库
   */
  private extractJsonText = (obj: unknown): string => {
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (obj == null) return '';

    if (typeof obj !== 'object') return JSON.stringify(obj);

    // 优先提取业务语义字段
    const semanticKeys = [
      'content',
      'text',
      'description',
      'name',
      'title',
      'question',
      'answer',
      'summary',
      'body',
      'message',
    ];
    const record = obj as Record<string, unknown>;
    const semanticParts: string[] = [];

    for (const key of semanticKeys) {
      if (record[key] != null) {
        const val = record[key];
        if (typeof val === 'string') {
          semanticParts.push(val);
        } else if (typeof val === 'object') {
          semanticParts.push(JSON.stringify(val, null, 0));
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          semanticParts.push(String(val));
        }
      }
    }

    if (semanticParts.length > 0) {
      return semanticParts.join('\n');
    }

    // 没有语义字段时，递归拼接所有字符串值
    const allStrings: string[] = [];
    for (const [key, val] of Object.entries(record)) {
      if (typeof val === 'string' && val.trim()) {
        allStrings.push(`${key}: ${val}`);
      } else if (typeof val === 'object' && val != null) {
        const nested = this.extractJsonText(val);
        if (nested.trim()) allStrings.push(`${key}: ${nested}`);
      } else if (val != null) {
        const strVal =
          typeof val === 'number' || typeof val === 'boolean'
            ? String(val)
            : JSON.stringify(val);
        allStrings.push(`${key}: ${strVal}`);
      }
    }

    return allStrings.join('\n');
  };

  /**
   * 检索商户相关知识
   */
  retrieveContext = (query: string, merchantId: string, k = 3) => {
    return this.ragService.retrieveContext(query, 'merchant', merchantId, k);
  };

  /** 清理临时文件 */
  cleanupTemp = async (filePath: string) => {
    await fs.unlink(filePath).catch(() => {});
  };
}
