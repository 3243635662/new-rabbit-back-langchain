# 库存模块接口文档

## 基础信息

- 基础路径: `/inventory`
- 认证方式: JWT Token（通过 `Authorization` Header 传递）
- 统一响应格式:

```json
{
  "code": 0,
  "message": "操作成功",
  "result": {}
}
```

---

## 1. 商家库存列表查询

获取当前登录商家所属商品的库存列表，支持关键词搜索、预警筛选和分页。

**Redis 缓存**: 列表结果缓存 5 分钟，缓存 Key 格式为 `inventory:merchant:list:{merchantId}:{page}:{limit}:{keyword}:{isWarning}`。

### 请求

```http
GET /inventory/merchant/list?page=1&limit=10&keyword=把手&isWarning=1
```

### Query 参数

| 参数名    | 类型   | 必填 | 说明                                                                                     |
| --------- | ------ | ---- | ---------------------------------------------------------------------------------------- |
| page      | number | 否   | 页码，默认 1                                                                             |
| limit     | number | 否   | 每页数量，默认 10，最大 50                                                               |
| keyword   | string | 否   | 搜索关键词，支持商品名称、SKU 编码、规格内容模糊匹配                                     |
| sort      | string | 否   | 排序字段，支持 `id`、`stock`、`warningStock`、`createdAt`、`updatedAt`，默认 `updatedAt` |
| order     | string | 否   | 排序方向，`ASC` 或 `DESC`，默认 `DESC`                                                   |
| isWarning | string | 否   | 传 `1` 或 `true` 时只返回低于预警值的库存                                                |

### 响应示例

```json
{
  "code": 0,
  "message": "查询成功",
  "result": {
    "list": [
      {
        "id": 1,
        "skuCode": "BZ6542",
        "goodsId": 10,
        "goodsName": "100角磨机配件手动自锁压板神器手",
        "goodsPicture": "https://xxx.jpg",
        "shortName": "100角磨机配件手动自锁压板神器手",
        "specs": [{ "name": "颜色", "value": "蓝色" }],
        "specsLabel": "颜色: 蓝色",
        "cargoNo": "BZ6542",
        "goodsStatus": "上架",
        "status": true,
        "totalOut": 565545,
        "totalIn": 565545,
        "stock": 500,
        "warningStock": 1000,
        "isWarning": true,
        "lockedStock": 0,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-08-23T00:00:00.000Z"
      }
    ],
    "total": 265,
    "totalPage": 27,
    "page": 1,
    "limit": 10
  }
}
```

### 字段说明

| 字段         | 说明                                      |
| ------------ | ----------------------------------------- |
| id           | 库存记录 ID                               |
| skuCode      | 商品编号 / SKU 编码（业务锚点）           |
| goodsId      | 所属商品 SPU ID                           |
| goodsName    | 商品名称                                  |
| goodsPicture | 商品图片（优先取 SKU 图，否则取商品主图） |
| shortName    | 商品简称（当前取商品名）                  |
| specs        | 规格数组                                  |
| specsLabel   | 规格文本，如 "颜色: 蓝色 / 尺码: XL"      |
| cargoNo      | 货号（当前取 SKU 编码）                   |
| goodsStatus  | 商品状态，"上架" 或 "下架"                |
| status       | 上架状态布尔值                            |
| totalOut     | 累计出库数量（从库存日志统计）            |
| totalIn      | 累计入库数量（从库存日志统计）            |
| stock        | 当前可用库存                              |
| warningStock | 库存预警值                                |
| isWarning    | 是否已触发预警                            |
| lockedStock  | 已锁定库存（已下单未支付）                |

---

## 2. 库存详情查询

根据库存记录 ID 查询单个库存详情。

**Redis 缓存**: 详情缓存 5 分钟，缓存 Key 格式为 `inventory:detail:{inventoryId}`。

### 请求

```http
GET /inventory/detail/1
```

### Path 参数

| 参数名 | 类型   | 必填 | 说明        |
| ------ | ------ | ---- | ----------- |
| id     | number | 是   | 库存记录 ID |

