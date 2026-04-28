import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { MerchantService } from '../../modules/merchant/merchant.service';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginationOptionsType } from '../../types/pagination.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 获取订单列表 Tool
 *
 * 职责：封装获取商家订单列表的业务逻辑。
 * merchantId 从 Agent 上下文的 token 中获取，无需用户在对话中指定。
 */
@Injectable()
export class OrderListTool {
  private readonly logger = new Logger(OrderListTool.name);

  constructor(private readonly merchantService: MerchantService) {}

  /**
   * 创建 getOrderList Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId, merchantId } = context;

    return tool(
      async ({
        keyword,
        shippingStatus,
        startTime,
        endTime,
        page,
        limit,
      }: {
        keyword?: string;
        shippingStatus?: string;
        startTime?: string;
        endTime?: string;
        page?: number;
        limit?: number;
      }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法获取订单列表。',
            orders: [],
          });
        }

        const safePage = Math.max(1, page || 1);
        const safeLimit = Math.min(Math.max(1, limit || 5), 20);

        try {
          const options: PaginationOptionsType = {
            page: safePage,
            limit: safeLimit,
            keyword: keyword?.trim() || '',
            status: shippingStatus || undefined,
            startTime: startTime || undefined,
            endTime: endTime || undefined,
            sort: 'createdAt',
            order: 'DESC',
          };

          // 使用真实用户信息构造 payload
          const payload = { id: userId, roleId } as JwtPayloadType;

          const result = await this.merchantService.getMerchantOrders(
            payload,
            options,
          );

          const list = result?.list || [];

          if (list.length === 0) {
            return JSON.stringify({
              success: true,
              message: '未找到订单。',
              page: safePage,
              limit: safeLimit,
              total: result?.total || 0,
              orders: [],
            });
          }

          const formattedList = list.map((item) => ({
            orderItemId: item.orderItemId,
            orderNo: item.orderNo,
            skuName: item.skuName,
            skuCode: item.skuCode || null,
            specs: item.specs || null,
            count: item.count,
            price: item.price != null ? '¥' + item.price : null,
            totalPrice: item.totalPrice != null ? '¥' + item.totalPrice : null,
            shippingStatus: item.shippingStatusLabel,
            orderStatus: item.orderStatusLabel,
            paidAt: item.paidAt || null,
            createdAt: item.createdAt || null,
          }));

          const total = result?.total || list.length;

          return JSON.stringify({
            success: true,
            message: '查询订单列表成功。',
            summary: `共 ${total} 个订单，第 ${safePage} 页`,
            page: safePage,
            limit: safeLimit,
            total,
            orders: formattedList,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('获取订单列表失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '获取订单列表失败。',
            error: errorMessage,
            orders: [],
          });
        }
      },
      {
        name: 'getOrderList',
        description:
          '获取当前登录商家的订单列表。用于查询商家的订单、发货状态、支付状态、订单金额等信息。支持按订单号搜索、按发货状态筛选、按时间范围筛选。不需要用户指定商家 ID，系统会自动从当前登录用户上下文获取。',
        schema: z.object({
          keyword: z
            .string()
            .optional()
            .describe('搜索关键词，可选。用于按订单号模糊搜索。'),
          shippingStatus: z
            .string()
            .optional()
            .describe(
              '发货状态筛选，可选。多个状态用逗号分隔：0=待发货，1=已发货，2=已收货，3=售后中。例如 "0,1" 表示查待发货和已发货。',
            ),
          startTime: z
            .string()
            .optional()
            .describe(
              '开始时间，可选。格式如 2025-01-01，筛选该时间之后的订单。',
            ),
          endTime: z
            .string()
            .optional()
            .describe(
              '结束时间，可选。格式如 2025-12-31，筛选该时间之前的订单。',
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
