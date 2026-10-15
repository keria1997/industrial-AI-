# 前端

UI 交互层。只负责展示和收集输入，禁止编写 prompt、直接调用 LLM、RAG 检索。

## 启动

```bash
npm install
npm run dev
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| VITE_API_BASE_URL | 业务后端地址 | http://localhost:8080 |

## 分层边界

- `src/api/` 只请求业务后端
- `src/hooks/` 管理状态和 SSE 流
- `src/components/` 纯 UI 组件
- 禁止出现 prompt 字符串、AI SDK、向量库依赖

