import { OpenAIEmbeddings } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;

  constructor(private readonly configService: ConfigService) {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('BAISHAN_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('BAISHAN_DASHSCOPE_BASE_URL'),
      },
      model: 'BAAI/bge-m3',
    });
  }

  getEmbeddings() {
    return this.embeddings;
  }

  // 对单条文本进行向量化
  async embedQuery(text: string) {
    return this.embeddings.embedQuery(text);
  }

  // 对多条文本进行向量化
  async embedDocuments(texts: string[]) {
    return this.embeddings.embedDocuments(texts);
  }
}
