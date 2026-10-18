# 001 消息模块 JPA 物理表重构实施记录

## 1. 交付范围

本轮按 `docs/refactor-backend/09-module-refactor-plan.md` 优先实施消息模块，完成持久层切换：

| 原存储 | 目标存储 |
| --- | --- |
| `module_document(kind=template)` | `msg_template` |
| `module_document(kind=record)` | `msg_record` |
| `module_document(kind=preference)` | `msg_user_preference` |
| `module_document(kind=subscription)` | `msg_subscription` |
| `module_outbox_event(module=message)` | `msg_outbox` |
| `module_audit_log(module=message)` | `msg_audit_log` |
| `module_idempotency_record(module=message)` | `msg_idempotency_record` |

没有新建业务表；`msg_*` 表优先复用既有物理结构。为保留历史 API ID，迁移为既有表补充 `api_id`，并建立 `(tenant_id, api_id)` 部分唯一索引。UUID 继续作为数据库物理主键，`api_id` 承载 `msg-seed-001` 这类旧业务 ID。`msg_record.source_id` 保持原语义，继续表示业务来源单据 ID。

## 2. 代码修改清单

### 构建与配置

| 文件 | 修改 |
| --- | --- |
| `backend/pom.xml` | 新增 `spring-boot-starter-data-jpa`。 |
| `backend/src/main/resources/application.properties` | 设置 `ddl-auto=validate`、`open-in-view=false`、UTC JDBC 时区；禁止 Hibernate 生成或修改表。 |
| `backend/src/main/java/com/wanshen/platform/MessageStoreConfig.java` | 数据源与 7 个 JPA Repository 可用时装配 `JpaMessageStore`；不可用时保留内存测试 Store。新增消息事务模板。 |

### JPA 实体与仓库

新增目录：`backend/src/main/java/com/wanshen/platform/message/infrastructure/persistence/`。

| 文件 | 职责 |
| --- | --- |
| `MessageTemplateEntity.java` | 映射 `msg_template`，模板变量使用具名 `TemplateVariable` 集合。 |
| `MessageRecordEntity.java` | 映射 `msg_record`，保留业务来源字段和历史消息元数据。 |
| `MessagePreferenceEntity.java` | 映射 `msg_user_preference`。 |
| `MessageSubscriptionEntity.java` | 映射 `msg_subscription`。 |
| `MessageOutboxEntity.java` | 映射 `msg_outbox`，封装发布和失败状态迁移。 |
| `MessageAuditLogEntity.java` | 映射 `msg_audit_log`。 |
| `MessageIdempotencyEntity.java` | 映射 `msg_idempotency_record`。 |
| `MessageTemplateJpaRepository.java` | 模板编码、旧 API ID 查询。 |
| `MessageRecordJpaRepository.java` | 旧 API ID 查询和 Specification 分页。 |
| `MessagePreferenceJpaRepository.java` | 用户偏好唯一键、旧 API ID 查询。 |
| `MessageSubscriptionJpaRepository.java` | 订阅唯一键、旧 API ID 查询。 |
| `MessageOutboxJpaRepository.java` | 租户内 pending 查询与跨租户租户 ID 发现。 |
| `MessageAuditLogJpaRepository.java` | 审计追加写入。 |
| `MessageIdempotencyJpaRepository.java` | 命令幂等查询。 |
| `JpaMessageStore.java` | 适配现有 `AbstractMessageStore` 接口；数据库分页、过滤、事务和租户会话绑定。 |

### 数据迁移

| 文件 | 职责 |
| --- | --- |
| `backend/src/main/resources/db/migrations/038_migrate_message_module_documents.sql` | 幂等回填消息聚合、Outbox、审计和幂等事实；补充 `api_id`；调整 Outbox 租户发现 RLS。 |

### 测试

| 文件 | 修改 |
| --- | --- |
| `backend/src/test/java/com/wanshen/platform/storage/PostgresDatabaseMigratorTests.java` | 迁移链数量从 37 更新为 38，并校验最后一个迁移为 038。 |

## 3. 运行时设计

