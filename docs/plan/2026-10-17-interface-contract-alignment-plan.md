# 接口与契约对齐整改计划

日期：2026-10-17
状态：只读审查结论与整改规划
范围：后端 Controller 路由、OpenAPI 文档、`docs/api-contract.md`、PRD 第 17.5 节、前端 API client 与页面调用。
约束：本轮未修改业务代码、数据库和既有接口；本文只冻结问题清单、优先级和后续实施顺序。

## 1. 审查结论

当前接口契约不满足“完整后端 API 文档”的要求，主要不是个别路径拼错，而是缺少单一权威契约源：

1. 后端共有 **292 个 HTTP 路由**。
2. 两份 OpenAPI 合并后只覆盖 **21 个路由**，覆盖率约 **7.2%**。
3. `docs/openapi/frontend-remediation.yaml` 是联调补丁契约，不是完整后端契约。
4. `docs/openapi/backend-prd-v1.yaml` 只覆盖最新销售履约和销售监控 P0 命令。
5. PRD 第 17.5 节、技术设计第 10 章、`docs/api-contract.md` 各自存在历史路径和当前实现混写。
6. 前端 client、后端 Controller、PRD之间存在多处路径、方法、字段和通用协议差异。

因此，下一步必须先建立“后端路由清单 → 公开/内部/废弃分类 → OpenAPI 覆盖 → 契约测试”的治理机制，再继续新增接口。

## 2. 当前接口覆盖统计

统计来源：

- 后端：扫描 12 个 Controller 中的 `@GetMapping/@PostMapping/@PutMapping/@PatchMapping/@DeleteMapping`。
- 契约：合并 `frontend-remediation.yaml` 与 `backend-prd-v1.yaml`。
- 比对方式：方法 + 完整路径精确匹配。

| 模块 | 后端路由数 | 已入 OpenAPI | 未入 OpenAPI |
| --- | ---: | ---: | ---: |
| AI | 21 | 0 | 21 |
| Auth | 17 | 0 | 17 |
| Finance | 17 | 3 | 14 |
| Fulfillment / Inventory / Procurement / Sales Order | 70 | 5 | 65 |
| Health | 2 | 0 | 2 |
| Message | 19 | 0 | 19 |
| Personnel | 15 | 0 | 15 |
| Platform | 49 | 0 | 49 |
| Production | 42 | 0 | 42 |
| Sales Fulfillment / RMA / Receipt / Monitoring / SLA | 22 | 12 | 10 |
| Supply Chain | 17 | 0 | 17 |
| Workbench | 1 | 1 | 0 |
| **合计** | **292** | **21** | **271** |

结论：不能把现有两份 YAML 称为完整后端 API 文档。它们只能作为联调补丁和 P0 履约命令契约。

## 3. 主要不一致清单

### P0-001 契约源分裂，覆盖率不足

| 类型 | 问题 |
| --- | --- |
| 位置 | `docs/openapi/frontend-remediation.yaml`、`docs/openapi/backend-prd-v1.yaml`、技术设计第 10 章 |
| 现象 | 两份 YAML 只有 21 个操作；技术设计中还存在历史示例路径；`api-contract.md` 只列关键路径 |
| 影响 | 后端、前端、测试各自按不同来源理解接口，新增功能容易继续漂移 |
| 处理 | 建立单一完整后端 OpenAPI，按模块拆分文件并做聚合；每个路由必须标记 `public`、`internal`、`deprecated`、`planned` |

### P0-002 通用响应契约冲突

| 项 | PRD 17.5 | 当前实现 |
| --- | --- | --- |
| 成功响应 | `{ data, error }` 包裹 | 直接返回 DTO、分页对象、`{product}`、`{receipt}` 等业务对象 |
| 错误响应 | `{ data, error }` 包裹 | `{ error }` |
| 影响 | 前端和测试无法用统一 unwrap 规则；文档与实现冲突 |
| 建议 | 冻结当前 ERP 的直接 DTO / `{error}` 为现网契约；PRD 17.5 改为长期目标或明确迁移版本。不建议在未对齐前端时突然改成 `{data}` 包裹 |

### P0-003 幂等请求头命名冲突

| 项 | PRD 17.5 | 当前后端/前端 |
| --- | --- | --- |
| 请求头 | `Idempotency-Key` | `X-Idempotency-Key` |
| 影响 | 按 PRD 调用会缺少幂等上下文；已有接口无法接收到幂等键 |
| 建议 | 冻结 `X-Idempotency-Key` 为现网标准，修订 PRD；如未来支持标准头，应同时兼容并写明优先级，但不能只改文档不改代码 |

