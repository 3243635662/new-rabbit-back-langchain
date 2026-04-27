import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { ChromaClient } from 'chromadb';
import type { Where } from 'chromadb';
import { Document } from '@langchain/core/documents';
import { EmbeddingService } from '../embedding.service';
import { RetrievalTrace } from '../../types/rag.type';

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
  private readonly CHROMA_URL: string;
  private readonly COLLECTION_NAME: string;
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
      Number(this.configService.get('RERANK_SCORE_THRESHOLD')) || 0.35;
  }

  /** 避免 ChromaDB getCollection 时加载 DefaultEmbeddingFunction 的占位实现 */
  private readonly dummyEmbeddingFunction = {
    generate: () => Promise.resolve<number[][]>([]),
  };

  private vectorStorePromise?: Promise<Chroma>;

  private createVectorStore = async (): Promise<Chroma> => {
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

  private getVectorStore = async (): Promise<Chroma> => {
    if (!this.vectorStorePromise) {
      this.vectorStorePromise = this.createVectorStore();
    }
    return this.vectorStorePromise;
  };

  /**
   * 向量化并存入 ChromaDB（分批写入，避免大文件一次性塞爆）
   */
  addDocuments = async (documents: Document[]): Promise<number> => {
    if (documents.length === 0) return 0;

    const vectorStore = await this.getVectorStore();
    const batchSize = 100;

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      await vectorStore.addDocuments(batch);
    }

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
   * 带租户隔离的相似度检索（返回分数）
   */
  similaritySearchWithScore = async (
    query: string,
    filter?: Where,
    k = 3,
  ): Promise<[Document, number][]> => {
    const vectorStore = await this.getVectorStore();
    return vectorStore.similaritySearchWithScore(query, k, filter);
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
   * 检索并拼接为 LLM 可读格式。
   * 区分"未检索到候选"与"候选相关性低于阈值"两种状态，
   * 后者会返回显式提示语，引导模型回答"知识库中没有足够依据"。
   */
  retrieveContext = async (
    query: string,
    tenantType: 'platform' | 'merchant',
    merchantId?: string,
    k = 5,
  ): Promise<string> => {
    const { context } = await this.retrieveContextWithTrace(
      query,
      tenantType,
      merchantId,
      k,
    );
    return context;
  };

  /**
   * 检索并返回上下文 + 可观测 trace。
   * context 拼接包含正文和来源元信息，便于 LLM 溯源和调试。
   */
  retrieveContextWithTrace = async (
    query: string,
    tenantType: 'platform' | 'merchant',
    merchantId?: string,
    k = 5,
  ): Promise<{ context: string; trace: RetrievalTrace }> => {
    const filter = this.buildTenantFilter(tenantType, merchantId);
    const candidateK = Math.max(k * 4, 20);

    const candidatesWithScore = await this.similaritySearchWithScore(
      query,
      filter,
      candidateK,
    );
    const candidates = candidatesWithScore.map(([doc]) => doc);
    const scoreMap = new Map(
      candidatesWithScore.map(([doc, score]) => [doc, score]),
    );

    const trace: RetrievalTrace = {
      query,
      retrievedCount: candidates.length,
      rerankedCount: 0,
      finalContextCount: 0,
      finalDocs: [],
    };

    if (candidates.length === 0) {
      return { context: '', trace };
    }

    let topDocs: Document[] = [];
    let rerankScores: number[] = [];

    if (candidates.length > k) {
      const result = await this.rerankDocuments(query, candidates, k);
      trace.rerankedCount = candidates.length;

      if (result.isLowRelevance) {
        return {
          context:
            '检索到的参考资料相关性均低于有效阈值，当前知识库中没有足够依据。',
          trace,
        };
      }

      topDocs = result.documents;
      rerankScores = result.rerankScores;
    } else {
      topDocs = candidates;
    }

    trace.finalContextCount = topDocs.length;
    trace.finalDocs = topDocs.map((doc, index) => {
      const meta = (doc.metadata || {}) as Record<string, unknown>;

      return {
        fileName:
          (meta.sourceFile as string) || (meta.source as string) || 'unknown',
        documentType: meta.documentType as string | undefined,
        score: scoreMap.get(doc) ?? 0,
        rerankScore: rerankScores[index],
        chunkIndex: typeof meta.chunkIndex === 'number' ? meta.chunkIndex : -1,
        page: typeof meta.page === 'number' ? meta.page : undefined,
        sheetName:
          typeof meta.sheetName === 'string' ? meta.sheetName : undefined,
        rowIndex: typeof meta.rowIndex === 'number' ? meta.rowIndex : undefined,
        section: typeof meta.section === 'string' ? meta.section : undefined,
        contentHash:
          typeof meta.contentHash === 'string' ? meta.contentHash : undefined,
        contentPreview: doc.pageContent.slice(0, 200),
      };
    });

    const context = topDocs
      .map((doc, index) => {
        const meta = (doc.metadata || {}) as Record<string, unknown>;
        const sourceFile =
          (meta.sourceFile as string) || (meta.source as string) || 'unknown';
        const parts: string[] = [];

        parts.push(`[参考资料 ${index + 1}]`);
        parts.push(`来源文件：${sourceFile}`);

        if (meta.documentType != null) {
          parts.push(
            `文件类型：${String(meta.documentType as string | number | boolean)}`,
          );
        }

        if (meta.page != null) {
          parts.push(`页码：${String(meta.page as string | number | boolean)}`);
        }

        if (meta.sheetName != null) {
          parts.push(
            `工作表：${String(meta.sheetName as string | number | boolean)}`,
          );
        }

        if (meta.rowIndex != null) {
          parts.push(
            `行号：${String(meta.rowIndex as string | number | boolean)}`,
          );
        }

        if (meta.section != null) {
          parts.push(
            `模块：${String(meta.section as string | number | boolean)}`,
          );
        }

        if (meta.chunkIndex != null) {
          parts.push(
            `片段序号：${String(meta.chunkIndex as string | number | boolean)}`,
          );
        }

        parts.push('内容：');
        parts.push(doc.pageContent);

        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    return { context, trace };
  };

  /**
   * 调用白山智算重排序 API 对候选文档进行二次精排。
   * 返回文档列表、低相关性标志及重排序分数，用于 trace。
   */
  rerankDocuments = async (
    query: string,
    documents: Document[],
    topN: number,
  ): Promise<{
    documents: Document[];
    isLowRelevance: boolean;
    rerankScores: number[];
  }> => {
    if (documents.length === 0)
      return { documents: [], isLowRelevance: false, rerankScores: [] };
    if (!this.API_KEY) {
      this.logger.warn('BAISHAN_DASHSCOPE_API_KEY 未配置，跳过重排序');
      return {
        documents: documents.slice(0, topN),
        isLowRelevance: false,
        rerankScores: [],
      };
    }

    try {
      const url = this.BASE_URL.replace(/\/$/, '') + '/rerank';
      const response = await fetch(url, {
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
      const filtered = data.results.filter(
        (r) => r.relevance_score >= this.RERANK_SCORE_THRESHOLD,
      );

      if (filtered.length === 0) {
        this.logger.warn(
          `重排序后所有文档相关性均低于阈值 ${this.RERANK_SCORE_THRESHOLD}，判定为低相关性`,
        );
        return { documents: [], isLowRelevance: true, rerankScores: [] };
      }

      const sortedDocs = filtered
        .map((r) => documents[r.index])
        .filter((d): d is Document => d != null);
      const rerankScores = filtered.map((r) => r.relevance_score);

      this.logger.log(
        `重排序完成，召回 ${documents.length} 个候选，过滤阈值 ${this.RERANK_SCORE_THRESHOLD}，返回 ${sortedDocs.length} 个结果`,
      );
      return {
        documents: sortedDocs,
        isLowRelevance: false,
        rerankScores,
      };
    } catch (error) {
      this.logger.error(
        `重排序失败: ${(error as Error).message}，降级使用原始向量检索结果`,
      );
      return {
        documents: documents.slice(0, topN),
        isLowRelevance: false,
        rerankScores: [],
      };
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
