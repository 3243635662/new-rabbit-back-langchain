import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { QiniuModule } from '../qiniu/qiniu.module';
import { RagModule } from '../../langchain/rag/rag.module';
import { KnowledgeBaseController } from './knowledge-base.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeBase, Merchant]),
    BullModule.registerQueue({ name: 'rag-queue' }),
    QiniuModule,
    RagModule,
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