### P0-004 Platform 前端与后端路径不一致

Platform 是当前最明显的高风险漂移模块。

| 前端调用 | 后端实际 | 判定 |
| --- | --- | --- |
| `GET/PUT /api/v1/platform/tenant` | 未发现对应 Controller 路由 | 缺失或应由 snapshot 承载 |
| `GET /api/v1/platform/permissions` | `GET /api/v1/platform/resources` | 语义相近但路径不一致 |
| `GET /api/v1/platform/role-grants?roleId=...` | `GET /api/v1/platform/roles/{id}/grants` | 查询方式不一致 |
| `GET/POST /api/v1/platform/permission-adapters` | `GET/POST /api/v1/platform/adapters` | 路径不一致 |
| `POST /api/v1/platform/permission-adapters/{id}/sync` | 未发现对应路由 | 前端调用会失败 |
| `GET /api/v1/platform/audits` | `GET /api/v1/platform/audit-logs` | 路径不一致 |
| `PUT /api/v1/platform/capabilities/{code}` | 后端只有 `GET/POST /capabilities` | 更新能力缺失 |
| `POST /api/v1/platform/accounts/{id}/status` | 后端 Platform 无该路由；Auth 有 `/platform/employee-accounts/{id}/status` | 路径归属不一致 |
| `POST /api/v1/platform/accounts/{id}/password-reset` | 后端 Platform 无该路由；Auth 有 `/platform/employee-accounts/{id}/reset-password` | 路径归属不一致 |

处理原则：

1. 平台管理 UI 是高频管理流程，应列为 P0。
2. 先确认前端页面实际使用哪些操作，不为了对齐而保留无 UI 的接口。
3. 对确实需要的接口优先修后端路径或新增兼容路由；对错误前端 client 直接修改路径。
4. `AuthController` 中租户员工账号接口与 `PlatformController` 中平台员工/账号接口必须明确职责边界。

### P0-005 销售 P0 命令前后端未完全对齐

后端已在 `0873e93` 实现 PRD 履约命令，但前端和旧契约尚未完全迁移。

| 问题 | 证据 | 影响 | 处理 |
| --- | --- | --- | --- |
| 前端未接入新写接口 | 前端检索未见 `POST /api/v1/rmas`、`/rmas/{id}/transition`、订单级 receipts/complete 的页面调用 | RMA、签收、完成关闭无法按 PRD 状态机办理 | 前端迁移到 `backend-prd-v1.yaml` |
| 旧写接口返回 410 | `POST /fulfillment/rmas`、旧 approve/inspect/close、旧 customer-receipts POST 已废弃 | 旧前端调用会失败 | API 文档必须继续标记 deprecated/410 |
| `frontend-remediation.yaml` 过期 | 仍描述写入阻塞，RMA 读模型使用 `creditArId` | 与新后端 `creditNoteFinanceId` 和状态机不一致 | 保留只读部分，新增 deprecated 说明，最终并入完整契约 |
| `complete-check` 与 PRD 不完全一致 | PRD 要求请求校验 `expectedVersion`；当前检查接口未消费版本 | 并发场景下检查结果可能过期 | 后端补版本校验或修订 PRD 为“检查不绑定版本，complete 强校验” |
| 完成响应缺少 PRD 要求的 `receiptId` / `arAllocationCheckId` 回显 | 当前后端由服务端推导签收与 AR 条件 | 前端可完成，但审计追溯字段不足 | 冻结响应应包含条件引用或补实现 |
| 销售监控未完整覆盖 PRD 指标 | 当前只有订单、停滞、交期风险；缺报价商机、商机转订单、订单转财务等完整监控事实 | 前端只能显示部分指标 | 定义 `metrics` 分组与事实缺失状态 |

### P0-006 库存产品/物料主数据契约缺失

| 字段/能力 | PRD | 当前实现 |
| --- | --- | --- |
| `defaultWarehouseId` | 产品/物料新建和编辑必填；只能选择启用、授权、类型兼容仓库 | 后端 POST 不保存，PATCH 白名单不含该字段；前端 DTO 也没有 |
| `traceMode` | 产品必填或按表单维护 | 后端未纳入 PATCH 白名单，前端 DTO/提交也没有 |
| `procurementType` | 物料外购/自制/委外 | 后端未纳入 PATCH 白名单，前端 DTO/提交也没有 |
| 删除未引用产品/物料 | PRD 允许未引用记录删除 | 后端只有仓库 DELETE，未见产品/物料 DELETE |
| 分页/筛选 | PRD 要求列表筛选和分页 | 当前产品/物料 GET 返回全量集合，分页/筛选由前端处理 |

