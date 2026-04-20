import { Controller } from '@nestjs/common';

/**
 * MerchantRagController - 已废弃
 * 上传接口已迁移到 KnowledgeBaseController + BullMQ 队列
 * 保留空 Controller 避免路由冲突，后续可删除
 */
@Controller('merchant-rag')
export class MerchantRagController {}
