import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LangChainService } from './langchain.service';
import { LangChainController } from './langchain.controller';
import { EmbeddingService } from './embedding.service';
import { ChatService } from './chat.service';
import { AuthModule } from '../modules/auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';

@Module({
  imports: [
    AuthModule,
    CommonModule,
    TypeOrmModule.forFeature([ChatSession, ChatMessage]),
  ],
  controllers: [LangChainController],
  providers: [LangChainService, EmbeddingService, ChatService],
  exports: [LangChainService, EmbeddingService, ChatService],
})
export class LangChainModule {}
