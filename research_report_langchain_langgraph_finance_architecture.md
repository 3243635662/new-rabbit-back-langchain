# LangChain + LangGraph 混用架构设计：RAG 财务智能 Agent 与发票财务报表系统

## 执行摘要

本项目已在 NestJS 中构建了完整的电商 AI 助手系统，包含手搓版 ReAct Agent、LangGraph 预构建 Agent、RAG 知识库（ChromaDB + 重排序）、BullMQ 文档处理队列、Redis/MySQL 双层消息持久化等核心能力。要在该基础上扩展"财务智能聊天 Agent"和"上传发票/票据生成财务报表"功能，最佳策略是：**以 LangGraph 为骨架负责 Agent 状态机编排和持久化，以 LangChain 为血肉提供模型调用、RAG 检索、工具定义等原子能力**。财务模块建议独立为 `finance/` 领域模块，票据处理走"OCR/LLM 提取 → 结构化存储 → 向量入库 → 报表生成"的流水线，与现有 RAG 基础设施复用。

---

## 一、现有架构分析

### 1.1 当前能力矩阵

| 模块 | 技术栈 | 状态 |
|:---|:---|:---|
| LLM 接入 | `@langchain/openai` ChatOpenAI + 阿里 DashScope 代理 | 已就绪 |
| Agent 执行 | `AgentsService`（手搓 ReAct 循环，maxSteps=3） | 运行中 |
| Agent 执行 | `LangGraphAgentService`（`createReactAgent` + `MemorySaver`） | 已编码但未确认依赖安装 |
| RAG 检索 | ChromaDB + 白山智算重排序 + 查询改写（LLM 扩展同义词） | 运行中 |
| 文档处理 | BullMQ 队列 + `PDFLoader`/`DocxLoader`/`CSVLoader`/XLSX + `RecursiveCharacterTextSplitter` | 运行中 |
| 消息持久化 | Redis 热数据 + MySQL 冷数据 + 定时同步 | 运行中 |
| 流式对话 | SSE + `AbortController` 支持中断 | 运行中 |
| 工具生态 | 商品查询、订单查询、库存查询、发货、知识库检索等 9 个工具 | 运行中 |

### 1.2 关键发现

你的 `LangGraphAgentService` 已经引用了 `@langchain/langgraph` 的 `createReactAgent` 和 `MemorySaver`，但 `package.json` 中缺少该依赖。这是首先需要修复的阻塞点。

你的手搓版 `AgentsService` 实际上是用 LangChain 原语手动实现了 LangGraph 的核心循环逻辑（模型生成 → 检测 tool_calls → 执行工具 → 回写 messages → 循环）。这种实现控制力极强，但维护成本高，且缺失了 LangGraph 的以下能力：

- 图结构可视化与调试
- 内置的持久化/断点恢复
- Human-in-the-Loop（人机介入审批）
- 多 Agent 协作（Supervisor 模式）
- 条件分支与循环的声明式定义

---

## 二、LangChain 与 LangGraph 的分工边界

### 2.1 一句话定界

**LangChain 负责"做什么"（原子能力），LangGraph 负责"怎么做"（流程编排）。**

### 2.2 详细分工表

| 层级 | LangChain 职责 | LangGraph 职责 |
|:---|:---|:---|
| **模型层** | `ChatOpenAI.invoke()` / `.stream()`，模型参数配置，enable_thinking | 无直接介入，通过节点调用 LangChain 模型 |
| **提示词层** | `ChatPromptTemplate`，System Prompt 构建，`buildExpandQueryPrompt` | `messageModifier` 注入系统提示，状态驱动的动态提示组装 |
| **工具层** | `DynamicStructuredTool` 定义，`tool()` 包装，`zod` schema 校验 | `ToolNode` 统一调度，工具执行错误的重试/回退策略 |
| **RAG 层** | `similaritySearch()`，`rerankDocuments()`，`retrieveContextWithTrace()` | 将检索节点化为图节点，支持"检索 → 评估相关性 → 决定是否改写查询再检索"的循环 |
| **文档处理层** | `PDFLoader`，`RecursiveCharacterTextSplitter`，`addDocuments()` | 无直接介入，但可作为子图节点被 Agent 调用 |
| **状态管理层** | 无（或简单的 Memory 组件） | **核心能力**：`StateGraph` 定义状态Schema，`checkpointer` 持久化，`thread_id` 会话隔离 |
| **流程控制层** | LCEL 的 `|` 管道（线性 DAG） | **核心能力**：循环、条件边、并行分支、中断/恢复 |
| **人机协同层** | 无 | `interrupt()` 原语，支持在任意节点暂停等待用户确认 |
| **多 Agent 层** | 无 | `Command` 交接，`handoff` 模式，Supervisor 调度子 Agent |

