# API 接口契约

## 1. 通信规则

- 前端只请求业务后端，禁止直连 AI 服务
- 业务后端通过 HTTP 请求 AI 服务
- 流式输出使用 SSE（Server-Sent Events）
- 统一 JSON 响应结构和错误码

## 2. 统一响应格式

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

### 错误响应

```json
{
  "code": 40100,
  "message": "未授权",
  "detail": null
}
```

## 3. 错误码表

| 错误码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 40001 | 参数校验失败 |
| 40100 | 未授权（Token 无效/过期） |
| 40300 | 无权限 |
| 40400 | 资源不存在 |
| 42900 | 请求频率超限 |
| 50000 | 服务器内部错误 |
| 50200 | AI 服务不可用 |
| 50300 | 向量库不可用 |

## 4. 业务后端 API（前端调用）

### 4.1 POST /api/v1/auth/login

登录获取 Token。

请求体：

```json
{"username": "admin", "password": "secret"}
```

响应：

```json
{"code": 0, "data": {"token": "eyJ...", "expiresIn": 86400}}
```

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

