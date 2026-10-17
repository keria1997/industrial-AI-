# 测试方案与验收标准

## 1. 测试目标

1. 重构前后业务行为一致。
2. 所有 Controller 入参和出参使用具名 DTO。
3. 所有 `module_document(kind)` 都有物理表和 JPA Repository。
4. 所有列表查询在数据库完成过滤和分页。
5. 租户隔离、并发、幂等和状态机回归通过。

## 2. 测试分层

| 层级 | 测试内容 | 工具 |
| --- | --- | --- |
| Domain | 状态机、不变量、值对象 | JUnit 5、AssertJ |
| Application | 用例编排、事务、权限、异常 | JUnit 5、Mockito/Testcontainers |
| Repository | JPA 映射、查询、租户隔离、乐观锁 | Testcontainers PostgreSQL |
| API | 参数校验、HTTP 状态、响应 DTO | Spring MockMvc |
| E2E | 页面 -> API -> 数据库 -> 页面刷新 | Playwright |

## 3. 静态验收

1. `backend/src/main/java` 中业务代码不允许 `Map<String, Object>` 作为 API 入参或出参。
2. Controller 和 Application Service 不允许 `JsonNode`、`ObjectNode`、`ArrayNode`。
3. 禁止新增 `JdbcJsonCollections`、`JdbcModuleStoreSupport` 调用。
4. 每个公共 DTO 必须有具名 record/class。
5. 每个模块必须存在 `application`、`domain`、`infrastructure.persistence` 包。

静态检查建议：

```bash
rg -n "@RequestBody (JsonNode|Map<String[ ,]*Object>)" backend/src/main/java
rg -n "Map<String[ ,]*Object>.*Response|ResponseEntity<Map" backend/src/main/java
rg -n "JdbcJsonCollections|JdbcModuleStoreSupport" backend/src/main/java
```

## 4. Repository 测试

每个 JPA Repository 至少覆盖：

1. insert。
2. findById。
3. tenant 隔离查询。
4. 分页和排序。
5. 状态过滤。
6. 唯一键冲突。
7. 乐观锁冲突。
8. 子表级联保存。
9. 审计字段自动填充。

## 5. 数据迁移验收

### 5.1 完整性

| 检查 | 标准 |
| --- | --- |
| 数量 | 文档数与主表聚合数一致 |
| 主键 | 无重复、无空值 |
| 租户 | 全部记录租户有效 |
| 子表 | JSON 数组数量等于子表行数 |
| 引用 | 所有 `customerId/productId/workOrderId` 可追溯到物理表 |
| 状态 | 状态枚举合法 |
| 金额/数量 | 与 JSON 字符串相等 |
| 版本 | 物理表版本 >= JSON 版本 |

### 5.2 抽样

每个 `kind` 至少抽样：

1. 最新一条。
2. 最旧一条。
3. 每个状态一条。
4. 含子集合的一条。
5. 含异常字段的一条。

## 6. 行为一致性

对同一 API 分别请求旧实现和新实现，比较：

1. HTTP 状态。
2. 字段集合。
3. 字段类型。
4. 数量。
5. 状态。
6. 金额和数量。
7. 数据库前后事实。

以下差异必须显式接受：

1. `Map` 中未声明字段不再返回。
2. 缺失事实由 0 改为 null。
3. 错误码从通用 500 改为业务 400/409/422。

## 7. 性能测试

| 场景 | 指标 |
| --- | --- |
| 列表查询 | p95 < 500ms（本地样本） |
| 单据详情 | p95 < 300ms |
| 状态迁移 | p95 < 500ms |
| 报表聚合 | p95 < 2s |
| 并发单据更新 | 无丢失更新 |

必须验证索引：

1. `(tenant_id, status, created_at)`。
2. `(tenant_id, business_no)`。
3. `(tenant_id, source_id)`。
4. 子表 `(tenant_id, parent_id)`。
5. Outbox `(tenant_id, status, created_at)`。

## 8. 安全测试

1. 无 Token 返回 401。
2. 无权限返回 403。
3. 跨租户 ID 返回 403 或 404，不泄露数据。
4. 修改 `tenant_id` 请求被拒绝。
5. 会话撤销后旧 Token 失效。

## 9. 模块验收门槛

模块可标记完成后必须满足：

1. 旧 Store 不再被 Controller/Service 调用。
2. `module_document(kind)` 停止写入。
3. JPA Repository 覆盖全部读路径。
4. 所有 API 使用具名 DTO。
5. 领域状态机测试覆盖合法和非法迁移。
6. 真实数据库迁移和回滚说明完成。
7. 前端联调无字段缺失。

## 10. 整体验收

1. 所有模块完成。
2. `module_document` 无新增业务写入。
3. OpenAPI 与 Controller 完全一致。
4. 后端全量测试通过。
5. 关键业务链路 E2E 通过。
6. 数据库校验无孤儿、无重复、无非法状态。
7. Code Review 确认无 Map/JSON API。