影响：

1. 默认仓库无法保存，当前前端只能锁定并提示不可用。
2. 前端销售产品选项可能因缺默认仓库被过滤，影响报价、订单和快速开单。
3. 仓库详情、仓库停用/删除引用检查不完整。
4. 后续必须先冻结仓库类型与产品/物料类型兼容矩阵，否则无法实现校验。

### P0-007 Workbench 契约与实现不一致

`frontend-remediation.yaml` 和 PRD 已描述 `sections/search/eventScope/cursor/todoLimit/activityLimit`，但当前后端实际只处理 `role/search/sections`：

1. `eventScope=KEY/ALL` 未实现。
2. `cursor` 未实现。
3. `todoLimit/activityLimit` 未实现。
4. `date` 未实现。
5. 工作台响应还不是 PRD 要求的 schema 1.1 完整结构。

当前页面可能因 Spring 忽略未知 query 而不出错，但这不等于契约已实现。

### P1-008 Production 前端旧路径未迁移

| 前端调用 | 后端实际 | 判定 |
| --- | --- | --- |
| `POST /production/work-orders/{id}/report` | `POST /production/work-orders/{id}/reports` | 路径不一致 |
| `POST /production/work-orders/{id}/complete` | `POST /production/work-orders/{id}/completions` | 语义相近但路径和契约不一致 |
| `POST /production/work-orders/{id}/close` | `POST /production/work-orders/{id}/close-submit`，另有 `close-check` | 路径和状态机不一致 |

需要确认当前页面是否已禁用这些动作。若页面仍可触发，将 404 或调用失败。

### P1-009 Finance P0 命令未全部落地

PRD 17.5 要求：

- `GET /api/v1/finance/ar-aps`
- `POST /api/v1/finance/allocations`
- `POST /api/v1/finance-documents/{id}/reverse`
- `POST /api/v1/finance/rma-credit-notes`
- 工单成本查询

当前后端已有：

- `GET /finance/receivables`
- `GET /finance/payables`
- `POST /finance/payments`
- `POST /finance/payments/{id}/confirm`
- `POST /finance/cost-accounting`

差异：

1. 没有独立聚合查询 `ar-aps`，只有分开的 receivables/payables。
2. 没有独立核销 `/allocations`，当前偏靠 settlement/payment confirm 内部处理。
3. 没有通用财务冲销 `/finance-documents/{id}/reverse`。
4. RMA 红字 AR 当前由履约服务在 transition 中创建财务 `Receivable`，但没有 PRD 的独立 `/finance/rma-credit-notes` 财务命令入口。
5. 财务冲销、核销明细、审批与职责分离需要单独契约。

### P1-010 Auth 契约路径与实现不一致

PRD/技术设计历史路径：

- `/api/v1/auth/login`
- `/api/v1/auth/sms-login`
- `/api/v1/auth/captcha`
- `/api/v1/auth/sms/send`
- `/api/v1/auth/forgot-password`
- `/api/v1/auth/register`
- `GET /api/v1/auth/session`

当前实际：

- `/api/v1/session/login`
- `/api/v1/session/sms/login`
- `/api/v1/session/captcha`
- `/api/v1/session/sms/send-code`
- `/api/v1/session/password/forgot`
- `/api/v1/session/register`
- `/api/v1/session/me`

建议修订文档为当前路径。不建议仅为对齐 PRD 增加一套 auth alias，否则会带来会话、限流和安全审计路径分裂。

### P2-011 技术设计文档仍有历史状态混写

技术设计第 10.7/10.8/10.4.1 分别反映了不同时间点：

1. `10.4.1` 准确描述产品默认仓库后端缺口。
2. `10.7` 是早期阻断证据。
3. `10.8` 描述 RMA/签收/完成后端缺失，但后端 `0873e93` 已实现新命令接口；当前缺口变成“前端未迁移”。

需要在技术设计中增加状态列或变更时间，避免“当前”“历史”“目标”混用。

## 4. 契约治理原则

1. **PRD 是业务口径权威**：状态机、数量守恒、审批规则、事实来源由 PRD 冻结。
2. **OpenAPI 是接口技术契约权威**：路径、方法、参数、响应、错误码、示例由 OpenAPI 冻结。
3. **Controller 是实现事实**：实现与 OpenAPI 不一致时必须生成差异清单，不允许以实现反向解释需求。
4. **内部接口单独标记**：`/internal/**`、worker 回调、导入接口不能与公开前端接口混在一个无标记契约中。
5. **旧接口必须显式生命周期**：每个旧路径必须标记 `deprecated`、`retired`、`410` 或迁移目标。
6. **一个操作只允许一个权威契约**：如果临时保留兼容路径，必须写明兼容适配器与下线条件。

