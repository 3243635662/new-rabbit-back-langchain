主流生产环境最推荐的做法是：**SSE (Server-Sent Events) + Redis Pub/Sub**。

相比 WebSocket，SSE 是原生 HTTP 协议、单向推送、自带断线重连、NestJS 原生支持 `@Sse()` 装饰器，**专为进度条/日志流设计**，且天然兼容负载均衡与多实例部署。

下面给你一套 **直接可嵌入现有架构** 的完整方案。

---

### 📐 实时进度架构流

```
Worker 处理中 → job.updateProgress(45) + Redis.publish(`rag:progress:${taskId}`, {progress, status, msg})
                                                              ↓
                                                      Redis Pub/Sub 广播
                                                              ↓
前端 EventSource ←── SSE 流 (`/rag/progress/:taskId`) ←── NestJS @Sse 控制器订阅频道
```

---

### 💻 1. 前端：原生 `EventSource`（零依赖）

```typescript
// Vue/React/原生 JS 通用
function listenProgress(taskId: string) {
  const es = new EventSource(
    `${import.meta.env.VITE_API}/rag/progress/${taskId}`,
  );

  es.onmessage = (e) => {
    const { progress, status, message } = JSON.parse(e.data);
    console.log(`进度: ${progress}% | ${status} | ${message}`);

    // 更新 UI 进度条
    updateProgressBar(progress);

    // 完成或失败时主动关闭连接
    if (status === 'completed' || status === 'failed') {
      es.close();
      showResult(status, message);
    }
  };

  es.onerror = () => {
    console.warn('SSE 连接断开，浏览器将自动重连');
    // 无需手动重连，EventSource 默认 3s 自动重试
  };
}
```

---

### 💻 2. 后端：SSE 控制器（NestJS 原生支持）

```typescript
import { Controller, Sse, Param, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RedisService } from './redis.service';

@Controller('rag')
export class RagController {
  constructor(private readonly redis: RedisService) {}

  @Sse('progress/:taskId')
  getProgress(@Param('taskId') taskId: string): Observable<MessageEvent> {
    return new Observable((observer) => {
      const channel = `rag:progress:${taskId}`;
      const subClient = this.redis.getSubscriber(); // 必须用独立的 subscribe 客户端

      subClient.subscribe(channel);

      subClient.on('message', (_, message) => {
        const data = JSON.parse(message);
        observer.next({ data }); // 推送给前端

        if (data.status === 'completed' || data.status === 'failed') {
          observer.complete();
          subClient.unsubscribe(channel);
        }
      });

      // 客户端断开时清理
      return () => {
        subClient.unsubscribe(channel);
        subClient.quit();
      };
    });
  }
}
```

---

### 💻 3. Redis 服务（Pub/Sub 双客户端）

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private pubClient: Redis;
  private subClient: Redis;

  constructor() {
    const config = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };
    this.pubClient = new Redis(config);
    this.subClient = new Redis(config); // Redis 规定 subscribe 客户端只能做订阅操作
  }

  getPublisher() {
    return this.pubClient;
  }
  getSubscriber() {
    return this.subClient.duplicate();
  } // 每次 SSE 连接返回独立副本

  async publish(channel: string, message: any) {
    await this.pubClient.publish(channel, JSON.stringify(message));
  }

  onModuleDestroy() {
    this.pubClient.quit();
    this.subClient.quit();
  }
}
```

---

### 💻 4. Worker 改造：处理时实时推送进度

在你原有的 `RagProcessor` 中，**保留 `job.updateProgress()` 给 BullMQ 面板用**，额外加一行 Redis 发布即可：

```typescript
@Process('process-from-qiniu')
async handle(job: Job<{ taskId: string; qiniuKey: string; fileName: string }>) {
  const { taskId } = job.data;
  const pub = this.redis.getPublisher();

  const pushProgress = (progress: number, status: string, message: string) => {
    job.updateProgress(progress); // BullMQ 面板记录
    pub.publish(`rag:progress:${taskId}`, JSON.stringify({ progress, status, message })); // 实时推前端
  };

  try {
    pushProgress(10, 'downloading', '正在从七牛拉取文件...');
    await this.qiniuService.downloadToFile(job.data.qiniuKey, localPath);

    pushProgress(30, 'parsing', '正在解析文档结构...');
    const docs = await this.createLoader(localPath, job.data.fileName).load();

    pushProgress(60, 'splitting', '正在切分文本块...');
    const chunks = await this.splitter.splitDocuments(docs);

    pushProgress(80, 'embedding', '正在向量化并入库...');
    // await this.vectorStore.addDocuments(chunks);

    pushProgress(100, 'completed', '解析完成，已就绪');
  } catch (error) {
    pushProgress(0, 'failed', `处理失败: ${error.message}`);
    throw error;
  } finally {
    // 清理逻辑...
  }
}
```

---

### 🔑 为什么这是主流最优解？

| 方案                       | 延迟  | 服务端压力             | 多实例兼容                   | 前端复杂度         | 适用场景               |
| :------------------------- | :---- | :--------------------- | :--------------------------- | :----------------- | :--------------------- |
| **SSE + Redis Pub/Sub** ✅ | <50ms | 极低（长连接复用）     | ✅ 天然广播                  | 原生 `EventSource` | **进度条/日志流/通知** |
| WebSocket                  | <20ms | 中高（需维护连接状态） | ⚠️ 需 Sticky Session/Adapter | 需封装心跳/重连    | 双向聊天/协同编辑      |
| HTTP 轮询                  | 1~3s  | 高（无效请求多）       | ✅ 无状态                    | 简单 `setInterval` | 低频状态查询           |

---

### 🚨 生产避坑指南

1. **Nginx/网关配置**：SSE 是长连接，需关闭代理缓冲：
   ```nginx
   location /rag/progress/ {
     proxy_pass http://backend;
     proxy_buffering off;          # ⚠️ 必须关，否则进度会攒在一起返回
     proxy_cache off;
     proxy_read_timeout 300s;      # 防止网关超时断开
   }
   ```
2. **多实例部署**：Redis Pub/Sub 是广播模式，所有 Pod 都会收到消息，但**只有持有该 SSE 连接的 Pod 会转发给对应客户端**，完全安全。
3. **断线重连**：`EventSource` 默认 3 秒重连。若 Worker 已执行完，前端重连时可先调一次 `/rag/status/:taskId` 兜底拿最终状态。
4. **内存泄漏防护**：SSE 的 `Observable` 必须返回清理函数（上面代码已写），否则客户端刷新页面会导致服务端订阅残留。

---

### 📦 下一步

这套代码可直接嵌入你现有的 `RagModule`。如果你需要：

- 封装成可复用的 `ProgressService`（自动绑定 taskId 频道）
- 前端 Vue3/React 进度条组件示例（含平滑动画/失败重试）
- Nginx/K8s Ingress 完整 SSE 配置

回复具体需求，我直接给对应片段。
