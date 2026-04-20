import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LangChainService } from './langchain.service';
import { LangChainController } from './langchain.controller';
import { ChatService } from './chat.service';
import { AuthModule } from '../modules/auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    AuthModule,
    CommonModule,
    TypeOrmModule.forFeature([ChatSession, ChatMessage]),
    RagModule,
  ],
  controllers: [LangChainController],
  providers: [LangChainService, ChatService],
  exports: [LangChainService, ChatService],
})
export class LangChainModule {}
