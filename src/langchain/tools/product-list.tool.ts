import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { MerchantService } from '../../modules/merchant/merchant.service';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginationOptionsType } from '../../types/pagination.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/** getGoodsList 返回的单条商品记录 */
interface GoodsListItem {
  id: number;
  name: string;
  specsLabel: string;
  price: number;
  salePrice?: number;
  minPrice?: number;
  stock: number;
  skuCode: string;
  brand: string;
  categoryLabel: string;
  status: boolean;
}

/** getGoodsList 返回的分页结果 */
interface GoodsListResult {
  list: GoodsListItem[];
  total: number;
  totalPage: number;
  page: number;
  limit: number;
}

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

          // 客户端用户（roleId=3）只能查看上架商品
          if (roleId === 3) {
            options.goodsStatus = true; // true 表示上架状态
          }

          // 使用真实用户信息构造 payload
          const payload = { id: userId, roleId } as JwtPayloadType;

          const result = (await this.merchantService.getGoodsList(
            payload,
            options,
            merchantId,
          )) as GoodsListResult | undefined;

          const list = result?.list ?? [];

          if (list.length === 0) {
            return JSON.stringify({
              success: true,
              message: '未找到商品。',
              page: safePage,
              limit: safeLimit,
              total: result?.total ?? 0,
              products: [],
            });
          }

          const formattedList = list.map((item: GoodsListItem) => ({
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

          const total = result?.total ?? list.length;
          const totalPage = result?.totalPage ?? 1;
          const hasMore = safePage < totalPage;

          return JSON.stringify({
            success: true,
            message: '查询商品列表成功。',
            summary: `共 ${total} 个商品，第 ${safePage}/${totalPage} 页`,
            page: safePage,
            limit: safeLimit,
            total,
            totalPage,
            hasMore,
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
          '获取商品列表。用于查询商品名称、价格、库存、SKU 编码、品牌、分类、上下架状态。\n' +
          '商家使用时：可查看所有商品（含下架）。\n' +
          '客户端用户使用时：只能查看已上架的商品。\n' +
          'keyword 支持按商品名/SKU 编码/规格模糊搜索。需要查找特定商品时传入 keyword。\n' +
          '不需要用户指定商家 ID，系统自动获取。\n' +
          '翻页：结果含 totalPage/hasMore，"下一页" page+1。',
        schema: z.object({
          keyword: z
            .string()
            .optional()
            .describe(
              '搜索关键词，用于按商品名称、SKU 编码或规格模糊搜索。查"iPhone"传 "iPhone"，查 SKU 编码传具体编码。',
            ),
          page: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('页码，默认 1。翻页时按 totalPage 判断。'),
          limit: z
            .number()
            .int()
            .positive()
            .max(20)
            .optional()
            .describe('每页数量，默认 5，最大 20。要一次多查可设 20。'),
        }),
      },
    );
  }

  /** 格式化商品价格字段，支持 price / salePrice / minPrice 优先级回退 */
  private formatPrice = (item: GoodsListItem): string | null => {
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
