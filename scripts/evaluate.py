"""
评测脚本

运行评测集，比较 AI 回复与期望输出。
用法: python scripts/evaluate.py
"""

import asyncio
import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).parent.parent / "ai-service"
sys.path.insert(0, str(AI_SERVICE_DIR))

from core.llm_client import LlmClient


# 评测集：question + expected_keywords
EVAL_CASES = [
    {"question": "什么是 RAG？", "expected_keywords": ["检索", "增强", "生成"]},
    {"question": "1+1等于几？", "expected_keywords": ["2"]},
]


async def run_eval():
    llm = LlmClient()
    passed = 0
    for case in EVAL_CASES:
        answer = await llm.chat([{"role": "user", "content": case["question"]}])
        hits = sum(1 for kw in case["expected_keywords"] if kw in answer)
        total = len(case["expected_keywords"])
        status = "PASS" if hits >= total * 0.5 else "FAIL"
        if status == "PASS":
            passed += 1
        print(f"[{status}] {case['question']} -> keyword match {hits}/{total}")
    print(f"\nTotal: {passed}/{len(EVAL_CASES)} passed")


if __name__ == "__main__":
    asyncio.run(run_eval())