1. 每个消息事务通过 `TransactionTemplate` 开启，并在事务内执行 `set_config('app.current_tenant_id', :tenantId, true)`。
2. 所有业务查询显式携带 `tenantId`；PostgreSQL RLS 作为第二道防线。
3. 模板和消息列表由数据库完成过滤、排序和分页，不再全量读取 `module_document` 后在 Java 内存过滤。
4. Worker 的租户发现只返回 `tenant_id`。RLS 规则要求 bootstrap 会话显式开启 `app.bootstrap_mode=true`，该规则只放宽 pending 租户 ID 发现，不用于普通业务查询。
5. `JpaMessageStore` 当前保留旧 `AbstractMessageStore` 接口，Controller 与 Worker 的 HTTP 契约和调用链保持不变。

## 4. 数据迁移结果

已在本地开发库 `industrial_ai` 执行 038 迁移，结果如下：

| 事实 | 源数量 | 目标数量 |
| --- | ---: | ---: |
| 消息记录 | 5 | 5 |
| 消息幂等记录 | 1 | 1 |

迁移后旧 API ID 保留示例：

| `api_id` | `msg_no` | 归一化 category |
| --- | --- | --- |
| `msg-seed-001` | `MSG-SEED-001` | `production` |
| `msg-seed-002` | `MSG-SEED-002` | `order` |
| `msg-seed-003` | `MSG-SEED-003` | `inventory` |
| `msg-seed-004` | `MSG-SEED-004` | `finance` |
| `msg-seed-baseline` | `MSG-SEED-BASELINE` | `system` |

历史 `sales` 分类映射为 `msg_record` CHECK 约束允许的 `order`。这是显式历史字典兼容规则，不是缺失字段兜底；迁移脚本不伪造 `msgNo`、标题、正文、接收人或租户。

本地开发库的 038 已实际执行，但未通过迁移命令写入 `schema_migrations`。因为 038 使用 `IF NOT EXISTS` 和 `ON CONFLICT`，后续用正式迁移命令执行会安全跳过数据重复并记录台账。

## 5. API 兼容性

本轮不改 URL、HTTP 方法、请求体和响应体。前端 `messagesApi` 使用的模板、消息、已读、归档、偏好、订阅等字段继续可用。

需要注意：现有契约中消息 `metadata` 是开放对象，发送参数 `variables` 是字符串键值对象；这是历史 API 契约。为避免前端断裂，本轮 JPA 适配层保留这些 JSONB 字段和现有领域 record。控制器仍使用 `JsonNode` 处理补丁和对象变量。

## 6. 剩余重构项

下一切片必须完成，未在本轮标记完成：

1. 拆分 `MessageController` 到 `api` / `application` / `domain` 分层，用 Bean Validation 和具名 Command/Query 替换 `JsonNode`。
2. 为模板变量和消息 metadata 发布具名 API schema；与前端确认后废弃 `additionalProperties: true`。
3. 将消息 Outbox payload、审计 before/after、幂等 response body 从现有公共 `Object/Map` 适配改为消息包内具名模型。
4. 删除或标注废弃 `JdbcMessageStore` 和内存 `MessageStore` 的生产装配路径。
5. 补充真实 PostgreSQL Repository 集成测试、租户越权测试和 038 迁移一致性测试。

## 7. 验证结果

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 后端全量测试 | `mvn -f backend/pom.xml clean test` | 通过：166 tests, 0 failures, 0 errors, 18 skipped。 |
| API 契约校验 | `npm run verify:api-contracts` | 通过：308 routes / 308 OpenAPI operations。 |
| Hibernate 表校验 | Spring Context 启动 | 通过：7 个消息 JPA Repository 加载，实体映射通过 `validate`。 |
| 迁移执行 | `psql -f .../038_migrate_message_module_documents.sql` | 通过：消息记录 5/5，幂等记录 1/1。 |

前端既有脚本 `frontend` 中的 `test:routes:java` 引用了不存在的 `frontend/scripts/verify-java-routes.mjs`，执行失败。这是既有脚本路径问题，与本次后端重构无关；实际契约校验使用根目录 `npm run verify:api-contracts`。

## 8. 影响范围与回滚

影响范围仅限消息模块持久化、消息 Worker、消息迁移和后端构建配置；未修改 Controller URL、前端代码、其他模块 Store、历史单据数据或前端静态路由。

回滚方式：将 `MessageStoreConfig` 的 JPA 分支下线，恢复装配 `JdbcMessageStore`；038 已添加的 `api_id` 列可保留，不影响旧 JDBC Store。回滚后 `module_document` 中仍保留迁移前文档，但 038 执行后新增消息只会写入 `msg_*` 表，不会自动双写回 `module_document`。
