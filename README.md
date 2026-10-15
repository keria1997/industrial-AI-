# AI 应用前后端分离项目

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                前端 (React 18 + TypeScript)               │
│                                                          │
│  UI 交互 / 收集用户输入 / 请求后端业务接口 / SSE 流式渲染     │
│  禁止: 编写 prompt / 直接调用 LLM / RAG 检索逻辑           │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (JSON / SSE)
┌────────────────────────▼────────────────────────────────┐
│             业务后端 (Spring Boot 3 / Java 17)             │
│                                                          │
│  鉴权 / 会话管理 / 参数校验 / 数据库存储(对话记录/用户)      │
│  通过内置 AiServiceClient 调用 AI 服务                     │
│  禁止: prompt 字符串 / Agent 调度 / 向量检索               │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (JSON / SSE)
┌────────────────────────▼────────────────────────────────┐
│              AI 服务层 (FastAPI / Python 3.11)            │
│                                                          │
│  LLM 调用 / Embedding / RAG 检索 / Agent 工具调度          │
│  Prompt 模板 (jinja2) / JSON 输出解析 / 模型参数           │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    向量库 / 大模型 API                    │
└─────────────────────────────────────────────────────────┘
```

**调用链路（严格单向）：**

```
前端 → 业务后端 → AI 服务 → 向量库 / 大模型
```

任何层不得跨层调用（如前端直连 AI 服务）。

## 目录树

```
gongye_ai_plat/
├── README.md                           # 本文件：架构总览
├── docs/                               # 项目文档
│   ├── 01 需求规格说明书-工业AI平台-V2.1.0-PRD.md
│   ├── 02 技术设计说明书-工业AI平台-V2.1.0.md
│   ├── 03 UI设计说明书-工业AI平台-V2.1.0.md
│   ├── api-contract.md                # 接口契约（前后端 + 后端AI服务）
│   ├── architecture.md                # 架构设计详细说明
│   ├── prompt-changelog.md            # Prompt 模板变更记录
│   └── dev-guide.md                   # 开发指引与规范
├── ai-service/                         # AI 服务层 (FastAPI / Python)
│   ├── requirements.txt
│   ├── README.md                      # AI 服务模块说明
│   ├── main.py                        # FastAPI 入口
│   ├── config/
│   │   └── settings.py                # 模型/向量库/密钥配置
│   ├── api/
│   │   └── routes.py                  # AI 服务 API 路由
│   ├── core/
│   │   ├── llm_client.py              # LLM 调用封装
│   │   ├── embedding_client.py        # Embedding 调用封装
│   │   ├── rag.py                     # RAG 检索逻辑
│   │   └── agent.py                   # Agent 工具调度
│   ├── prompts/                        # Prompt 模板 (jinja2)
│   │   ├── chat_system.jinja2         # 聊天系统提示词
│   │   ├── rag_context.jinja2         # RAG 上下文注入模板
│   │   └── agent_tools.jinja2         # Agent 工具描述模板
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── chat.py                    # Pydantic 请求/响应模型
│   └── services/
│       ├── __init__.py
│       └── chat_service.py            # AI 聊天业务逻辑
├── backend/                             # 业务后端 (Spring Boot / Java 17)
│   ├── pom.xml
│   ├── README.md                      # 后端模块说明
│   └── src/main/
│       ├── java/com/aiapp/
│       │   ├── AiAppApplication.java
│       │   ├── config/
│       │   │   └── AiServiceConfig.java
│       │   ├── controller/
│       │   │   └── ChatController.java
│       │   ├── service/
│       │   │   ├── ChatService.java
│       │   │   └── AiServiceClient.java
│       │   ├── model/
│       │   │   ├── ChatRequest.java
│       │   │   ├── ChatResponse.java
│       │   │   └── ApiResponse.java
│       │   ├── repository/
│       │   │   ├── ChatSessionRepository.java
│       │   │   └── ChatMessageRepository.java
│       │   └── entity/
│       │       ├── ChatSession.java
│       │       └── ChatMessage.java
│       └── resources/
│           └── application.yml
├── frontend/                            # 前端 (React 18 + TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── README.md                      # 前端模块说明
│   └── src/
│       ├── main.tsx                   # 入口
│       ├── App.tsx                    # 根组件
│       ├── api/
│       │   └── chat.ts                # API 客户端（只请求后端）
│       ├── components/
│       │   ├── ChatWindow.tsx         # 聊天窗口
│       │   ├── MessageBubble.tsx      # 消息气泡
│       │   └── ChatInput.tsx          # 输入框
│       ├── hooks/
│       │   └── useChat.ts             # 聊天逻辑 Hook（SSE 流式）
│       ├── types/
│       │   └── chat.ts                # 前端类型定义
│       └── config/
│           └── index.ts               # 环境配置
└── scripts/                             # 脚本目录（不混入线上服务）
    ├── README.md
    ├── import_knowledge.py            # 知识库导入
    ├── evaluate.py                    # 评测脚本
    └── debug_prompt.py                # Prompt 调试
```

## 快速开始

```bash
# 1. 启动 AI 服务（端口 8000）
cd ai-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. 启动业务后端（端口 8080）
cd backend
mvn spring-boot:run

# 3. 启动前端（端口 5173）
cd frontend
npm install
npm run dev
```

## 开发规范

新增功能严格按以下顺序，不得打乱：

1. 在 `docs/api-contract.md` 定义接口契约
2. 在 `ai-service/` 实现 AI 逻辑 + 编写测试
3. 在 `backend/` 封装 AiServiceClient + 实现业务接口
4. 在 `frontend/` 对接后端接口
5. 补充 `docs/` 相关文档和 `docs/prompt-changelog.md`

## 分层边界（严禁越界）

| 层 | 允许 | 禁止 |
| --- | --- | --- |
| 前端 | UI 交互、SSE 流式渲染、请求后端 | prompt、LLM 调用、RAG |
| 后端 | 鉴权、会话、校验、DB、调用 AI 服务 | prompt 字符串、Agent 调度、向量检索 |
| AI 服务 | LLM/Embedding/RAG/Agent/prompt 模板/参数 | 直接操作业务数据库 |
| scripts | 知识导入、评测、调试 | 混入线上服务代码 |

