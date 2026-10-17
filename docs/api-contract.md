# API 接口契约

## 1. 通信规则

- 前端只请求业务后端，禁止直连 AI 服务
- 业务后端通过 HTTP 请求 AI 服务
- 流式输出使用 SSE（Server-Sent Events）
- 当前 ERP 使用直接 DTO/分页集合与 `{error: ...}` 错误结构；目标新增契约见 `docs/openapi/frontend-remediation.yaml`

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

现有 ERP 使用 `/api/v1/{sales,inventory,production,procurement,finance,personnel,supply-chain,ai,message,platform}` 各业务 client 的已验证端点。RMA、客户签收、报价等新 Controller 仍有持久化和鉴权阻断，不能仅因路径存在便认定可上线，详见 `docs/前后端真实联调报告-2026-10-17.md`。

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

