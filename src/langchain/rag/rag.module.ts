import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RagService } from './rag.service';
import { RagProcessor } from './rag.processor';
import { EmbeddingService } from '../embedding.service';
import { MerchantRagService } from './merchant-rag/merchant-rag.service';
import { KnowledgeBase } from '../../modules/knowledge-base/entities/knowledge-base.entity';
import { QiniuModule } from '../../modules/qiniu/qiniu.module';
import { RedisKeys } from '../../common/constants/redis-key.constant';

@Module({
  imports: [
    BullModule.registerQueue({ name: RedisKeys.RAG.QUEUE_NAME }),
    TypeOrmModule.forFeature([KnowledgeBase]),
    forwardRef(() => QiniuModule),
  ],
  providers: [RagService, RagProcessor, EmbeddingService, MerchantRagService],
  exports: [RagService, MerchantRagService],
})
export class RagModule {}
