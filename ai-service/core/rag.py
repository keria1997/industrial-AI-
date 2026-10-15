"""
RAG 检索逻辑

向量检索 + 上下文注入。
调用链路: ai-service/core/rag.py <- ai-service/services/chat_service.py

禁止在其他层（backend/frontend）实现 RAG 逻辑。
"""

import chromadb

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import get_settings
from core.embedding_client import EmbeddingClient


class RagRetriever:
    """RAG 检索器：向量化查询 -> 向量库搜索 -> 返回相关文档块"""

    def __init__(self):
        settings = get_settings()
        self._client = chromadb.HttpClient(host=settings.chroma_host)
        self._collection = self._client.get_or_create_collection(settings.chroma_collection)
        self._embedder = EmbeddingClient()
        self._top_k = settings.rag_top_k
        self._threshold = settings.rag_score_threshold

    async def search(self, query: str, top_k: int | None = None) -> list[dict]:
        """
        向量检索相关文档块。

        调用链路: services/chat_service.py -> core/rag.py -> ChromaDB
        返回: [{"content": str, "score": float, "source": str}, ...]
        """
        embedding = await self._embedder.embed(query)
        results = self._collection.query(
            query_embeddings=[embedding],
            n_results=top_k or self._top_k,
            include=["documents", "metadatas", "distances"],
        )
        chunks = []
        for i in range(len(results["documents"][0])):
            distance = results["distances"][0][i]
            score = 1.0 - distance  # chroma 使用距离，转为相似度分数
            if score >= self._threshold:
                chunks.append({
                    "content": results["documents"][0][i],
                    "score": round(score, 4),
                    "source": results["metadatas"][0][i].get("source", "unknown"),
                })
        return chunks

    async def add_documents(self, texts: list[str], metadatas: list[dict] | None = None) -> int:
        """
        批量导入文档到向量库（供 scripts/import_knowledge.py 调用）。
        """
        embeddings = await self._embedder.embed_batch(texts)
        ids = [f"doc_{i}" for i in range(len(texts))]
        self._collection.add(
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas or [{"source": "unknown"}] * len(texts),
            ids=ids,
        )
        return len(texts)

