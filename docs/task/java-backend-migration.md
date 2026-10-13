# Java 后端完整迁移

## 原则

1. 不做破坏性 API 变更：路径、请求体、响应体、状态码、`ETag`、`X-Trace-Id` 和幂等响应必须一致。
2. 不直接把原型切到 Java：只有 PostgreSQL/内存仓储、审计、Outbox、幂等、乐观锁、RLS 语义通过 parity test 后才切换。
3. 按模块迁移；全量切换完成后删除 Node/Fastify 实现及其依赖。

## 范围

| 模块 | 接口 | 复杂度 | 迁移顺序 |
| --- | ---: | --- | --- |
| session / auth | 17 | 中 | Java 控制器、注册用户/短信/重置仓储、Node scrypt 兼容和注销校验已迁移 |
| personnel | 15 | 低 | PostgreSQL、事务审计、Outbox、drain worker 和输入校验已迁移 |
| message | 19 | 中 | Java 控制器、PostgreSQL/内存仓储和 Outbox worker 已迁移 |
| finance | 17 | 中 | Java 控制器、结算规则、PostgreSQL/内存仓储已迁移 |
| supply-chain | 16 | 中 | Java 控制器、PostgreSQL/内存仓储已迁移 |
| ai | 21 | 中高 | Java 控制器、内存/PostgreSQL 仓储和 Outbox worker 已迁移 |
| platform | 49 | 高 | 租户基线开通、组织、角色权限和管理路由已迁移 |
| production | 36 | 高 | Java 状态机、PostgreSQL 仓储和主流程测试已迁移 |
| fulfillment / inventory / procurement / sales | 260 | 高 | 既有 HTTP 路由已全部由 Java 覆盖，另有 1 个 Java-only 工作台聚合接口；生产-履约 worker 和 completion 结果接口已完成 |

## 完成定义

- `server-java` 覆盖原 Node 后端全部 260 个既有 API，并新增前端使用的 `GET /api/v1/workbench/dashboard`，共 261 个 API，由 `server-java/java-routes.json` 和 `npm run test:routes:java` 守护。
- PostgreSQL 迁移可由 Java 应用执行或继续由迁移器执行，但 Java 仓储必须支持同一 schema 和 RLS 上下文。
- 切换期间已按既有 API 基线校验状态码、响应结构、业务状态、ETag、审计和 Outbox 语义；Fastify 删除后由 Java 路由基线和 Java 测试守护。
- 原 Vitest API 覆盖已映射到 Java 测试，并在真实 PostgreSQL 与无数据库两种模式下验证。
- 前端只指向 Java 服务；Fastify 进程不再启动。

## 当前验证

