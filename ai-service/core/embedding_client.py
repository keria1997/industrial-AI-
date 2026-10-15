"""
Embedding 调用封装

将文本转换为向量，用于 RAG 检索和知识库导入。
调用链路: ai-service/core/embedding_client.py <- ai-service/core/rag.py

禁止在其他层直接调用此模块。
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from openai import AsyncOpenAI
from config import get_settings


class EmbeddingClient:
    """文本向量化客户端"""

    def __init__(self):
        settings = get_settings()
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self._model = settings.openai_embedding_model

    async def embed(self, text: str) -> list[float]:
        """
        将单条文本转换为向量。
        调用链路: core/rag.py -> core/embedding_client.py -> OpenAI Embedding API
        """
        response = await self._client.embeddings.create(input=text, model=self._model)
        return response.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量向量化"""
        response = await self._client.embeddings.create(input=texts, model=self._model)
        return [item.embedding for item in response.data]

