import { Module, forwardRef } from '@nestjs/common';
import { MerchantRagController } from './merchant-rag.controller';
import { MerchantRagService } from './merchant-rag.service';
import { LangChainModule } from '../../langchain.module';

@Module({
  imports: [forwardRef(() => LangChainModule)],
  controllers: [MerchantRagController],
  providers: [MerchantRagService],
  exports: [MerchantRagService],
})
export class MerchantRagModule {}
