"""
AI 服务入口

FastAPI 应用启动文件。
启动命令: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

此服务仅接受业务后端的 HTTP 请求，不直接暴露给前端。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router

app = FastAPI(
    title="AI Service",
    description="AI 服务层：LLM / Embedding / RAG / Agent",
    version="1.0.0",
)

# 仅允许业务后端访问（生产环境应收紧为具体域名/IP）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok"}

