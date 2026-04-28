import { Module, forwardRef } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { LangChainModule } from '../langchain.module';
import { MerchantModule } from '../../modules/merchant/merchant.module';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { UserModule } from '../../modules/user/user.module';
import { MerchantKbTool } from './merchant-kb.tool';
import { ProductListTool } from './product-list.tool';
import { OrderListTool } from './order-list.tool';
import { InventoryListTool } from './inventory-list.tool';
import { InventoryLogsTool } from './inventory-logs.tool';
import { InventoryStockChangeTool } from './inventory-stock-change.tool';
import { UserInfoTool } from './user-info.tool';
import { ShipOrderTool } from './ship-order.tool';
import { MerchantCategoriesTool } from './merchant-categories.tool';

/**
 * LangChain Tools 模块
 *
 * 聚合所有 Agent 可调用的 Tool，每个 Tool 只封装单一业务能力。
 * Agent 层通过注入 Tool 类来组装工具列表，不直接依赖底层业务 Service。
 */
@Module({
  imports: [
    RagModule,
    MerchantModule,
    InventoryModule,
    UserModule,
    forwardRef(() => LangChainModule),
  ],
  providers: [
    MerchantKbTool,
    ProductListTool,
    OrderListTool,
    InventoryListTool,
    InventoryLogsTool,
    InventoryStockChangeTool,
    UserInfoTool,
    ShipOrderTool,
    MerchantCategoriesTool,
  ],
  exports: [
    MerchantKbTool,
    ProductListTool,
    OrderListTool,
    InventoryListTool,
    InventoryLogsTool,
    InventoryStockChangeTool,
    UserInfoTool,
    ShipOrderTool,
    MerchantCategoriesTool,
  ],
})
export class ToolModule {}
