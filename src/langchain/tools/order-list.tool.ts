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
        shippedStartTime,
        shippedEndTime,
        page,
        limit,
      }: {
        keyword?: string;
        shippingStatus?: string;
        startTime?: string;
        endTime?: string;
        shippedStartTime?: string;
        shippedEndTime?: string;
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
            shippedStartTime: shippedStartTime || undefined,
            shippedEndTime: shippedEndTime || undefined,
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
            // 发货/售后状态（同时提供数值和中文标签，方便 LLM 统计和筛选）
            shippingStatus: item.shippingStatus,
            shippingStatusLabel: item.shippingStatusLabel,
            // 订单级别状态
            orderStatus: item.orderStatus,
            orderStatusLabel: item.orderStatusLabel,
            // 订单金额信息
            payAmount: item.payAmount != null ? '¥' + item.payAmount : null,
            paidAt: item.paidAt || null,
            shippedAt: item.shippedAt || null,
            createdAt: item.createdAt || null,
          }));

          const total = result?.total || list.length;
          const totalPage = result?.totalPage || 1;
          const hasMore = safePage < totalPage;

          return JSON.stringify({
            success: true,
            message: '查询订单列表成功。',
            summary: `共 ${total} 个订单，第 ${safePage}/${totalPage} 页`,
            page: safePage,
            limit: safeLimit,
            total,
            totalPage,
            hasMore,
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
          '获取当前登录商家的订单列表。用于查询商家的订单、发货状态、支付状态、订单金额等信息。\n' +
          '支持按订单号搜索、按发货/售后状态筛选、按时间范围筛选、分页查询。\n' +
          '不需要用户指定商家 ID，系统会自动从当前登录用户上下文获取。\n' +
          '翻页方式：查看返回结果中的 totalPage 和 hasMore，用户要"下一页"时将 page 设为当前页+1，要"上一页"时设为当前页-1。\n' +
          '时间筛选注意：startTime/endTime 按订单创建时间筛选；shippedStartTime/shippedEndTime 按实际发货时间筛选，两者可以同时使用。',
        schema: z.object({
          keyword: z
            .string()
            .optional()
            .describe('搜索关键词，用于按订单号模糊搜索。'),
          shippingStatus: z
            .string()
            .optional()
            .describe(
              '发货/售后状态筛选，多个用逗号分隔。\n' +
                '0=待发货（未发货），1=已发货，2=已收货，3=售后中（含退款/退货/换货）。\n' +
                '查退款订单用 "3"，查待发货用 "0"，查全部不传此参数。\n' +
                '例如 "0,1" 表示查待发货和已发货。',
            ),
          startTime: z
            .string()
            .optional()
            .describe(
              '按下单时间筛选的开始日期，格式 YYYY-MM-DD。筛选该日期及之后创建的订单。\n' +
                '适用场景："最近一周的订单""本月订单"。\n' +
                '注意：问"今天发货了几个"时不要用此参数，应使用 shippedStartTime。',
            ),
          endTime: z
            .string()
            .optional()
            .describe(
              '按下单时间筛选的结束日期，格式 YYYY-MM-DD。筛选该日期及之前创建的订单。',
            ),
          shippedStartTime: z
            .string()
            .optional()
            .describe(
              '按实际发货时间筛选的开始日期，格式 YYYY-MM-DD。筛选该日期及之后发货的订单。\n' +
                '适用场景："今天发货了哪些""最近一周发货量"。\n' +
                '通常与 shippingStatus=1 或 shippingStatus=3 配合使用。',
            ),
          shippedEndTime: z
            .string()
            .optional()
            .describe(
              '按实际发货时间筛选的结束日期，格式 YYYY-MM-DD。筛选该日期及之前发货的订单。',
            ),
          page: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              '页码，默认为 1。翻页时根据上一轮结果中的 totalPage 判断是否还有下一页。',
            ),
          limit: z
            .number()
            .int()
            .positive()
            .max(20)
            .optional()
            .describe(
              '每页数量，默认为 5，最大 20。查询全部数据时可设为 20 以减少翻页次数。',
            ),
        }),
      },
    );
  }
}
