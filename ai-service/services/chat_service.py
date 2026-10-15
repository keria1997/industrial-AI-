"""
AI 聊天业务逻辑

组装 prompt（jinja2 模板）→ 调用 LLM → 返回流式结果。
调用链路: ai-service/api/routes.py <- ai-service/services/chat_service.py <- ai-service/core/*.py

所有 prompt 模板从 prompts/ 目录加载，禁止在此文件硬编码 prompt 字符串。
"""

from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from typing import AsyncGenerator

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import get_settings
from core.llm_client import LlmClient
from core.rag import RagRetriever
from core.agent import AgentOrchestrator


class ChatService:
    """聊天服务：构建 prompt -> 调用 LLM -> 流式返回"""

    def __init__(self):
        settings = get_settings()
        self._llm = LlmClient()
        self._rag = RagRetriever()
        self._agent = AgentOrchestrator(self._llm)
        self._jinja = Environment(
            loader=FileSystemLoader(settings.prompts_dir),
            autoescape=False,
        )

    def _render_system_prompt(self, use_rag: bool, rag_chunks: list[dict] | None = None) -> str:
        """
        渲染系统提示词。

        模板: prompts/chat_system.jinja2（基础）+ prompts/rag_context.jinja2（RAG 上下文注入）
        """
        base_prompt = self._jinja.get_template("chat_system.jinja2").render()
        if use_rag and rag_chunks:
            rag_context = self._jinja.get_template("rag_context.jinja2").render(chunks=rag_chunks)
            return base_prompt + "\n\n" + rag_context
        return base_prompt

    async def stream_chat(
        self,
        user_message: str,
        history: list[dict] | None = None,
        use_rag: bool = False,
    ) -> AsyncGenerator[str, None]:
        """
        流式聊天入口。

        调用链路: api/routes.py -> services/chat_service.py -> core/llm_client.py -> OpenAI
        """
        rag_chunks = None
        if use_rag:
            rag_chunks = await self._rag.search(user_message)

        system_prompt = self._render_system_prompt(use_rag, rag_chunks)
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_message})

        async for chunk in self._llm.chat_stream(messages):
            yield chunk

