import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LangChainService } from './langchain.service';
import { LangChainController } from './langchain.controller';
import { ChatService } from './chat.service';
import { EmbeddingService } from './embedding.service';
import { AuthModule } from '../modules/auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { MerchantRagModule } from './rag/merchant-rag/merchant-rag.module';

@Module({
  imports: [
    AuthModule,
    CommonModule,
    TypeOrmModule.forFeature([ChatSession, ChatMessage]),
    forwardRef(() => MerchantRagModule),
  ],
  controllers: [LangChainController],
  providers: [LangChainService, ChatService, EmbeddingService],
  exports: [LangChainService, ChatService, EmbeddingService],
})
export class LangChainModule {}
