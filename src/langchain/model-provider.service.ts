import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ModelProviderService {
  private readonly model: ChatOpenAI;
  private readonly visionModel: ChatOpenAI;
  private readonly reportModel: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    // 默认文本模型 (GLM / DashScope, 例如 glm-4.5-air)
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('GLM_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('GLM_DASHSCOPE_BASE_URL'),
      },
      modelName: this.configService.get<string>('MODEL_NAME') || 'glm-4.5-air',
      streaming: true,
      modelKwargs: {
        thinking: {
          type: 'enabled',
        },
      },
    });

    // 视觉模型 (Qwen)
    this.visionModel = new ChatOpenAI({
      apiKey: this.configService.get<string>('QINIU_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('QINIU_DASHSCOPE_BASE_URL'),
      },
      modelName:
        this.configService.get<string>('VISION_MODEL_NAME') ||
        'qwen/qwen3.5-35b-a3b',
      streaming: false,
      modelKwargs: {
        thinking: {
          type: 'enabled',
        },
      },
    });

    // 财务报告专业模型
    this.reportModel = new ChatOpenAI({
      apiKey: this.configService.get<string>('BAISHAN_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('BAISHAN_DASHSCOPE_BASE_URL'),
      },
      modelName: this.configService.get<string>('REPORT_MODEL_NAME'),
      streaming: false,
      modelKwargs: {
        thinking: {
          type: 'enabled',
        },
      },
    });
  }

  getModel = () => this.model;

  getVisionModel = () => this.visionModel;

  getReportModel = () => this.reportModel;
}
