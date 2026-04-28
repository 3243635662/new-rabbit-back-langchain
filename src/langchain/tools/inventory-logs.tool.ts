import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { InventoryService } from '../../modules/inventory/inventory.service';
import { InventoryLog } from '../../modules/inventory/entities/inventory_logs.entity';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginationOptionsType } from '../../types/pagination.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 获取库存变动日志 Tool
 *
 * 职责：封装获取指定 SKU 库存变动记录的业务逻辑。
 * 通过 skuCode 查询该 SKU 的入库/出库/订单扣减/退款等历史变动。
 */
@Injectable()
export class InventoryLogsTool {
  private readonly logger = new Logger(InventoryLogsTool.name);

  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * 创建 getInventoryLogs Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId, merchantId } = context;

    return tool(
      async ({
        skuCode,
        page,
        limit,
      }: {
        skuCode: string;
        page?: number;
        limit?: number;
      }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法获取库存变动记录。',
            logs: [],
          });
        }

        if (!skuCode?.trim()) {
          return JSON.stringify({
            success: false,
            message: '请提供 SKU 编码以查询库存变动记录。',
            logs: [],
          });
        }

        const safePage = Math.max(1, page || 1);
        const safeLimit = Math.min(Math.max(1, limit || 5), 20);

        try {
          const payload = { id: userId, roleId } as JwtPayloadType;
          const options: PaginationOptionsType = {
            page: safePage,
            limit: safeLimit,
            order: 'DESC',
          };

          const result = await this.inventoryService.getInventoryLogs(
            payload,
            skuCode.trim(),
            options,
          );

          const list = result?.list || [];

          if (list.length === 0) {
            return JSON.stringify({
              success: true,
              message: `SKU ${skuCode} 暂无库存变动记录。`,
              page: safePage,
              limit: safeLimit,
              total: result?.total || 0,
              logs: [],
            });
          }

          const typeMap: Record<string, string> = {
            ORDER: '下单扣减',
            REFUND: '退货入库',
            MANUAL_ADD: '手动入库',
            MANUAL_REDUCE: '手动出库',
          };

          const formattedList = list.map((log: InventoryLog) => ({
            id: log.id,
            change: log.change,
            changeLabel: log.change > 0 ? `+${log.change}` : String(log.change),
            currentStock: log.currentStock,
            type: log.type,
            typeLabel: typeMap[log.type] || log.type,
            relatedId: log.relatedId || null,
            remark: log.remark || null,
            createdAt: log.createdAt || null,
          }));

          const total = result?.total || list.length;

          return JSON.stringify({
            success: true,
            message: `查询 SKU ${skuCode} 的库存变动记录成功。`,
            summary: `共 ${total} 条变动记录，第 ${safePage} 页`,
            page: safePage,
            limit: safeLimit,
            total,
            logs: formattedList,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('获取库存变动记录失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '获取库存变动记录失败。',
            error: errorMessage,
            logs: [],
          });
        }
      },
      {
        name: 'getInventoryLogs',
        description:
          '获取指定 SKU 编码的库存变动日志。用于查询某个商品的库存增减历史，包括下单扣减、退货入库、手动入库/出库等变动记录。需要提供 SKU 编码（skuCode），不需要用户指定商家 ID。',
        schema: z.object({
          skuCode: z
            .string()
            .describe('SKU 编码，必填。用于查询该 SKU 的库存变动记录。'),
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
