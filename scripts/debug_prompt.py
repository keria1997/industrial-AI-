"""
Prompt 调试脚本

渲染指定 prompt 模板并输出结果，用于调试模板变量。
用法: python scripts/debug_prompt.py <template_name> [--var key=value ...]
"""

import sys
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

PROMPTS_DIR = Path(__file__).parent.parent / "ai-service" / "prompts"


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/debug_prompt.py <template_name> [--var key=value]")
        sys.exit(1)

    template_name = sys.argv[1]
    variables = {}
    args = sys.argv[2:]
    for i in range(0, len(args), 2):
        if args[i] == "--var" and i + 1 < len(args):
            key, _, value = args[i + 1].partition("=")
            variables[key] = value

    env = Environment(loader=FileSystemLoader(str(PROMPTS_DIR)))
    template = env.get_template(template_name)
    result = template.render(**variables)
    print("--- Rendered prompt ---")
    print(result)


if __name__ == "__main__":
    main()

