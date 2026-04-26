# RAG 个性化商家 AI 助手

> 电商智能知识库系统 —— 让每位商家拥有专属 AI 顾问

---

## Slide 1: 封面

**标题**: RAG 个性化商家 AI 助手
**副标题**: 电商场景下的智能知识库问答系统
**视觉**: 深蓝色背景 + 简洁的 AI 对话气泡图标

---

## Slide 2: 项目背景

**标题**: 我们做了一个什么项目？

这是一个**电商平台的商家后台系统**，核心功能是让商家能够：

- **上传自己的经营文档**（财报、规则、产品资料等）
- **向 AI 提问**，获得基于真实文档的回答
- **像和真人顾问聊天一样**，随时查询店铺数据

**适用场景**:

- 商家问 "我的店铺上个月净利润是多少？"
- 商家问 "平台扣款规则是什么？"
- 商家上传产品手册，让 AI 帮客户解答

---

## Slide 3: 商家面临的三大痛点

**标题**: 为什么需要这个系统？

| 痛点         | 通俗解释                                        | 技术视角                 |
| ------------ | ----------------------------------------------- | ------------------------ |
| **规则复杂** | 平台政策、费用标准分散在多个文档，商家找不到    | 非结构化数据无法快速检索 |
| **数据孤岛** | 经营数据、财报信息沉睡在 Excel/PDF 里，无法对话 | 传统数据库不支持语义搜索 |
| **响应滞后** | 人工客服无法 7×24 小时即时解答                  | 缺乏自动化智能问答能力   |

> "我的店铺扣款规则是什么？" —— 同一个问题，客服每天要回答 100 遍

---

## Slide 4: 解决方案 —— RAG 是什么？

**标题**: RAG（检索增强生成）= 给 AI 配一个"资料库"

**通俗理解**:

```
普通 AI 聊天：你问什么，AI 凭记忆回答（可能胡说）
RAG 系统：   你问什么，AI 先去查资料，再基于资料回答（有据可查）
```

**核心流程**:

```
商家上传文档 → AI 解析入库 → 智能问答 → 持续学习
(PDF/CSV/Word)   (向量数据库)   (实时检索)   (自动更新)
```

**三大优势**:

- 知识库由商家自主控制，上传即生效
- 回答基于真实文档，杜绝 AI "幻觉"
- 支持多种格式：PDF、Word、Excel、CSV、TXT

---

## Slide 5: 技术栈全景

**标题**: 我们用到了哪些技术？

| 层级           | 技术                  | 作用                         | 类比                  |
| -------------- | --------------------- | ---------------------------- | --------------------- |
| **前端**       | Vue3 + SSE            | 实时流式对话界面             | 微信聊天窗口          |
| **后端框架**   | NestJS (Node.js)      | 接口服务、依赖注入、模块化   | 企业级 Spring Boot    |
| **AI 框架**    | LangChain             | 连接 LLM、向量库、提示词模板 | AI 应用的 "胶水"      |
| **大模型**     | OpenAI GPT-4o         | 理解问题、生成回答           | 大脑                  |
| **向量数据库** | ChromaDB              | 存储文档向量，支持语义搜索   | 智能图书馆索引        |
| **Embedding**  | OpenAI text-embedding | 把文字转成数字向量           | 翻译官（文字 → 数学） |
| **缓存/队列**  | Redis                 | 缓存对话历史、消息队列       | 高速便签本            |
| **任务队列**   | BullMQ                | 异步处理文档解析任务         | 工厂流水线            |
| **关系数据库** | MySQL + TypeORM       | 存储用户、订单、会话数据     | 档案柜                |
| **文件存储**   | 七牛云 OSS            | 存储原始文档                 | 云盘                  |

---

## Slide 6: 系统架构图

**标题**: 系统是怎么运转的？

```
┌─────────────────────────────────────────────┐
│              前端 (Vue3 + SSE)               │
│         实时流式对话 + 进度推送               │
└──────────────────┬──────────────────────────┘
                   │ HTTP / SSE
┌──────────────────▼──────────────────────────┐
│           NestJS 后端服务层                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ AI 对话   │ │ 知识库   │ │ 会话管理  │    │
│  │ Controller│ │ Controller│ │ Service  │    │
│  └────┬─────┘ └────┬─────┘ └──────────┘    │
│       │            │                        │
│  ┌────▼────────────▼────┐                   │
│  │    LangChain Service  │                   │
│  │  (OpenAI GPT-4o + Embedding)             │
│  └────┬─────────────────┘                   │
│       │                                      │
│  ┌────▼────┐  ┌──────────┐  ┌──────────┐    │
│  │ChromaDB │  │  Redis   │  │  MySQL   │    │
│  │向量存储  │  │ 缓存/队列 │  │ 持久化   │    │
│  └─────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────┘
```

**关键设计**: 商家 A 的知识库，商家 B 绝对看不到（租户隔离）

---

## Slide 7: RAG 核心流程详解

