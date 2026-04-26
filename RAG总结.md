```json
curl -X POST "https://open.bigmodel.cn/api/paas/v4/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer 3d4ea8abec1441bdaefc8990cf115d6d.CcotkugYJSZNL8pA" -d "{\"model\":\"glm-4.7-flash\",\"messages\":[{\"role\":\"user\",\"content\":\"你好，请简单介绍一下自己\"}]}"
```



# RAG 知识库 AI 对话系统 — 架构与开发总结

> 项目：电商商家后台 RAG 个性化 AI 助手
> 技术栈：NestJS + LangChain + ChromaDB + OpenAI + 白山智算 + Redis + BullMQ + MySQL

---

## 一、项目背景与目标

### 1.1 解决的问题
- 商家每天重复问同样的问题（扣款规则、提现周期等）
- 经营数据、财报信息沉睡在 PDF/Excel 里，无法对话查询
- 人工客服无法 7×24 小时即时解答

### 1.2 核心目标
让每位商家拥有**专属 AI 顾问**：上传文档 → AI 学习 → 智能问答

---

## 二、RAG 是什么？（核心概念）

### 2.1 通俗理解
```
普通 AI 聊天：你问什么，AI 凭记忆回答（可能胡说 = 幻觉）
RAG 系统：   你问什么，AI 先去查资料，再基于资料回答（有据可查）
```

### 2.2 RAG 核心流程
```
文档上传 → 文本解析 → 文本切分 → Embedding 向量化 → 存入向量库
→ 用户提问 → 向量相似度检索（扩大召回） → Rerank 重排序（精排） → 取 Top-K
→ 注入 Prompt → LLM 生成回答
```

### 2.3 为什么用 RAG 而不是微调模型？
| 对比 | RAG | 微调 |
|------|-----|------|
| 成本 | 低（直接上传文档） | 高（需要训练） |
| 时效性 | 实时（上传即生效） | 慢（需重新训练） |
| 准确性 | 基于真实文档，可溯源 | 可能遗忘或混淆 |
| 适用场景 | 频繁更新的知识库 | 固定领域的深度能力 |

---

## 三、系统架构全景

### 3.1 分层架构
```
┌─────────────────────────────────────────────┐
│  前端层 (Vue3)                               │
│  - 文件上传（直传七牛云）                      │
│  - AI 对话界面（支持流式输出）                 │
│  - SSE 进度推送（实时看解析进度）              │
└──────────────────┬──────────────────────────┘
                   │ HTTP / SSE
┌──────────────────▼──────────────────────────┐
│  接入层 (NestJS Controllers)                 │
│  - KnowledgeBaseController（知识库上传/删除）  │
│  - LangChainController（AI 对话 4 个接口）     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  业务层 (NestJS Services)                    │
│  - KnowledgeBaseService（上传流程编排）        │
│  - MerchantRagService（文档解析 + 入库）       │
│  - RagService（向量检索 + Rerank 重排序）      │
│  - LangChainService（LLM 调用 + Prompt 构建）  │
│  - ChatService（会话历史管理）                 │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  AI 编排层 (LangChain)                       │
│  - ChatPromptTemplate（提示词模板）            │
│  - OpenAI Embeddings（向量化）                │
│  - Chroma VectorStore（向量存储）              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  基础设施层                                   │
│  - ChromaDB（向量数据库）                      │
│  - 白山智算（Rerank 重排序模型服务）            │
│  - Redis（缓存 + 消息队列 + SSE 发布）          │
│  - BullMQ（异步任务队列）                      │
│  - MySQL + TypeORM（业务数据持久化）            │
│  - 七牛云 OSS（文件存储）                      │
└─────────────────────────────────────────────┘
```

---

## 四、核心模块详解

### 4.1 知识库上传流程

#### 4.1.1 为什么用前端直传？
- 服务器不接触文件内容，**零内存/带宽消耗**
- 大文件上传不会阻塞 NestJS 主线程

#### 4.1.2 上传流程
```
1. 前端请求 presign URL
   GET /knowledge-base/presign?fileName=report.pdf
   → 返回 { uploadToken, key, domain }

2. 前端直传七牛云
   前端 → 七牛云（绕过服务器）

3. 前端通知服务器"上传完成"
   POST /knowledge-base/confirm
   → 服务器将任务加入 BullMQ 队列

4. Worker 异步处理（BullMQ）
   - 从七牛下载 → 解析文档 → 文本切分 → Embedding → ChromaDB 入库
   - 每步通过 Redis SSE 推送进度给前端
```

