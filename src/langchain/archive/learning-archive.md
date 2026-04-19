# LangChain 学习过程代码归档

> 本文件保存了从学习 LangChain 过程中编写的实验性代码，已从生产代码中移除。
> 保留供后续观摩学习使用。最后归档时间：2026-04-19

---

## 一、Controller 旧接口

### 1. embed - 向量嵌入测试接口

```typescript
@Post('embed')
async embed(@Body() dto: ChatDto) {
  const vector = await this.embeddingService.embedQuery(dto.message);
  return resFormatMethod(0, 'success', {
    dimension: vector.length,
    preview: vector.slice(0, 5),
  });
}
```

### 2. few-shot - Few-Shot 对话接口

```typescript
@Post('few-shot')
async fewShot(@Body() dto: ChatDto) {
  const reply = await this.langChainService.fewShotChat(dto.message);
  return resFormatMethod(0, 'success', reply);
}
```

### 3. chat-with-history - 带历史对话（无持久化，用 MOCK_HISTORY）

```typescript
@Post('chat-with-history')
async chatWithHistory(
  @Body() dto: ChatDto,
  @Req() req: { user: JwtPayloadType },
) {
  const role = getRoleTypeByRoleId(req.user.roleId);
  const reply = await this.langChainService.chatWithHistory(
    dto.message,
    role,
  );
  return resFormatMethod(0, 'success', reply);
}
```

### 4. chain/translate - 翻译链（SSE 流式）

```typescript
@Public()
@Sse('chain/translate')
streamTranslateChain(
  @Query('text') text: string,
  @Query('inputLanguage') inputLanguage: string,
  @Query('outputLanguage') outputLanguage: string,
): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        for await (const chunk of this.langChainService.streamTranslateChain(
          text,
          inputLanguage || '中文',
          outputLanguage || '英语',
        )) {
          subscriber.next({
            data: JSON.stringify(chunk),
          } as MessageEvent);
        }
        subscriber.complete();
      } catch (e) {
        subscriber.error(e);
      }
    })();
  });
}
```

### 5. chain/product-naming - 产品命名链（SSE 流式）

```typescript
@Public()
@Sse('chain/product-naming')
streamProductNamingChain(
  @Query('product') product: string,
): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        for await (const chunk of this.langChainService.streamProductNamingChain(
          product,
        )) {
          subscriber.next({
            data: JSON.stringify(chunk),
          } as MessageEvent);
        }
        subscriber.complete();
      } catch (e) {
        subscriber.error(e);
      }
    })();
  });
}
```

### 6. chain/custom - 自定义函数链（模拟 RAG）

```typescript
@Public()
@Post('chain/custom')
async customChain(@Body() dto: ChatDto) {
  const reply = await this.langChainService.customChainChat(dto.message);
  return resFormatMethod(0, 'success', reply);
}
```

### 7. chat-memory - InMemory 会话记忆接口（旧版）

```typescript
@Public()
@Post('chat-memory')
async chatWithMemory(@Body() dto: ChatMemoryDto) {
  const reply = await this.langChainService.chatWithMemory(
    dto.message,
    dto.sessionId,
  );
  return resFormatMethod(0, 'success', reply);
}

@Public()
@Post('chat-memory/history')
async getChatHistory(@Query('sessionId') sessionId: string) {
  const history = await this.langChainService.getChatHistory(sessionId);
  return resFormatMethod(0, 'success', history);
}

@Public()
@Post('chat-memory/clear')
clearChatHistory(@Query('sessionId') sessionId: string) {
  this.langChainService.clearChatHistory(sessionId);
  return resFormatMethod(0, 'success', '已清除');
}
```

---

## 二、Service 旧方法

### 1. fewShotChat - Few-Shot 对话

```typescript
async fewShotChat(prompt: string) {
  const messages = await fewShotPrompt.formatMessages({
    ...FEW_SHOT_EXAMPLES,
    question: prompt,
  });
  const response = await this.model.invoke(messages);
  return response.content;
}
```

### 2. streamTranslateChain - 翻译链（流式）

```typescript
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
```

