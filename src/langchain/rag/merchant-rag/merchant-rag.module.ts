import { Module, forwardRef } from '@nestjs/common';
import { MerchantRagService } from './merchant-rag.service';
import { RagModule } from '../rag.module';

/**
 * MerchantRagModule - 供外部模块（如 KnowledgeBaseModule）导入
 * 内部已通过 RagModule 提供 MerchantRagService
 */
@Module({
  imports: [forwardRef(() => RagModule)],
  providers: [MerchantRagService],
  exports: [MerchantRagService],
})
export class MerchantRagModule {}
