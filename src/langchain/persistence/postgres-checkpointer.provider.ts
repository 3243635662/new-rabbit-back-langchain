import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

/**
 * LangGraph PostgreSQL Checkpointer Provider
 *
 * 职责：将 PostgresSaver 封装为 NestJS Provider，随模块初始化自动 setup。
 * 供 AgentGraphBuilder 编译 StateGraph 时注入，实现执行状态的持久化。
 */
@Injectable()
export class PostgresCheckpointerProvider implements OnModuleInit {
  private readonly logger = new Logger(PostgresCheckpointerProvider.name);
  private checkpointer?: PostgresSaver;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const connectionString = this.configService.get<string>(
      'LANGGRAPH_POSTGRES_URL',
    );
    if (!connectionString) {
      this.logger.warn(
        'LANGGRAPH_POSTGRES_URL 未配置，LangGraph Checkpointer 将不可用',
      );
      return;
    }

    try {
      this.checkpointer = PostgresSaver.fromConnString(connectionString);
      await this.checkpointer.setup();
      this.logger.log('PostgresSaver 初始化成功，checkpoint 表已就绪');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PostgresSaver 初始化失败: ${msg}`);
      throw err;
    }
  }

  getCheckpointer = (): PostgresSaver | undefined => this.checkpointer;
}