### 2.3 混用模式：三层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Agent 编排层 (LangGraph)                           │
│  - StateGraph / createReactAgent                            │
│  - 持久化: PostgresSaver / RedisSaver / MemorySaver         │
│  - 人机协同: interrupt()                                    │
│  - 多 Agent: Supervisor + Sub-agents                        │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 业务工具层 (LangChain + 自定义服务)                  │
│  - RAG 检索: MerchantRagService.retrieveContext()           │
│  - 财务工具: InvoiceParserTool, FinancialReportTool         │
│  - 电商工具: ProductListTool, OrderListTool...              │
│  - 文档处理: BullMQ + Loaders + Splitters                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 基础能力层 (LangChain Core)                        │
│  - ChatOpenAI, Embeddings                                   │
│  - ChatPromptTemplate, Messages                             │
│  - Document, TextSplitter                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、RAG 商家财务聊天智能 Agent 设计

### 3.1 为什么财务 Agent 需要 LangGraph

财务场景的典型对话流程比普通电商问答复杂得多：

```
用户: "帮我看看上个月的营收情况"
  → Agent: [调用 queryRevenueData 工具]
  → 工具返回: 原始订单数据（量大）
  → Agent: [发现数据量过大，需要进一步细化]
  → Agent: "您希望按商品类目还是按日期维度查看？"
  → 用户: "按商品类目"
  → Agent: [调用 queryRevenueByCategory 工具]
  → 工具返回: 分类营收数据
  → Agent: [调用 RAG 检索财务分析模板]
  → Agent: 生成带有趋势分析和建议的回复
```

这种"工具调用 → 发现需要澄清 → 追问用户 → 再次调用工具 → 综合分析"的流程，用 LangGraph 的状态机比手搓循环清晰得多。

### 3.2 财务 Agent 的 StateGraph 设计

```typescript
// src/langchain/agents/finance-graph.service.ts
import { StateGraph, Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// 定义状态 Schema
const FinanceState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  // 当前用户意图分类
  intent: Annotation<'revenue_query' | 'invoice_upload' | 'report_request' | 'general_chat'>(),
  // 是否需要用户澄清
  needsClarification: Annotation<boolean>(),
  // 检索到的财务上下文
  financialContext: Annotation<string>(),
  // 工具执行记录
  toolCalls: Annotation<Array<{ name: string; result: string }>>({
    reducer: (x, y) => [...x, ...y],
    default: () => [],
  }),
  // 是否生成报表文件
  generatedReport: Annotation<string>(), // 文件路径或 URL
});

// 节点函数
const classifyIntent = async (state: typeof FinanceState.State) => {
  // 用 LLM 或规则分类用户意图
  const lastMsg = state.messages[state.messages.length - 1];
  // ... 分类逻辑
  return { intent: 'revenue_query', needsClarification: false };
};

const retrieveFinanceContext = async (state: typeof FinanceState.State) => {
  // 调用 RAG 检索财务知识库
  const context = await merchantRagService.retrieveContext(
    state.messages[state.messages.length - 1].content as string,
    merchantId,
    5,
  );
  return { financialContext: context };
};

const callFinanceTools = async (state: typeof FinanceState.State) => {
  // 根据 intent 调用对应工具
  // revenue_query → queryRevenueTool
  // ...
};

const askClarification = async (state: typeof FinanceState.State) => {
  return {
    messages: [new AIMessage('为了更准确地回答，请问您希望按什么维度查看？')],
    needsClarification: false,
  };
};

const generateResponse = async (state: typeof FinanceState.State) => {
  // 综合 messages + financialContext + toolCalls 生成回复
};

// 构建图
const workflow = new StateGraph(FinanceState)
  .addNode('classify', classifyIntent)
  .addNode('retrieve', retrieveFinanceContext)
  .addNode('tools', callFinanceTools)
  .addNode('clarify', askClarification)
  .addNode('generate', generateResponse)
  .addEdge('__start__', 'classify')
  .addConditionalEdges('classify', (state) => {
    if (state.needsClarification) return 'clarify';
    return 'retrieve';
  })
  .addEdge('clarify', '__end__')
  .addEdge('retrieve', 'tools')
  .addEdge('tools', 'generate')
  .addEdge('generate', '__end__');

// 编译时附加持久化
const checkpointer = new PostgresSaver(/* postgres conn */);
const app = workflow.compile({ checkpointer });
```

