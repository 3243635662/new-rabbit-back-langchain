import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { InventoryService } from '../../modules/inventory/inventory.service';
import { JwtPayloadType } from '../../types/auth.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 手动入库/出库 Tool
 *
 * 职责：封装手动调整库存（入库或出库）的业务逻辑。
 * 商家通过 AI 助手执行手动入库或出库操作，需要提供 SKU 编码、数量和操作类型。
 */
@Injectable()
export class InventoryStockChangeTool {
  private readonly logger = new Logger(InventoryStockChangeTool.name);

  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * 创建 manualStockChange Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId, merchantId } = context;

    return tool(
      async ({
        skuCode,
        count,
        type,
        remark,
      }: {
        skuCode: string;
        count: number;
        type: 'MANUAL_ADD' | 'MANUAL_REDUCE';
        remark?: string;
      }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法执行库存操作。',
          });
        }

        if (!skuCode?.trim()) {
          return JSON.stringify({
            success: false,
            message: '请提供 SKU 编码。',
          });
        }

        if (!count || count <= 0) {
          return JSON.stringify({
            success: false,
            message: '操作数量必须大于 0。',
          });
        }

        if (!['MANUAL_ADD', 'MANUAL_REDUCE'].includes(type)) {
          return JSON.stringify({
            success: false,
            message:
              '操作类型无效，仅支持 MANUAL_ADD（入库）或 MANUAL_REDUCE（出库）。',
          });
        }

        try {
          const payload = { id: userId, roleId } as JwtPayloadType;

          const result = await this.inventoryService.manualStockChange(
            payload,
            {
              skuCode: skuCode.trim(),
              count,
              type,
              remark: remark?.trim() || undefined,
            },
          );

          const actionLabel = type === 'MANUAL_ADD' ? '入库' : '出库';

          return JSON.stringify({
            success: true,
            message: `SKU ${skuCode} 手动${actionLabel} ${count} 成功。`,
            data: {
              id: result.id,
              skuId: result.skuId,
              stock: result.stock,
              warningStock: result.warningStock,
              isWarning: result.isWarning,
            },
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('手动库存操作失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '手动库存操作失败。',
            error: errorMessage,
          });
        }
      },
      {
        name: 'manualStockChange',
        description:
          '手动入库或出库操作。用于商家对指定 SKU 进行手动入库（增加库存）或出库（减少库存）。需要提供 SKU 编码、操作数量、操作类型。出库时库存不足会报错。不需要用户指定商家 ID。',
        schema: z.object({
          skuCode: z.string().describe('SKU 编码，必填。指定要操作的 SKU。'),
          count: z
            .number()
            .int()
            .positive()
            .describe('操作数量，必填。必须大于 0。'),
          type: z
            .enum(['MANUAL_ADD', 'MANUAL_REDUCE'])
            .describe(
              '操作类型，必填。MANUAL_ADD=手动入库（增加库存），MANUAL_REDUCE=手动出库（减少库存）。',
            ),
          remark: z
            .string()
            .optional()
            .describe('备注说明，可选。记录本次操作的原因。'),
        }),
      },
    );
  }
}
