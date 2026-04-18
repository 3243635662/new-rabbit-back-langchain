import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMessage } from '@langchain/core/messages';
import type { RoleType } from './prompts/agent.prompt';
import {
  ecomAssistantPrompt,
  ROLE_CONFIG,
  fewShotPrompt,
  FEW_SHOT_EXAMPLES,
  translatePrompt,
  productNamingPrompt,
  stringOutputParser,
  listOutputParser,
} from './prompts/agent.prompt';
import { MOCK_HISTORY } from './prompts/history.data';

@Injectable()
export class LangChainService {
  private model: ChatOpenAI;
  constructor(private readonly configService: ConfigService) {
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('BAISHAN_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('BAISHAN_DASHSCOPE_BASE_URL'),
      },
      // modelName: 'MiniMax-M2.5',
      modelName: 'DeepSeek-R1-0528-Qwen3-8B',
      modelKwargs: {
        enable_thinking: true,
        streaming: true,
      },
    });
  }

  // 暴露模型实例
  getModel() {
    return this.model;
  }

  // 模板构建消息列表
  private async buildMessages(
    prompt: string,
    role: RoleType = 'merchant',
    history: BaseMessage[] = [],
  ): Promise<BaseMessage[]> {
    const config = ROLE_CONFIG[role];
    const messages = await ecomAssistantPrompt.formatMessages({
      role: config.role,
      duty: config.duty,
      rules: config.rules,
      greeting: config.greeting,
      history,
      question: prompt,
    });
    return messages;
  }

  // 简单的对话方法
  async chat(prompt: string, role?: RoleType) {
    const messages: BaseMessage[] = await this.buildMessages(prompt, role);
    const response = await this.model.invoke(messages);
    return response.content;
  }

  // 带历史对话的聊天 - AI 能记住之前的上下文
  async chatWithHistory(prompt: string, role?: RoleType) {
    const messages: BaseMessage[] = await this.buildMessages(
      prompt,
      role,
      MOCK_HISTORY,
    );
    const response = await this.model.invoke(messages);
    return response.content;
  }

  // 流式对话方法 - 返回 async generator  *:异步生成器函数
  async *streamChat(prompt: string, role?: RoleType) {
    const messages: BaseMessage[] = await this.buildMessages(prompt, role);
    const stream = await this.model.stream(messages);

    for await (const chunk of stream) {
      const content = chunk.content as string;
      const reasoning = chunk.additional_kwargs?.reasoning_content as
        | string
        | undefined;

      if (content || reasoning) {
        yield { content: content || '', reasoning: reasoning || '' };
      }
    }
  }

  // Few-Shot 对话 - AI 会模仿示例的格式回答
  async fewShotChat(prompt: string) {
    const messages = await fewShotPrompt.formatMessages({
      ...FEW_SHOT_EXAMPLES,
      question: prompt,
    });
    const response = await this.model.invoke(messages);
    return response.content;
  }

  // ========== Chain 链式调用 ==========

  // 翻译链（流式）：prompt.pipe(model)
  // 不用 StringOutputParser，因为 DeepSeek-R1 思考阶段 content 为空、思考内容在 reasoning_content 里
  // 需要手动提取 content + reasoning，和 streamChat 保持一致
  async *streamTranslateChain(
    text: string,
    inputLanguage: string,
    outputLanguage: string,
  ) {
    const chain = translatePrompt.pipe(this.model);
    const stream = await chain.stream({
      text,
      input_language: inputLanguage,
      output_language: outputLanguage,
    });

    for await (const chunk of stream) {
      const content = chunk.content as string;
      const reasoning = chunk.additional_kwargs?.reasoning_content as
        | string
        | undefined;

      if (content || reasoning) {
        yield { content: content || '', reasoning: reasoning || '' };
      }
    }
  }

  // 产品命名链（流式）：prompt.pipe(model)
  // 同理不走 StringOutputParser，手动处理思考内容
  async *streamProductNamingChain(product: string) {
    const chain = productNamingPrompt.pipe(this.model);
    const stream = await chain.stream({ product });

    for await (const chunk of stream) {
      const content = chunk.content as string;
      const reasoning = chunk.additional_kwargs?.reasoning_content as
        | string
        | undefined;

      if (content || reasoning) {
        yield { content: content || '', reasoning: reasoning || '' };
      }
    }
  }
}
