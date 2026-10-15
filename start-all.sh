#!/bin/bash
# 启动前后端服务
cd "$(dirname "$0")"

# 清理旧进程
lsof -ti:8081 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# 启动后端
echo "Starting backend on :8081..."
cd backend
mvn spring-boot:run -q > /dev/null 2>&1 &
BACKEND_PID=$!
cd ..

# 等待后端启动
echo "Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "" http://127.0.0.1:8081/api/v1/session/captcha -X POST 2>/dev/null; then
    echo "Backend ready (attempt $i)"
    break
  fi
  sleep 1
done

# 启动前端
echo "Starting frontend on :5173..."
cd frontend
npx vite --host 127.0.0.1 --port 5173 > /dev/null 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 3

# 验证
BE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8081/api/v1/session/captcha -H "Content-Type: application/json" 2>/dev/null)
FE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null)

echo ""
echo "=========================================="
echo "  Backend  : http://127.0.0.1:8081  [$BE]"
echo "  Frontend : http://127.0.0.1:5173  [$FE]"
echo "=========================================="
echo ""
echo "Login: test01 / 123456"
echo ""
echo "PID: backend=$BACKEND_PID frontend=$FRONTEND_PID"
echo "Stop: kill $BACKEND_PID $FRONTEND_PID"
