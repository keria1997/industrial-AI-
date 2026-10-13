# 工业AI平台 Ubuntu 部署制品

本目录用于在 Ubuntu 22.04 / 24.04 LTS 上部署工业 AI 平台。包含前端静态资源、Java 后端 fat jar、PostgreSQL 数据库与 nginx 反向代理的完整部署链路。

## 1. 目录结构

```
deploy/
├── build-artifacts.sh             # 在开发机执行：构建并打包制品
├── install-ubuntu.sh              # 在服务器执行：安装系统依赖（首次）
├── deploy.sh                      # 在服务器执行：部署应用
├── .env.production.example        # 生产环境变量模板
├── nginx/
│   └── industrial-ai.conf         # nginx 站点配置
├── systemd/
│   └── industrial-ai-api.service  # systemd 服务单元
└── README.md                       # 本文件
```

## 2. 技术栈与依赖

| 类别 | 组件 | 来源 |
| --- | --- | --- |
| 运行时 | Java 17 JRE | Ubuntu APT |
| 数据库 | PostgreSQL 16 | PostgreSQL 官方 APT |
| Web 服务器 | nginx | Ubuntu 官方源 |
| 进程管理 | systemd | 系统内置 |
| 防火墙 | UFW | 系统内置 |
| 前端构建 | Vite 7 | npm |
| 后端运行时 | Spring Boot 3.3 fat jar | Maven（构建机） |
| 数据库驱动 | PostgreSQL JDBC 42 | Maven |
| Web 框架 | Spring Web | Maven |

> 说明：数据库迁移链打包在 Java fat jar 的 `BOOT-INF/classes/db/migrations` 内。生产服务器不再需要 npm 依赖。

## 3. 部署架构

```
┌──────────────────────────────────────────────────────────┐
│  Ubuntu Server                                            │
│                                                            │
│   Internet ──► nginx :80                                  │
│                 │                                         │
│                 ├─► /api/v1/* ──► Java API :5185         │
│                 │                  │                      │
│                 │                  └─► PostgreSQL :5432   │
│                 │                  │   (本机)              │
│                 └─► /* ──► /opt/industrial-ai/current/app/dist│
│                     (静态前端)                            │
│                                                            │
│   systemd: industrial-ai-api.service                       │
└──────────────────────────────────────────────────────────┘
```

- 后端 API 监听 `127.0.0.1:5185`，仅本机访问，UFW 不开放对外端口。
- 数据库与本机同进程同机部署，账号 `industrial_ai`。
- Outbox Worker 通过 Spring `@Scheduled` 运行在 Java 主进程内，无需独立 systemd 单元。
- 应用目录 `/opt/industrial-ai`，按版本号滚动发布到 `releases/<version>/`，`current` 软链指向当前版本。

## 4. 完整部署流程

### 4.1 在开发机或 CI 上构建制品

```bash
cd /path/to/gongye_ai_plat

# 1. 确保构建依赖已安装
npm ci

# 2. 构建 Java fat jar 与前端，并打包

bash deploy/build-artifacts.sh

# 或指定版本号
bash deploy/build-artifacts.sh 1.0.0

# 跳过测试（仅紧急发布时使用）
SKIP_TEST=1 bash deploy/build-artifacts.sh 1.0.0
```

产物：

```
deploy/artifacts/
├── industrial-ai-<version>.tar.gz
└── industrial-ai-<version>.tar.gz.sha256
```

### 4.2 上传到服务器

```bash
scp deploy/artifacts/industrial-ai-<version>.tar.gz \
    deploy/install-ubuntu.sh deploy/deploy.sh \
    ubuntu@<server>:/tmp/
```

### 4.3 在服务器上首次安装系统依赖

```bash
ssh ubuntu@<server>
sudo bash /tmp/install-ubuntu.sh
```

脚本会自动：
- 安装 Java 17 JRE、PostgreSQL 16、nginx、UFW
- 创建系统用户 `industrial-ai` 与目录 `/opt/industrial-ai`
- 创建数据库 `industrial_ai` 与账号（自动生成密码并打印）
- 配置 UFW：开放 SSH 与 Nginx 80/443