**标题**: 文档如何变成 AI 的知识？

**Step 1: 上传文档**

```typescript
// 前端直传七牛云，服务器零带宽消耗
GET /knowledge-base/presign?fileName=report.pdf
→ 返回 uploadToken + key → 前端直传云存储
```

**Step 2: 异步解析（BullMQ 队列）**

```typescript
@Processor('rag-queue')
class RagProcessor {
  async process(job: Job<RAGJobData>) {
    // 1. 从七牛下载文档
    // 2. 根据格式选择解析器（PDF/CSV/Word）
    // 3. 文本切分（chunkSize: 800 字）
    // 4. OpenAI Embedding 向量化
    // 5. ChromaDB 入库
    // 6. Redis SSE 推送进度给前端
  }
}
```

**Step 3: 智能检索**

```typescript
// 用户提问时，自动检索最相关的知识片段
const context = await merchantRagService.retrieveContext(
  query: "2025年净利润是多少？",
  merchantId: "merchant_001",  // 租户隔离
  topK: 5                      // 取最相关的 5 段
);
```

---

## Slide 8: 向量数据库与租户隔离

**标题**: ChromaDB —— AI 的"智能图书馆"

**什么是向量数据库？**

普通数据库查的是 "等于"、"包含"：

```sql
SELECT * FROM docs WHERE content LIKE '%净利润%'
-- 只能找到包含"净利润"三个字的文档
```

向量数据库查的是 "意思相近"：

```typescript
// "赚了多少钱" 和 "净利润" 意思一样，也能找到！
const results = await chroma.similaritySearch('今年赚了多少钱？', 5);
```

**我们的数据存储结构**:

```typescript
// 每个文档片段都带 "租户标签"
{
  pageContent: "净利润,139万元,161万元,178万元,199万元,677万元",
  metadata: {
    tenantType: 'merchant',      // 平台 / 商户隔离
    merchantId: 'merchant_001',  // 属于哪个商家
    sourceFile: '财报2025.csv',  // 来源文件
    rowIndex: 15                 // 第几行
  }
}
```

**检索时自动过滤**:

```typescript
// 只查当前商户的数据，其他商户的数据自动排除
{
  $and: [{ tenantType: 'merchant' }, { merchantId: { $eq: 'merchant_001' } }];
}
```

---

## Slide 9: AI 对话接入知识库

**标题**: 4 个对话接口全部接入 RAG

```typescript
@Controller('ai')
export class LangChainController {

  // ① 普通对话（一问一答）
  @Post('chat')
  async chat(@Body() dto: ChatDto) { ... }

  // ② 流式对话（逐字输出，体验更好）
  @Sse('streaming-chat')
  streamingChat(@Query('message') msg: string) { ... }

  // ③ 会话对话（带历史记忆，支持多轮）
  @Post('session/:id/chat')
  chatWithPersistentMemory(...) { ... }

  // ④ 会话流式对话（记忆 + 流式，最佳体验）
  @Sse('session/:id/streaming-chat')
  streamingChatWithPersistentMemory(...) { ... }
}
```

**智能触发**: 仅商户角色（roleId === 2）自动检索知识库，普通用户不走 RAG

---

## Slide 10: 提示词工程

**标题**: 怎么让 AI 乖乖基于知识库回答？

```typescript
export const ecomAssistantPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`
    你是一个电商{role}助手。
    你的职责是：{duty}
    回答风格：情感丰富，知识专业，严格基于知识库回答，不要编造数据。

    以下是你的业务规则：
    {rules}

    以下是从知识库检索到的参考资料，请优先基于这些资料回答。
    如果知识库中没有相关信息，请明确告知用户你没有该数据：
    {knowledgeBase}
  `),
  new MessagesPlaceholder('history'), // 历史对话
  HumanMessagePromptTemplate.fromTemplate('{question}'),
]);
```

**关键技巧**:

- `{knowledgeBase}` 动态注入检索结果
- `{history}` 保持多轮对话上下文
- 明确指令 "不要编造"，减少 AI 幻觉

---

## Slide 11: 实时进度推送

**标题**: 上传文档时，前端怎么知道处理到哪儿了？

**技术方案**: SSE（Server-Sent Events）—— 服务器主动向浏览器推送消息

```typescript
// 前端：建立长连接，实时接收进度
const es = new EventSource(`/knowledge-base/progress/${taskId}`);
es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  // { status: 'processing', progress: 70, message: '正在向量化...' }
  // { status: 'completed', progress: 100 }
  // { status: 'failed', failReason: '文档格式无效' }
};
```

**处理阶段**:

1. `downloading` (10%) — 从云存储下载
2. `parsing` (30%) — 文档解析
3. `cleaning` (35%) — 清理历史向量（去重）
4. `splitting` (50%) — 文本切分
5. `embedding` (70%) — OpenAI 向量化
6. `completed` (100%) — 入库完成

---

## Slide 12: 去重与更新机制