- `mvn -f server-java/pom.xml -o test`：51 个 Java 测试通过，其中无数据库环境下真实 JDBC 用例自动跳过。
- `JAVA_JDBC_URL`、`JAVA_JDBC_MIGRATION_URL`、`JAVA_JDBC_APP_ROLE` 同时配置时，真实 PostgreSQL JDBC 冒烟测试通过：迁移、迁移重放、JSONB、事务回滚和 `FORCE ROW LEVEL SECURITY` 均已验证。
- `npm run test:routes:java`：261 条 Java 路由与固定基线一致。
- `npm run typecheck` 通过。
- `npm run test:frontend`：74 个前端测试通过。
- `npm run build` 通过。
- 2026-10-12：`mvn -f server-java/pom.xml -o test` 通过 38 个测试。认证密码改为 Node `scryptSync(salt_hex:hash_hex, N=16384,r=8,p=1,dkLen=64)` 兼容实现，并用 RFC 简化向量与 Node 生产向量双重验证。租户 `self-provision` 已从桩改为真实幂等基线开通，支持内存与 PostgreSQL `module_document` 双仓储；注册接口恢复 `baselineProvisioning` 响应，业务请求上下文接入会话注销校验。
- 2026-10-12：platform 44 个业务路由已迁移；注销语义统一使用 platform store。新增 production 36 个路由映射，覆盖 readiness、需求、销售接入、库存事实、工单下达/开始/暂停/恢复、报工与更正、FQC 处置、完工入库、库存回调/重试、结案复核和 MRP/APS。新增 Java 主流程测试覆盖创建、幂等回放、审批人分离、认领和 MRP。
- 2026-10-12：新增 fulfillment 域销售订单 10 个 Java 路由，覆盖创建、分页/详情、编辑、审批提交/决策、确认、取消、发货申请和履约轨迹；实现订单手机号 AES-GCM 加密/脱敏、幂等回放、稳定 JSON 请求哈希、乐观锁、事件轨迹和发货申请转仓库任务的 Outbox 即时消费。`FULFILLMENT_NATIVE_ENABLED` 默认关闭。
- 2026-10-12：新增 fulfillment 域库存 13 个 Java 路由，覆盖可用性事件/查询、发货任务查询、权威库存校验和预留、预留详情/释放、出库详情/过账、库存事务和 WMS 异步结果查询。Java 测试覆盖库存事实插入、预留、消费、出库过账、任务完成、订单发货状态回写和事务投影。`FULFILLMENT_NATIVE_ENABLED` 默认关闭。
- 2026-10-12：新增 fulfillment 域主数据 / 调拨 / 盘点 27 个 Java 路由，覆盖仓库、产品、物料的查询与变更，调拨单创建、审批、发货、收货、取消，以及盘点单创建、审批、开始、录入和库存调整。测试覆盖主数据生命周期、调拨两端库存事实变化、盘点盘亏出库事务和库存事实回写。`FULFILLMENT_NATIVE_ENABLED` 默认关闭。
- 2026-10-12：新增采购域 17 个 Java 路由，覆盖 MRP 缺料建采购申请、审批转采购订单、直接入库 / 待检入库、质检、供应商维护、申请驳回、订单取消和采购退货。测试覆盖制单人不能审批本人申请、金额计算、入库库存事实、退货出库事务和采购订单状态回写。fulfillment 采购申请通过共享 `ProductionStore` 读取 MRP 任务。
- 2026-10-12：修正路由清点，实际业务路由为 260 个，补齐 Java 的企查查企业核验、完工事件信封接口和发货任务转生产需求接口。新增 `ProductionFulfillmentOutboxWorker`，覆盖完工入库投影、任务重检、幂等 inbox、失败重试和 dead letter。新增 native-only 装配冒烟测试。
- 2026-10-12：`npm run dev:all` 改为只启动 Java API 和前端。`JAVA_NATIVE_ONLY=true` 会启用全部 Java 模块和 worker；前端默认代理到 `http://127.0.0.1:8080`。
- 2026-10-12：新增 Java PostgreSQL 迁移器，完整保留 `schema_migrations`、SHA-256 checksum、advisory lock、旧库哨兵基线和事务语义。21 个迁移文件和两份 OpenAPI 契约已从 Fastify 目录保全到 `server-java`。迁移默认关闭，只有部署命令显式传入 `app.database.migrate=true` 才执行。
- 2026-10-12：部署链路已切到 Java fat jar：`build-artifacts.sh` 打包前端和 JAR，`deploy.sh` 使用 JAR 内置迁移链，systemd 使用 Java 17 运行时，nginx 代理 Java API。`java-routes.json` 已固化 261 路由基线，删除 Fastify 源码后仍可用该基线守住 Java 路由契约。
- 2026-10-12：新增 `RealJdbcSmokeTests`，覆盖真实 PostgreSQL 迁移、21 项迁移幂等重放、JSONB 仓储提交、事务回滚、`FORCE ROW LEVEL SECURITY` 租户隔离和 bootstrap 读取。该测试通过 `JAVA_JDBC_URL` 启用；未设置时自动跳过。
- 2026-10-12：删除前审计修正四项风险：兼容 Node 风格和 JDBC 风格 `DATABASE_URL`；Java native 运行改为默认开启；移除 Java 内旧 Fastify catch-all 代理；`dev:all` 的 Java 子进程加载本地环境。同时保留前端使用的 Java-only 工作台接口，路由基线更新为 261。
- 2026-10-12：用户确认后删除 `server/` 和 Node 对照脚本，移除旧后端依赖及脚本入口。OpenAPI、SQL 迁移和业务实现已完整保留在 `server-java`。

## 当前状态

- Java 后端替换已完成；`server/`、Fastify 进程入口和对照脚本已删除。
- 旧后端直接依赖已移除，路由、前端、Java、真实 PostgreSQL JDBC、类型检查和生产构建均已通过。
- OpenAPI 契约、21 个 SQL 迁移、Java 源码和部署链路保存在 `server-java` 与 `deploy`。
- 与外部 ERP、MES、WMS、消息队列、OIDC 和真实模型服务的生产集成仍按项目边界单独验证。
