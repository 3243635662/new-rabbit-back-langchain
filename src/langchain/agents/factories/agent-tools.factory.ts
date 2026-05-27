/**
 * @file agent-tools.factory.ts
 * @description Agent 工具工厂
 * @职责 根据运行时上下文组装当前 Agent 可用的工具列表
 */

import { Injectable } from '@nestjs/common';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { MerchantKbTool } from '../../tools/merchant-kb.tool';
import { ProductListTool } from '../../tools/product-list.tool';
import { ProductDetailTool } from '../../tools/product-detail.tool';
import { OrderListTool } from '../../tools/order-list.tool';
import { InventoryListTool } from '../../tools/inventory-list.tool';
import { InventoryLogsTool } from '../../tools/inventory-logs.tool';
import { InventoryStockChangeTool } from '../../tools/inventory-stock-change.tool';
import { UserInfoTool } from '../../tools/user-info.tool';
import { ShipOrderTool } from '../../tools/ship-order.tool';
import { MerchantCategoriesTool } from '../../tools/merchant-categories.tool';
import { GenericQueryTool } from '../../tools/generic-query.tool';
import { AgentRuntimeContext } from '../../../types/agent.type';

@Injectable()
export class AgentToolsFactory {
  constructor(
    private readonly merchantKbTool: MerchantKbTool,
    private readonly productListTool: ProductListTool,
    private readonly productDetailTool: ProductDetailTool,
    private readonly orderListTool: OrderListTool,
    private readonly inventoryListTool: InventoryListTool,
    private readonly inventoryLogsTool: InventoryLogsTool,
    private readonly inventoryStockChangeTool: InventoryStockChangeTool,
    private readonly userInfoTool: UserInfoTool,
    private readonly shipOrderTool: ShipOrderTool,
    private readonly merchantCategoriesTool: MerchantCategoriesTool,
    private readonly genericQueryTool: GenericQueryTool,
  ) {}

  /** 组装当前 Agent 可用的 Tool 列表（根据角色过滤） */
  createTools = (context: AgentRuntimeContext): DynamicStructuredTool[] => {
    const roleId = context.roleId;
    const tools: DynamicStructuredTool[] = [];

    // ===== 所有角色都可以使用的工具 =====
    // 知识库检索（商家和客户都需要）
    tools.push(this.merchantKbTool.create(context));
    // 商品列表查询（商家和客户都需要）
    tools.push(this.productListTool.create(context));
    // 商品详情查询（根据 goodsId 获取 SPU + 全量 SKU 规格/价格/库存）
    tools.push(this.productDetailTool.create(context));
    // 分类查询
    tools.push(this.merchantCategoriesTool.create(context));

    // ===== 商家专属工具（roleId === 2） =====
    if (roleId === 2) {
      tools.push(this.orderListTool.create(context));
      tools.push(this.inventoryListTool.create(context));
      tools.push(this.inventoryLogsTool.create(context));
      tools.push(this.inventoryStockChangeTool.create(context));
      tools.push(this.userInfoTool.create(context));
      tools.push(this.shipOrderTool.create(context));
      tools.push(this.genericQueryTool.create(context));
    }

    // ===== 客户专属工具（roleId === 3）======
    // 客户只能查询商品相关信息，不能查询订单、库存等敏感信息
    // 已在上方面向所有角色的工具中添加了客户可用的工具

    return tools;
  };
}
