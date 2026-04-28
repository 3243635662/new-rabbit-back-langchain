import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { MerchantKbTool } from './merchant-kb.tool';

/**
 * LangChain Tools 模块
 *
 * 聚合所有 Agent 可调用的 Tool，每个 Tool 只封装单一业务能力。
 * Agent 层通过注入 Tool 类来组装工具列表，不直接依赖底层业务 Service。
 */
@Module({
  imports: [RagModule],
  providers: [MerchantKbTool],
  exports: [MerchantKbTool],
})
export class ToolModule {}
