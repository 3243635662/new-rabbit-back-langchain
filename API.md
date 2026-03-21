# 用户与鉴权模块接口文档

api_key:fanfan0521

支持 header以及query传参 楠哥此功能后续再管理后台我会添加

## 统一响应格式说明

后端采用统一的响应格式。

**成功响应结构：** 业务 HTTP 状态通常为 `200` 或 `201`，业务状态码 `code` 返回 `0`。

```json
{
  "code": 0,
  "result": { ... }, // 或 null
  "message": "成功/提示消息"
}
```

**失败/异常响应结构（全局 Filter 处理）：** `code` 返回 HTTP 状态码（如 400, 401, 404, 500 等）。

```json
{
  "code": 1
  "result": {
    "path": "/xxx",
    "method": "POST",
    "statusCode": 400,
    "timestamp": "2026-03-20 16:00:00",
    "validationDetails": { ... } // 仅在参数校验未通过时返回的具体字段错误详情
  },
  "message": "具体的错误信息，如：密码错误 / 账号不存在 / 账号被锁定"
}
```

## 1. 用户登录

- **接口路径:** `/auth/login`
- **请求方式:** `POST`
- **权限要求:** 无需 Token (Public)
- **请求参数 (`body` / `application/json`)**

| 字段名称   | 类型   | 必填 | 限制      | 说明                       |
| :--------- | :----- | :--: | :-------- | :------------------------- |
| `account`  | String |  是  | 1-20 字符 | 可使用 用户名 或 邮箱 登录 |
| `password` | String |  是  | 6-20 字符 | 登录密码                   |

- **成功响应示例:**

```json
{
  "code": 0,
  "result": {
    "id": 12,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  },
  "message": "登录成功"
}
```

- **失败响应示例:**
  - **400 Bad Request:** 提交参数格式不对（例如密码小于6位），`message` 会提示类似于 `"password must be longer than or equal to 6 characters"`。
  - **404 Not Found:** `"message": "账号不存在"`
  - **401 Unauthorized:** `"message": "密码错误"`
  - **401 Unauthorized:** `"message": "账号被锁定"`

---

## 2. 发送注册验证码邮件

- **接口路径:** `/user/emailCode`
- **请求方式:** `POST`
- **权限要求:** 无需 Token (Public)
- **请求参数 (`body` / `application/json`)**

| 字段名称 | 类型   | 必填 | 说明                       |
| :------- | :----- | :--: | :------------------------- |
| `email`  | String |  是  | 需要接收验证码的邮箱地址。 |

_(限流说明: 每个邮箱发送请求冷却时间为 60 秒，验证码有效时间为 5 分钟)_

- **成功响应示例:**

```json
{
  "code": 0,
  "result": null,
  "message": "验证码已发送"
}
```

- **失败响应示例:**
  - **429 Too Many Requests:** `"message": "请60秒后再试"`
  - **500 Internal Server Error:** `"message": "验证码发送失败"`

---

## 3. 注册新用户

- **接口路径:** `/user`
- **请求方式:** `POST`
- **权限要求:** 无需 Token (Public)。
  - **逻辑说明**: 后端通过判断是否携带含有 `role="admin"` 的 Token 来区分【后台建号】与【前端自主注册】。如果是不带 Token 调用的自主注册，必须传 `emailCode`。
- **请求参数 (`body` / `application/json`)**

| 字段名称    | 类型    |     必填     | 限制/默认值                    | 说明                                                                  |
| :---------- | :------ | :----------: | :----------------------------- | :-------------------------------------------------------------------- |
| `username`  | String  |      是      | 1-20 字符                      | 用户登录名                                                            |
| `password`  | String  |      是      | 6-20 字符                      | 密码                                                                  |
| `email`     | String  |      是      | 须为有效邮箱格式 (`@IsEmail`)  | 用户绑定的邮箱                                                        |
| `emailCode` | String  | **条件必填** | -                              | 客户端自行注册时 **必传** 验证码；后台管理员携带 Token 创建号时不用传 |
| `avatar`    | String  |      否      | 需为有效 URL (`@IsUrl`)        | 头像地址，无则使用默认图片                                            |
| `role`      | String  |      否      | 默认值: `user`                 | 权限角色                                                              |
| `active`    | Boolean |      否      | 默认值: `true`(1) / `false`(0) | 是否为启用状态                                                        |
| `areaId`    | Number  |      否      | 数字类型，默认值: `0`          | 所属区域ID                                                            |
| `remark`    | String  |      否      | 默认值: `无`                   | 账号备注信息                                                          |

- **成功响应示例:**

```json
{
  "code": 0,
  "result": null,
  "message": "创建成功"
}
```

- **失败响应示例:**
  - **400 Bad Request:** 提交的值不符合格式要求，如邮箱格式不对，用户名超长。
  - **400 Bad Request:** 数据冲突，`"message": "用户名或邮箱已存在"`
  - **400 Bad Request:** 验证码问题，`"message": "邮箱验证码不能为空"` 或 `"message": "邮箱验证码错误"`
  - **400 Bad Request:** 异常捕获失败，`"message": "创建失败"`
