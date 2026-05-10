import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { LangChainModule } from '../langchain.module';
import { ToolModule } from '../tools/tool.module';
import { Merchant } from '../../modules/merchant/entities/merchant.entity';
import { AgentToolsFactory } from './factories/agent-tools.factory';
import { LegacyAgentRunner } from './runners/legacy-agent.runner';
import { LangGraphAgentRunner } from './runners/langgraph-agent.runner';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant]),
    forwardRef(() => LangChainModule),
    ToolModule,
  ],
  providers: [
    AgentsService,
    AgentToolsFactory,
    LegacyAgentRunner,
    LangGraphAgentRunner,
  ],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
