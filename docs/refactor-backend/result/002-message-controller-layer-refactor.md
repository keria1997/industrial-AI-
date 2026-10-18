# 002 消息模块 Controller 分层与具名 DTO 重构

## 1. 交付范围

本切片在 001 的 JPA 物理表切换基础上完成消息模块接口层重构：

1. `MessageController` 不再依赖 `JsonNode`、`ObjectNode`、`ArrayNode`。
2. 所有请求使用具名 DTO 和 Bean Validation。
3. 业务编排迁移到 `MessageApplicationService`。
4. Controller 只保留协议转换、认证上下文转换、HTTP 状态、ETag 和响应头。
5. 消息 metadata、模板变量、Outbox payload、审计快照改为具名领域对象。

## 2. 架构变化

```text
MessageController
  -> api.dto.Request
  -> MessageCommands
  -> MessageApplicationService
  -> AbstractMessageStore / JPA Store
```

| 分层 | 主要类 | 职责 |
| --- | --- | --- |
| API | `MessageController`、`api.dto.*` | 参数绑定、`@Valid`、上下文、响应头。 |
| Application | `MessageApplicationService`、`MessageCommands`、`result.*` | 权限、状态流转、幂等、审计、Outbox、聚合。 |
| Domain | `MessageMetadata`、`MessageVariableBindings`、`MessageOutboxEvent`、`MessageAuditEntry` | 具名业务值对象和事件模型。 |
| Infrastructure | `JpaMessageStore`、`JdbcMessageStore` | 数据库访问；仅适配层允许处理历史 JSON 形状。 |

## 3. 代码修改清单

### 新增

| 目录/文件 | 说明 |
| --- | --- |
| `backend/src/main/java/com/wanshen/platform/message/api/dto/` | 9 个请求 DTO，字段长度、必填、集合规模使用 Bean Validation。 |
| `backend/src/main/java/com/wanshen/platform/message/application/MessageApplicationService.java` | 消息核心用例、事务、权限、幂等、审计、Outbox。 |
| `backend/src/main/java/com/wanshen/platform/message/application/MessageCommands.java` | 应用层命令和执行者上下文。 |
| `backend/src/main/java/com/wanshen/platform/message/application/result/` | 类型化命令结果和消息看板响应。 |
| `backend/src/main/java/com/wanshen/platform/message/domain/` | metadata、变量、Outbox、审计状态等具名模型和 Jackson 流式适配器。 |

### 修改

| 文件 | 说明 |
| --- | --- |
| `backend/src/main/java/com/wanshen/platform/message/MessageController.java` | 重写为薄 HTTP 适配器。 |
| `backend/src/main/java/com/wanshen/platform/message/AbstractMessageStore.java` | 消息记录 metadata、消息 Outbox、审计接口改为消息领域类型；聚合支持 `read/archive/star` 状态方法。 |
| `backend/src/main/java/com/wanshen/platform/message/JdbcMessageStore.java` | 兼容旧通用 Outbox/审计结构；`pendingOutbox` 使用消息事件类型。 |
| `backend/src/main/java/com/wanshen/platform/message/MessageStore.java` | 内存测试 Store 适配具名事件/审计模型。 |
| `backend/src/main/java/com/wanshen/platform/message/MessageOutboxWorker.java` | 使用 `MessageOutboxEvent`。 |
| `backend/src/main/java/com/wanshen/platform/message/infrastructure/persistence/*` | JPA 实体的 metadata、Outbox payload、审计快照切换为具名类型。 |
| `backend/src/main/java/com/wanshen/platform/storage/JdbcModuleStoreSupport.java` | 通用 pending 查询更名为 `pendingModuleOutbox`，避免与消息接口协变返回冲突。 |
| `backend/src/main/java/com/wanshen/platform/ai/JdbcAiStore.java`、`finance/JdbcFinanceStore.java`、`supplychain/JdbcSupplyChainStore.java` | 适配通用支撑方法更名。 |
| `backend/src/main/java/com/wanshen/platform/web/ApiExceptionHandler.java` | 补充 Bean Validation 和不可读请求体错误，统一返回既有错误契约。 |
| `backend/pom.xml` | 新增 `spring-boot-starter-validation`。 |
| `docs/openapi/backend/v1/message.yaml` | metadata 契约从 `additionalProperties: true` 收敛为字符串值。 |

## 4. API 行为影响

| 项 | 影响 |
| --- | --- |
| URL、HTTP 方法 | 无变化。 |
| 核心请求/响应字段 | 无变化；模板变量继续接受对象，响应消息继续输出 `metadata` 对象。 |
| metadata 值类型 | 数字和布尔值会归一化为字符串；嵌套对象/数组不再接受。当前前端未消费消息 metadata 字段。 |
| 非法字段 | 未知字段和字段超长由 Bean Validation/不可读请求体处理，统一返回 `PRODUCTION_400_INVALID_ARGUMENT`。 |
| 幂等重放 | 类型化结果继续恢复；JPA 中历史 `Object` 反序列化结果会按命令类型转换为对应具名结果。 |

## 5. 清理结果

消息 Controller 和 Application Service 已无 `JsonNode`、`ObjectNode`、`ArrayNode`；dashboard 聚合和版本冲突 details 也不再使用 `Map`。

`MessageMetadata`、`MessageVariableBindings`、`MessageAuditState` 的 Jackson 适配器只处理流式 JSON 事件，用于保持既有 JSONB/API 形状。`JdbcMessageStore` 中保留少量 `LinkedHashMap`，用于旧通用 `module_outbox_event` / `module_audit_log` 兼容边界；这是 001 中定义的历史兼容例外，待对应通用表完全退役后删除。

## 6. 验证

| 验证 | 结果 |
| --- | --- |
| `mvn -f backend/pom.xml clean test` | 通过：166 tests, 0 failures, 0 errors, 18 skipped。 |
| `npm run verify:api-contracts` | 通过：308 routes / 308 OpenAPI operations。 |
| 消息模块 Controller/Worker/Context 测试 | 通过：7 tests。 |

## 7. 剩余工作

1. 删除内存 `MessageStore` 的生产 fallback；无数据库时消息 API 应显式失败或由健康检查阻断。
2. 将 `AbstractMessageStore` 中剩余聚合 records 移入 domain 包，Repository 接口从 Infrastructure 上移。
3. 将幂等响应从公共 `ModuleInfra.IdempotencyRecord(Object body)` 改为消息模块具名持久化模型。
4. 删除 `JdbcMessageStore` 中旧 Outbox/审计 Map 适配；前提是 038 迁移和生产切换完成。
5. 为 Bean Validation 错误、metadata 类型收敛、幂等重放补集成测试。
