import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
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
  ragPrompt,
} from './prompts/agent.prompt';
import { RunnableLambda } from '@langchain/core/runnables';
import {
  RunnableWithMessageHistory,
  type RunnableConfig,
} from '@langchain/core/runnables';
import {
  InMemoryChatMessageHistory,
  type BaseChatMessageHistory,
} from '@langchain/core/chat_history';
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
  // 有历史时不再注入 greeting，避免每轮重复插入"假"AI消息干扰上下文
  private async buildMessages(
    prompt: string,
    role: RoleType = 'merchant',
    history: BaseMessage[] = [],
  ): Promise<BaseMessage[]> {
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
  }

  // 简单的对话方法
  async chat(prompt: string, role?: RoleType) {
    const messages: BaseMessage[] = await this.buildMessages(prompt, role);
    const response = await this.model.invoke(messages);
    return response.content;
  }

  // 带历史对话的聊天 - AI 能记住之前的上下文
  // 外部历史优先，未传则用 MOCK_HISTORY
  async chatWithHistory(
    prompt: string,
    role?: RoleType,
    externalHistory?: BaseMessage[],
  ) {
    const history =
      externalHistory && externalHistory.length > 0
        ? externalHistory
        : MOCK_HISTORY;
    const messages: BaseMessage[] = await this.buildMessages(
      prompt,
      role,
      history,
    );
    const response = await this.model.invoke(messages);
    return response.content;
  }

  // 流式对话方法 - 返回 async generator  *:异步生成器函数
  // 外部历史优先，未传则无历史
  async *streamChat(
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

  // ========== 自定义函数链（RunnableLambda）==========

  // 模拟知识库检索 - 实际 RAG 中这里是查向量数据库
  // RunnableLambda.from() 把任意函数包装成 Runnable，可以接入 .pipe() 链
  private mockRetriever = RunnableLambda.from((question: string) => {
    // 模拟知识库文档
    const knowledgeBase: Record<string, string[]> = {
      退款: [
        '退款政策：用户在签收后7天内可申请退款，审核通过后24小时内原路退回。',
        '退款流程：用户提交退款申请 → 商家审核（48小时内）→ 平台打款 → 用户到账。',
      ],
      审核: [
        '商品审核：商家提交商品后，平台在3个工作日内完成审核。',
        '审核不通过常见原因：商品图片不清晰、描述与实际不符、价格异常。',
      ],
      提现: [
        '商家提现：T+1到账，节假日顺延。最低提现金额100元。',
        '提现手续费：每笔提现收取0.6%的手续费，最低1元。',
      ],
    };

    // 简单关键词匹配检索
    const matchedDocs: string[] = [];
    for (const [keyword, docs] of Object.entries(knowledgeBase)) {
      if (question.includes(keyword)) {
        matchedDocs.push(...docs);
      }
    }

    // 没匹配到就返回全部（模拟兜底）
    if (matchedDocs.length === 0) {
      return Object.values(knowledgeBase).flat();
    }

    return matchedDocs;
  });

  // 格式化检索结果 - 把文档数组拼成字符串，才能塞进提示词的 {context}
  private formatDocs = RunnableLambda.from((docs: string[]) =>
    docs.join('\n---\n'),
  );

  // 自定义函数链：question → 检索文档 → 格式化 → 塞进提示词 → LLM 回答
  // 这就是 RAG 的核心链路，只不过这里用模拟数据，后面换真实向量库即可
  async customChainChat(question: string) {
    // 第一步：检索相关文档
    const docs = await this.mockRetriever.invoke(question);

    // 第二步：格式化文档为字符串
    const context = await this.formatDocs.invoke(docs);

    // 第三步：填入提示词 + LLM 生成
    const messages = await ragPrompt.formatMessages({
      context,
      question,
    });
    const response = await this.model.invoke(messages);
    return response.content;
  }

  // ========== 会话记忆（InMemory）==========

  // 内存中的会话存储：每个 sessionId 对应一段独立的对话历史
  // 重启服务后丢失，适合开发测试；生产环境换成 Redis/DB 持久化
  private chatHistories: Record<string, InMemoryChatMessageHistory> = {};

  // 根据 sessionId 获取或创建会话历史
  private getMessageHistory = (sessionId: string): BaseChatMessageHistory => {
    if (!this.chatHistories[sessionId]) {
      this.chatHistories[sessionId] = new InMemoryChatMessageHistory();
    }
    return this.chatHistories[sessionId];
  };

  // 带会话记忆的聊天 - AI 能记住同一 sessionId 下的多轮对话
  // 不同 sessionId 的对话互不干扰
  async chatWithMemory(input: string, sessionId: string) {
    // 简单通用聊天模板：系统提示 + 历史记录 + 用户输入
    const chatPrompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        '你是一个友好的AI助手，请用简洁的中文回答用户的问题。',
      ),
      new MessagesPlaceholder('history'),
      HumanMessagePromptTemplate.fromTemplate('{input}'),
    ]);

    const chain = chatPrompt.pipe(this.model);

    // 用 RunnableWithMessageHistory 包装，自动管理历史存取
    const chainWithHistory = new RunnableWithMessageHistory({
      runnable: chain,
      getMessageHistory: this.getMessageHistory,
      inputMessagesKey: 'input',
      historyMessagesKey: 'history',
    });

    const response = await chainWithHistory.invoke({ input }, {
      configurable: { sessionId },
    } as RunnableConfig);
    return response.content;
  }

  // 获取某个会话的历史记录
  async getChatHistory(sessionId: string) {
    const history = this.chatHistories[sessionId];
    if (!history) return [];
    const messages = await history.getMessages();
    return messages.map((msg) => ({
      role:
        msg instanceof HumanMessage
          ? 'human'
          : msg instanceof AIMessage
            ? 'ai'
            : 'system',
      content: msg.content,
    }));
  }

  // 清除某个会话的历史记录
  clearChatHistory(sessionId: string) {
    delete this.chatHistories[sessionId];
  }
}
