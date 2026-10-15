# AI 服务层

所有 LLM 调用、Embedding、RAG、Agent 工具调度、prompt 模板集中在此服务。

## 启动

```bash
pip install -r requirements.txt
cp .env.example .env  # 填写 API 密钥
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 目录说明

| 目录/文件 | 用途 |
| --- | --- |
| config/settings.py | 环境配置（模型/密钥/向量库） |
| api/routes.py | API 路由（仅业务后端可调用） |
| core/llm_client.py | LLM 调用封装 |
| core/embedding_client.py | Embedding 调用封装 |
| core/rag.py | RAG 检索逻辑 |
| core/agent.py | Agent 工具调度 |
| prompts/*.jinja2 | Prompt 模板（jinja2） |
| schemas/chat.py | Pydantic 请求/响应模型 |
| services/chat_service.py | 聊天业务逻辑 |

## 分层边界

此服务只接受业务后端的 HTTP 请求。前端禁止直接调用此服务。

