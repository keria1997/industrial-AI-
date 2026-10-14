# 02 - Ubuntu 安装与发布

## 主机要求

使用 Ubuntu Server 24.04 LTS `amd64`：

- 最低 2 vCPU、4 GiB 内存；推荐 4 vCPU、8 GiB 内存。
- 系统盘至少 40 GiB，另按业务增长单独规划数据库空间。
- 对用户开放 TCP 80；不要把 5185 或 5432 暴露给不可信网络。
- 启用 NTP 或 `systemd-timesyncd`。
- 具备 root 或 sudo 权限。

发布包已包含 PostgreSQL 16 软件包。Java 和 Nginx 通过 Ubuntu apt 仓库安装。完全离线主机需要预先准备内部 Ubuntu 镜像，或用 `03-database.md` 中的 apt 本地包方法补充这些依赖。

## 准备环境配置

在解压后的发布目录中执行：

```bash
cp .env.production.example .env
chmod 600 .env
```

生成生产密钥：

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # FULFILLMENT_DATA_KEY
openssl rand -hex 24      # 数据库密码，可直接用于 JDBC URL
```

必须修改以下值：

- `AUTH_SECRET`
- `FULFILLMENT_DATA_KEY`
- `DATABASE_URL` 中的数据库密码
- `DEMO_AUTH_PASSWORD`

同时保持：

```text
DEMO_AUTH_ENABLED=false
JAVA_NATIVE_ONLY=true
LEGACY_PROXY_ENABLED=false
```

## 安装应用

在解压后的发布目录中执行：

```bash
sudo ./scripts/install-ubuntu.sh "$(pwd)"
```

安装脚本可重复执行。它会完成以下动作：

1. 校验 Ubuntu 版本和架构。
2. 通过 apt 安装 Java 17、Nginx、curl 和 CA 证书。
3. 创建 `industrial-ai` 系统账号和 `/opt/industrial-ai` 目录。
4. 将发布内容复制到 `/opt/industrial-ai/releases/<release-id>/`。
5. 安装权限为 `600` 的 `.env`、Nginx 配置和 systemd 服务。
6. 按开关安装 PostgreSQL、创建数据库并执行初始化。
7. 启用并重启服务，然后执行健康检查。

数据库安装和迁移由开关控制：

```bash
# 标准安装：安装 PostgreSQL，创建数据库并执行全部迁移。
sudo INSTALL_DB=1 RUN_DB_MIGRATIONS=1 ./scripts/install-ubuntu.sh "$(pwd)"

# 使用已有 PostgreSQL 15 及以上数据库。
sudo INSTALL_DB=0 RUN_DB_MIGRATIONS=0 ./scripts/install-ubuntu.sh "$(pwd)"

# 先安装 PostgreSQL，迁移留给 DBA 在受控窗口执行。
sudo INSTALL_DB=1 RUN_DB_MIGRATIONS=0 ./scripts/install-ubuntu.sh "$(pwd)"
```

## 发布验证

```bash
sudo systemctl status industrial-ai-api --no-pager
sudo nginx -t
curl -fsS http://127.0.0.1:5185/healthz
curl -fsS http://127.0.0.1/healthz
sudo -u industrial-ai /opt/industrial-ai/current/scripts/verify-release.sh
```

最后在浏览器打开 `http://<服务器地址>/`，使用真实生产账号登录验收。不要使用演示账号作为生产验收依据。
