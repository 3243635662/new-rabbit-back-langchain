import { Injectable, Logger } from '@nestjs/common';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { EmbeddingService } from '../../embedding.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class MerchantRagService {
  private readonly logger = new Logger(MerchantRagService.name);

  constructor(private readonly embeddingService: EmbeddingService) {}

  /**
   * 解析 CSV → 打商户标签 → 返回解析结果
   * 后续可接入 ChromaDB 向量库
   */
  ingestCsv = async (filePath: string, merchantId: string) => {
    await fs.access(filePath);

    const loader = new CSVLoader(filePath);
    const docs = await loader.load();

    if (docs.length === 0) {
      throw new Error('CSV 文件为空或格式无效');
    }

    // 3. 注入商户元数据（实现数据隔离的核心）
    docs.forEach((doc, idx) => {
      doc.metadata = {
        ...doc.metadata,
        merchantId,
        source: path.basename(filePath),
        rowIndex: idx,
      };
    });

    this.logger.log(`商户 ${merchantId} CSV 解析完成: ${docs.length} 条记录`);

    return {
      count: docs.length,
      preview: docs.slice(0, 2).map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
    };
  };

  /** 清理临时文件（可选） */
  cleanupTemp = async (filePath: string) => {
    await fs.unlink(filePath).catch(() => {});
  };
}
