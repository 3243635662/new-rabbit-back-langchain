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
export class PostgresStoreProvider implements OnModuleInit {
  private readonly logger = new Logger(PostgresStoreProvider.name);
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
      // TODO: 当 @langchain/langgraph-checkpoint-postgres 支持 PostgresStore 时迁移
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
