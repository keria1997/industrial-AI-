# 当前状态分析

## 1. 基线

- 代码基线：`f955758`。
- 后端框架：Spring Boot 3.5，当前持久化以 JDBC 为主，没有生产级 JPA Repository。
- 本地 `module_document` 快照：8 个业务模块、60 个 `kind`、约 894 条 JSON 文档。
- 现有迁移已定义超过 100 张业务表，但很多表没有被当前 Store 实际读写。

## 2. `module_document` 表结构

`017_module_business_persistence.sql` 定义：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `module` | text | 模块名，例如 `fulfillment`、`production`、`platform` |
| `tenant_id` | text | 租户 ID |
| `kind` | text | 聚合或文档类型，例如 `order`、`rma`、`workOrder` |
| `doc_id` | text | 文档 ID，通常同时承担业务 ID |
| `data` | jsonb | 整个业务聚合快照 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

主键是 `(module, tenant_id, kind, doc_id)`。另有索引 `module_document_list_idx` 基于 `data->>'createdAt'`。

相关基础表：

| 表 | 用途 |
| --- | --- |
| `module_outbox_event` | 各模块通用 Outbox |
| `module_audit_log` | 各模块审计日志 |
| `module_idempotency_record` | 各模块幂等记录 |

## 3. 当前访问方式

### 3.1 `JdbcModuleStoreSupport`

用于 AI、财务、消息、人员、供应链、平台等模块：

1. `documents(tenantId, kind, type)` 读取指定租户和 `kind` 的全部 JSON 文档，并反序列化到 Record。
2. `document(tenantId, kind, id, type)` 按主键读取单个文档。
3. `putDocument(...)` 将整个 Record 序列化后 upsert 到 `module_document`。
4. `deleteDocument(...)` 删除文档。
5. 通过 `ThreadLocal<Connection>` 模拟事务上下文。

问题：

1. 查询通常先读取全部文档，再在 Java 内存中过滤、分页、排序。
2. 没有数据库级唯一约束、外键和字段检查保证业务不变量。
3. 更新是整份 JSONB 覆盖，容易出现并发覆盖。
4. 同一聚合的字段和嵌套结构分散在 `data` 内，无法稳定 JOIN 和统计。

### 3.2 `JdbcJsonCollections`

主要用于履约域：

1. 启动时按 `kind` 加载全部文档到内存 `Map`。
2. `FulfillmentStore` 的大量字段是 `Map<String, JsonNode>`。
3. 写入时通过 write-through 更新 `module_document`。
4. 使用 PostgreSQL Advisory Lock 加租户级锁。

问题：

1. Store 本质上仍暴露可变 `Map` 给 Service。
2. 业务代码通过字符串路径读取字段，例如 `text(value, "status")`、`decimal(value, "qty")`。
3. 数据一致性依赖 Service 手工检查，数据库结构不表达不变量。
4. 内存快照与数据库之间生命周期复杂，重启、租户隔离和并发测试成本高。

### 3.3 生产域 `ProductionStore`

生产域使用另一套内存 JSON 聚合：

1. 字段包括 `Map<String, JsonNode> demands`、`workOrders`、`inspections`、`completions` 等。
2. `JdbcProductionStore` 把这些 Map write-through 到 `module_document`。
3. Service 通过 `JsonNode` 组装工单、报工、质检、完工和结案结果。

问题：

1. 虽然迁移 `001_production_p0.sql` 已定义大量 `prod_*` 物理表，但当前主链路没有使用这些表。
2. 状态机、数量守恒和分配关系全部嵌在 Service 的 `JsonNode` 操作中。
3. 领域模型没有显式聚合边界。

## 4. API 和业务代码中的 Map/JSON 问题

| 位置 | 现状 | 影响 |
| --- | --- | --- |
| `FulfillmentController` | 大量 `@RequestBody JsonNode` 和 `Map<String, Object>` 返回 | 无法从签名判断字段，Bean Validation 缺失 |
| `FulfillmentService` | 约 3,500 行，使用 `JsonNode` 组装订单、发货、出库、采购、库存 | 业务规则和序列化耦合 |
| `SalesAftercareService` | RMA、签收、完成关闭使用 `Map<String, Object>` | 状态机和必填字段难以静态验证 |
| `ProductionService` | 工单、BOM、报工、完工全部使用 `JsonNode` | 数量守恒和状态迁移依赖字符串取值 |
| `FinanceController` | 入参 `JsonNode`，出参常为 Record 或 `Map` | 财务金额和核销行为缺少编译期契约 |
| `PlatformController` | 通用 CRUD 使用 `Map<String, Object>` | 字段校验分散，历史兼容字段难以治理 |
| `WorkbenchController` | 聚合多个 Store 后手工构造 `Map` | 指标口径不可类型化 |

## 5. 已有物理表未被充分使用

以下表已经存在，但当前业务仍读取 `module_document`：

| 模块 | 已有物理表示例 |
| --- | --- |
| 销售/库存/采购 | `sales_order`、`sales_order_line`、`inv_shipment_task`、`inv_sales_outbound`、`proc_purchase_request`、`proc_purchase_order` |
| 生产 | `prod_demand`、`prod_work_order`、`prod_work_report`、`prod_inspection`、`prod_completion` |
| 财务 | `fin_receivable`、`fin_payable`、`fin_payment`、`fin_invoice`、`fin_voucher` |
| 平台 | `iam_tenant`、`iam_org_unit`、`iam_account`、`iam_role`、`iam_dictionary` |
| 消息 | `msg_record`、`msg_template`、`msg_user_preference`、`msg_subscription` |
| 人员 | `hr_employee`、`hr_attendance`、`hr_skill` |
| 产业链 | `sc_supplier`、`sc_customer`、`sc_risk_event` |
| AI | `ai_conversation`、`ai_message`、`ai_insight`、`ai_model_config` |

结论：重构不是简单“JSONB 转 JSONB + JPA”，而是恢复既有物理表作为唯一事实源，并用 JPA Repository 替换文档 Store。
