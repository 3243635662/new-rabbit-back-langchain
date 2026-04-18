// src/langchain/langchain.module.ts
import { Module } from '@nestjs/common';
import { LangChainService } from './langchain.service';
import { LangChainController } from './langchain.controller';
import { EmbeddingService } from './embedding.service';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LangChainController],
  providers: [LangChainService, EmbeddingService],
  exports: [LangChainService, EmbeddingService],
})
export class LangChainModule {}