#### 4.1.3 BullMQ 队列设计
```typescript
// 生产者（KnowledgeBaseService）
await this.ragQueue.add('process', {
  filePath,     // 七牛云文件路径
  mimeType,     // 文件类型
  merchantId,   // 商户 ID（租户隔离）
  fileName,     // 原始文件名（用于去重）
  taskId,       // 任务 ID（前端追踪进度）
});

// 消费者（RagProcessor）
@Processor('rag-queue')
class RagProcessor {
  async process(job: Job<RAGJobData>) {
    // 1. 下载（10%）
    // 2. 解析（30%）
    // 3. 清理历史向量（35%）- 同名文件去重
    // 4. 文本切分（50%）
    // 5. Embedding 向量化（70%）
    // 6. ChromaDB 入库（100%）
  }
}
```

### 4.2 文档解析模块（MerchantRagService）

#### 4.2.1 支持的格式
| 格式 | Loader | 注意事项 |
|------|--------|---------|
| PDF | `PDFLoader` | 依赖 `pdf-parse@^1`，metadata 中有嵌套 `pdf` 对象需剔除 |
| Word | `DocxLoader` | 直接解析文本内容 |
| CSV | `CSVLoader` | 每行作为一个 Document |
| TXT | 自定义读取 | `fs.readFile` + `new Document()` |
| JSON | 自定义解析 | 递归提取语义字段，避免塞 JSON 结构 |

#### 4.2.2 文本切分策略
```typescript
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,      // 每段 800 字符
  chunkOverlap: 100,   // 重叠 100 字符，避免断句丢失上下文
  separators: ['\n', '。', '；', '，', ''],  // 优先按句子切分
});
```

**为什么需要切分？**
- Embedding 模型有输入长度限制（如 8192 tokens）
- 切分后检索更精准，能定位到具体段落
- overlap 保证上下文连贯性

#### 4.2.3 元数据注入（租户隔离 + 去重）
```typescript
docs.forEach((doc, idx) => {
  // ChromaDB metadata 只支持标量，剔除 pdf 嵌套对象
  const { pdf: _pdf, ...restMeta } = doc.metadata || {};

  doc.metadata = {
    ...restMeta,
    tenantType: 'merchant',      // 租户类型：platform / merchant
    merchantId,                  // 商户 ID，实现数据隔离
    sourceFile: fileName,        // 原始文件名，用于去重和溯源
    rowIndex: idx,               // 片段序号
  };
});
```

### 4.3 向量数据库（ChromaDB）

#### 4.3.1 什么是向量数据库？

**普通数据库**：查的是"等于"、"包含"
```sql
SELECT * FROM docs WHERE content LIKE '%净利润%'
-- 只能找到包含"净利润"三个字的文档
```

**向量数据库**：查的是"意思相近"
```typescript
// "今年赚了多少钱" 和 "净利润" 意思一样，也能找到！
const results = await chroma.similaritySearch("今年赚了多少钱？", 5);
```

#### 4.3.2 Embedding（向量化）
```
文字 → Embedding 模型 → 1536 维数字向量
"净利润" → [0.12, -0.05, 0.88, ..., 0.33]  // 1536 个数字
```

- 语义相近的文字，向量距离近（余弦相似度高）
- 我们用的是 **OpenAI text-embedding-3-small**，1536 维，成本低效果好

#### 4.3.3 ChromaDB 集合设计
```typescript
// Collection 名称
ecommerce_knowledge_base

// 每个文档片段存储：
{
  id: "uuid",                    // 唯一标识
  document: "文本内容",           // 原始文本
  embedding: [0.1, -0.2, ...],  // 1536 维向量
  metadata: {                    // 元数据（过滤用）
    tenantType: "merchant",
    merchantId: "1",
    sourceFile: "财报2025.csv",
    rowIndex: 15
  }
}
```

#### 4.3.4 租户隔离（核心安全机制）
```typescript
// 检索时自动注入过滤条件
const filter = {
  $and: [
    { tenantType: 'merchant' },
    { merchantId: { $eq: 'merchant_001' } }
  ]
};

// 商户 A 只能搜到自己的数据，商户 B 的数据完全隔离
const results = await collection.query({
  queryEmbeddings: [embedding],
  nResults: 5,
  where: filter,  // 关键！实现多租户隔离
});
```