**标题**: 同名文件自动替换，不重复累积

```typescript
async ingestDocument(filePath, mimeType, merchantId, fileName) {
  // 1. 先删除该商户该文件名的旧数据
  await this.deleteDocumentsBySourceFile(merchantId, fileName);

  // 2. 给新数据打上 "身份标签"
  docs.forEach(doc => {
    doc.metadata = {
      tenantType: 'merchant',
      merchantId,
      sourceFile: fileName,  // 用于去重和溯源
    };
  });

  // 3. 切分 → 向量化 → 入库
  const chunks = await splitter.splitDocuments(docs);
  await this.ragService.addDocuments(chunks);
}
```

**业务价值**: 商家可以反复上传更新版文档，AI 知识库自动同步最新内容

---

## Slide 13: 演示效果

**标题**: 真实对话效果展示

**场景**: 商家上传 `financial_report_2025.csv` 后提问

**用户**: "2025年全年的净利润是多少？"

**AI 检索到的知识片段**:

```
[参考资料1] section,利润情况 / item,净利润 / 全年,677万元
[参考资料2] section,关键财务指标 / item,净利率 / 全年平均,11.2%
```

**AI 回答**:

> 根据您上传的 2025 年财务年报，全年净利润为 **677万元**，净利率为 **11.2%**。其中 Q4 净利润最高，达到 199万元。

---

## Slide 14: 未来扩展路线图

**标题**: 从知识库问答到智能经营分析

| 阶段     | 功能             | 通俗解释                         | 状态      |
| -------- | ---------------- | -------------------------------- | --------- |
| **V1.0** | RAG 知识库问答   | 上传文档，AI 回答                | ✅ 已上线 |
| **V1.1** | AI 导出财务报表  | 说一句话，AI 生成 PDF/Excel 报表 | 🚧 开发中 |
| **V1.2** | 经营数据异常预警 | AI 自动发现 "这个月利润异常下降" | 📋 规划中 |
| **V2.0** | 多模态支持       | 上传图片、图表，AI 也能读懂      | 📋 规划中 |

**AI 导出财务报表示意**:

```typescript
@Post('report/generate')
async generateReport(@Body() dto: ReportDto) {
  // 用户说："帮我生成 2025 年 Q4 的利润报表"
  const data = await ragService.retrieveContext("2025 Q4 利润");
  return langChainService.generateReport(data, 'pdf');
  // → 返回 PDF 下载链接
}
```

---

## Slide 15: 技术亮点总结

**标题**: 为什么选择这套方案？

| 维度           | 我们的选择                    | 优势                                                       |
| -------------- | ----------------------------- | ---------------------------------------------------------- |
| **后端框架**   | NestJS                        | 企业级 Node.js 框架，模块化、依赖注入、TypeScript 原生支持 |
| **AI 编排**    | LangChain                     | 统一封装 LLM、向量库、提示词，降低接入成本                 |
| **向量数据库** | ChromaDB                      | 开源轻量，支持元数据过滤，适合中小规模                     |
| **Embedding**  | OpenAI text-embedding-3-small | 1536 维、成本低、语义理解好                                |
| **大模型**     | GPT-4o                        | 多语言强、推理能力优秀、支持流式输出                       |
| **异步队列**   | BullMQ + Redis                | 可靠消息队列，支持延迟任务、进度追踪                       |
| **文件存储**   | 七牛云 OSS                    | 前端直传，零服务器带宽消耗                                 |
| **数据库**     | MySQL + TypeORM               | 成熟稳定，ORM 自动迁移                                     |

---

## Slide 16: 结语

**标题**: 让 AI 成为商家的超级员工

> "不是替代商家思考，而是让商家更快获得答案。"

**核心价值**: 每位商家都能拥有 7×24 小时在线的专属 AI 顾问

**联系方式 / 演示二维码**

---

## 附录：核心代码速查（供专业人员参考）

### 1. 文档解析入口

```typescript
// merchant-rag.service.ts
private loadDocument = async (filePath: string, mimeType: string) => {
  if (mimeType.includes('pdf')) return new PDFLoader(filePath).load();
  if (mimeType.includes('csv')) return new CSVLoader(filePath).load();
  if (mimeType.includes('docx')) return new DocxLoader(filePath).load();
  // ...
};
```

### 2. 文本切分策略

```typescript
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800, // 每段 800 字
  chunkOverlap: 100, // 重叠 100 字，避免断句
  separators: ['\n', '。', '；', '，', ''],
});
```

### 3. 相似度检索

```typescript
const results = await vectorStore.similaritySearch(
  '净利润是多少？', // 用户问题
  5, // 取 Top-5
  { tenantType: 'merchant', merchantId: { $eq: '1' } }, // 租户过滤
);
```

### 4. 租户隔离过滤

```typescript
buildTenantFilter = (tenantType, merchantId) => {
  return {
    $and: [{ tenantType: 'merchant' }, { merchantId: { $eq: merchantId } }],
  };
};
```
