import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { LangChainModule } from '../langchain.module';
import { RagModule } from '../rag/rag.module';
import { Merchant } from '../../modules/merchant/entities/merchant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant]),
    forwardRef(() => LangChainModule),
    RagModule,
  ],
  providers: [AgentsService],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