**重要**：ChromaDB `where` 最多只允许 **1 个顶层操作符**，多条件必须用 `$and` / `$or` 包裹。

#### 4.3.5 去重机制
```typescript
// 上传同名文件前，先删除该商户该文件名的历史向量
async deleteDocumentsBySourceFile(merchantId, sourceFile) {
  await collection.delete({
    where: {
      $and: [
        { tenantType: 'merchant' },
        { merchantId: { $eq: merchantId } },
        { sourceFile: { $eq: sourceFile } },
      ]
    }
  });
}
```

### 4.4 检索与重排序模块（RagService）

#### 4.4.1 两阶段检索策略
传统 RAG 只用向量相似度检索，可能召回语义相近但相关性不足的文档。本系统采用 **"粗排 + 精排"** 的两阶段策略：

```
阶段一（粗排）：向量相似度检索，扩大召回
  └─ 召回数量：Math.max(k * 4, 20)，确保候选池充足

阶段二（精排）：Rerank 重排序，选出最相关的 Top-K
  └─ 使用白山智算 bge-reranker-v2-m3 模型对候选文档二次打分
```

#### 4.4.2 检索流程代码
```typescript
retrieveContext = async (
  query: string,
  tenantType: 'platform' | 'merchant',
  merchantId?: string,
  k = 5,
): Promise<string> => {
  const filter = this.buildTenantFilter(tenantType, merchantId);
  // 扩大召回数量，至少召回 20 个或 k*4 个候选，用于后续重排序
  const candidateK = Math.max(k * 4, 20);
  const candidates = await this.similaritySearch(query, filter, candidateK);

  if (candidates.length === 0) return '';

  // 若候选数大于目标数，则执行重排序；否则直接使用召回结果
  const topDocs =
    candidates.length > k
      ? await this.rerankDocuments(query, candidates, k)
      : candidates;

  return topDocs
    .map((doc, i) => `[参考资料${i + 1}] ${doc.pageContent}`)
    .join('\n\n');
};
```

#### 4.4.3 Rerank 重排序实现
```typescript
rerankDocuments = async (
  query: string,
  documents: Document[],
  topN: number,
): Promise<Document[]> => {
  if (documents.length === 0) return [];
  if (!this.BAISHAN_API_KEY) {
    this.logger.warn('BAISHAN_DASHSCOPE_API_KEY 未配置，跳过重排序');
    return documents.slice(0, topN);
  }

  try {
    const response = await fetch(`${this.BAISHAN_BASE_URL}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.BAISHAN_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'bge-reranker-v2-m3',
        query,
        documents: documents.map((d) => d.pageContent),
        top_n: topN,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Rerank API 请求失败: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as RerankResponse;
    const sortedDocs = data.results
      .map((r) => documents[r.index])
      .filter((d): d is Document => d != null);

    return sortedDocs;
  } catch (error) {
    this.logger.error(
      `重排序失败: ${(error as Error).message}，降级使用原始向量检索结果`,
    );
    return documents.slice(0, topN);
  }
};
```

**重排序降级保护**：
- 若 `BAISHAN_DASHSCOPE_API_KEY` 未配置，直接返回原候选 Top N
- 若 API 调用失败（网络异常、接口报错等），捕获异常并降级为原始向量检索结果
- 保证系统在任何情况下都能正常提供服务

#### 4.4.4 为什么需要 Rerank？
| 对比 | 纯向量检索 | 向量检索 + Rerank |
|------|-----------|------------------|
| 召回逻辑 | Embedding 余弦相似度 | 粗排召回 + Cross-Encoder 精排 |
| 精度 | 中（可能召回语义相近但不相关的片段） | 高（直接对 Query-Doc 对打分） |
| 速度 | 快 | 稍慢（需额外一次 API 调用） |
| 适用场景 | 简单问答 | 对准确性要求高的业务问答 |

### 4.5 AI 对话模块（LangChainController + LangChainService）

#### 4.5.1 四个对话接口
| 接口 | 路径 | 特点 |
|------|------|------|
| 普通对话 | `POST /ai/chat` | 一问一答，无记忆 |
| 流式对话 | `SSE /ai/streaming-chat` | 逐字输出，体验好 |
| 会话对话 | `POST /ai/session/:id/chat` | 带历史记忆，支持多轮 |
| 会话流式 | `SSE /ai/session/:id/streaming-chat` | 记忆 + 流式，最佳体验 |

#### 4.5.2 RAG 接入点
仅商户角色（`roleId === 2`）触发知识库检索：
```typescript
private retrieveKnowledgeBase = async (message, userId, roleId) => {
  if (roleId !== 2) return '';  // 非商户角色不走 RAG

  const merchant = await this.merchantRepo.findOne({
    where: { userId },
    select: ['id'],
  });
  if (!merchant) return '';

  // 检索商户知识库（已内置 Rerank 重排序）
  return this.merchantRagService.retrieveContext(message, merchant.id, 5);
};
```

#### 4.5.3 提示词工程（Prompt Engineering）
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
  new MessagesPlaceholder('history'),  // 历史对话占位
  HumanMessagePromptTemplate.fromTemplate('{question}'),
]);
```