## 5. 分阶段实施计划

### Phase 0：冻结契约规范和差异基线

目标：先停止漂移，再修接口。

任务：

1. 冻结通用协议：
   - 现网成功响应保持直接 DTO / 分页 / `{entity}`。
   - 错误响应保持 `{error}`。
   - 幂等头冻结为 `X-Idempotency-Key`。
   - 写命令继续使用 Bearer Token、`X-Tenant-Id`、`X-Trace-Id`、`X-Idempotency-Key`、`If-Match`。
2. 建立 292 条后端路由台账。
3. 对每个路由分类：
   - `public`：前端或外部集成调用。
   - `internal`：worker、事件补偿、导入、内部回调。
   - `deprecated`：已有调用但应迁移。
   - `retired`：保留 410。
   - `planned`：PRD 要求但未实现。
4. 将 `frontend-remediation.yaml` 标记为“联调补丁契约”，不再作为新增接口入口。
5. 将 `backend-prd-v1.yaml` 标记为“销售履约 P0 命令契约”，后续并入完整契约。

交付物：

- `docs/openapi/backend/v1` 完整 OpenAPI 骨架。
- `docs/api-inventory.md` 或机器可读路由清单。
- 契约差异基线报告。

验收：

- 292 条路由全部有分类。
- 每个模块都有公开接口契约文件。
- 已知 P0 不一致全部有 issue/计划编号。

### Phase 1：修复 P0 命令和前端阻断

按业务风险排序，不建议一次性大重构。

#### 1A Platform 路径对齐

范围：

- 租户信息。
- 能力开关更新。
- 权限资源。
- 角色授权查询。
- 权限适配器与 sync。
- 审计查询。
- 员工/账号状态与重置密码。

处理顺序：

1. 以当前平台页面实际功能为准，删除无调用 client 方法。
2. 优先修改前端路径到后端现有资源：
   - permissions -> resources。
   - permission-adapters -> adapters。
   - audits -> audit-logs。
   - role-grants 查询 -> roles/{id}/grants。
3. 后端确实缺失的接口先补 OpenAPI，再实现。
4. 明确 `AuthController.employee-accounts` 与 `PlatformController.accounts/employees` 的职责。

验收：

- 平台管理页面全部真实读写。
- 无 404 假成功。
- 权限变更、账号状态、重置密码、审计可追溯。

#### 1B 销售履约前端迁移

范围：

- RMA 创建。
- RMA 统一 transition。
- 订单级客户签收。
- 完成检查。
- 销售完成关闭。

任务：

1. 前端新增 `backend-prd-v1` client。
2. 移除旧写 client 或标记 deprecated。
3. 页面按 PRD 状态机分步办理。
4. 展示 `creditNoteFinanceId`，不再以 `creditArId` 作为权威字段。
5. 完整测试幂等、版本冲突、数量校验、权限不足和红字 AR。

后端小修：

1. `complete-check` 决定是否要求 `expectedVersion`；若要求，实现并写入 OpenAPI。
2. 完成响应冻结是否返回 `receiptId`、`arAllocationCheckId`、条件引用。
3. 若保留服务端推导，必须修订 PRD 字段契约。

#### 1C 产品/物料默认仓库和主数据契约

前置决策：

1. 冻结仓库类型 × 产品分类/物料类型兼容矩阵。
2. 冻结历史 `defaultWarehouseId=null` 的治理策略。
3. 确认是否将 `traceMode`、`procurementType` 一并纳入 P0。

任务：

1. OpenAPI 先定义 POST/PATCH/GET 字段。
2. 后端保存并校验 `defaultWarehouseId`。
3. 响应返回真实字段；历史未配置返回 `null`。
4. 增加仓库授权、启用状态、分类兼容、版本冲突校验。
5. 前端解锁选择器并移除库存事实推导。
6. 修复销售产品选项对未配置产品的过滤策略。
7. 用专用数据验证“创建/编辑 → 数据库 → GET → 列表 → 重新打开弹窗”一致。

#### 1D Workbench 参数契约补齐

任务：

1. 实现 `todoLimit`、`activityLimit`。
2. 实现 `eventScope=KEY/ALL`。
3. 定义并实现游标或明确 P0 不支持游标并修订契约。
4. 输出 schema 1.1 结构和来源状态。
5. 前端与 OpenAPI 同步。

### Phase 2：补齐完整 OpenAPI

建议按模块拆分，避免单个巨型 YAML：

