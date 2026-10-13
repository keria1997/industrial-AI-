# Industrial AI Java API

Spring Boot 3 / Java 17 后端。当前仓库的 API 运行入口是 Java。

## 启动

```bash
npm run dev:all
```

该命令启动：

1. Java API：`http://127.0.0.1:8081`
2. React/Vite：`http://127.0.0.1:5175`

`dev:all` 会加载根目录 `.env.local`，并将环境配置传入前后端进程。本地端口配置为：

```dotenv
JAVA_API_PORT=8081
PRODUCTION_API_PORT=8081
VITE_API_PROXY_TARGET=http://127.0.0.1:8081
```

Vite 固定使用 `5175` 并启用 `strictPort`；端口被占用时启动失败，不会自动切换端口。以上为本地开发配置，Ubuntu 生产部署仍使用 `deploy/` 中的 nginx 和环境变量模板。

## 数据库

`DATABASE_URL` 支持：

- `jdbc:postgresql://user:password@host:5432/database`
- `postgresql://user:password@host:5432/database`
- `postgres://user:password@host:5432/database`

Java 会把后两种格式规范化为 JDBC URL。首次初始化数据库使用部署脚本，或显式运行：

```bash
java -jar server-java/target/industrial-ai-api-0.1.0.jar \
  --spring.main.web-application-type=none \
  --app.database.migrate=true \
  --app.migration.exit=true
```

## 测试与构建

```bash
npm run test:routes:java
npm run test:frontend
npm run test:java
npm run build
```

`RealJdbcSmokeTests` 只有在设置 `JAVA_JDBC_URL` 时才执行；它会验证真实 PostgreSQL 迁移、事务回滚、JSONB 读写和 RLS 租户隔离。
