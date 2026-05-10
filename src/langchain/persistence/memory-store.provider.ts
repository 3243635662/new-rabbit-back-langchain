/**
 * @file memory-store.provider.ts
 * @description LangGraph Store 提供者（长期记忆）
 * @作用 封装 Store，实现跨会话的长期记忆存储（如用户画像、偏好等）
 * @当前实现 使用 InMemoryStore（内存模式）
 * @未来计划 当 @langchain/langgraph-checkpoint-postgres 支持 PostgresStore 时迁移到 PostgresStore
 * @职责
 *   1. 从环境变量读取 LANGGRAPH_POSTGRES_URL
 *   2. 在模块初始化时创建 Store 实例
 *   3. 提供 getStore() 方法供需要长期记忆的模块使用
 * @注意 当前为内存模式，重启服务后记忆会丢失；生产环境建议迁移到持久化 Store
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryStore } from '@langchain/langgraph';
import type { BaseStore } from '@langchain/langgraph';

/**
 * LangGraph Store Provider（长期记忆）
 *
 * 职责：封装 Store，用于跨会话的用户画像存储（facts, preferences）。
 * 当前使用 InMemoryStore 作为实现，后续可迁移到 PostgresStore（当上游包支持时）。
 */
@Injectable()
export class MemoryStoreProvider implements OnModuleInit {
  private readonly logger = new Logger(MemoryStoreProvider.name);
  private store?: BaseStore;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const connectionString = this.configService.get<string>(
      'LANGGRAPH_POSTGRES_URL',
    );
    if (!connectionString) {
      this.logger.warn('LANGGRAPH_POSTGRES_URL 未配置，Store 长期记忆将不可用');
      return;
    }

    try {
      this.store = new InMemoryStore();
      this.logger.log('InMemoryStore 初始化成功（长期记忆 - 内存模式）');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Store 初始化失败: ${msg}`);
      throw err;
    }
  }

  getStore = (): BaseStore | undefined => this.store;
}
