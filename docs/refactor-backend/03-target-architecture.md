# 目标架构与分层

## 1. 总体原则

1. 以业务模块划分边界，不再以技术性 Store 汇总多个聚合。
2. Controller 只做协议转换，不写业务规则。
3. Application Service 只编排领域对象、Repository 和事务。
4. Domain 表达状态机、不变量和值对象。
5. Infrastructure 负责 JPA 映射、数据库查询和外部服务。
6. API 入参、出参、应用层参数和返回值必须是具名 `record` 或具名类。

## 2. 分层

```text
interfaces / api
  Controller + Request + Response + Presenter
        ↓ 具名 Command / Query
application
  Application Service + Port + Assembler
        ↓ 领域对象
domain
  Aggregate + Entity + Value Object + Domain Service + Repository Interface
        ↓ 接口
infrastructure
  JPA Entity + JPA Repository + Mapper + External Client
```

推荐 Maven 包结构：

```text
com.wanshen.platform.sales
  .api
  .application
  .domain
  .infrastructure.persistence

com.wanshen.platform.inventory
com.wanshen.platform.procurement
com.wanshen.platform.production
com.wanshen.platform.finance
com.wanshen.platform.platform
com.wanshen.platform.message
com.wanshen.platform.personnel
com.wanshen.platform.supplychain
com.wanshen.platform.ai
```

历史包中的 `FulfillmentStore`、`ProductionStore`、`AbstractFinanceStore` 等将在模块迁移完成后删除或标记 `@Deprecated`。

## 3. 依赖方向

| 层 | 可依赖 | 禁止依赖 |
| --- | --- | --- |
| `api` | `application` DTO | `JPA Entity`、Repository 实现、`JsonNode` |
| `application` | `domain`、Repository 接口、Port | Controller、JPA Entity、`HttpServletRequest` |
| `domain` | 本模块领域对象 | Spring Web、Spring Data、JDBC、Jackson |
| `infrastructure.persistence` | JPA、Domain、Mapper | Controller |

## 4. 事务

1. Application Service 方法使用 `@Transactional`。
2. 取消 `ThreadLocal<Connection>` 手工事务。
3. 跨聚合写入放在同一应用事务中；跨模块最终一致使用 Outbox。
4. 并发控制使用数据库唯一约束和 JPA `@Version`。

## 5. 租户隔离

1. 所有业务实体保留 `tenant_id`。
2. JPA Entity 使用 `@MappedSuperclass` 统一租户字段和审计字段。
3. 继续依赖 PostgreSQL RLS，同时 Repository 查询显式带租户条件。
4. 禁止在 Service 中通过“过滤最后一个”“列表中查找”模拟租户隔离。

## 6. JPA 策略

1. 优先映射既有物理表，不修改表名。
2. 优先复用既有列；字段不足时通过 ALTER TABLE 补充，不优先新建表。
3. 一对多关系使用子实体；禁止用 JSONB 数组替代可查询业务行。
4. 金额使用 `BigDecimal`，数量使用 `BigDecimal`，时间使用 `Instant`。
5. 枚举使用 `@Enumerated(EnumType.STRING)`。
6. 既有 JSONB 列仅在历史兼容时保留，映射必须使用具名类型或 Converter；新代码禁止 `JsonNode`。
7. JPA DDL 使用显式迁移管理，不开启 `ddl-auto=update`。

## 7. Repository

1. Domain 层只定义接口，例如 `SalesOrderRepository`。
2. Infrastructure 层实现 `SalesOrderJpaRepository extends JpaRepository<SalesOrderEntity, Long>` 或对应 ID 类型。
3. 复杂查询使用 `@Query` 或 `JpaSpecificationExecutor`，但查询条件必须用具名 Criteria/Specification 对象。
4. 禁止返回 `Map<String, Object>`；投影必须定义具名接口或 record。

## 8. Outbox、Inbox、审计和幂等

这些能力不复用 `module_document`：

| 能力 | 目标 |
| --- | --- |
| Outbox | 每模块既有 outbox 表 + 具名 JPA Entity |
| Inbox | 每模块既有 inbox 表 + 消费幂等 |
| 审计 | 每模块审计表 + 具名 AuditEntry |
| 幂等 | 每模块幂等表 + 具名 IdempotencyRecord |

## 9. 与旧 Store 的兼容

1. 新旧实现不允许长期双写同一聚合。
2. 单模块切换前先完成数据回填和只读比对。
3. 切换后旧 Store 标记 `@Deprecated`，观察一个发布周期后删除。
4. `module_document` 最终只保留归档数据，或整体转为归档表。
