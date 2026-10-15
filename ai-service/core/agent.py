"""
Agent 工具调度

注册工具 -> LLM 判断是否调用 -> 执行工具 -> 注入结果 -> 生成最终回复。
调用链路: ai-service/core/agent.py <- ai-service/services/chat_service.py

禁止在其他层实现 Agent 调度逻辑。
"""

from typing import Any, Callable

from core.llm_client import LlmClient


class AgentOrchestrator:
    """Agent 编排器：管理工具注册表和工具调用流程"""

    def __init__(self, llm_client: LlmClient):
        self._llm = llm_client
        self._tools: dict[str, dict[str, Any]] = {}

    def register_tool(self, name: str, description: str, parameters: dict, fn: Callable):
        """注册工具函数，供 LLM 选择调用"""
        self._tools[name] = {
            "description": description,
            "parameters": parameters,
            "fn": fn,
        }

    def get_tool_definitions(self) -> list[dict]:
        """返回所有已注册工具的定义列表（供 prompt 模板渲染）"""
        return [
            {"name": name, "description": tool["description"], "parameters": tool["parameters"]}
            for name, tool in self._tools.items()
        ]

    async def execute_tool(self, tool_name: str, arguments: dict) -> str:
        """执行指定工具并返回结果字符串"""
        tool = self._tools.get(tool_name)
        if not tool:
            return f"Error: tool '{tool_name}' not found"
        try:
            result = tool["fn"](**arguments)
            return str(result)
        except Exception as e:
            return f"Error executing tool '{tool_name}': {e}"

