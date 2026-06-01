import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ModelProviderService {
  private readonly model: ChatOpenAI;
  private readonly visionModel: ChatOpenAI;
  private readonly reportModel: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    // 默认文本模型 (DeepSeek-R1, 支持思考过程)
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('BAISHAN_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('BAISHAN_DASHSCOPE_BASE_URL'),
      },
      modelName: this.configService.get<string>('MODEL_NAME'),
      streaming: true,
      modelKwargs: {
        reasoning: true,
      },
    });

    // 视觉模型 (Qwen)
    this.visionModel = new ChatOpenAI({
      apiKey: this.configService.get<string>('QINIU_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('QINIU_DASHSCOPE_BASE_URL'),
        timeout: 60_000,
      },
      modelName: this.configService.get<string>('VISION_MODEL_NAME'),
      streaming: false,
    });

    // 财务报告专业模型
    this.reportModel = new ChatOpenAI({
      apiKey: this.configService.get<string>('ALI_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('ALI_DASHSCOPE_BASE_URL'),
        timeout: 1200_000,
      },
      modelName: this.configService.get<string>('REPORT_MODEL_NAME'),
      streaming: false,
    });
  }

  getModel = () => this.model;

  getVisionModel = () => this.visionModel;

  getReportModel = () => this.reportModel;
}
