# Prompt 模板变更记录

所有 prompt 模板变更必须在此文档登记，注明版本号、日期、变更内容和原因。

## 变更记录

| 版本 | 日期 | 文件 | 变更内容 | 变更原因 | 作者 |
| --- | --- | --- | --- | --- | --- |
| v1.0.0 | 2026-10-15 | chat_system.jinja2 | 初始版本：基础聊天系统提示词 | 项目初始化 | Codex |
| v1.0.0 | 2026-10-15 | rag_context.jinja2 | 初始版本：RAG 上下文注入模板 | 项目初始化 | Codex |
| v1.0.0 | 2026-10-15 | agent_tools.jinja2 | 初始版本：Agent 工具描述模板 | 项目初始化 | Codex |

## 变更流程

1. 修改 `ai-service/prompts/` 下的 `.jinja2` 文件
2. 在 `scripts/debug_prompt.py` 中测试新 prompt 效果
3. 在 `scripts/evaluate.py` 中运行评测集，确认指标未劣化
4. 在本文件添加变更记录
5. 提交代码审查