### 3. streamProductNamingChain - 产品命名链（流式）

```typescript
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
```

### 4. mockRetriever - 模拟知识库检索

```typescript
private mockRetriever = RunnableLambda.from((question: string) => {
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

  const matchedDocs: string[] = [];
  for (const [keyword, docs] of Object.entries(knowledgeBase)) {
    if (question.includes(keyword)) {
      matchedDocs.push(...docs);
    }
  }

  if (matchedDocs.length === 0) {
    return Object.values(knowledgeBase).flat();
  }

  return matchedDocs;
});
```

### 5. formatDocs - 格式化检索结果

```typescript
private formatDocs = RunnableLambda.from((docs: string[]) =>
  docs.join('\n---\n'),
);
```

### 6. customChainChat - 自定义函数链（模拟 RAG）

```typescript
async customChainChat(question: string) {
  const docs = await this.mockRetriever.invoke(question);
  const context = await this.formatDocs.invoke(docs);
  const messages = await ragPrompt.formatMessages({
    context,
    question,
  });
  const response = await this.model.invoke(messages);
  return response.content;
}
```

### 7. InMemory 会话记忆（旧版，已被 Redis+MySQL 持久化替代）

```typescript
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
async chatWithMemory(input: string, sessionId: string) {
  const chatPrompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      '你是一个友好的AI助手，请用简洁的中文回答用户的问题。',
    ),
    new MessagesPlaceholder('history'),
    HumanMessagePromptTemplate.fromTemplate('{input}'),
  ]);

  const chain = chatPrompt.pipe(this.model);

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
```

---

## 三、Prompt 模板（学习用）

### 1. fewShotPrompt - Few-Shot 提示模板

```typescript
export const fewShotPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    `你是一个电商数据分析助手。
用户会问你业务问题，你必须严格按照以下 JSON 格式回答：
{{"answer": "你的回答", "confidence": "高/中/低", "source": "数据来源"}}

以下是几个示例，请严格照此格式回答。`,
  ),
  HumanMessagePromptTemplate.fromTemplate('{example1_question}'),
  AIMessagePromptTemplate.fromTemplate('{example1_answer}'),
  HumanMessagePromptTemplate.fromTemplate('{example2_question}'),
  AIMessagePromptTemplate.fromTemplate('{example2_answer}'),
  HumanMessagePromptTemplate.fromTemplate('{example3_question}'),
  AIMessagePromptTemplate.fromTemplate('{example3_answer}'),
  HumanMessagePromptTemplate.fromTemplate('{question}'),
]);

export const FEW_SHOT_EXAMPLES = {
  example1_question: '上个月销售额多少？',
  example1_answer:
    '{"answer": "上月销售额为128.5万元，环比增长12.3%", "confidence": "高", "source": "月度销售报表"}',
  example2_question: '退货率高吗？',
  example2_answer:
    '{"answer": "本月退货率为5.2%，略高于行业平均4.8%", "confidence": "中", "source": "售后数据统计"}',
  example3_question: '哪个商品卖得最好？',
  example3_answer:
    '{"answer": "商品A本月销量3200件，为全平台TOP1", "confidence": "高", "source": "商品销量排行"}',
};
```

### 2. translatePrompt - 翻译链提示模板

```typescript
export const translatePrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    '你是一个专业的翻译助手，请将用户提供的文本从{input_language}翻译为{output_language}。只输出翻译结果，不要添加解释。',
  ),
  HumanMessagePromptTemplate.fromTemplate('{text}'),
]);
```

### 3. productNamingPrompt - 产品命名链提示模板

```typescript
export const productNamingPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    '你是一个品牌命名专家。根据产品描述，给出5个有创意的产品名称，用逗号分隔。',
  ),
  HumanMessagePromptTemplate.fromTemplate('产品描述：{product}'),
]);
```

### 4. ragPrompt - RAG 提示模板

```typescript
export const ragPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    `你是一个电商知识库助手。请根据以下参考资料回答用户的问题。

参考资料：
{context}