**关键设计**：
- `{knowledgeBase}` 动态注入检索结果（已按 Rerank 精排后的 Top-K）
- `{history}` 保持多轮对话上下文
- 明确指令 "不要编造"，减少 AI 幻觉

### 4.6 实时进度推送（SSE）

#### 4.6.1 为什么用 SSE？
- 前端 `EventSource` 原生支持，自动重连
- 比 WebSocket 轻量，适合单向推送（服务器 → 客户端）
- 兼容性好，HTTP 协议穿透防火墙

#### 4.6.2 实现流程
```typescript
// 前端
const es = new EventSource(`/knowledge-base/progress/${taskId}`);
es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  // { status: 'processing', progress: 70, message: '正在向量化...' }
  // { status: 'completed', progress: 100 }
  // { status: 'failed', failReason: '文档格式无效' }
};

// 后端（Redis Pub/Sub）
// Worker 每步执行后 publish 进度 → Redis → SSE 推送给前端
```

---

## 五、开发过程中的关键难点

### 难点 1：ChromaDB `where` 语法限制
**问题**：多条件过滤时报错 `Expected 'where' to have exactly one operator, but got 2`

**原因**：ChromaDB v3.x 的 `where` 最多只允许 **1 个顶层操作符**

**错误写法**：
```typescript
{ tenantType: 'merchant', merchantId: { $eq: '1' } }  // 2 个顶层键，报错！
```

**正确写法**：
```typescript
{ $and: [
  { tenantType: 'merchant' },
  { merchantId: { $eq: '1' } }
]}  // 只有 1 个顶层键 $and
```

### 难点 2：PDF 解析依赖版本
**问题**：`PDFLoader` 报错 `Failed to load pdf-parse. This loader currently supports pdf-parse v1 only`

**原因**：`@langchain/community` 的 `PDFLoader` 只兼容 `pdf-parse` v1，但默认安装了 v2

**解决**：`pnpm add pdf-parse@^1`

### 难点 3：PDF metadata 嵌套对象
**问题**：ChromaDB 入库时报错 `Expected metadata value for key 'pdf' to be a string, number, boolean...`

**原因**：`PDFLoader` 在 `metadata` 中注入嵌套对象 `{ pdf: { version, info } }`，ChromaDB 只支持标量类型

**解决**：注入商户元数据前剔除 `pdf` 字段：
```typescript
const { pdf: _pdf, ...restMeta } = doc.metadata || {};
```

### 难点 4：BullMQ Redis 连接时序
**问题**：启动报错 `Worker requires a connection` 或 `maxRetriesPerRequest must be null`

**原因**：
- `redisService.getClient()` 在 `onModuleInit` 才创建，BullModule 注册时取不到
- BullMQ Worker 使用阻塞命令，要求 `maxRetriesPerRequest: null`

**解决**：BullModule 独立创建 Redis 连接：
```typescript
BullModule.forRootAsync({
  useFactory: (configService: ConfigService) => ({
    connection: {
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
      maxRetriesPerRequest: null,  // 关键！
    },
  }),
});
```

### 难点 5：SSE 认证（EventSource 无法设置 Header）
**问题**：`EventSource` 不支持自定义 `Authorization` header，JWT 认证失效

