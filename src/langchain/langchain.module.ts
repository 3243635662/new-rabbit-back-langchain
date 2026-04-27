import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LangChainService } from './langchain.service';
import { LangChainController } from './langchain.controller';
import { ChatService } from './chat.service';
import { AuthModule } from '../modules/auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { RagModule } from './rag/rag.module';
import { Merchant } from '../modules/merchant/entities/merchant.entity';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    AuthModule,
    CommonModule,
    TypeOrmModule.forFeature([ChatSession, ChatMessage, Merchant]),
    RagModule,
    forwardRef(() => AgentsModule),
  ],
  controllers: [LangChainController],
  providers: [LangChainService, ChatService],
  exports: [LangChainService, ChatService],
})
export class LangChainModule {}
