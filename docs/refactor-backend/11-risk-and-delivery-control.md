# 风险、影响范围与交付控制

## 1. 主要风险

| 风险 | 等级 | 影响 | 控制 |
| --- | --- | --- | --- |
| JSON 字段缺失或类型不一致 | 高 | 数据迁移失败、接口 500 | 先定义 schema，再写迁移 |
| 既有表字段不足 | 高 | 无法承载文档字段 | 优先 ALTER 既有表；必要时补子表 |
| 业务行为回归 | 高 | 前端字段缺失、状态异常 | API diff 和 E2E 回归 |
| Map/JSON 隐性依赖 | 高 | 隐藏字段在重构后消失 | 全量 Controller/Service 扫描 |
| 多模块耦合 | 高 | 修改一个 Store 影响多个业务 | 分模块迁移，禁止一次性重写 |
| 并发覆盖 | 高 | 金额、库存、状态丢失 | JPA 乐观锁和数据库约束 |
| 租户数据泄露 | 高 | 合规和安全问题 | RLS + 显式租户条件测试 |
| 迁移期间双写不一致 | 高 | API 与数据库不一致 | 单一权威写入口 |
| 前端依赖隐式字段 | 中 | 页面空白或字段 undefined | API diff 与前端联调 |
| 开发周期过长 | 中 | 新旧代码长期并存 | 按模块小批量交付 |

## 2. 直接影响范围

### 2.1 必须修改的代码层

| 层 | 影响内容 |
| --- | --- |
| Controller | 全部业务 Controller 改用具名 DTO |
| Application | 新增或拆分 Application Service |
| Domain | 新增聚合、实体、值对象、状态枚举 |
| Repository | 新增 Domain Repository 和 JPA Repository |
| Persistence | 删除或替代 `JdbcJsonCollections` / `JdbcModuleStoreSupport` |
| Migration | 新增 `module_document` 到物理表的回填脚本 |
| Test | 新增领域、Repository、API、迁移一致性测试 |

### 2.2 受影响的当前类

| 类 | 影响 |
| --- | --- |
| `FulfillmentController` | API DTO 重构 |
| `FulfillmentService` | 拆分为销售、库存、采购应用服务 |
| `FulfillmentStore` / `JdbcFulfillmentStore` | 删除或废弃 |
| `SalesAftercareService` | 拆分 RMA、签收、完成领域服务 |
| `ProductionStore` / `ProductionService` | 拆分生产聚合和应用服务 |
| `FinanceController` / `JdbcFinanceStore` | 改为财务应用服务和 JPA Repository |
| `PlatformController` / `PlatformService` | 按平台子域拆分 |
| `WorkbenchController` | 改为 Query Service 聚合 |
| `AiBusinessQueryService` | 不再直读其他模块 JSON |
| `JdbcModuleStoreSupport` | 迁移完成后废弃 |
| `JdbcJsonCollections` | 迁移完成后删除 |

## 3. 对数据库的影响

1. 既有物理表成为唯一事实源。
2. `module_document` 停止业务写入。
3. 缺失子表新增，例如报价、RMA、签收、核销。
4. 既有表补充 `source_id`、业务编码、状态和租户索引。
5. JSONB 历史数据归档，不再参与接口查询。

## 4. 对接口的影响

1. 字段集合必须通过 OpenAPI 显式声明。
2. 历史 Map 随机字段不再返回。
3. 业务异常从 500/200 修正为 400/403/409/422。
4. 枚举和状态统一。
5. 分页结构统一。

## 5. 对前端的影响

1. 字段名原则上保持不变。
2. 未声明字段、演示字段、固定字段可能消失。
3. 缺失数据从 0 变为 `-` 或空态。
4. 错误响应更结构化，前端需处理 `suggestion` 和 `fieldErrors`。
5. Position 相关接口和字段以后端 ISSUE-035 目标态为准。

## 6. 对测试的影响

1. 原 Mock Store 测试需要替换为 JPA/Testcontainers 测试。
2. 原 JSON 断言需改为具名字段断言。
3. 新增迁移一致性测试。
4. 新增权限、并发、幂等测试。

## 7. 交付阶段

| 阶段 | 交付内容 | 退出条件 |
| --- | --- | --- |
| 0 基线冻结 | 当前接口、数据、表结构快照 | 文档和 OpenAPI 评审通过 |
| 1 架构搭建 | JPA 依赖、通用基类、包结构、异常和分页 | 编译与示例 Repository 测试通过 |
| 2 低风险模块 | 消息、AI、人员、产业链 | 数据一致且接口回归通过 |
| 3 平台 | IAM、组织、账号、角色、授权 | 权限和租户测试通过 |
| 4 财务 | AR/AP、Payment、Allocation、冲销 | 财务守恒测试通过 |
| 5 销售/库存/采购 | 订单、库存、发货、采购 | 主链路数据库校验通过 |
| 6 生产 | 需求、工单、报工、质检、完工 | 生产状态机测试通过 |
| 7 工作台 | 只读聚合迁移 | 页面/API/数据库一致 |
| 8 清理 | 旧 Store、Map/JSON、`module_document` 写入移除 | 静态检查无违规 |

## 8. 回滚策略

1. 代码回滚不回滚已提交业务数据。
2. 阶段 A 可直接切回旧 Store。
3. 阶段 B 切换前必须备份 `module_document` 和目标表。
4. 阶段 B 发现差异时停止新写入，修复差异后再切换。
5. 禁止通过手工 UPDATE 目标表掩盖业务事实缺失。

## 9. 交付物

每个模块完成后必须提交：

1. JPA Entity 和 Repository。
2. Application Service 与 Command/Query。
3. Controller 和具名 DTO。
4. 数据迁移脚本。
5. 数据校验脚本和报告。
6. API diff。
7. 后端测试报告。
8. 联调回归报告。

## 10. 完成定义

只有同时满足以下条件，才能认为模块重构完成：

1. 该模块所有业务读写不再访问 `module_document`。
2. 所有 Controller/Service 签名无 Map/JSON。
3. 所有字段可追踪到物理列。
4. 所有状态和枚举可编译验证。
5. 数据库迁移与 JPA 映射一致。
6. 全量测试和真实联调通过。
7. 文档与代码同步。