**解决**：Token 通过 query 参数传入，AuthGuard 兼容：
```typescript
// AuthGuard
const token =
  this.extractTokenFromHeader(context) ||  // 优先 header
  this.extractTokenFromQuery(context);      // 降级 query（SSE 场景）
```

### 难点 6：DefaultEmbeddingFunction 警告
**问题**：大量警告 `Cannot instantiate a collection with the DefaultEmbeddingFunction`

**原因**：ChromaDB v3.x `getCollection` / `getOrCreateCollection` 没传 `embeddingFunction` 时，尝试动态加载 `@chroma-core/default-embed`

**解决**：
1. 安装 `@chroma-core/default-embed`
2. 或所有 `getCollection` / `getOrCreateCollection` 调用都传入 dummy `embeddingFunction`

### 难点 7：同名文件去重逻辑
**问题**：用户上传同名文件时，如何只替换旧数据而不清空其他文件？

**关键**：用 **原始文件名 `fileName`** 作为去重键，不能用临时文件路径

```typescript
// 错误：用 path.basename(filePath) → 临时文件名随机，去重失效
// 正确：用用户上传的原始 fileName
await deleteDocumentsBySourceFile(merchantId, fileName);
```

### 难点 8：`expiresIn: '1Year'` 无效
**问题**：JWT token 验证失败，返回 "登录过期"

**原因**：`jsonwebtoken` 库不支持 `year` 单位（因闰年长度不固定）

**解决**：`expiresIn: '365d'`

---

## 六、关键知识点速查

### 6.1 向量相似度计算
```
余弦相似度 = (A · B) / (|A| × |B|)
- 值域：[-1, 1]
- 越接近 1，语义越相近
- ChromaDB 默认使用余弦相似度
```

### 6.2 Embedding 模型选择
| 模型 | 维度 | 特点 |
|------|------|------|
| text-embedding-3-small | 1536 | 成本低，效果够用 |
| text-embedding-3-large | 3072 | 成本高，精度更高 |

### 6.3 Chunk 大小选择
| chunkSize | 适用场景 |
|-----------|---------|
| 200-400 | 短文本、FAQ |
| 800-1000 | 通用文档（我们用的 800） |
| 1500-2000 | 长文章、论文 |

### 6.4 Top-K 检索数量
| k 值 | 适用场景 |
|------|---------|
| 3-4 | 精准指向单一答案的查询 |
| 5 | **推荐默认值**，兼顾精度与覆盖（我们用的 5） |
| 6-8 | 需要跨文档综合/总结的场景 |
| 10+ | 不推荐，易引入噪声和"Lost in the Middle"问题 |

**有 Rerank 时的建议**：
- 粗排召回：`candidateK = Math.max(k * 4, 20)`
- 精排返回：Top `k`（经 bge-reranker-v2-m3 二次打分后精选）

### 6.5 NestJS 装饰器速查
```typescript
@Controller('ai')           // 路由前缀
@Post('chat')              // POST 接口
@Sse('streaming-chat')     // SSE 流式接口
@UseGuards(AuthGuard)      // 认证守卫
@InjectRepository(Merchant) // 注入 Repository
```

---

## 七、后续扩展方向

| 功能 | 说明 |
|------|------|
| AI 导出财务报表 | 说一句话，AI 生成 PDF/Excel 报表 |
| 经营数据异常预警 | AI 自动发现 "这个月利润异常下降" |
| 多模态支持 | 上传图片、图表，AI 也能读懂 |
| Query 改写 | 结合对话历史优化检索 query，提升召回率 |
| 混合检索（Hybrid Search） | 向量检索 + 关键词 BM25 检索融合，进一步提升召回覆盖 |
| 检索结果可溯源高亮 | 在原文中标注 AI 回答引用的是哪一段 |

---

## 八、常用调试命令

```bash
# 查看 ChromaDB 集合数据
http://localhost:8000/api/v1/collections/ecommerce_knowledge_base

# 查看 Redis 队列状态
redis-cli LRAG rag-queue

# 查看 BullMQ 任务
redis-cli KEYS bull:rag-queue:*

# 手动触发 RAG 处理（测试用）
curl -X POST http://localhost:3000/knowledge-base/confirm \
  -H "Authorization: Bearer <token>" \
  -d '{"fileName":"test.pdf","mimeType":"application/pdf"}'
```

---

*最后更新：2026-04-25*