```text
docs/openapi/backend/v1/
  index.yaml
  paths/
    auth.yaml
    platform.yaml
    sales.yaml
    inventory.yaml
    production.yaml
    procurement.yaml
    finance.yaml
    personnel.yaml
    supply-chain.yaml
    message.yaml
    ai.yaml
    workbench.yaml
    health.yaml
  schemas/
    common.yaml
    errors.yaml
```

每个模块执行：

1. 从 Controller 路由生成初稿清单。
2. 人工标注 public/internal/deprecated/retired。
3. 补 request/response schema。
4. 补权限码、幂等、版本、错误码。
5. 与前端 client 逐条比对。
6. 与实际接口测试对齐。

模块优先级：

1. Platform：前端调用多且路径漂移严重。
2. Fulfillment / Inventory / Procurement / Sales：P0 主链路。
3. Production：执行路径存在旧前端调用。
4. Finance：核销、冲销、红字 AR 是闭环必需。
5. AI / Message / Personnel / Supply Chain。
6. Health / Ready / internal。

### Phase 3：契约测试和 CI 防漂移

新增三层防线：

1. **静态路由测试**
   - 扫描 Spring `@RequestMapping`。
   - 与 OpenAPI paths 比对。
   - 未登记路由导致测试失败，除非标记 internal 且有豁免。
2. **Controller 契约测试**
   - MockMvc 逐接口校验状态码、响应字段、错误码。
   - 至少覆盖 P0 命令的成功、401、403、409、422。
3. **前端 client 契约测试**
   - 每个 API client 方法断言 method/path/headers/body。
   - 不允许前端调用未登记路由。

CI 增加检查：

- OpenAPI 可解析。
- 所有 path 有 operationId。
- 所有写接口声明安全、幂等、版本要求。
- 所有响应使用冻结的错误结构。
- 路由新增但没有 OpenAPI 时失败。

### Phase 4：历史文档修订

任务：

1. PRD 17.5 的通用响应、幂等头、Auth 路径按冻结结果修订。
2. 技术设计第 10 章拆分为“历史证据”“当前状态”“目标契约”。
3. `api-contract.md` 只保留协议原则和权威链接，不再散写临时路径。
4. `frontend-remediation.yaml` 冻结后逐步合并进完整后端 OpenAPI。
5. 每个 deprecated 路径写明迁移目标和下线版本。

## 6. 优先级排序

| 优先级 | 工作项 | 原因 |
| --- | --- | --- |
| P0 | 契约冻结、路由台账、OpenAPI 骨架 | 防止继续新增漂移接口 |
| P0 | Platform 前端/后端路径对齐 | 当前明显不一致，平台管理流程风险最高 |
| P0 | 销售履约前端迁移 | 后端已实现 PRD 状态机，前端未接导致闭环无法办理 |
| P0 | 产品/物料默认仓库契约 | PRD 必填且影响销售产品选项、入库和仓库归属 |
| P0 | 通用响应与幂等头修订 | 所有接口都受影响 |
| P1 | Workbench schema 1.1 参数补齐 | 页面当前可用，但契约能力未实现 |
| P1 | Production 写路径迁移 | 存在旧路径 404 风险 |
| P1 | Finance 核销/冲销/红字 AR 独立契约 | P0 财务闭环和审计必需 |
| P1 | Auth 文档修订 | 实现稳定，主要修文档 |
| P2 | AI/Message/Personnel/Supply Chain 全量 OpenAPI | 页面当前可用性较好，但契约不完整 |
| P2 | Health/internal 接口文档 | 需要公开/内部边界标记 |

## 7. 完成标准

整体对齐完成必须同时满足：

1. 后端 292 条路由 100% 进入路由台账，并标记 public/internal/deprecated/retired/planned。
2. 所有 public 路由 100% 有 OpenAPI 操作定义。
3. OpenAPI 与 Spring 路由有自动比对测试，CI 通过。
4. 前端所有 API client 调用与 OpenAPI 精确一致。
5. P0 命令覆盖成功、401、403、404、409、422、未知结果和幂等重放。
6. PRD、技术设计、`api-contract.md`、OpenAPI 不再存在互相矛盾的通用协议。
7. 历史路径全部有迁移目标或 410 说明。
8. 真实联调脚本在专用数据集上通过，且不再使用内存、localStorage 或示例数据补齐。

## 8. 本轮边界

本文只完成只读审查和规划：

- 未修改 Controller、Service、Store。
- 未修改前端 API client。
- 未修改既有 OpenAPI 文档。
- 未新增或修改数据库。
- 未重启服务。

后续实施必须按 Phase 0 先建立路由台账和契约规范，再进入代码修改。
