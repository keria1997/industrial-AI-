"""
AI 服务配置

所有模型参数、API 密钥、向量库地址通过环境变量注入。
禁止在代码中硬编码密钥或地址。

调用链路: ai-service/config/settings.py ← ai-service/core/*.py
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """AI 服务全局配置，通过 .env 文件或环境变量注入"""

    # OpenAI API 配置
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # 生成参数
    default_temperature: float = 0.7
    default_max_tokens: int = 2048

    # 向量库配置
    chroma_host: str = "http://localhost:8001"
    chroma_collection: str = "knowledge_base"

    # RAG 配置
    rag_top_k: int = 5
    rag_score_threshold: float = 0.7

    # Prompt 模板目录
    prompts_dir: str = "prompts"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """单例获取配置，避免重复解析环境变量"""
    return Settings()

