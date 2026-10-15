"""
AI 服务 API 路由

仅暴露给业务后端调用，不直接暴露给前端。
调用链路: backend/AiServiceClient -> ai-service/api/routes.py -> ai-service/services/chat_service.py
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from schemas.chat import (
    ChatCompletionRequest,
    EmbeddingRequest,
    EmbeddingResponse,
    RagSearchRequest,
    RagSearchResponse,
)
from core.llm_client import LlmClient
from core.embedding_client import EmbeddingClient
from core.rag import RagRetriever
from services.chat_service import ChatService

router = APIRouter(prefix="/ai/v1")

# 懒加载服务实例（避免导入时初始化连接）
_chat_service: ChatService | None = None
_embedder: EmbeddingClient | None = None
_rag: RagRetriever | None = None


def get_chat_service() -> ChatService:
    global _chat_service
    if _chat_service is None:
        _chat_service = ChatService()
    return _chat_service


def get_embedder() -> EmbeddingClient:
    global _embedder
    if _embedder is None:
        _embedder = EmbeddingClient()
    return _embedder


def get_rag() -> RagRetriever:
    global _rag
    if _rag is None:
        _rag = RagRetriever()
    return _rag


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    聊天补全接口（SSE 流式）。

    调用链路: backend/AiServiceClient -> routes.chat_completions -> chat_service.stream_chat
    """
    service = get_chat_service()

    # 提取最后一条用户消息
    user_message = ""
    history = []
    for msg in request.messages:
        if msg["role"] == "user":
            user_message = msg["content"]
        elif msg["role"] != "system":
            history.append(msg)

    async def stream():
        async for chunk in service.stream_chat(
            user_message=user_message,
            history=history,
            use_rag=request.use_rag,
        ):
            yield {"event": "delta", "data": chunk}
        yield {"event": "done", "data": ""}

    return EventSourceResponse(stream())


@router.post("/embeddings", response_model=EmbeddingResponse)
async def create_embedding(request: EmbeddingRequest):
    """文本向量化接口"""
    embedding = await get_embedder().embed(request.input)
    return EmbeddingResponse(embedding=embedding)


@router.post("/rag/search", response_model=RagSearchResponse)
async def rag_search(request: RagSearchRequest):
    """RAG 向量检索接口"""
    chunks = await get_rag().search(request.query, top_k=request.top_k)
    return RagSearchResponse(chunks=chunks)

