import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * LangGraph 全局配置服务
 *
 * 统一管理 LangGraph 相关的环境变量与运行参数，
 * 供 Graph Builder 和 AgentsService 消费。
 */
@Injectable()
export class LangGraphConfigService {
  constructor(private readonly configService: ConfigService) {}

  /** 是否启用 LangGraph（双轨运行开关） */
  get useLangGraph(): boolean {
    return this.configService.get<string>('USE_LANGGRAPH') === 'true';
  }

  /** 最大递归步数（防止无限循环） */
  get recursionLimit(): number {
    return Number(this.configService.get('LANGGRAPH_RECURSION_LIMIT')) || 8;
  }

  /** 模型最大工具调用轮次 */
  get maxSteps(): number {
    return Number(this.configService.get('AGENT_MAX_STEPS')) || 3;
  }

  /** PostgreSQL 连接字符串 */
  get postgresUrl(): string | undefined {
    return this.configService.get<string>('LANGGRAPH_POSTGRES_URL');
  }
}
