import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import {
  MerchantService,
  CategoryTreeNode,
} from '../../modules/merchant/merchant.service';
import { JwtPayloadType } from '../../types/auth.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 获取商家分类树 Tool
 *
 * 职责：封装获取商家商品分类树的业务逻辑。
 * 返回包含系统公共分类和商家自定义分类的树形结构。
 */
@Injectable()
export class MerchantCategoriesTool {
  private readonly logger = new Logger(MerchantCategoriesTool.name);

  constructor(private readonly merchantService: MerchantService) {}

  /**
   * 创建 getMerchantCategories Tool 实例
   * @param context Agent 运行时上下文，包含用户身份和商户信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId, merchantId } = context;

    return tool(
      async () => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法获取分类信息。',
            categories: [],
          });
        }

        try {
          const payload = { id: userId, roleId } as JwtPayloadType;

          const categories =
            await this.merchantService.getMerchantCategories(payload);

          if (!categories || categories.length === 0) {
            return JSON.stringify({
              success: true,
              message: '暂无分类信息。',
              categories: [],
            });
          }

          const formattedCategories = categories.map(
            (cat: CategoryTreeNode) => ({
              id: cat.id,
              name: cat.name,
              children: cat.children
                ? cat.children.map((child: CategoryTreeNode) => ({
                    id: child.id,
                    name: child.name,
                  }))
                : [],
            }),
          );

          return JSON.stringify({
            success: true,
            message: '获取分类信息成功。',
            categories: formattedCategories,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('获取分类信息失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '获取分类信息失败。',
            error: errorMessage,
            categories: [],
          });
        }
      },
      {
        name: 'getMerchantCategories',
        description:
          '获取当前登录商家的商品分类树。用于查询商家有哪些商品分类（包括系统公共分类和商家自定义分类），返回树形结构。不需要任何参数，系统会自动从当前登录用户上下文获取。',
        schema: z.object({}),
      },
    );
  }
}
