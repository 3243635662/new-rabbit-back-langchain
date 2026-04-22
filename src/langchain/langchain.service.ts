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
    knowledgeBase = '',
  ): Promise<BaseMessage[]> => {
    const config = ROLE_CONFIG[role];
    const hasHistory = history && history.length > 0;
    const kbText = knowledgeBase
      ? `以下是从商户知识库检索到的参考资料，请基于这些资料回答用户问题（如果知识库中没有直接答案，请结合你的专业知识回答，不要编造数据）：\n\n${knowledgeBase}`
      : '';
    const messages = await ecomAssistantPrompt.formatMessages({
      role: config.role,
      duty: config.duty,
      rules: config.rules,
      greeting: hasHistory ? '' : config.greeting,
      history,
      question: prompt,
      knowledgeBase: kbText,
    });
    return messages;
  };

  // 简单的对话方法（无记忆）
  chat = async (prompt: string, role?: RoleType, knowledgeBase?: string) => {
    const messages: BaseMessage[] = await this.buildMessages(
      prompt,
      role,
      [],
      knowledgeBase,
    );
    const response = await this.model.invoke(messages);
    return response.content;
  };

  // 带历史对话的聊天 - AI 能记住之前的上下文
  // 外部传入历史（来自 Redis/MySQL 持久化层）
  chatWithHistory = async (
    prompt: string,
    role?: RoleType,
    externalHistory?: BaseMessage[],
    knowledgeBase?: string,
  ) => {
    const history = externalHistory || [];
    const messages: BaseMessage[] = await this.buildMessages(
      prompt,
      role,
      history,
      knowledgeBase,
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
    knowledgeBase?: string,
  ) {
    const history = externalHistory || [];
    const messages: BaseMessage[] = await this.buildMessages(
      prompt,
      role,
      history,
      knowledgeBase,
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