> 安装结束会打印数据库密码，请妥善保存，后续需写入 `.env`。

### 4.4 首次部署应用

```bash
# 首次执行：仅生成 .env 模板并退出
sudo bash /tmp/deploy.sh /tmp/industrial-ai-<version>.tar.gz

# 编辑 .env，填入 AUTH_SECRET、FULFILLMENT_DATA_KEY、DATABASE_URL
sudo -u industrial-ai vi /opt/industrial-ai/current/.env

# 再次执行：完成数据库迁移与服务启动
sudo bash /tmp/deploy.sh /tmp/industrial-ai-<version>.tar.gz
```

`.env` 中必须修改的字段：

```bash
AUTH_SECRET=$(openssl rand -base64 48)
FULFILLMENT_DATA_KEY=$(openssl rand -base64 32)
DATABASE_URL=postgresql://industrial_ai:<install-ubuntu.sh输出的密码>@127.0.0.1:5432/industrial_ai
```

### 4.5 升级部署

```bash
# 上传新制品后
sudo bash /tmp/deploy.sh /tmp/industrial-ai-<new-version>.tar.gz <new-version>
```

`deploy.sh` 会：
1. 解压到 `releases/<version>/`
2. 沿用上一次的 `.env`
3. 使用 Java fat jar 执行数据库迁移
4. 切换 `current` 软链
5. 重启 systemd 服务
6. reload nginx

旧版本保留在 `releases/` 下，可回滚：`ln -sfn releases/<old> /opt/industrial-ai/current && systemctl restart industrial-ai-api`。

数据库迁移使用 `public.schema_migrations` 做版本记录，每个文件保存 SHA-256 checksum，并使用 PostgreSQL advisory lock 避免多个部署进程并发执行。已有环境首次升级时会根据每个迁移文件的哨兵对象补记录历史版本，不会重放已经生效的历史 SQL。Java 迁移器默认不会在 API 启动时改库；`deploy.sh` 显式传入 `app.database.migrate=true`。正式上线时重复执行迁移是秒级 no-op，同时会拦截 checksum 冲突。

## 5. 验证

```bash
# 服务状态
systemctl status industrial-ai-api

# 实时日志
journalctl -u industrial-ai-api -f
tail -f /opt/industrial-ai/logs/api.log

# nginx 状态
sudo nginx -t
systemctl status nginx

# 访问前端
curl -I http://localhost/

# 访问 API
curl -i http://localhost/healthz
```

## 6. 常用运维命令

```bash
# 启停
sudo systemctl start|stop|restart industrial-ai-api

# nginx
sudo nginx -t && sudo systemctl reload nginx

# 数据库
sudo -u postgres psql -d industrial_ai

# 清理旧版本（保留最近 5 个）
ls -1dt /opt/industrial-ai/releases/*/ | tail -n +6 | xargs rm -rf
```

## 7. HTTPS 配置（可选）

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

certbot 会自动修改 `/etc/nginx/sites-available/industrial-ai.conf`，添加 443 监听与证书路径，并配置 80→443 跳转。

## 8. 已知限制

- Outbox Worker 与 API 同进程；进程崩溃会暂停 Worker。Worker 按待处理事件动态发现租户，无需配置租户列表。
- MRP/APS 仅有任务入口，无求解器消费者（见 `AGENTS.md` §2.4）。
- 演示账号登录通过 `DEMO_AUTH_ENABLED=false` 关闭；真实租户通过 `/api/v1/session/register` 注册开通（自动创建租户基线：能力开关、角色权限、组织骨架与管理员账号），如基线缺失可调用 `/api/v1/platform/tenants/self-provision` 幂等补齐。
- 前端构建产物路径由 nginx 配置指向 `/opt/industrial-ai/current/app/dist`；打包与部署脚本均会校验 `index.html`。
