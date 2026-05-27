import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { MerchantService } from '../../modules/merchant/merchant.service';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 获取商品详情 Tool
 *
 * 职责：根据商品 ID 或 SKU ID 获取商品全量信息（SPU + 所有 SKU 规格/价格/库存）。
 * 商家（roleId=2）和客户端用户（roleId=3）均可使用。
 * 客户端用户调用时，仅返回已上架的 SKU（isLaunching=true）。
 */
@Injectable()
export class ProductDetailTool {
  private readonly logger = new Logger(ProductDetailTool.name);

  constructor(private readonly merchantService: MerchantService) {}

  /**
   * 创建 getProductDetail Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { roleId, merchantId } = context;

    return tool(
      async ({
        goodsId,
        skuId,
      }: {
        goodsId?: number | string;
        skuId?: number | string;
      }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法获取商品详情。',
          });
        }

        // skuId 优先：根据 skuId 反查 goodsId
        const targetGoodsId =
          typeof goodsId === 'string' ? Number(goodsId) : goodsId;
        if (skuId) {
          return JSON.stringify({
            success: false,
            message:
              '请传入 goodsId（商品ID）查询商品详情。skuId 参数暂不支持。',
          });
        }

        if (!targetGoodsId || isNaN(targetGoodsId)) {
          return JSON.stringify({
            success: false,
            message: '请传入有效的 goodsId（商品ID）。',
          });
        }

        try {
          const result = await this.merchantService.getGoodsDetail(
            targetGoodsId,
            merchantId,
          );

          if (!result.success) {
            return JSON.stringify(result);
          }

          // 客户端用户：只保留已上架的 SKU，且去除库存等敏感字段
          if (roleId === 3) {
            const typed = result;
            const skus = (typed['skus'] as Record<string, unknown>[]) || [];
            typed['skus'] = skus
              .filter((s) => s['isLaunching'] === true)
              .map((s) => {
                const cleaned = { ...s };
                delete cleaned['stock'];
                return cleaned;
              });
            typed['skuCount'] = (typed['skus'] as unknown[]).length;
          }

          return JSON.stringify(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`获取商品详情失败: ${msg}`);
          return JSON.stringify({
            success: false,
            message: `获取商品详情失败: ${msg}`,
          });
        }
      },
      {
        name: 'getProductDetail',
        description:
          '获取商品详情（SPU + 全量 SKU 规格/价格）。' +
          '传入 goodsId（商品ID）查询该商品的所有规格信息。' +
          '商家可查看所有 SKU（含库存），客户端用户仅可查看已上架的 SKU（不含库存）。' +
          '如需查具体某个 SKU 的价格，用此工具获取全量 SKU 后自行匹配。',
        schema: z.object({
          goodsId: z.coerce
            .number()
            .optional()
            .describe(
              '商品ID（SPU ID），优先传入此参数。从商品详情页 URL 或上下文中获取。',
            ),
          skuId: z.coerce
            .number()
            .optional()
            .describe(
              'SKU ID，当前仅支持通过 goodsId 查询，此参数暂不支持，请传 goodsId。',
            ),
        }),
      },
    );
  }
}