### 3.3 与现有 RAG 系统的复用策略

你的 `MerchantRagService` 已经实现了：
- 多格式文档加载（PDF/Excel/CSV/JSON/Docx/Txt）
- 租户隔离（`buildTenantFilter`）
- 查询改写 + 重排序（`expandQuery` + `rerankDocuments`）
- Trace 可观测性

**财务知识库可以直接复用这套基础设施**，只需要：

1. **新增独立的 Collection**：为财务文档创建 `finance_knowledge_base` collection，与电商知识库物理隔离
2. **扩展 `SupportedDocumentType`**：增加 `invoice`、`contract`、`receipt` 类型（在处理逻辑上映射到 pdf/img）
3. **新增财务专属检索工具**：`FinanceKbTool`，逻辑与 `MerchantKbTool` 相同，但指向财务 collection

---

## 四、上传发票/合同/票据 → 生成财务报表

### 4.1 整体流程设计

```
用户上传发票/合同/票据图片/PDF
        ↓
┌─────────────────────────────────────┐
│  Step 1: 文档解析与 OCR 提取          │
│  - 多模态 LLM (Qwen-VL / GPT-4V)    │
│  - 或专用 OCR API + LLM 结构化       │
│  输出: 结构化票据数据 (JSON)          │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  Step 2: 数据校验与存储               │
│  - 校验必填字段完整性                 │
│  - 存入 MySQL financial_documents 表  │
│  - 去重检测（金额+日期+开票方）        │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  Step 3: 向量化入库（RAG）            │
│  - 将票据文本内容转为 Document        │
│  - 加入财务知识库 Collection          │
│  - 元数据标记: documentType=invoice   │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  Step 4: 财务报表生成（按需触发）      │
│  - 用户发起: "生成 2026年4月 报表"    │
│  - Agent 查询 MySQL 聚合数据           │
│  - 调用 LLM 生成分析文本               │
│  - 可选: 生成 Excel/PDF 报表文件       │
└─────────────────────────────────────┘
```

### 4.2 Step 1: 票据信息提取方案对比

| 方案 | 优点 | 缺点 | 推荐场景 |
|:---|:---|:---|:---|
| **多模态 LLM 直接提取** (Qwen-VL / GPT-4o) | 无需 OCR 中间层，端到端，格式适应性强 | 成本高，大文件处理慢 | 精度要求高、格式多变的场景 |
| **OCR + LLM 结构化** (PaddleOCR / 阿里读光 + GPT) | 成本可控，OCR 和结构化解耦可分别优化 | 两步链路，集成复杂度高 | 批量处理、成本敏感的场景 |
| **专用票据识别 API** (百度/腾讯/阿里发票识别) | 精度最高，已针对发票优化 | 依赖第三方，灵活性差 | 仅处理标准发票的场景 |

**推荐方案**：先用多模态 LLM（如通义千问 VL 或你已有的 DashScope 渠道）做 MVP，后期如果票据量大且成本敏感，再切换为 OCR + LLM 的混合方案。

### 4.3 票据数据结构定义

```typescript
// src/modules/finance/entities/invoice.entity.ts
interface InvoiceData {
  // 基础信息
  invoiceType: 'vat_special' | 'vat_normal' | 'receipt' | 'contract' | 'other';
  invoiceCode: string;      // 发票代码
  invoiceNumber: string;    // 发票号码
  issueDate: string;        // 开票日期 YYYY-MM-DD

  // 交易信息
  sellerName: string;       // 销售方
  sellerTaxId: string;      // 销售方税号
  buyerName: string;        // 购买方
  buyerTaxId: string;       // 购买方税号

  // 金额信息
  totalAmount: number;      // 价税合计
  totalTax: number;         // 税额
  amountWithoutTax: number; // 不含税金额
  currency: string;         // 币种，默认 CNY

  // 明细
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    taxRate: number;
    taxAmount: number;
  }>;

  // 元数据
  fileUrl: string;          // 原始文件七牛地址
  merchantId: string;       // 所属商户
  extractedBy: 'llm' | 'ocr' | 'manual';
  confidence: number;       // 提取置信度 0-1
  rawText: string;          // OCR 原始文本
}
```

### 4.4 财务报表生成 Agent 设计

这是一个典型的"计划-执行-汇总"任务，非常适合用 LangGraph 的自定义 StateGraph 实现：

