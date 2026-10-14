# 00 - 部署总览

## 方案范围

本目录是工业 AI 平台的完整 Ubuntu 部署套件，包含前端构建产物、Java API 运行包、PostgreSQL 离线软件包、数据库初始化与校验脚本、运行配置模板和分步执行文档。

目标基线：

- Ubuntu Server 24.04 LTS，`amd64` 架构。
- PostgreSQL 16.2，离线 `.deb` 软件包已随部署套件提供。
- Java 17 JRE。
- Nginx。
- 前端：React 18 / Vite 7。
- 后端：Spring Boot 3.3 / Java 17。

本方案不使用 Docker、Podman、Kubernetes 或其他容器运行时。

## 目录结构

```text
deploy/
  00-overview.md                     部署总览和目录索引
  01-build-and-package.md           编译、测试、打包和校验
  02-ubuntu-install-and-release.md  Ubuntu 主机安装与发布流程
  03-database.md                    PostgreSQL 安装、初始化和校验
  04-configuration.md               运行配置说明
  05-operations.md                  健康检查、备份和回滚
  .env.production.example           生产环境配置模板
  scripts/build-release.sh          构建完整发布包
  scripts/install-ubuntu.sh         在 Ubuntu 上安装一个发布版本
  scripts/verify-release.sh         API、前端、服务和数据库检查
  config/application.properties     从源码归档的后端配置
  config/nginx/industrial-ai.conf   Nginx 前端服务和 API 反向代理
  config/systemd/industrial-ai-api.service Java API 服务单元
  database/packages/ubuntu-24.04-amd64 PostgreSQL 16 .deb 依赖闭包
  database/init/001...030.sql       按顺序执行的数据库初始化脚本
  database/scripts/                 数据库安装、初始化、迁移和校验脚本
```

构建归档和生成的发布包写入 `deploy/artifacts/`。该目录被 Git 忽略，只作为传输产物，不作为配置和源码的最终保存位置。

## 推荐执行流程

1. 在 macOS 或 Linux 构建机上执行 `deploy/scripts/build-release.sh`。构建机需要 Node.js 20 及以上、npm、Java 17 和 Maven。
2. 将生成的 `.tar.gz` 和 `.tar.gz.sha256` 复制到 Ubuntu 主机。
3. 在 Ubuntu 主机上校验归档 SHA256，然后解压。
4. 将解压目录中的 `.env.production.example` 复制为 `.env`，并替换所有 `change-me` 值。
5. 执行 `sudo ./scripts/install-ubuntu.sh <解压后的发布目录>`。
6. 执行 `/opt/industrial-ai/current/scripts/verify-release.sh` 完成发布验证。

数据库单独操作时阅读 `03-database.md`。除受控恢复场景外，不要绕过脚本手工执行 SQL。
