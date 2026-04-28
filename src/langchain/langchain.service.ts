import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LangChainService {
  private model: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('GLM_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('GLM_DASHSCOPE_BASE_URL'),
      },
      modelName: this.configService.get<string>('MODEL_NAME') || '',
      streaming: true,
      modelKwargs: {
        enable_thinking: true,
      },
    });
  }

  getModel = () => this.model;
}