要求：
- 只基于参考资料回答，不要编造
- 如果参考资料中没有相关内容，回答"知识库中暂无相关信息"
- 回答要精简准确`,
  ),
  HumanMessagePromptTemplate.fromTemplate('{question}'),
]);
```

### 5. 输出解析器

```typescript
import { StringOutputParser } from '@langchain/core/output_parsers';
import { CommaSeparatedListOutputParser } from '@langchain/core/output_parsers';

export const stringOutputParser = new StringOutputParser();
export const listOutputParser = new CommaSeparatedListOutputParser();
```

---

## 四、MOCK_HISTORY - 模拟历史对话数据

```typescript
// src/langchain/prompts/history.data.ts
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

export const MOCK_HISTORY: BaseMessage[] = [
  new HumanMessage('商品审核要多久？'),
  new AIMessage('商品审核期为3个工作日之内，请耐心等待。'),
  new HumanMessage('可以加急审核吗？'),
  new AIMessage('目前不支持加急审核，但您可以在商品管理页面查看审核进度。'),
];
```

---

## 五、ChatMemoryDto - 旧版 InMemory 会话 DTO

```typescript
// src/langchain/dto/chat-memory.dto.ts 中的 ChatMemoryDto
export class ChatMemoryDto {
  @IsString({ message: '消息内容必须是字符串' })
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(2000, { message: '消息内容不能超过 2000 个字' })
  message: string;

  @IsString({ message: '会话ID必须是字符串' })
  @IsNotEmpty({ message: '会话ID不能为空' })
  sessionId: string;
}
```

---

## 六、归档说明

| 分类 | 接口/方法 | 归档原因 |
|------|-----------|----------|
| 旧接口 | `POST /ai/embed` | 向量嵌入测试，非业务接口 |
| 旧接口 | `POST /ai/few-shot` | 学习 Few-Shot 技巧用，非生产需求 |
| 旧接口 | `POST /ai/chat-with-history` | 无持久化历史，用 MOCK_HISTORY，已被 session 系列替代 |
| 旧接口 | `SSE /ai/chain/translate` | Chain 学习示例，非生产需求 |
| 旧接口 | `SSE /ai/chain/product-naming` | Chain 学习示例，非生产需求 |
| 旧接口 | `POST /ai/chain/custom` | 模拟 RAG，非真实向量库 |
| 旧接口 | `POST /ai/chat-memory` 系列 | InMemory 会话记忆，已被 Redis+MySQL 持久化替代 |
| Prompt | `fewShotPrompt` / `FEW_SHOT_EXAMPLES` | 配合 few-shot 接口 |
| Prompt | `translatePrompt` | 配合翻译链 |
| Prompt | `productNamingPrompt` | 配合产品命名链 |
| Prompt | `ragPrompt` | 配合模拟 RAG |
| 工具 | `stringOutputParser` / `listOutputParser` | 学习用解析器 |
| 数据 | `MOCK_HISTORY` | 模拟历史数据，生产环境从 Redis/MySQL 读取 |
| DTO | `ChatMemoryDto` | 旧版 InMemory 接口专用 |
| DTO | `TranslateChainDto` / `ProductNamingChainDto` | Chain 链式接口专用 DTO |

---

## 七、Chain DTO（旧版）

```typescript
// src/langchain/dto/chain.dto.ts
import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';

// 翻译链 DTO
export class TranslateChainDto {
  @IsNotEmpty({ message: '待翻译文本不能为空' })
  @IsString({ message: '待翻译文本必须是字符串' })
  @MaxLength(2000, { message: '待翻译文本不能超过 2000 个字' })
  text: string;

  @IsOptional()
  @IsString({ message: '源语言必须是字符串' })
  inputLanguage: string;

  @IsOptional()
  @IsString({ message: '目标语言必须是字符串' })
  outputLanguage: string;
}

// 产品命名链 DTO
export class ProductNamingChainDto {
  @IsString({ message: '产品描述必须是字符串' })
  @IsNotEmpty({ message: '产品描述不能为空' })
  @MaxLength(2000, { message: '产品描述不能超过 2000 个字' })
  product: string;
}
```