### 响应示例

```json
{
  "code": 0,
  "message": "查询成功",
  "result": {
    "id": 1,
    "skuCode": "BZ6542",
    "goodsId": 10,
    "goodsName": "100角磨机配件手动自锁压板神器手",
    "goodsPicture": "https://xxx.jpg",
    "shortName": "100角磨机配件手动自锁压板神器手",
    "specs": [{ "name": "颜色", "value": "蓝色" }],
    "specsLabel": "颜色: 蓝色",
    "cargoNo": "BZ6542",
    "goodsStatus": "上架",
    "status": true,
    "totalOut": 565545,
    "totalIn": 565545,
    "stock": 500,
    "warningStock": 1000,
    "isWarning": true,
    "lockedStock": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-08-23T00:00:00.000Z"
  }
}
```

---

## 3. 库存变动日志查询

查询某个 SKU 的出入库记录，按时间倒序排列。

### 请求

```http
GET /inventory/logs/BZ6542?page=1&limit=10
```

### Path 参数

| 参数名  | 类型   | 必填 | 说明            |
| ------- | ------ | ---- | --------------- |
| skuCode | string | 是   | SKU 编码 / 货号 |

### Query 参数

| 参数名 | 类型   | 必填 | 说明                       |
| ------ | ------ | ---- | -------------------------- |
| page   | number | 否   | 页码，默认 1               |
| limit  | number | 否   | 每页数量，默认 10，最大 50 |

### 响应示例

```json
{
  "code": 0,
  "message": "查询成功",
  "result": {
    "list": [
      {
        "id": 1,
        "skuId": 100,
        "change": -10,
        "currentStock": 500,
        "type": "ORDER",
        "relatedId": "20240823-000001",
        "operatorId": null,
        "remark": null,
        "createdAt": "2024-08-23T10:00:00.000Z"
      },
      {
        "id": 2,
        "skuId": 100,
        "change": 100,
        "currentStock": 510,
        "type": "MANUAL_ADD",
        "relatedId": null,
        "operatorId": null,
        "remark": "手动入库 100",
        "createdAt": "2024-08-22T09:00:00.000Z"
      }
    ],
    "total": 50,
    "totalPage": 5,
    "page": 1,
    "limit": 10
  }
}
```

### 日志 type 说明

| type 值       | 含义                |
| ------------- | ------------------- |
| ORDER         | 下单扣减            |
| REFUND        | 退货入库            |
| MANUAL_ADD    | 人工补货 / 手动入库 |
| MANUAL_REDUCE | 人工核减 / 手动出库 |

---

## 4. 修改库存

修改库存预警值或库存数量，库存变动会自动写入日志。

**缓存行为**: 修改成功后自动清除该商家的列表缓存、当前库存详情缓存和统计缓存。

### 请求

```http
PUT /inventory/update/1
Content-Type: application/json
```

### Path 参数

| 参数名 | 类型   | 必填 | 说明        |
| ------ | ------ | ---- | ----------- |
| id     | number | 是   | 库存记录 ID |

### Body 参数

| 参数名       | 类型   | 必填 | 说明                                                             |
| ------------ | ------ | ---- | ---------------------------------------------------------------- |
| warningStock | number | 否   | 库存预警值                                                       |
| stock        | number | 否   | 库存数量（修改后会自动产生一条 MANUAL_ADD / MANUAL_REDUCE 日志） |
| remark       | string | 否   | 备注说明                                                         |

### 请求示例

```json
{
  "warningStock": 500,
  "stock": 800,
  "remark": "盘点调整"
}
```

### 响应示例

```json
{
  "code": 0,
  "message": "修改成功",
  "result": {
    "id": 1,
    "skuCode": "BZ6542",
    "stock": 800,
    "warningStock": 500,
    "isWarning": false,
    "lockedStock": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-08-23T12:00:00.000Z"
  }
}
```

---

## 5. 手动入库

为指定 SKU 增加库存，会自动创建库存记录（如果不存在）并写入日志。