```typescript
// src/langchain/agents/report-graph.service.ts
const ReportState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (x, y) => x.concat(y) }),
  reportPeriod: Annotation<{ start: string; end: string }>(),
  // 收集的数据
  revenueData: Annotation<unknown>(),
  expenseData: Annotation<unknown>(),
  invoiceData: Annotation<unknown[]>(),
  // 生成结果
  reportMarkdown: Annotation<string>(),
  reportExcelUrl: Annotation<string>(),
});

// 节点：解析用户报表请求，提取时间范围
const parseReportRequest = async (state) => { /* ... */ };

// 节点：查询营收数据（调用现有订单/商品工具）
const queryRevenue = async (state) => { /* ... */ };

// 节点：查询支出数据（查询发票/票据表）
const queryExpenses = async (state) => { /* ... */ };

// 节点：并行执行（LangGraph 支持 Send 并行）
// .addEdge('parse', ['queryRevenue', 'queryExpenses'])

// 节点：生成报表文本
const generateReportText = async (state) => {
  const model = langChainService.getModel();
  const prompt = `基于以下数据生成财务分析报告：
营收: ${JSON.stringify(state.revenueData)}
支出: ${JSON.stringify(state.expenseData)}
发票明细: ${JSON.stringify(state.invoiceData.slice(0, 50))}`;
  const response = await model.invoke(prompt);
  return { reportMarkdown: response.content as string };
};

// 节点：生成 Excel 文件
const generateExcel = async (state) => {
  // 用 xlsx 库生成，上传七牛，返回 URL
  const buffer = await generateExcelBuffer(state);
  const url = await qiniuService.upload(buffer, `reports/${merchantId}/${Date.now()}.xlsx`);
  return { reportExcelUrl: url };
};
```

---

## 五、代码演进路径与模块划分

### 5.1 推荐文件组织

```
src/
├── langchain/
│   ├── agents/
│   │   ├── agents.service.ts              # 现有手搓版（逐步废弃）
│   │   ├── langgraph-agent.service.ts     # 现有预构建版
│   │   ├── finance-graph.service.ts       # 新增：财务专用 StateGraph
│   │   └── report-graph.service.ts        # 新增：报表生成 StateGraph
│   ├── tools/
│   │   ├── ...existing tools...
│   │   ├── finance-query.tool.ts          # 新增：财务数据查询
│   │   ├── invoice-parse.tool.ts          # 新增：票据解析工具
│   │   └── report-generate.tool.ts        # 新增：报表生成工具
│   └── rag/
│       └── ...existing...
├── modules/
│   └── finance/                          # 新增：财务领域模块
│       ├── entities/
│       │   ├── invoice.entity.ts
│       │   └── financial-document.entity.ts
│       ├── services/
│       │   ├── invoice.service.ts         # 票据 CRUD + 去重
│       │   ├── invoice-parser.service.ts  # OCR/LLM 提取核心
│       │   └── financial-report.service.ts # 报表聚合逻辑
│       ├── controllers/
│       │   └── finance.controller.ts
│       └── finance.module.ts
```

### 5.2 演进路线图

| 阶段 | 目标 | 涉及改动 | 预估工作量 |
|:---|:---|:---|:---|
| **P0: 修复阻塞** | 安装 `@langchain/langgraph`，验证 `LangGraphAgentService` 可运行 | `pnpm add @langchain/langgraph` | 5分钟 |
| **P1: 统一 Agent 入口** | 将 `LangChainController.streamingChat` 切换为调用 `LangGraphAgentService.runAgentStream` | 修改 controller + 保留流式格式兼容 | 2小时 |
| **P2: 持久化升级** | 将 `MemorySaver` 替换为 `RedisSaver` 或 `PostgresSaver`，实现断线续聊 | 新增依赖 + 配置化 checkpointer | 4小时 |
| **P3: 财务知识库** | 新增 `finance_knowledge_base` collection + `FinanceKbTool` | 复用现有 RAG 基础设施 | 3小时 |
| **P4: 票据解析** | 实现 `InvoiceParserService`（多模态 LLM 提取）+ `InvoiceEntity` + 入库 | 新建 finance 模块 | 1-2天 |
| **P5: 报表 Agent** | 实现 `ReportGraphService`，支持自然语言请求 → 数据查询 → 报表生成 | 自定义 StateGraph + Excel 生成 | 2-3天 |
| **P6: 人机协同** | 对敏感操作（如大额发票确认、报表发布）引入 `interrupt()` | LangGraph interrupt 集成 | 1天 |
| **P7: 多 Agent 协作** | 拆分 Supervisor Agent（调度器）+ 电商 Agent + 财务 Agent | Supervisor 图架构 | 2-3天 |

