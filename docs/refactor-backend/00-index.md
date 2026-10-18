# 后端 `module_document` 重构方案索引

- 日期：2026-10-18
- 代码基线：`f955758`
- 文档目标：分析当前 `module_document` 文档存储实现，制定全面迁移到 JPA 实体和 PostgreSQL 物理表的重构方案。
- 原则：优先复用既有物理表；只有业务模型没有对应表时才允许新增表；新代码禁止使用 `Map`、`JsonNode`、`ObjectNode` 接收入参或生成出参。

## 文档列表

| 编号 | 文档 | 内容 |
| --- | --- | --- |
| 00 | [00-index.md](00-index.md) | 索引、范围、结论和阅读顺序 |
| 01 | [01-current-state-analysis.md](01-current-state-analysis.md) | 当前 `module_document` 结构、存储实现、代码问题 |
| 02 | [02-business-logic-inventory.md](02-business-logic-inventory.md) | 各后端模块业务逻辑与实现方式盘点 |
| 03 | [03-target-architecture.md](03-target-architecture.md) | 目标分层架构、JPA 边界和依赖方向 |
| 04 | [04-coding-standards.md](04-coding-standards.md) | Java、阿里巴巴规范和 Clean Code 落地规则 |
| 05 | [05-domain-and-class-design.md](05-domain-and-class-design.md) | 实体、值对象、命令、响应、仓库和 Service 设计 |
| 06 | [06-module-document-mapping.md](06-module-document-mapping.md) | `module_document` 到既有物理表的完整映射 |
| 07 | [07-api-and-dto-refactor.md](07-api-and-dto-refactor.md) | Controller 入参、出参和 API 契约重构 |
| 08 | [08-data-migration-and-cutover.md](08-data-migration-and-cutover.md) | 存量数据迁移、双写、校验和切换 |
| 09 | [09-module-refactor-plan.md](09-module-refactor-plan.md) | 分模块实施顺序、任务拆分和关联影响 |
| 10 | [10-testing-and-acceptance.md](10-testing-and-acceptance.md) | 测试、验收和回归门槛 |
| 11 | [11-risk-and-delivery-control.md](11-risk-and-delivery-control.md) | 风险、回滚和交付控制 |

## 实施记录

| 编号 | 文档 | 状态 |
| --- | --- | --- |
| 001 | [result/001-message-module-jpa-refactor.md](result/001-message-module-jpa-refactor.md) | 消息模块持久化切换已完成并通过后端与契约校验；Controller DTO 分层重构列入下一切片。 |

## 当前结论

1. 当前系统存在两套数据访问方式：一部分模块使用既有物理表定义，另一部分实际读写 `module_document` JSONB。
2. `JdbcJsonCollections` 和 `JdbcModuleStoreSupport` 把业务聚合保存为 `data jsonb`，并通过内存 `Map<String, JsonNode>` 缓存、过滤、排序和修改。
3. Controller、Service、Store 多处使用 `JsonNode`、`ObjectNode`、`Map<String, Object>` 传递业务输入和输出，导致契约不可编译验证、字段约束分散、业务规则难以测试。
4. 既有迁移已经创建了销售、库存、采购、生产、财务、平台、消息、人员、产业链和 AI 的物理表。重构应优先把这些表纳入 JPA 持久化，而不是另起一套新模型。
5. 重构应按模块 strangler pattern 推进：先建立 JPA Repository 和显式 DTO，再替换 Store，再停止 `module_document` 写入，最后归档历史数据。

## 阅读顺序

1. 了解现状：阅读 01、02。
2. 确认目标架构和规范：阅读 03、04、05。
3. 执行迁移和接口改造：阅读 06、07、08。
4. 排期和验收：阅读 09、10、11。
