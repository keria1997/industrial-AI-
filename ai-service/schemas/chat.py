"""
聊天请求/响应 Pydantic 模型

用于 AI 服务 API 的请求校验和响应序列化。
"""

from pydantic import BaseModel, Field


class ChatCompletionRequest(BaseModel):
    """AI 服务聊天补全请求"""
    messages: list[dict] = Field(..., description="对话消息列表")
    use_rag: bool = Field(default=False, description="是否启用 RAG 检索")
    model: str | None = Field(default=None, description="指定模型（覆盖默认值）")
    temperature: float | None = Field(default=None, ge=0, le=2)


class EmbeddingRequest(BaseModel):
    """Embedding 请求"""
    input: str = Field(..., min_length=1, description="要向量化的文本")


class EmbeddingResponse(BaseModel):
    """Embedding 响应"""
    embedding: list[float]


class RagSearchRequest(BaseModel):
    """RAG 检索请求"""
    query: str = Field(..., min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=50)


class RagChunk(BaseModel):
    """检索结果块"""
    content: str
    score: float
    source: str


class RagSearchResponse(BaseModel):
    """RAG 检索响应"""
    chunks: list[RagChunk]

