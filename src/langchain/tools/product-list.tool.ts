import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { MerchantService } from '../../modules/merchant/merchant.service';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginationOptionsType } from '../../types/pagination.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 获取商品列表 Tool
 *
 * 职责：封装获取商家商品列表的业务逻辑。
 * merchantId 从 Agent 上下文的 token 中获取，无需用户在对话中指定。
 */
@Injectable()
export class ProductListTool {
  private readonly logger = new Logger(ProductListTool.name);

  constructor(private readonly merchantService: MerchantService) {}

  /**
   * 创建 getProductList Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId, merchantId } = context;

    return tool(
      async ({
        keyword,
        page,
        limit,
      }: {
        keyword?: string;
        page?: number;
        limit?: number;
      }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法获取商品列表。',
            products: [],
          });
        }

        const safePage = Math.max(1, page || 1);
        const safeLimit = Math.min(Math.max(1, limit || 5), 20);

        try {
          const options: PaginationOptionsType = {
            page: safePage,
            limit: safeLimit,
            keyword: keyword?.trim() || '',
            order: 'DESC',
          };

          // 使用真实用户信息构造 payload
          const payload = { id: userId, roleId } as JwtPayloadType;

          const result = await this.merchantService.getGoodsList(
            payload,
            options,
            merchantId,
          );

          const list = result?.list || [];

          if (list.length === 0) {
            return JSON.stringify({
              success: true,
              message: '未找到商品。',
              page: safePage,
              limit: safeLimit,
              total: result?.total || 0,
              products: [],
            });
          }

          const formattedList = list.map((item) => ({
            id: item.id,
            name: item.name,
            specs: item.specsLabel || null,
            price: this.formatPrice(item),
            stock: item.stock ?? 0,
            skuCode: item.skuCode || null,
            brand: item.brand || null,
            category: item.categoryLabel || null,
            status: item.status ? '上架' : '下架',
          }));

          const total = result?.total || list.length;

          return JSON.stringify({
            success: true,
            message: '查询商品列表成功。',
            summary: `共 ${total} 个商品，第 ${safePage} 页`,
            page: safePage,
            limit: safeLimit,
            total,
            products: formattedList,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('获取商品列表失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '获取商品列表失败。',
            error: errorMessage,
            products: [],
          });
        }
      },
      {
        name: 'getProductList',
        description:
          '获取当前登录商家的商品列表。用于查询商家有哪些商品、商品价格、库存、SKU、品牌、分类、上下架状态等信息。支持通过关键词搜索商品名称、规格或 SKU 编码。不需要用户指定商家 ID，系统会自动从当前登录用户上下文获取。',
        schema: z.object({
          keyword: z
            .string()
            .optional()
            .describe('搜索关键词，可选。用于过滤商品名称、规格或 SKU 编码。'),
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

  /** 格式化商品价格字段 */
  private formatPrice = (item: Record<string, unknown>): string | null => {
    const raw = item.price ?? item.salePrice ?? item.minPrice;

    if (raw === undefined || raw === null) {
      return null;
    }

    const num = Number(raw);
    if (Number.isNaN(num)) {
      return null;
    }

    return '¥' + num;
  };
}
