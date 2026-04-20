import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chroma } from '@langchain/community/vectorstores/chroma';
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

  /**
   * 向量化并存入 ChromaDB
   */
  addDocuments = async (documents: Document[]): Promise<number> => {
    if (documents.length === 0) return 0;

    await Chroma.fromDocuments(
      documents,
      this.embeddingService.getEmbeddings(),
      {
        collectionName: this.COLLECTION_NAME,
        url: this.CHROMA_URL,
      },
    );

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
    const vectorStore = new Chroma(this.embeddingService.getEmbeddings(), {
      collectionName: this.COLLECTION_NAME,
      url: this.CHROMA_URL,
    });

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
      tenantType: 'merchant' as const,
      merchantId: { $eq: merchantId! },
    };
  };

  /**
   * 检索并拼接为 LLM 可读格式
   */
  retrieveContext = async (
    query: string,
    tenantType: 'platform' | 'merchant',
    merchantId?: string,
    k = 3,
  ): Promise<string> => {
    const filter = this.buildTenantFilter(tenantType, merchantId);
    const results = await this.similaritySearch(query, filter, k);

    if (results.length === 0) return '';

    return results
      .map((doc, i) => `[参考资料${i + 1}] ${doc.pageContent}`)
      .join('\n\n');
  };
}
