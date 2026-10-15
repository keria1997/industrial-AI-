# 业务后端

负责鉴权、会话管理、参数校验、数据库存储。通过 `AiServiceClient` 调用 AI 服务。

## 启动

```bash
mvn spring-boot:run
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| DATABASE_URL | PostgreSQL JDBC URL | jdbc:postgresql://localhost:5432/aiapp |
| DATABASE_USER | 数据库用户 | postgres |
| DATABASE_PASSWORD | 数据库密码 | postgres |
| AI_SERVICE_URL | AI 服务地址 | http://localhost:8000 |
| JWT_SECRET | JWT 签名密钥 | change-me-in-production |

## 分层边界

此层禁止出现 prompt 字符串、Agent 调度、向量检索逻辑。所有 AI 逻辑在 `ai-service/` 中。

