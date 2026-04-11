---
name: order-item-status-separation
overview: 将 Order 和 OrderItem 的状态职责彻底分离：Order 只管支付/超时级别状态，OrderItem 管发货/售后级别状态。移除 Order 中的待发货/已发货/已收货/售后中状态，同步调整相关业务逻辑。
todos:
  - id: modify-order-status-enum
    content: 修改 OrderStatus 枚举，移除3/4/5/6/8，保留1/2/7/9，更新 orders.entity.ts 的 status 列注释
    status: completed
  - id: modify-shipping-status-enum
    content: ShippingStatus 新增 AFTER_SALE=3，OrderItem 新增 receivedAt 字段
    status: completed
  - id: refactor-merchant-service
    content: 重构 merchant.service.ts：删除 syncOrderStatus，简化 shipOrderItems 校验逻辑，将 batchUpdateOrderStatus 改为 OrderItem 级别的 batchUpdateOrderItemStatus，更新 orderStatusMap
    status: completed
    dependencies:
      - modify-order-status-enum
      - modify-shipping-status-enum
  - id: add-orderitem-operations
    content: 新增 OrderItem 级别的确认收货(confirmOrderItems)和售后申请(applyAfterSale)方法，并更新 merchant.controller.ts 对应端点
    status: completed
    dependencies:
      - refactor-merchant-service
  - id: cleanup-redis-constants
    content: 清理 redis-key.constant.ts 中 Order 级别的 PENDING_SHIPMENT_LIST 常量
    status: completed
    dependencies:
      - modify-order-status-enum
---

## 用户需求

将 Order 和 OrderItem 的状态模型彻底分离，实现职责清晰的分层：

**Order（订单级）** 只管支付/超时维度的状态，因为 Order 本质上是购物车一次性提交的产物，包含多个商家的商品：

- 1-待支付、2-已支付、7-已取消、9-已超时
- 移除：3-待发货、4-已发货、5-已收货、6-已完成、8-售后中

**OrderItem（订单项级）** 承担发货/售后维度的状态，因为发货和售后是商家维度的事情：

- 0-待发货、1-已发货、2-已收货、3-售后中（新增）
- 新增 `receivedAt` 收货时间字段

核心变化：Order 支付成功后直接停在"已支付"，不再联动推进到"待发货"；发货/收货/售后全部在 OrderItem 上流转；删除 `syncOrderStatus` 方法。

## 技术方案

### 架构设计

状态分离后的完整生命周期：

```
Order:  待支付(1) → 已支付(2)      （正常流程）
             → 已超时(9)            （超时未支付）
             → 已取消(7)            （手动取消）

OrderItem: 待发货(0) → 已发货(1) → 已收货(2)     （正常发货收货）
                → 售后中(3)                         （发起售后）
```

**关键设计决策：**

1. Order 支付后状态始终为"已支付(2)"，不再因发货而改变。Order 的职责是：一次结算容器、支付状态跟踪、超时/取消管理。

2. OrderItem 的 `ShippingStatus` 重命名为 `ItemStatus` 更准确（因为现在不仅包含发货状态，还包含售后状态），但考虑到改动范围和字段名语义，保持 `shippingStatus` 字段名不变，只扩展枚举值。

3. 删除 `syncOrderStatus` 方法——这是旧模型中"根据 OrderItem 发货状态反推 Order 状态"的逻辑，新模型中不再需要。

4. `batchUpdateOrderStatus` 改造为 `batchUpdateOrderItemStatus`，操作目标从 Order 变为 OrderItem，状态类型从 OrderStatus 变为 ShippingStatus。

5. 商家发货时的 Order 状态校验从 `PAID || PENDING_SHIPMENT` 简化为 `PAID`（因为新模型中 Order 不再有 PENDING_SHIPMENT）。

6. Redis 中 `PENDING_SHIPMENT_LIST` key 在 Order 级别不再需要，因为待发货是 OrderItem 维度的概念。

### 数据库迁移注意

- `orders.status` 字段的 tinyint 值 3/4/5/6/8 将不再被使用，已有数据中如果存在这些状态值需要做数据迁移（全部映射为 2-已支付）
- `order_items.shippingStatus` 新增值 3（售后中），已有数据不受影响
- `order_items` 新增 `receivedAt` timestamp 列

### 实现策略

按文件影响范围分批修改，先改实体定义（枚举），再改业务逻辑（服务层），最后改控制器和常量。

## 目录结构

```
d:\nest\new-rabbit-back\
├── src\modules\order\entities\
│   ├── orders.entity.ts              # [MODIFY] OrderStatus 枚举缩减为4种，更新 status 列注释
│   └── order_items.entity.ts         # [MODIFY] ShippingStatus 新增 AFTER_SALE=3，新增 receivedAt 字段
├── src\modules\order\
│   ├── order.service.ts              # [无变更] 创建订单逻辑不涉及被移除的状态值
│   ├── order.controller.ts           # [无变更] 只有一个 create 端点
│   └── order-timeout.scheduler.ts    # [无变更] 只使用 PENDING_PAYMENT 和 TIMEOUT
├── src\modules\merchant\
│   ├── merchant.service.ts           # [MODIFY] 核心变更：
│   │                                 #   - shipOrderItems: 移除 syncOrderStatus 调用，Order状态校验简化为 PAID
│   │                                 #   - 删除 syncOrderStatus 方法
│   │                                 #   - batchUpdateOrderStatus → batchUpdateOrderItemStatus（操作OrderItem，ShippingStatus）
│   │                                 #   - getMerchantOrders: 更新 orderStatusMap
│   │                                 #   - 新增 confirmOrderItems 方法（用户确认收货，OrderItem 0→1→2）
│   │                                 #   - 新增 applyAfterSale 方法（OrderItem → 售后中=3）
│   └── merchant.controller.ts        # [MODIFY] 
│                                     #   - batch-status 端点改为 OrderItem 级别
│                                     #   - 新增 confirm 端点（确认收货）
│                                     #   - 新增 after-sale 端点（申请售后）
├── src\common\constants\
│   └── redis-key.constant.ts         # [MODIFY] 移除 PENDING_SHIPMENT_LIST（Order级别不再有待发货概念）
```