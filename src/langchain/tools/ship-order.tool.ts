import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { MerchantService } from '../../modules/merchant/merchant.service';
import { JwtPayloadType } from '../../types/auth.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 确认发货 Tool
 *
 * 职责：封装商家确认订单发货的业务逻辑。
 * 商家通过 AI 助手确认某个订单项的发货操作，需要提供订单项 ID。
 */
@Injectable()
export class ShipOrderTool {
  private readonly logger = new Logger(ShipOrderTool.name);

  constructor(private readonly merchantService: MerchantService) {}

  /**
   * 创建 shipOrder Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId, merchantId } = context;

    return tool(
      async ({ orderItemId }: { orderItemId: string }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法执行发货操作。',
          });
        }

        if (!orderItemId?.trim()) {
          return JSON.stringify({
            success: false,
            message: '请提供订单项 ID。',
          });
        }

        try {
          const payload = { id: userId, roleId } as JwtPayloadType;

          const result = await this.merchantService.shipOrderItems(
            payload,
            orderItemId.trim(),
          );

          return JSON.stringify({
            success: true,
            message: `订单项 ${orderItemId} 已确认发货。`,
            data: result,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('确认发货失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '确认发货失败。',
            error: errorMessage,
          });
        }
      },
      {
        name: 'shipOrder',
        description:
          '商家确认订单发货。将待发货订单项标记为已发货。\n' +
          'orderItemId 从 getOrderList 结果中获取（不是 orderNo 也不是 skuCode）。\n' +
          '只能发 shippingStatus=0（待发货）的订单项。\n' +
          '操作前向用户确认订单号和商品名，避免误操作。',
        schema: z.object({
          orderItemId: z
            .string()
            .describe(
              '订单项 ID，必填。从 getOrderList 返回的 orderItemId 获取。',
            ),
        }),
      },
    );
  }
}
