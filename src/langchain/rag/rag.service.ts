import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { ChromaClient } from 'chromadb';
import type { Where } from 'chromadb';
import { Document } from '@langchain/core/documents';
import { EmbeddingService } from '../embedding.service';

interface RerankResult {
  index: number;
  document: string;
  relevance_score: number;
}

interface RerankResponse {
  model: string;
  results: RerankResult[];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  //  chroma 连接URL
  private readonly CHROMA_URL: string;

  // 库名
  private readonly COLLECTION_NAME: string;

  // 白山智算重排序配置
  private readonly API_KEY: string;
  private readonly BASE_URL: string;
  private readonly RERANK_SCORE_THRESHOLD: number;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {
    this.CHROMA_URL =
      this.configService.get<string>('CHROMA_URL') || 'http://localhost:8000';
    this.COLLECTION_NAME =
      this.configService.get<string>('CHROMA_COLLECTION') ||
      'ecommerce_knowledge_base';
    this.API_KEY =
      this.configService.get<string>('BAISHAN_DASHSCOPE_API_KEY') || '';
    this.BASE_URL =
      this.configService.get<string>('BAISHAN_DASHSCOPE_BASE_URL') ||
      'https://api.edgefn.net/v1';
    this.RERANK_SCORE_THRESHOLD =
      this.configService.get<number>('RERANK_SCORE_THRESHOLD') ?? 0.35;
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
    // 扩大召回数量，至少召回 20 个或 k*4 个候选，用于后续重排序
    const candidateK = Math.max(k * 4, 20);
    const candidates = await this.similaritySearch(query, filter, candidateK);

    if (candidates.length === 0) return '';

    // 若候选数大于目标数，则执行重排序；否则直接使用召回结果
    const topDocs =
      candidates.length > k
        ? await this.rerankDocuments(query, candidates, k)
        : candidates;

    return topDocs
      .map((doc, i) => `[参考资料${i + 1}] ${doc.pageContent}`)
      .join('\n\n');
  };

  /**
   * 调用白山智算重排序 API 对候选文档进行二次精排
   */
  rerankDocuments = async (
    query: string,
    documents: Document[],
    topN: number,
  ): Promise<Document[]> => {
    if (documents.length === 0) return [];
    if (!this.API_KEY) {
      this.logger.warn('BAISHAN_DASHSCOPE_API_KEY 未配置，跳过重排序');
      return documents.slice(0, topN);
    }

    try {
      const response = await fetch(`${this.BASE_URL}/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.API_KEY}`,
        },
        body: JSON.stringify({
          model: 'bge-reranker-v2-m3',
          query,
          documents: documents.map((d) => d.pageContent),
          top_n: topN,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Rerank API 请求失败: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as RerankResponse;
      const sortedDocs = data.results
        .filter((r) => r.relevance_score >= this.RERANK_SCORE_THRESHOLD)
        .map((r) => documents[r.index])
        .filter((d): d is Document => d != null);

      this.logger.log(
        `重排序完成，召回 ${documents.length} 个候选，过滤阈值 ${this.RERANK_SCORE_THRESHOLD}，返回 ${sortedDocs.length} 个结果`,
      );
      return sortedDocs;
    } catch (error) {
      this.logger.error(
        `重排序失败: ${(error as Error).message}，降级使用原始向量检索结果`,
      );
      return documents.slice(0, topN);
    }
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
