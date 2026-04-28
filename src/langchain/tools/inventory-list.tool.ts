import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { InventoryService } from '../../modules/inventory/inventory.service';
import { JwtPayloadType } from '../../types/auth.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 获取库存列表 Tool
 *
 * 职责：封装获取商家库存列表的业务逻辑。
 * merchantId 从 Agent 上下文的 token 中获取，无需用户在对话中指定。
 */
@Injectable()
export class InventoryListTool {
  private readonly logger = new Logger(InventoryListTool.name);

  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * 创建 getInventoryList Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId, merchantId } = context;

    return tool(
      async ({
        keyword,
        isWarning,
        page,
        limit,
      }: {
        keyword?: string;
        isWarning?: boolean;
        page?: number;
        limit?: number;
      }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法获取库存列表。',
            inventories: [],
          });
        }

        const safePage = Math.max(1, page || 1);
        const safeLimit = Math.min(Math.max(1, limit || 5), 20);

        try {
          const payload = { id: userId, roleId } as JwtPayloadType;

          const result = await this.inventoryService.getMerchantInventoryList(
            payload,
            {
              page: safePage,
              limit: safeLimit,
              keyword: keyword?.trim() || '',
              isWarning: isWarning ? '1' : undefined,
              order: 'DESC',
            },
          );

          const list = result?.list || [];

          if (list.length === 0) {
            return JSON.stringify({
              success: true,
              message: '未找到库存记录。',
              page: safePage,
              limit: safeLimit,
              total: result?.total || 0,
              inventories: [],
            });
          }

          const formattedList = list.map((item: Record<string, unknown>) => ({
            id: item.id,
            goodsName: item.goodsName || '未知商品',
            skuCode: item.skuCode || null,
            specs: item.specsLabel || null,
            stock: item.stock ?? 0,
            warningStock: item.warningStock ?? 0,
            isWarning: item.isWarning ?? false,
            lockedStock: item.lockedStock ?? 0,
            goodsStatus: item.goodsStatus || '下架',
          }));

          const total = result?.total || list.length;

          return JSON.stringify({
            success: true,
            message: '查询库存列表成功。',
            summary: `共 ${total} 条库存记录，第 ${safePage} 页`,
            page: safePage,
            limit: safeLimit,
            total,
            inventories: formattedList,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('获取库存列表失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '获取库存列表失败。',
            error: errorMessage,
            inventories: [],
          });
        }
      },
      {
        name: 'getInventoryList',
        description:
          '获取当前登录商家的库存列表。用于查询商家有哪些库存、库存数量、预警状态、锁定库存等信息。支持通过关键词搜索商品名称、SKU编码或规格，支持筛选预警库存。不需要用户指定商家 ID，系统会自动从当前登录用户上下文获取。',
        schema: z.object({
          keyword: z
            .string()
            .optional()
            .describe('搜索关键词，可选。用于过滤商品名称、SKU编码或规格。'),
          isWarning: z
            .boolean()
            .optional()
            .describe(
              '是否只显示预警库存，可选。设为 true 时只返回库存低于预警值的记录。',
            ),
          page: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('页码，可选，默认为 1。'),
          limit: z
            .number()
            .int()
            .positive()
            .max(20)
            .optional()
            .describe('每页数量，可选，默认为 5，最大为 20。'),
        }),
      },
    );
  }
}
