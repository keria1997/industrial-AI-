# 部署文档 - 工业 AI 平台

> 目标服务器：腾讯云 Ubuntu 22.04
> 架构：Nginx（静态前端+反向代理）→ Spring Boot（后端 API）→ PostgreSQL（数据库）

## 服务器信息

| 项目 | 值 |
|---|---|
| IP | `124.222.114.67` |
| 用户 | `ubuntu` |
| 系统 | Ubuntu 22.04 LTS |

## 系统架构

```
用户浏览器 (80/443)
    │
    ▼
Nginx (:80)
    ├── / → 前端静态文件 (/var/www/industrial-ai/dist)
    └── /api/v1 → 反向代理 → Spring Boot (:8081)
                                    │
                                    ▼
                          PostgreSQL (:5432)
                          数据库: industrial_ai
```

## 目录结构（服务器端）

```
/opt/industrial-ai/
├── app.jar                    # 后端 JAR
├── .env                       # 环境变量
├── start.sh                   # 启动脚本
├── stop.sh                    # 停止脚本
├── logs/                      # 日志目录
└── dist/                      # 前端静态文件
/etc/nginx/sites-available/industrial-ai  # Nginx 配置
```

## 一键部署步骤

### 1. SSH 连接服务器

```bash
ssh ubuntu@124.222.114.67
```

### 2. 安装依赖

```bash
sudo apt update && sudo apt install -y openjdk-17-jre-headless postgresql nginx
```

### 3. 配置 PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE industrial_ai;
ALTER USER postgres PASSWORD 'industrial_ai_2026';
SQL
```

### 4. 上传应用文件

```bash
# 在本地执行
ssh ubuntu@124.222.114.67 "sudo mkdir -p /opt/industrial-ai/logs && sudo chown -R ubuntu:ubuntu /opt/industrial-ai"
scp backend/target/industrial-ai-api-0.1.0.jar ubuntu@124.222.114.67:/opt/industrial-ai/app.jar
scp -r frontend/dist/* ubuntu@124.222.114.67:/opt/industrial-ai/dist/
```

### 5. 配置环境变量

```bash
cat > /opt/industrial-ai/.env <<'ENV'
SERVER_PORT=8081
DATABASE_URL=postgresql://postgres:industrial_ai_2026@127.0.0.1:5432/industrial_ai
JAVA_API_PORT=8081
APP_AUTH_SECRET=industrial-ai-prod-secret-2026-change-me
DEMO_AUTH_ENABLED=true
DEMO_AUTH_ACCOUNT=test01
DEMO_AUTH_PASSWORD=123456
APP_DATABASE_MIGRATE=false
ENV
```

### 6. 配置 Nginx

```bash
sudo tee /etc/nginx/sites-available/industrial-ai <<'NGINX'
server {
    listen 80;
    server_name _;

    root /opt/industrial-ai/dist;
    index index.html;

    location /api/v1 {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/industrial-ai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 7. 配置 systemd 服务

```bash
sudo tee /etc/systemd/system/industrial-ai.service <<'SERVICE'
[Unit]
Description=Industrial AI Platform Backend
After=postgresql.service

[Service]
User=ubuntu
WorkingDirectory=/opt/industrial-ai
EnvironmentFile=/opt/industrial-ai/.env
ExecStart=/usr/bin/java -jar /opt/industrial-ai/app.jar --server.port=8081
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
sudo systemctl daemon-reload
sudo systemctl enable industrial-ai
sudo systemctl start industrial-ai
```

## 快速更新（增量部署）

```bash
# 1. 本地重新构建
cd frontend && npm run build && cd ..
cd backend && mvn clean package -DskipTests -q && cd ..

# 2. 上传新文件
scp backend/target/industrial-ai-api-0.1.0.jar ubuntu@124.222.114.67:/opt/industrial-ai/app.jar
scp -r frontend/dist/* ubuntu@124.222.114.67:/opt/industrial-ai/dist/

# 3. 重启后端
ssh ubuntu@124.222.114.67 "sudo systemctl restart industrial-ai"
```

## 服务管理

```bash
# 后端状态
sudo systemctl status industrial-ai

# 查看后端日志
journalctl -u industrial-ai -f --no-pager | tail -50

# 重启后端
sudo systemctl restart industrial-ai

# 重启 Nginx
sudo systemctl reload nginx
```

## 验证部署

```bash
# 前端页面
curl -s -o /dev/null -w "%{http_code}" http://124.222.114.67/

# 后端 API（通过 Nginx 代理）
curl -s -X POST http://124.222.114.67/api/v1/session/captcha | head -c 200
```

