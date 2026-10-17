# API 接口契约

## 1. 通信规则

- 前端只请求业务后端，禁止直连 AI 服务
- 业务后端通过 HTTP 请求 AI 服务
- 流式输出使用 SSE（Server-Sent Events）
- 当前 ERP 使用直接 DTO/分页集合与 `{error: ...}` 错误结构；销售履约 P0 后端契约见 `docs/openapi/backend-prd-v1.yaml`，前端联调读取契约见 `docs/openapi/frontend-remediation.yaml`

## 2. 统一响应格式

### 成功响应

```json
{"items": [], "total": 0, "page": 1, "pageSize": 20}
```

当前 Java ERP 查询不会统一包装为 `code/message/data`。单据查询返回单据对象；部分命令返回 `{customer: ...}`、`{order: ..., receipt: ...}` 等业务结果。无内容成功响应可为204。以对应 client、Controller 和已冻结的字段契约为准，不能对所有响应统一解包 `.data`。

### 错误响应

```json
{
  "error": {
    "code": "PRODUCTION_401_UNAUTHENTICATED",
    "message": "请登录后重试",
    "suggestion": "重新登录",
    "retryable": false,
    "fieldErrors": [],
    "details": null,
    "traceId": "request-trace-id"
  }
}
```

## 3. 错误码表

| HTTP状态 / 业务码 | 含义 |
| --- | --- |
| 400 / `PRODUCTION_400_INVALID_ARGUMENT` | 参数校验失败；按模块返回实际业务码 |
| 401 / `PRODUCTION_401_UNAUTHENTICATED` | 未授权或会话无效 |
| 403 / `PRODUCTION_403_PERMISSION_DENIED` | 无权限；履约模块也可返回 `FULFILLMENT_403_PERMISSION_DENIED` |
| 404 / `PRODUCTION_404_NOT_FOUND` | 资源或授权范围内的租户不存在 |
| 409 | 版本、幂等或业务状态冲突，读取对应模块的实际业务码 |
| 429 | 请求频率超限 |
| 5xx | 服务异常，保留输入与未知结果，禁止显示成功或真实零值 |

## 4. 业务后端 API（前端调用）

### 4.1 POST /api/v1/session/login

登录获取 Token。

请求体：

```json
{"account": "<local-account>", "password": "<configured-password>", "captchaId": "<issued-captcha-id>", "captchaCode": "<rendered-code>"}
```

响应：

```json
{"account": "<local-account>", "accessToken": "<issued-token>", "tenantIds": ["<authorized-tenant>"], "permissions": ["<effective-permission>"], "expiresAt": "<ISO-8601>"}
```

登录前通过 `POST /api/v1/session/captcha` 获取图形验证码，`GET /api/v1/session/me` 复核会话。业务请求携带 `Authorization: Bearer {accessToken}` 和签名会话内的 `X-Tenant-Id`。上述响应只列出联调必要字段，不作为全部会话字段清单。

现有 ERP 使用 `/api/v1/{sales,inventory,production,procurement,finance,personnel,supply-chain,ai,message,platform}` 各业务 client 的已验证端点。

### 4.1.1 PRD 销售履约命令契约（2026-10-17 冻结）

`docs/openapi/backend-prd-v1.yaml` 是以下后端命令的唯一正式契约：

| 方法 | 路径 | 用途 | 关键要求 |
| --- | --- | --- | --- |
| POST | `/api/v1/rmas` | 创建来源行级 RMA | 原出库行、可退余量、证据、幂等键；创建时 `approvedQty=null` |
| POST | `/api/v1/rmas/{id}/transition` | 统一执行 RMA 状态机 | `If-Match`、动作/目标状态一致、数量守恒；支持审批、物流、收货、检验、回入库、红字 AR、关闭 |
| GET | `/api/v1/fulfillment/rmas` | 查询 RMA 只读投影 | 租户和 `sales.order.read` 隔离 |
| POST | `/api/v1/sales-orders/{orderId}/receipts` | 创建客户签收聚合 | 只信任服务端出库数量；正式字段为 `receiptStatus` |
| GET | `/api/v1/fulfillment/customer-receipts` | 查询签收只读投影 | 租户和 `sales.receipt.read` 隔离 |
| POST | `/api/v1/sales-orders/{orderId}/complete-check` | 完成前置检查 | 返回 `canComplete` 和 `missingConditions` |
| POST | `/api/v1/sales-orders/{orderId}/complete` | 销售完成关闭 | 全部发货、签收完成、AR 结算、无未关闭 RMA/争议 |
| GET | `/api/v1/sales/ai-insights` | 销售监控事实 | 区分月度统计与全量交期风险；携带可用性、时区、来源版本 |
| GET/POST/PATCH | `/api/v1/sales/sla-rules` | 查询/维护 SLA 规则 | 持久化、版本、幂等、审计 |
| GET | `/api/v1/sales/sla-notifications` | 查询 SLA 违约通知 | 小时扫描生成的幂等事实 |

已废弃写路径 `POST /api/v1/fulfillment/rmas`、`PATCH /api/v1/fulfillment/rmas/{id}/approve|inspect|close`、`POST /api/v1/fulfillment/customer-receipts` 和 `GET/PUT /api/v1/platform/outreach-settings` 返回 `410 SALES_410_LEGACY_COMMAND_RETIRED`。读取路径继续可用。前端必须迁移后再调用正式完成关闭。

下面4.2至第5节保留为早期聊天/SSE目标设计，未在本轮验证为当前 ERP 可用路由。当前页面聊天使用既有 `POST /api/v1/ai/chat`；不能将下面的 `/chat/*` 直接当作已部署接口，也不能将普通JSON回复宣称为SSE全链路验收通过。

### 4.2 POST /api/v1/chat/sessions

创建聊天会话。请求头：`Authorization: Bearer {token}`

响应：

```json
{"code": 0, "data": {"sessionId": "uuid-v4"}}
```

### 4.3 POST /api/v1/chat/completions (SSE 流式)

发送消息并流式接收 AI 回复。请求头：`Authorization: Bearer {token}`

请求体：

```json
{"sessionId": "uuid-v4", "message": "你好", "useRag": true}
```

SSE 事件流：

```
event: delta
data: {"content": "你"}

event: delta
data: {"content": "好"}

event: done
data: {"messageId": "uuid", "usage": {"promptTokens": 10, "completionTokens": 5}}

```

SSE 错误事件：

```
event: error
data: {"code": 50200, "message": "AI 服务不可用"}

```

### 4.4 GET /api/v1/chat/sessions/{sessionId}/messages

获取会话历史消息。

## 5. AI 服务 API（仅业务后端调用）

### 5.1 POST /ai/v1/chat/completions (SSE)

请求体包含 messages、useRag、model、temperature。SSE 响应与 OpenAI chunk 格式对齐。

### 5.2 POST /ai/v1/embeddings

输入文本，返回向量数组。

### 5.3 POST /ai/v1/rag/search

输入查询，返回相关文档块列表。

