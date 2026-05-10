import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { ChatService } from '../chat.service';
import { LangChainModule } from '../langchain.module';
import { ToolModule } from '../tools/tool.module';
import { CommonModule } from '../../common/common.module';
import { RedisModule } from '../../modules/db/redis/redis.module';
import { Merchant } from '../../modules/merchant/entities/merchant.entity';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { AgentToolsFactory } from './factories/agent-tools.factory';
import { LegacyAgentRunner } from './runners/legacy-agent.runner';
import { LangGraphAgentRunner } from './runners/langgraph-agent.runner';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant, ChatSession, ChatMessage]),
    forwardRef(() => LangChainModule),
    ToolModule,
    CommonModule,
    RedisModule,
  ],
  providers: [
    AgentsService,
    ChatService,
    AgentToolsFactory,
    LegacyAgentRunner,
    LangGraphAgentRunner,
  ],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
