import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ModelProviderService {
  private readonly logger = new Logger(ModelProviderService.name);
  private readonly model: ChatOpenAI;
  private readonly strongVisionModel: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    // 默认模型 (GLM / DashScope)
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('GLM_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('GLM_DASHSCOPE_BASE_URL'),
      },
      modelName: this.configService.get<string>('MODEL_NAME') || 'glm-4-flash',
      streaming: true,
      modelKwargs: {
        enable_thinking: true,
      },
    });

    // 强力模型 (Qiniu Qwen)
    this.strongVisionModel = new ChatOpenAI({
      apiKey: this.configService.get<string>('QINIU_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('QINIU_DASHSCOPE_BASE_URL'),
      },
      modelName: 'qwen/qwen3.5-35b-a3b',
      streaming: false,
    });
  }

  getModel = () => this.model;

  getVisionModel = () => this.model;

  getStrongVisionModel = () => this.strongVisionModel;
}
