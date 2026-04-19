import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMessage } from '@langchain/core/messages';
import type { RoleType } from './prompts/agent.prompt';
import { ecomAssistantPrompt, ROLE_CONFIG } from './prompts/agent.prompt';

@Injectable()
export class LangChainService {
  private model: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('BAISHAN_DASHSCOPE_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('BAISHAN_DASHSCOPE_BASE_URL'),
      },
      modelName: 'DeepSeek-R1-0528-Qwen3-8B',
      modelKwargs: {
        enable_thinking: true,
        streaming: true,
      },
    });
  }

  // 暴露模型实例
  getModel = () => this.model;

  // 模板构建消息列表
  // 有历史时不再注入 greeting，避免每轮重复插入"假"AI消息干扰上下文
  private buildMessages = async (
    prompt: string,
    role: RoleType = 'merchant',
    history: BaseMessage[] = [],
  ): Promise<BaseMessage[]> => {
    const config = ROLE_CONFIG[role];
    const hasHistory = history && history.length > 0;
    const messages = await ecomAssistantPrompt.formatMessages({
      role: config.role,
      duty: config.duty,
      rules: config.rules,
      greeting: hasHistory ? '' : config.greeting,
      history,
      question: prompt,
    });
    return messages;
  };

  // 简单的对话方法（无记忆）
  chat = async (prompt: string, role?: RoleType) => {
    const messages: BaseMessage[] = await this.buildMessages(prompt, role);
    const response = await this.model.invoke(messages);
    return response.content;
  };

  // 带历史对话的聊天 - AI 能记住之前的上下文
  // 外部传入历史（来自 Redis/MySQL 持久化层）
  chatWithHistory = async (
    prompt: string,
    role?: RoleType,
    externalHistory?: BaseMessage[],
  ) => {
    const history = externalHistory || [];
    const messages: BaseMessage[] = await this.buildMessages(
      prompt,
      role,
      history,
    );
    const response = await this.model.invoke(messages);
    return response.content;
  };

  // 流式对话方法 - 返回 async generator
  // 外部传入历史（来自 Redis/MySQL 持久化层）
  streamChat = async function* (
    this: LangChainService,
    prompt: string,
    role?: RoleType,
    externalHistory?: BaseMessage[],
  ) {
    const history = externalHistory || [];
    const messages: BaseMessage[] = await this.buildMessages(
      prompt,
      role,
      history,
    );
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
  };
}
