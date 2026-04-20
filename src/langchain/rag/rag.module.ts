import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { RagProcessor } from './rag.processor';
import { EmbeddingService } from '../embedding.service';
import { MerchantRagService } from './merchant-rag/merchant-rag.service';
import { KnowledgeBase } from '../../modules/knowledge-base/entities/knowledge-base.entity';
import { QiniuModule } from '../../modules/qiniu/qiniu.module';

@Module({
  imports: [
    // BullMQ 连接 Redis（复用项目的 Redis 配置）
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || '127.0.0.1',
          port: configService.get<number>('REDIS_PORT') || 6379,
        },
      }),
    }),
    // 声明 rag-queue 队列
    BullModule.registerQueue({ name: 'rag-queue' }),
    TypeOrmModule.forFeature([KnowledgeBase]),
    forwardRef(() => QiniuModule),
  ],
  controllers: [RagController],
  providers: [RagService, RagProcessor, EmbeddingService, MerchantRagService],
  exports: [RagService, MerchantRagService],
})
export class RagModule {}