**缓存行为**: 成功后自动清除该商家的列表缓存、详情缓存和统计缓存。

### 请求

```http
POST /inventory/manual-in
Content-Type: application/json
```

### Body 参数

| 参数名  | 类型   | 必填 | 说明                   |
| ------- | ------ | ---- | ---------------------- |
| skuCode | string | 是   | SKU 编码 / 货号        |
| count   | number | 是   | 入库数量（必须大于 0） |
| remark  | string | 否   | 备注说明               |

### 请求示例

```json
{
  "skuCode": "BZ6542",
  "count": 50,
  "remark": "供应商补货"
}
```

### 响应示例

```json
{
  "code": 0,
  "message": "入库成功",
  "result": {
    "id": 1,
    "skuCode": "BZ6542",
    "stock": 550,
    "warningStock": 1000,
    "isWarning": true,
    "lockedStock": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-08-23T12:00:00.000Z"
  }
}
```

---

## 6. 手动出库

为指定 SKU 减少库存，库存不足时会返回错误。

**缓存行为**: 成功后自动清除该商家的列表缓存、详情缓存和统计缓存。

### 请求

```http
POST /inventory/manual-out
Content-Type: application/json
```

### Body 参数

| 参数名  | 类型   | 必填 | 说明                   |
| ------- | ------ | ---- | ---------------------- |
| skuCode | string | 是   | SKU 编码 / 货号        |
| count   | number | 是   | 出库数量（必须大于 0） |
| remark  | string | 否   | 备注说明               |

### 请求示例

```json
{
  "skuCode": "BZ6542",
  "count": 20,
  "remark": "样品取出"
}
```

### 响应示例

```json
{
  "code": 0,
  "message": "出库成功",
  "result": {
    "id": 1,
    "skuCode": "BZ6542",
    "stock": 480,
    "warningStock": 1000,
    "isWarning": true,
    "lockedStock": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-08-23T12:00:00.000Z"
  }
}
```

### 错误响应

```json
{
  "code": 403,
  "message": "库存不足，无法出库",
  "result": null
}
```

---

## 7. 删除库存记录

删除指定的库存记录，同时清除相关缓存。

**缓存行为**: 成功后自动清除该商家的列表缓存、详情缓存和统计缓存。

### 请求

```http
DELETE /inventory/delete/1
```

### Path 参数

| 参数名 | 类型   | 必填 | 说明        |
| ------ | ------ | ---- | ----------- |
| id     | number | 是   | 库存记录 ID |

### 响应示例

```json
{
  "code": 0,
  "message": "删除成功",
  "result": {
    "id": 1,
    "deleted": true
  }
}
```

---

## Redis 缓存设计

| 缓存类型   | Key 格式                                                                    | TTL  | 说明           |
| ---------- | --------------------------------------------------------------------------- | ---- | -------------- |
| 商家列表   | `inventory:merchant:list:{merchantId}:{page}:{limit}:{keyword}:{isWarning}` | 300s | 分页列表结果   |
| 库存详情   | `inventory:detail:{inventoryId}`                                            | 300s | 单条库存详情   |
| 出入库统计 | `inventory:stats:{skuId}`                                                   | 600s | 累计出入库数量 |

### 缓存清除策略

所有写操作（修改库存、手动出入库、删除库存）完成后，会执行以下清除动作：

1. 按前缀删除该商家的所有列表缓存：`inventory:merchant:list:{merchantId}:*`
2. 删除对应库存详情缓存：`inventory:detail:{inventoryId}`
3. 删除对应 SKU 统计缓存：`inventory:stats:{skuId}`

原有订单扣减（`deductStock`）和恢复（`restoreStock`）方法也追加了相同的缓存清除逻辑，确保下单/退款后列表数据不会 stale。

---

## 权限控制

所有接口均基于当前登录用户的 JWT Token 获取商家身份，校验规则如下：

- 若用户没有关联商家，返回空列表或 `404` 错误
- 若操作的库存记录/SKU 不属于当前商家，返回 `403 Forbidden`
- 库存日志查询也受商家归属校验保护
