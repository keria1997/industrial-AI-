"""
LLM 调用封装

所有大模型 API 调用集中在此文件。
调用链路: ai-service/core/llm_client.py <- ai-service/services/chat_service.py

禁止在其他层（backend/frontend）直接调用此模块。
"""

import json
from typing import AsyncGenerator
from openai import AsyncOpenAI

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import get_settings


class LlmClient:
    """大模型客户端，支持流式和非流式调用"""

    def __init__(self):
        settings = get_settings()
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self._model = settings.openai_model
        self._temperature = settings.default_temperature
        self._max_tokens = settings.default_max_tokens

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        流式调用大模型，逐 chunk 返回文本内容。
        调用链路: services/chat_service.py -> core/llm_client.py -> OpenAI API
        """
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature or self._temperature,
            max_tokens=max_tokens or self._max_tokens,
            stream=True,
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def chat(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """
        非流式调用大模型，返回完整文本。
        """
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature or self._temperature,
            max_tokens=max_tokens or self._max_tokens,
            stream=False,
        )
        return response.choices[0].message.content or ""

    async def chat_json(self, messages: list[dict], temperature: float | None = None) -> dict:
        """
        调用大模型并解析 JSON 输出。
        用于 Agent 工具调用判断、结构化输出等场景。
        """
        text = await self.chat(messages, temperature)
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)

