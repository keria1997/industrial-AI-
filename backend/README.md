# Industrial AI Java API

Spring Boot 3 / Java 17 后端。当前仓库的 API 运行入口是 Java。

## 启动

```bash
npm run dev:all
```

该命令启动：

1. Java API：`http://127.0.0.1:8081`
2. React/Vite：`http://127.0.0.1:5173`

`dev:all` 会加载根目录 `.env.local`，并将环境配置传入前后端进程。本地端口配置为：

```dotenv
JAVA_API_PORT=8081
PRODUCTION_API_PORT=8081
VITE_API_PROXY_TARGET=http://127.0.0.1:8081
```

以上命令在仓库根目录运行。Vite 默认使用 `5173`，当前 `strictPort=false`，占用时可切换端口，以实际启动输出为准。以上为本地开发配置，Ubuntu 生产部署仍使用 `deploy/` 中的 nginx 和环境变量模板。单独启动 Java 使用根目录的 `npm run dev:java-api`，以加载根目录 `.env.local`；直接执行 Maven 不会自动加载此文件。

## 数据库

`DATABASE_URL` 支持：

- `jdbc:postgresql://user:password@host:5432/database`
- `postgresql://user:password@host:5432/database`
- `postgres://user:password@host:5432/database`

Java 会把后两种格式规范化为 JDBC URL。首次初始化数据库使用部署脚本，或显式运行：

```bash
java -jar backend/target/industrial-ai-api-0.1.0.jar \
  --spring.main.web-application-type=none \
  --app.database.migrate=true \
  --app.migration.exit=true
```

已存在业务表却缺少已审核迁移台账时，不可直接执行首次初始化或补写当前文件校验和。`/readyz` 会报告迁移基线未就绪，需后端根据已审核备份与实际表结构恢复。

## 测试与构建

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test:frontend
npm --prefix frontend run build
mvn -f backend/pom.xml test
# 真实服务与数据库联调，在本地专用账号/数据库运行
LIVE_WRITE=1 npm --prefix frontend run test:live-backend
```

`RealJdbcSmokeTests` 只有在设置 `JAVA_JDBC_URL` 时才执行；它会验证真实 PostgreSQL 迁移、事务回滚、JSONB 读写和 RLS 租户隔离。
