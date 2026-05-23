/**
 * @file agent-tools.factory.ts
 * @description Agent 工具工厂
 * @职责 根据运行时上下文组装当前 Agent 可用的工具列表
 */

import { Injectable } from '@nestjs/common';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { MerchantKbTool } from '../../tools/merchant-kb.tool';
import { ProductListTool } from '../../tools/product-list.tool';
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
    private readonly orderListTool: OrderListTool,
    private readonly inventoryListTool: InventoryListTool,
    private readonly inventoryLogsTool: InventoryLogsTool,
    private readonly inventoryStockChangeTool: InventoryStockChangeTool,
    private readonly userInfoTool: UserInfoTool,
    private readonly shipOrderTool: ShipOrderTool,
    private readonly merchantCategoriesTool: MerchantCategoriesTool,
    private readonly genericQueryTool: GenericQueryTool,
  ) {}

  /** 组装当前 Agent 可用的 Tool 列表 */
  createTools = (context: AgentRuntimeContext): DynamicStructuredTool[] => {
    return [
      this.merchantKbTool.create(context),
      this.productListTool.create(context),
      this.orderListTool.create(context),
      this.inventoryListTool.create(context),
      this.inventoryLogsTool.create(context),
      this.inventoryStockChangeTool.create(context),
      this.userInfoTool.create(context),
      this.shipOrderTool.create(context),
      this.merchantCategoriesTool.create(context),
      this.genericQueryTool.create(context),
    ];
  };
}
