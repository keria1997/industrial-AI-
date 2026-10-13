#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "正在启动前后端开发服务..."
osascript -e "
  tell application \"Terminal\"
    activate
    do script \"cd '$DIR' && npm run dev:all\"
  end tell
"

sleep 2

echo "前后端 watcher 已在 Terminal 中启动，请等待几秒后访问 http://127.0.0.1:5175"
