# 开发指引与规范

## 新增功能开发流程

严格按以下顺序执行，不得跳步：

### Step 1：定义接口契约

在 `docs/api-contract.md` 中新增接口定义，包含：路径、方法、请求体、响应体、错误码。

### Step 2：AI 服务实现

1. 在 `ai-service/prompts/` 创建 jinja2 模板（如需要新 prompt）
2. 在 `ai-service/core/` 实现核心逻辑
3. 在 `ai-service/services/` 实现业务逻辑
4. 在 `ai-service/api/routes.py` 注册路由
5. 本地测试通过（`curl` 或 pytest）

### Step 3：后端封装

1. 在 `backend/src/.../service/AiServiceClient.java` 添加调用方法
2. 在 `backend/src/.../service/` 实现业务逻辑
3. 在 `backend/src/.../controller/` 添加 REST 接口
4. 在 `backend/src/.../entity/` 添加数据库实体（如需要）
5. 编写单元测试

### Step 4：前端对接

1. 在 `frontend/src/types/` 定义类型
2. 在 `frontend/src/api/` 添加 API 调用
3. 在 `frontend/src/hooks/` 实现状态管理
4. 在 `frontend/src/components/` 构建组件

### Step 5：补文档

1. 更新 `docs/api-contract.md`
2. 如修改了 prompt，更新 `docs/prompt-changelog.md`
3. 更新相关模块 README

## 代码规范

### 通用

- 文件命名见名知义，一个文件只做一件事
- 关键位置添加注释，标注调用链路
- 配置抽离到独立 config 文件，禁止硬编码密钥、地址

### 前端

- TypeScript 严格模式
- 函数组件 + Hooks，不使用 class 组件
- API 调用统一放在 `src/api/` 目录

### 后端

- 遵循 Controller → Service → Repository 分层
- 所有接口返回统一的 `ApiResponse<T>` 包装
- 使用构造函数注入，不使用字段注入

### AI 服务

- 所有 prompt 使用 jinja2 模板文件，禁止代码内硬编码字符串
- Pydantic 模型校验请求/响应
- 配置通过环境变量注入，不硬编码

## 环境变量清单

| 变量 | 所属层 | 说明 | 示例 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | ai-service | OpenAI API 密钥 | `sk-...` |
| `OPENAI_BASE_URL` | ai-service | OpenAI API 地址 | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | ai-service | 默认模型 | `gpt-4o-mini` |
| `CHROMA_HOST` | ai-service | 向量库地址 | `http://localhost:8001` |
| `DATABASE_URL` | backend | PostgreSQL 连接串 | `jdbc:postgresql://...` |
| `JWT_SECRET` | backend | JWT 签名密钥 | 随机字符串 |
| `AI_SERVICE_URL` | backend | AI 服务地址 | `http://localhost:8000` |
| `VITE_API_BASE_URL` | frontend | 后端 API 地址 | `http://localhost:8080` |

