import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { ChromaClient } from 'chromadb';
import type { Where } from 'chromadb';
import { Document } from '@langchain/core/documents';
import { EmbeddingService } from '../embedding.service';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  private readonly CHROMA_URL: string;
  private readonly COLLECTION_NAME: string;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {
    this.CHROMA_URL =
      this.configService.get<string>('CHROMA_URL') || 'http://localhost:8000';
    this.COLLECTION_NAME =
      this.configService.get<string>('CHROMA_COLLECTION') ||
      'ecommerce_knowledge_base';
  }

  /** 避免 ChromaDB getCollection 时加载 DefaultEmbeddingFunction 的占位实现 */
  private readonly dummyEmbeddingFunction = {
    generate: () => Promise.resolve<number[][]>([]),
  };

  private getVectorStore = async () => {
    const { host, port, ssl } = this.parseChromaUrl(this.CHROMA_URL);
    const client = new ChromaClient({ host, port, ssl });
    await client.getOrCreateCollection({
      name: this.COLLECTION_NAME,
      embeddingFunction: this
        .dummyEmbeddingFunction as unknown as import('chromadb').EmbeddingFunction,
    });
    return new Chroma(this.embeddingService.getEmbeddings(), {
      collectionName: this.COLLECTION_NAME,
      index: client,
    });
  };

  /**
   * 向量化并存入 ChromaDB（复用已有 collection，避免重复创建）
   */
  addDocuments = async (documents: Document[]): Promise<number> => {
    if (documents.length === 0) return 0;

    const vectorStore = await this.getVectorStore();
    await vectorStore.addDocuments(documents);

    this.logger.log(`知识库入库成功: ${documents.length} 个片段`);
    return documents.length;
  };

  /**
   * 带租户隔离的相似度检索
   */
  similaritySearch = async (
    query: string,
    filter?: Where,
    k = 3,
  ): Promise<Document[]> => {
    const vectorStore = await this.getVectorStore();
    return vectorStore.similaritySearch(query, k, filter);
  };

  /**
   * 构建租户过滤条件
   */
  buildTenantFilter = (
    tenantType: 'platform' | 'merchant',
    merchantId?: string,
  ): Where => {
    if (tenantType === 'platform') {
      return { tenantType: 'platform' as const };
    }
    return {
      $and: [
        { tenantType: 'merchant' as const },
        { merchantId: { $eq: merchantId! } },
      ],
    } as unknown as Where;
  };

  /**
   * 检索并拼接为 LLM 可读格式
   */
  retrieveContext = async (
    query: string,
    tenantType: 'platform' | 'merchant',
    merchantId?: string,
    k = 5,
  ): Promise<string> => {
    const filter = this.buildTenantFilter(tenantType, merchantId);
    const results = await this.similaritySearch(query, filter, k);

    if (results.length === 0) return '';

    return results
      .map((doc, i) => `[参考资料${i + 1}] ${doc.pageContent}`)
      .join('\n\n');
  };

  /**
   * 解析 ChromaDB URL 为 host/port/ssl
   */
  private parseChromaUrl = (url: string) => {
    const normalized = url.startsWith('http') ? url : `http://${url}`;
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : undefined,
      ssl: parsed.protocol === 'https:',
    };
  };

  /**
   * 根据过滤条件删除 ChromaDB 中的向量
   * 注意：ChromaDB delete 的 where 最多只允许 1 个顶层操作符，
   * 多条件时必须用 $and / $or 包裹。
   */
  deleteDocuments = async (filter: Where): Promise<void> => {
    try {
      const { host, port, ssl } = this.parseChromaUrl(this.CHROMA_URL);
      const client = new ChromaClient({ host, port, ssl });

      try {
        const collection = await client.getCollection({
          name: this.COLLECTION_NAME,
          embeddingFunction: this
            .dummyEmbeddingFunction as unknown as import('chromadb').EmbeddingFunction,
        });
        await collection.delete({ where: filter });
      } catch (err) {
        const msg = (err as Error).message || '';
        if (msg.includes('does not exist') || msg.includes('not found')) {
          this.logger.log('Collection 不存在，跳过删除');
          return;
        }
        throw err;
      }
      this.logger.log(`向量删除成功，过滤条件: ${JSON.stringify(filter)}`);
    } catch (error) {
      this.logger.error(`向量删除失败: ${(error as Error).message}`);
      throw error;
    }
  };
}
