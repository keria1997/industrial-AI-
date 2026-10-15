# 架构设计详细说明

## 调用流程图

### 普通聊天（无 RAG）

```
用户输入
  → 前端 ChatInput 组件收集
  → useChat Hook 调用 api/chat.ts
  → POST /api/v1/chat/completions (SSE)
  → 后端 ChatController 验证 Token + 参数
  → 后端 ChatService 保存用户消息到 DB
  → 后端 AiServiceClient POST /ai/v1/chat/completions (SSE)
  → AI 服务 ChatService 构建 prompt (jinja2 模板)
  → AI 服务 LlmClient 调用 OpenAI API (流式)
  → AI 服务逐 chunk 返回给后端
  → 后端逐 chunk 转发给前端 (SSE)
  → 前端 useChat Hook 逐 chunk 更新 state
  → MessageBubble 实时渲染
  → 流结束后后端保存完整 assistant 消息到 DB
```

### RAG 聊天

```
用户输入 + useRag=true
  → 前端请求后端
  → 后端请求 AI 服务 (SSE)
  → AI 服务 RAG 模块:
      1. EmbeddingClient 将 query 向量化
      2. 向量库检索 top-K 相似文档块
      3. RAG 模板 (rag_context.jinja2) 注入检索结果
      4. 构建最终 system prompt
  → AI 服务 LlmClient 流式调用 LLM
  → 逐 chunk 返回
```

### Agent 工具调用

```
用户输入需要工具的场景
  → AI 服务 Agent 模块:
      1. 加载 agent_tools.jinja2 工具描述
      2. LLM 判断是否需要调用工具
      3. 如需调用 → 执行工具 → 将结果注入上下文 → 再次调用 LLM
      4. 如无需工具 → 直接生成回复
  → 流式返回最终结果
```

## 分层职责边界

### 前端（frontend/）

只做 UI。不出现 prompt 字符串、不 import openai、不调用向量库。

### 业务后端（backend/）

负责鉴权（JWT Token 校验）、会话管理（创建/查询会话）、参数校验、数据库存储。通过 `AiServiceClient` 这个唯一入口调用 AI 服务。后端代码中不出现任何 prompt 文本。

### AI 服务（ai-service/）

所有 AI 逻辑集中于此：

- `core/llm_client.py`：封装 OpenAI SDK 调用（流式/非流式）
- `core/embedding_client.py`：封装 Embedding API
- `core/rag.py`：向量检索 + 上下文注入
- `core/agent.py`：工具注册、调度、多轮工具调用
- `prompts/*.jinja2`：所有 prompt 模板
- `config/settings.py`：模型名、温度、向量库地址、API 密钥

## 技术栈

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 前端 | React + TypeScript + Vite | 18 / 5 / 7 |
| 前端 UI | Tailwind CSS + Lucide React | 3 / latest |
| 后端 | Spring Boot + Java | 3.3 / 17 |
| 后端 DB | PostgreSQL + Spring Data JPA | 15+ |
| AI 服务 | FastAPI + Python | latest / 3.11 |
| Prompt 引擎 | Jinja2 | latest |
| LLM SDK | openai (Python) | latest |
| 向量库 | ChromaDB（本地开发）/ Milvus（生产） | latest |

