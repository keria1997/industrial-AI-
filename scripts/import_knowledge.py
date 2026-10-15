"""
知识库导入脚本

将文本文件分块后向量化并存入向量库。
调用链路: scripts/import_knowledge.py -> ai-service/core/rag.py -> ChromaDB

用法: python scripts/import_knowledge.py <文件或目录路径>
"""

import sys
import os
from pathlib import Path

# 将 ai-service 目录加入 sys.path 以复用 core 模块
AI_SERVICE_DIR = Path(__file__).parent.parent / "ai-service"
sys.path.insert(0, str(AI_SERVICE_DIR))

from core.rag import RagRetriever


CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def split_text(text: str) -> list[str]:
    """按固定长度分块，带重叠"""
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
    return [c.strip() for c in chunks if c.strip()]


def import_file(filepath: str):
    """导入单个文件到向量库"""
    text = Path(filepath).read_text(encoding="utf-8")
    chunks = split_text(text)
    source = Path(filepath).name
    metadatas = [{"source": source}] * len(chunks)

    retriever = RagRetriever()
    count = retriever.add_documents(chunks, metadatas)
    print(f"Imported {count} chunks from {source}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/import_knowledge.py <file_or_dir>")
        sys.exit(1)

    target = Path(sys.argv[1])
    if target.is_file():
        import_file(str(target))
    elif target.is_dir():
        for f in target.glob("*.md"):
            import_file(str(f))
    else:
        print(f"Path not found: {target}")
        sys.exit(1)


if __name__ == "__main__":
    main()