### 5.3 立即可以开始的代码：安装依赖

```bash
# 核心依赖（P0）
pnpm add @langchain/langgraph

# 持久化（P2）
pnpm add @langchain/langgraph-checkpoint-postgres
# 或 Redis 版本（如果官方已发布，否则用 MemorySaver 过渡）

# 财务相关（P4）
pnpm add @langchain/anthropic  # 如果用 Claude 做票据识别（可选）
# 或继续使用你现有的 DashScope 渠道调用通义千问 VL
```

---

## 六、关键设计决策说明

### 6.1 为什么财务 Agent 要独立建图，而不是共用 `createReactAgent`

`createReactAgent` 是 LangGraph 提供的高阶封装，适合标准的"思考-行动-观察"循环。但财务场景有特殊需求：

1. **意图分类前置**：用户说"看看上个月的账"，需要先解析出时间范围、维度，才能决定调哪些工具
2. **数据聚合后再生成回复**：可能需要并行调用多个工具（营收 + 支出 + 发票），等全部返回后再综合分析
3. **报表输出是副作用**：生成 Excel 文件不是模型直接输出，而是节点副作用

这些需求用自定义 `StateGraph` 比 `createReactAgent` 更灵活。

### 6.2 为什么票据处理要用 BullMQ 队列，而不是同步处理

参考你现有的 `RagProcessor` 设计，票据解析也应该异步化：

1. **LLM 解析耗时**：多模态模型分析一张发票可能需要 3-10 秒
2. **批量上传场景**：用户可能一次上传 50 张发票
3. **容错与重试**：解析失败可以自动重试，手动重试
4. **进度反馈**：队列天然支持进度推送（你已有 `pushProgress` 模式）

### 6.3 为什么票据向量化和财务知识库要分开 Collection

虽然可以存在同一个 collection 用 `documentType` 过滤，但独立 collection 有以下好处：

1. **检索精度**：财务术语和电商术语的语义空间不同，独立 collection 避免交叉污染
2. **权限隔离**：未来可能允许某些角色访问财务知识但禁止访问电商知识
3. **维护独立**：财务文档更新频率和电商文档不同，独立 collection 便于重建索引

---

## 七、结论

你的项目已经具备了非常扎实的 AI 基础设施（RAG、Agent、文档处理、消息持久化），扩展财务能力不需要推倒重来，而是**在现有架构上分层叠加**。

核心策略是：

1. **LangChain 继续承担原子能力层**：模型调用、RAG 检索、工具定义、文档解析，这些你的代码已经做得很好，保持不动。
2. **LangGraph 承担编排控制层**：用 `StateGraph` 替代手搓循环，实现财务 Agent 的意图分类、多工具并行、报表生成等复杂流程。用 `checkpointer` 实现持久化，用 `interrupt()` 实现人机协同。
3. **财务模块独立演进**：新建 `modules/finance/` 领域模块，票据解析走异步队列，结构化数据存 MySQL，文本内容入向量库，报表生成由 LangGraph Agent 编排。

建议从 P0 → P1 → P3 → P4 的顺序逐步推进，每完成一个阶段就有可演示的产出。

---

## 参考来源

1. [LangChain 官方文档 - 使用 LangGraph 构建 RAG 代理](https://docs.langchain.org.cn/oss/python/langchain/rag)
2. [Zilliz 中文博客 - 全面测评 LangChain vs LangGraph](https://zilliz.com.cn/blog/LangChain-vs-LangGraph-Agent-Deployment-Showdown)
3. [LangGraph 官方中文文档 - 人机协作](https://github.langchain.ac.cn/langgraph/agents/human-in-the-loop/)
4. [LangGraph 官方中文文档 - 构建多智能体系统](https://langgraph.com.cn/how-tos/multi_agent/index.html)
5. [LangChain 2026 构建可靠 Agent 和 RAG 管道](https://www.blockchain-council.org/ai/langchain-2026-reliable-agents-langchain-rag/)
6. [Arxiv - Automated Invoice Data Extraction: Using LLM and OCR](https://arxiv.org/pdf/2511.05547)
7. [RaftLabs - OCR vs LLM: How We Built Automated Invoice Scanning](https://www.raftlabs.com/blog/ocr-vs-llm-how-we-built-automated-invoice-scanning)
