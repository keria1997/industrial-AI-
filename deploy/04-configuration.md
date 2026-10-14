# 04 - 配置说明

## 归档配置

| 文件 | 安装目标 | 用途 |
| --- | --- | --- |
| `.env.production.example` | `/opt/industrial-ai/releases/<id>/.env` | 密钥、数据库地址、端口和运行开关 |
| `config/application.properties` | 可执行 JAR 内 | 后端默认值；环境变量可覆盖默认值 |
| `config/nginx/industrial-ai.conf` | `/etc/nginx/sites-available/industrial-ai.conf` | 前端静态服务、SPA 回退和 API 反向代理 |
| `config/systemd/industrial-ai-api.service` | `/etc/systemd/system/industrial-ai-api.service` | Java 进程生命周期和安全限制 |

后端生效配置由两部分组成：JAR 内归档的 `application.properties`，以及 systemd 加载的受保护 `.env`。

## 关键运行参数

| 变量 | 是否必填 | 生产要求 |
| --- | --- | --- |
| `PRODUCTION_API_HOST` | 是 | Nginx 同机部署时使用 `127.0.0.1` |
| `PRODUCTION_API_PORT` | 是 | 使用 `5185`，并阻止客户端直接访问 |
| `DATABASE_URL` | 是 | 使用最小权限应用角色的 JDBC URL |
| `AUTH_SECRET` | 是 | 48 字节随机数据的 Base64 值 |
| `FULFILLMENT_DATA_KEY_ID` | 是 | 稳定密钥标识，例如 `prod-v1` |
| `FULFILLMENT_DATA_KEY` | 是 | Base64 编码的 32 字节密钥 |
| `JAVA_NATIVE_ONLY` | 是 | 固定为 `true`，防止误用旧代理行为 |
| `LEGACY_PROXY_ENABLED` | 是 | 固定为 `false` |
| `DEMO_AUTH_ENABLED` | 是 | 生产固定为 `false`，不得暴露演示账号 |

连接池和后台 Worker 参数见 `.env.production.example`。标准单进程部署保持 Worker 发现开启。

## 服务路径

```text
/opt/industrial-ai/releases/<release-id>/     不可变发布内容
/opt/industrial-ai/current                    指向当前版本的符号链接
/opt/industrial-ai/logs/api.log               标准输出日志
/opt/industrial-ai/logs/api.err.log          标准错误日志
/etc/nginx/sites-available/industrial-ai.conf Nginx 站点配置
/etc/systemd/system/industrial-ai-api.service Java 服务单元
```

`.env` 权限为 `600`，属主为 `industrial-ai:industrial-ai`。发布代码由服务账号只读使用，不允许服务账号改写。

## Nginx 行为

- `/` 服务 `/opt/industrial-ai/current/app/dist`。
- `/assets/` 使用一年 immutable 缓存，因为 Vite 文件名带内容哈希。
- `/api/v1/` 反向代理到 `127.0.0.1:5185`。
- `/healthz` 反向代理到 Java 健康接口。
- 未命中的 SPA 路径回退到 `index.html`。
- 请求体限制为 25 MiB，API 超时为 300 秒。

启用 HTTPS 时在 Nginx 443 端口终止 TLS，并把 80 端口重定向到 HTTPS。API 和 PostgreSQL 只监听回环地址或私网地址。
