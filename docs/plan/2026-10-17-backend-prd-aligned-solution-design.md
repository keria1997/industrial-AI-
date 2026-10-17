# 后端 PRD 对齐修复设计方案

- 日期：2026-10-17。
- 代码基线：`cd814b0 docs: define backend delivery and integration acceptance criteria`。
- 文档性质：只读源码复核后的后端设计与实施计划；本文不实施代码、数据库或接口变更。
- 判断顺序：PRD 与用户冻结决策优先，技术契约次之，前端实现诉求仅作为联调输入。前端字段如果与 PRD 冲突，不自动采纳。
- 结论：306 条路由与 OpenAPI operation 覆盖一致，但 route coverage 不等于业务闭环。后端仍需先冻结契约、修复领域状态机和跨模块事实，再开放前端完整办理和真实联调。

## 1. 复核范围与证据

### 1.1 已读依据

| 类型 | 来源 |
| --- | --- |
| 需求 | PRD §7.2、§7.3.9.2.6/7、§7.7.5～7.7.10、§10、§13、§17.2～17.5；`AC-PH1-072~082`；`SC-FULL-001~011` |
| 交接 | `2026-10-17-backend-handoff-integration-acceptance.md`、前端实施计划与实施记录 |
| 契约 | `docs/openapi/backend-prd-v1.yaml`、模块 YAML、`route-inventory.json`、`all-modules.openapi.json`、`docs/api-contract.md` |
| 后端源码 | `WorkbenchController`、`SalesFulfillmentController`、`SalesAftercareService`、`FinanceController`、`ProductionService`、`PlatformService`、`AuthController`、`RequestContextService`、`TokenService`、各 Jdbc Store |
| 持久化 | `module_document`、`fulfill_idempotency_record`、`module_outbox_event`、`module_audit_log`、`fin_*`、`registered_users`、`sms_codes`、`password_reset_tokens`、`auth_consumed_session` 相关迁移 |

### 1.2 静态复核结论

| 项 | 当前事实 | 影响 |
| --- | --- | --- |
| Workbench | 声明 `schemaVersion=1.1` 但返回平铺对象；`dataAsOf` 固定为当前时间减 30 秒；`role` 参与 tenant-wide 判断；先取 50 条消息再过滤；越界游标被压回有效末条 | 前端 1.1 projection 拒绝合法 200；低权限可通过 role 扩权；超过 50 条数据漏读；数据时效造假 |
| Finance | 收付款确认直接更新 AR/AP；独立 Allocation 再次扣减；无累计核销额度模型。冲销先保存 `reversed`，再用旧状态判断是否恢复余额。`approverToken` 只做非空校验 | 同一笔款可能重复扣减；冲销余额无法正确恢复；审批和补偿不满足职责分离 |
| RMA | `approve` 先要求目标 `APPROVED`，导致 `decision=REJECTED/target=REJECTED` 不可达；`taxBasis` 实际接收金额；红字 AR 只按 `receivableBySource` 找第一张 AR；关闭的 `closureCheckId` 只校验非空 | 驳回流程阻断；金额和税口径可被请求方改写；多 AR/行级确权无法核对；关闭检查不可追溯 |
| Customer receipt | 创建时要求整单全发，但行内 `signed+rejected+damaged` 只限制不超已发，未强制等于已发；没有补签、争议解除和增量更新命令 | 与 PRD 行级守恒及差额闭环冲突，订单无法通过真实异常链完成 |
| Sales completion | 只取一张 `SalesOrder` 来源 AR 判定结算；未核对应开票/凭证标记和争议全量状态 | 多 AR、REQUIRED 发票/凭证未完成时可能误判可关闭 |
| 生产完工 | `allocationPreview` 只返回 workOrderId/qty/allocations；completion 输入可携带 traceMode/allocationRevision 等元数据 | 前端若补齐字段也缺权威来源；无法证明资源、仓库、分配修订和业务日期来自正式主数据 |
| Platform/Auth | `/platform/permissions` 返回资源；审计 total 可被估算；会话撤销要求 jti 但无活跃会话目录。邮箱验证码在 `AuthController` 内存 Map 中；登录只按 IP 限频 | 权限语义错误、审计不可对账；多实例下验证码丢失；未实现账号级连续失败锁定 |
| Persistence | 主要业务聚合写入 `module_document`，具备租户键、事务、Advisory Lock、Outbox/Audit/Idempotency；但 `fin_allocation`、RMA、签收、工作台投影等仍缺少专用约束和查询投影 | 可以作为过渡持久层，但关键事实需要专用表/生成列/索引支撑唯一性、余额审计和对账，不能只靠 JSON 内字段 |

## 2. 契约冻结决策

### 2.1 必须先冻结的公共契约

| 冲突 | 冻结建议 | 说明 |
| --- | --- | --- |
| 幂等头 | PRD §17.5 的 `Idempotency-Key` 为 canonical；`X-Idempotency-Key` 作为 v1 兼容头继续读取；OpenAPI 同时标注 deprecated | 避免一次性破坏现网前端，最终测试必须包含 canonical 头 |
| Workbench envelope | 按 PRD 使用 `{schemaVersion:"1.1",data:...}`；旧平铺结构只在兼容窗口返回 `schemaVersion:"1.0"`，不得继续声明 1.1 | 前端 1.1 projection 不放宽为任意对象 |
| 通用响应 envelope | 新增或正式重写的闭环命令返回 `{data,error}`；现有 v1 直连 DTO 先在 OpenAPI 标记 compatibility response，最终契约版本统一收敛 | 不做一次性无版本重包装，避免把所有前端查询打断 |
| RMA 路径 | `POST /api/v1/rmas` 和 `POST /api/v1/rmas/{id}/transition` 为 PRD 正式路径；旧 `PATCH /api/v1/fulfillment/rmas/*` 保留只读兼容或标记 retired，不得作为新前端主入口 | 避免两套状态机继续分叉 |
| 签收字段 | `receiptStatus` 是持久化和契约 canonical；`status` 仅只读别名 | 与 PRD 和 `backend-prd-v1.yaml` 一致 |
| 红字字段 | RMA 返回 `creditNoteFinanceId`；财务事实保留 `creditFinanceId` 或 `financeId` 并返回行级追溯 | 不把 RMA 上的引用字段冒充财务聚合 |
| 税口径 | `taxBasis` 只能是 `INCLUDING_TAX`/`EXCLUDING_TAX`/`AS_CAPTURED`；金额字段使用 `netAmount/taxAmount/grossAmount` 十进制字符串 | 禁止把金额塞进税口径字段 |
| 数据时效 | `dataAsOf` 取各来源事实的最新可信时间或返回不可用；禁止 `now()-30s` | `generatedAt` 与 `dataAsOf` 分离 |
| 人员考勤 | 按用户冻结决策，工作台移除 `attendanceRate`；人员考勤/排班不作为前端交付能力。PRD §7.8 需另发修订记录，后端不据此恢复入口 | 当前 PRD 该节仍描述考勤，属于文档滞后，不能反向覆盖用户决策 |

### 2.2 不采纳或暂缓采纳的前端诉求

1. 不为通过前端解析而放宽 Workbench 1.1 schema。
2. 不用“最后一个 AR”或名称相似的客户/产品/供应商补关联。
3. 不允许前端传入 `closureCheckId`、`allocationRevision`、`traceMode`、资源 ID 后端只做非空校验。
4. 不把 `taxBasis` 继续当金额字段兼容为长期契约。
5. 不把本地 `synced`、邮件受理、202 POSTING、消息已读或工作台展示当成外部同步、真实投递、库存过账或业务完成。
6. 不在缺少产品确认时新增“取消产品仓库关联”的隐性语义；需要时以显式字段或命令发布并更新 PRD/技术契约。

## 3. 分项后端设计

### B-01/B-02 Workbench

**目标结构**

```json
{
  "schemaVersion": "1.1",
  "data": {
    "generatedAt": "ISO-8601 UTC",
    "dataAsOf": "ISO-8601 UTC 或 null",
    "timeZone": "tenant timezone",
    "businessDate": "YYYY-MM-DD",
    "period": { "type": "MONTH", "startDate": "...", "endDate": "..." },
    "role": "展示角色",
    "roleGroups": ["..."],
    "scope": {
      "tenantId": "...",
      "organizationIds": [],
      "factoryIds": [],
      "warehouseIds": [],
      "financeEntityIds": [],
      "scopeVersion": "..."
    },
    "metrics": {},
    "alerts": { "items": [], "hasMore": false, "nextCursor": null },
    "todos": { "items": [], "hasMore": false, "fullListUrl": "..." },
    "activities": { "items": [], "eventCatalogVersion": "WB-EVENT-CATALOG-20261015-v1", "hasMore": false, "nextCursor": null },
    "sources": []
  },
  "error": null
}
```

**设计要点**

1. `role` 可选且必须属于签名账号的有效角色；服务端用 IAM 推导 roleGroups、permissions 和 ResourceScope。展示角色不参与 tenant-wide 判断。
2. 指标按角色矩阵输出 PRD 的 `orderAmount`、`confirmedRevenueAmount`、`shippedRecognizedAmount`、交期达成量、低水位物料。金额按 `currency + taxBasis` 分组，缺失事实返回 `availability=UNAVAILABLE` 和 `unavailableReason`，不合并为 0。
3. 交期达成量按计划单位分组；跨单位必须有已批准换算事实，否则只输出单位组，不静默相加。
4. 低水位按当前账号全部授权仓库合并，公式使用 `qualifiedOnHand - allocated/reserved - frozen < safetyStock`，同一物料跨仓去重，详情返回仓库分组。
5. 待办/预警/动态先做 IAM、租户、仓库/工厂/财务主体过滤，再做 KEY/ALL、search 和状态过滤，最后分页和计数。`todoTotal/alertTotal` 是过滤后的准确值。
6. 动态只消费事件目录 `WB-EVENT-CATALOG-20261015-v1` 内事件。建议新增 Workbench projection 表保存 `eventId,eventType,sourceModule,sourceId,sourceVersion,availability,ownerId,priority,status,catalogVersion,occurredAt`，消费端按 `(tenantId,eventId)` 幂等。
7. 活动游标改为不透明 keyset：`occurredAt,eventId` 加上 query fingerprint、scopeVersion、catalogVersion 和过期时间。游标 scope 不匹配返回 400，过期返回 410 或业务错误；不压回末条。
8. `sources[]` 返回每个指标和分区的来源、可用性、`sourceFactVersions`、最近事实时间和失败原因。部分来源失败时可用分区继续返回，失败分区状态为 `SOURCE_ERROR`。
9. 服务端缓存 key 至少包含 tenant、actor、permissionVersion、scopeVersion、roleGroups、businessDate、sections、search、eventScope、response schemaVersion；来源版本变化失效。浏览器仍只允许内存快照。
10. 移除 `attendanceRate` 及考勤数据读取依赖；没有授权指标组不返回伪造零值。

### B-03/B-04 Finance

**领域模型**

1. 以不可变财务事实 + 可更新投影表达余额：
   - `finance_payment_fact`：登记、确认、失败、反向、冲销事实。
   - `finance_allocation_fact`：核销/分配事实，行级保存 AR/AP、方向、金额、币种、来源 Payment。
   - `finance_reversal_fact`：原单、反向单、原因、审批人、余额恢复结果。
   - `finance_balance_projection`：AR/AP 的 `totalAmount/receivedOrPaidAmount/outstandingAmount/allocatedAmount/status/sourceVersion`。
2. 表设计遵守用户既定方向：应用层校验来源存在、租户一致和状态合法，不使用数据库外键；保留 `UNIQUE`、`CHECK`、索引和 RLS。
3. 每个事实写入同事务保存 `module_idempotency_record`、`module_audit_log` 和 `module_outbox_event`。跨模块失败不直接改历史事实，用 compensation task 恢复或提示人工复核。

**确认与核销**

1. `POST /payments` 只登记，不改变 AR/AP。
2. `POST /payments/{id}/confirm`：
   - 校验登记人与确认人分离、金额/方向/往来方/币种、银行流水唯一。
   - 状态迁移 `PENDING_CONFIRM -> CONFIRMED`。
   - 若 Payment 直接引用单一 AR/AP，同一事务生成系统 Allocation；若无指定来源，只确认可用金额，不自动核销。
   - AR/AP 只由 Allocation 更新；确认本身不重复扣余额。
3. `POST /allocations`：
   - 计算已确认 Payment 的 `amount - sum(active allocation lines)` 得到可分配余额。
   - 行级校验方向、往来方、币种、`amount > 0`、累计不超 Payment 金额且不超对应 AR/AP 剩余额度。
   - 行内锁定或 tenant Advisory Lock 串行化后重读余额；任一行失败整体回滚。
   - 状态统一为 `OPEN/PARTIALLY_SETTLED/SETTLED` 等冻结枚举；当前小写状态做兼容映射。
4. 错误码区分：400 字段格式、403 无权、404 来源不存在、409 幂等/版本/状态冲突、422 金额方向币种/超额、424 来源不可用。

**冲销**

1. 独立审批凭据不使用请求原文 token 作为授权。使用后端签发的一次性审批 challenge 或具备 `finance.reversal.approve` 权限的审批事实；登记人、确认人和冲销审批人分离。
2. 先计算冲销影响，再保存反向事实和原单状态：
   - Payment 冲销生成反向 Payment，并把关联的 active Allocation 标记 `REVERSED` 或生成 counter Allocation。
   - AR/AP 余额只按 Allocation 调整，恢复金额不得基于已变为 `reversed` 的旧投影重复计算。
   - AR/AP 冲销生成负向事实，原单保留并可追溯。
3. 冲销前重读版本；同一原单存在未完成冲销时返回 409。失败时整体回滚；已发布外部消息失败进入补偿任务。

### B-05/B-06/B-07 RMA、签收与销售完成

**RMA**

1. 状态机按 PRD 保留 `REQUESTED/APPROVED/REJECTED/IN_TRANSIT/RECEIVED/INSPECTING/INSPECTION_COMPLETED/RESTOCKED/CLOSED`。
2. `approve` 允许两个出口：
   - `decision=APPROVE,toStatus=APPROVED`：写 approvedQty、expectedCreditAmount、currency，并生成预期回入库待办。
   - `decision=REJECTED,toStatus=REJECTED`：写 comment、rejectedReason、rejectedAt；释放该单占用的可退额度。
3. 创建 RMA 时写入 `shipmentRecognitionFactId/outboundLineId/expectedVersion`，校验原订单、原出库、原发货确权行同租户且状态可退。可退余额按状态聚合，`REJECTED/CANCELED` 不占用。
4. 回入库使用幂等命令事实；`SALES_RETURN` 流水保存 RMA、出库行、订单、仓库、产品、批次、数量、factVersion 和 correlationId。库存更新与命令保存同事务；库存结果未知时 RMA 保持 `RESTOCK_PENDING`，不得先置 `RESTOCKED`。
5. 红字 AR：
   - 服务端根据原发货确权行单价、税口径、四舍六入五成双或冻结舍入规则和批准退货数量计算金额。
   - 请求改为 `currency/reason/taxBasis/lines[shipmentRecognitionLineId,qty]`；不允许 `taxBasis` 传金额。
   - 通过 Finance 命令/事件生成负向 AR；RMA 在收到 finance fact 确认后回填 `creditNoteFinanceId`。
6. 关闭前生成服务端 `closure-check` 事实，返回可复用的 `closureCheckId`、检查时间、来源版本和逐项结果；`close` 校验该事实未被消费、来源版本仍匹配。检查项包括回入库、返修/报废处置、红字或退款/抵扣、审批和争议。
7. 已收款退货单独冻结为红字 AR 冲抵、退款或客户余额抵扣；未确认前 RMA 不关闭。

**客户签收**

1. `receiptStatus` 为 canonical，状态保留 PRD 五值；`status` 只读兼容。
2. 行级规则改为 `signedQty + rejectedQty + damagedQty = shippedQty`。首次登记可以登记全量事实；来源行数量不匹配返回 422。
3. 新增增量命令：
   - `PATCH /sales-orders/{orderId}/receipts/{receiptId}` 或独立子命令 `supplement/dispute/resolve`，具体以契约冻结为准。
   - 只允许更新本次 delta，后端累计后校验行级守恒和来源版本。
   - 拒收/破损差额可直接创建 RMA 或争议事实；未闭合差额不允许销售完成。
4. 签收聚合保存来源出库事实版本；原出库变化后旧签收进入 `STALE`，重检通过才可继续。

**销售完成**

1. `complete-check` 返回逐项条件：
   - 所有 `sourceType=SalesOrder/sourceId=orderId` 的有效 AR 全部 `SETTLED`。
   - REQUIRED 发票全部 `ISSUED`、REQUIRED 凭证全部 `POSTED`。
   - 无未关闭 RMA、争议、破损或未处置差额。
   - 客户签收聚合全行完成且来源事实版本未过期。
2. `complete` 在同事务重新执行检查，生成独立 `SalesCompletionClosure` 聚合，不只在订单上拼 `closure-{id}-{version}` 字符串。订单回填 closureId 并进入只读 `COMPLETED`。
3. closure 事件和订单状态同事务 Outbox；重复请求通过幂等键返回同一 closure。

### B-08 Platform、IAM 与审计

1. `/platform/permissions` 改为权限目录：`permissionId/code/name/module/action/resourceType/dependsOn/status/version`。资源目录迁到 `/platform/resources`，旧路径短窗兼容但响应 schema 不同。
2. 冻结三层身份：
   - `registered_users.auth_user_id`：认证身份。
   - `iam_account.account_id`：租户内账号。
   - `iam_employee.employee_id`：人事档案。
   三者使用稳定 ID 相互引用，应用层校验租户与状态，不使用数据库外键。
3. 平台账号变更与认证账号写入同一应用服务：创建、禁用、重置、授权变更同步 `sessionVersion`；演示账号仅允许非生产 profile。
4. 新增 `auth_session` 活跃会话记录：`jti/account/tenantId/issuedAt/expiresAt/status/clientFingerprint/ipHash/lastSeenAt`。平台会话页分页返回脱敏目录；撤销必须命中真实 jti，撤销后 `auth_consumed_session` 或状态字段立即生效。
5. 审计查询使用同一筛选条件执行 count 和 page 查询；响应返回准确 `total/hasMore/nextCursor`。禁止用当前页长度或缓存快照冒充全量。
6. 适配器同步拆分为预检、提交、结果查询三个事实；只有外部返回成功或异步任务 `SUCCEEDED` 才标记 synced，失败保留外部 requestId 和错误。

### B-09 生产与主数据

1. `allocation-preview` 扩展为完整完工前置事实：
   - `workOrderId/factoryId/workCenterResourceId/inventoryWarehouseId/materialId/productId`
   - `traceMode`、`allocationRevision`、`businessDate/timeZone`
   - `sourceVersions`：BOM、工艺、工单、库存、资源映射
   - `availability` 和缺失原因
2. `create-completion` 服务端重读最新 preview 对应修订；输入的 revision/traceMode/warehouse/workCenter 与服务端不一致返回 409/422。202 只表示 POSTING，库存回执 `POSTED/FAILED/UNKNOWN` 才更新终态。
3. 库存回执接口保持 internal 认证 + 幂等 + 租户校验；完成后通过事件更新库存、工单和必要销售补发状态。禁止内部回调替代页面查询能力。
4. 产品新增允许不关联仓库；修改允许关联/替换，现有库存不自动迁移。是否清除关联需产品确认；未冻结前不得返回成功。
5. 物料创建仍要求有效库存仓库。供应商主数据归属采购/产业链单一 owner，另一侧使用稳定 ID 或显式映射；禁止同名合并。
6. 业务用户可按权限查询客户、负责人、工厂、仓库、物料等选项；平台管理权限不是读取业务选项的前置。

### B-10/B-11 完整业务与 SLA

1. 建立 PRD 条目矩阵：能力 ID、页面、公开 API、命令、数据库事实、事件、验收用例。没有映射的能力继续标未完成。
2. 库存手工入库、盘点、调拨使用公开命令和正式库存流水，不用内部回调或导入接口替代页面办理。
3. 采购链保留 `MRP/缺货 -> PR -> PO -> 多次收货 -> IQC -> 合格入库 -> AP -> 退货` 的行级追溯；退货必须关联原收货行。
4. 生产路线、设备、委外、退料、反馈先发布契约，再实现；快照发布不等同于这些 CRUD 能力。
5. SLA 冻结多渠道、多阈值、小时/日单位、升级规则、时区、停用和重复扫描去重；通知拆分为平台内事件、站内消息、外部投递三种事实。
6. 客户等级、行业、风险枚举持久化为租户字典，存量数据做受审核迁移；不跨模块字符串替换。

### B-12 注册、登录、找回与会话安全

1. 邮箱验证码迁到数据库表 `auth_email_code`：`emailHash/codeHash/purpose/expiresAt/attemptCount/status/tenantId/createdAt`。多实例一次性消费使用数据库原子 UPDATE；不返回开发验证码到生产响应。
2. 忘记密码保持通用受理，不泄露邮箱是否存在；邮件 provider 返回 2xx 记录 `ACCEPTED/SENT`，失败记录 `FAILED` 并告警。受理和投递分离。
3. 邮件链接若继续携带六位码，页面必须要求邮箱补录；推荐升级为一次性不透明 token 链接 + email/code 请求协议共存。契约版本必须写清，不做隐式兼容。
4. 登录失败锁定改为账号维度持久表：连续 5 次失败锁定 15 分钟，锁定期间跨 IP 也不能绕过；成功清零。审计不打印明文密码。
5. 统一密码策略：至少 10 位，包含大小写和数字；禁用弱口令与最近 5 次历史密码。前后端提示一致。
6. 注册成功不签发业务会话，返回登录引导；租户初始化创建管理员身份和全量角色/权限映射，首次登录强制改密。注册事务写入 registered user、tenant、IAM account/role/employee 初始化和审计。
7. 短信验证码使用数据库一次性消费、设备/手机号/IP 限频；真实 provider 失败不能返回成功。生产环境禁用 `devCode`。

## 4. 数据与事件设计

### 4.1 过渡策略

1. 不做一次性把所有模块 JSONB 改成关系表的大爆炸重构。
2. 本轮优先为影响资金、库存、售后关闭和工作台对账的事实建立专用表：
   - `finance_allocation_fact`、`finance_reversal_fact`、`finance_balance_projection`
   - `sales_rma`、`sales_rma_line/fact_link`、`sales_customer_receipt`、`sales_customer_receipt_line`、`sales_completion_closure`
   - `workbench_projection`、`workbench_source_status`
3. 现有 `module_document` 可继续保存低频扩展字段或历史快照；正式命令读取和写入专用表后，再归档重复 JSON 副本。
4. 所有新表不使用数据库外键；使用应用层引用校验、唯一索引、检查约束、行版本、租户 RLS 和审计。

### 4.2 每个写命令必须交付的证据

| 证据 | 要求 |
| --- | --- |
| 命令事实 | 聚合表或集合中的新版本、旧版本、状态、来源版本 |
| 幂等事实 | canonical 头、commandType、requestHash、response、traceId |
| 审计事实 | actor、permissionVersion、before/after 或差异、reason、traceId |
| Outbox | 同事务写入，事件 ID、类型、aggregate version、correlationId |
| Inbox/补偿 | 跨模块消费幂等；失败可重试或进入补偿 |
| 数据库 SQL | 验收脚本按 tenant + 业务 ID 查询，不依赖列表接口反推 |

## 5. 权限与租户

1. 所有查询先做认证，再做租户、数据范围和字段权限过滤；不使用请求参数角色扩权。
2. `ResourceScope` 统一支持 ID 与 code 双向校验，但持久化稳定 ID；展示 code 只来自已校验记录。
3. 写命令逐一映射权限码；创建/审批/确认/冲销/回入库/关闭等动作必须职责分离。
4. 401/403/404 语义区分；跨租户 ID 返回 404 或 403 时按安全策略统一，不得泄露存在性。
5. 授权发布、撤销、账号停用和密码重置提升 `sessionVersion`，下一请求即时生效。

## 6. 实施顺序

| 阶段 | 内容 | 出口条件 |
| --- | --- | --- |
| 0 契约冻结 | 发布本文 §2 的 OpenAPI、JSON Schema、示例和错误码；产品确认待定项 | 前后端和测试使用同一版本号 |
| 1 公共能力 | IAM scope、canonical 幂等头、统一错误、审计 count、数据库验证工具 | 低权限/跨租户/重复请求反例通过 |
| 2 Workbench | B-01/B-02 结构、指标、事件目录、游标、缓存 | AC-WB 对应用例通过，缺事实显示不可用 |
| 3 Finance | B-03/B-04 allocation/reversal 模型和迁移 | 确认/核销/冲销数据库守恒，正反例通过 |
| 4 RMA/Receipt/Completion | B-05/B-06/B-07 状态机、跨模块事实和补偿 | `SC-FULL-004~006/011` 数据库证据通过 |
| 5 Platform/Production/Master | B-08/B-09 权限、会话、审计、完工元数据 | 授权即时生效，202 不误判成功 |
| 6 Full coverage/SLA | B-10/B-11 能力矩阵 | PRD 必验条目全部有 API/DB/页面映射 |
| 7 Auth hardening | B-12 生产级验证码、锁定、审计、会话治理 | 真实邮件/短信、锁定、过期、重放反例通过 |
| 8 Regression | OpenAPI diff、后端单测/集成测试、真实联调 | `AC-PH1-072~082` 与 `E-01~E-07` 全量证据 |

## 7. 测试与验收门槛

### 7.1 自动化

1. OpenAPI 契约测试：路径、方法、请求/响应 schema、错误码、安全头、示例一致。
2. Service 集成测试：正常、空数据、真实零、缺事实、来源失败、部分失败。
3. 数据库测试：事务回滚、唯一冲突、并发余额、幂等重放、Outbox/Inbox 幂等。
4. 安全测试：跨租户、越权仓库/工厂/财务主体、伪造来源行、低权限切 role、撤销会话、锁定绕过。
5. 回归测试：现有 161 项后端测试不得因重构失败；新增用例覆盖本文所有 B 项。

### 7.2 真实联调

每条用例记录：环境/提交、tenant、actor、页面操作、API trace、幂等键哈希、请求/响应、数据库前后事实、Outbox 状态、刷新/新会话结果。至少覆盖：

1. `SC-FULL-001`：销售缺口到生产、采购、完工、发货、AR、核销、签收、完成。
2. `SC-FULL-002~004`：分批采购收货、采购退货、AR 分笔核销。
3. `SC-FULL-005/011`：正常完成与 8 签收 + 1 破损 + 1 短少差额闭环。
4. `SC-FULL-006`：RMA 退 3、合格回入库 3、红字 AR 3，原订单保持 `SHIPPED` 且已发不变。
5. `SC-FULL-007~010`：信用展示、生产成本、消息重复/失败、多租户越权。
6. 工作台：低权限切角色、无匹配搜索、跨页游标、KEY/ALL、来源失败、空数据、真实零、`dataAsOf`。
7. Finance：确认不扣减、Allocation 只扣一次、部分核销、并发核销、冲销恢复、重复冲销。
8. Auth：注册后进登录、真实邮件找回、一次性验证码、连续失败锁定、重置后旧会话失效。

### 7.3 关闭条件

后端可以宣布 B 项关闭，必须同时满足：

1. 契约和 PRD/技术文档一致，待确认项有明确决策。
2. 代码、迁移、OpenAPI、测试在同一提交可追溯。
3. 页面 -> API -> 数据库 -> 刷新回读一致。
4. 反例、并发、幂等、权限和补偿通过。
5. 没有伪造 `dataAsOf`、零值、终态、外部送达或业务完成。

## 8. 待产品/架构确认清单

| 编号 | 问题 | 默认处理 |
| --- | --- | --- |
| Q-01 | RMA 关闭是返回可复用 `closureCheckId`，还是每次完成时后端实时生成检查事实 | 建议前者，契约和审计更清晰 |
| Q-02 | 已收款退货默认走红字 AR 冲抵、现金退款还是客户余额 | 未确认前三条都实现守卫但不默认落账 |
| Q-03 | 产品仓库关联是否需要显式清除命令 | 未确认前不提供清除入口，也不假成功 |
| Q-04 | 现有 v1 直连 DTO 是否在本轮统一 `{data,error}` | 建议新闭环接口统一，旧接口版本化迁移 |
| Q-05 | Workbench ALL 是否包含系统埋点 | 按 PRD 不包含；若客户要求调整必须改事件目录并升版 |
| Q-06 | 人员考勤/排班路由是退役、internal 化还是保留后端能力 | 用户已确认前端不展示；接口处置需单独确认 |
| Q-07 | 邮箱找回继续 email/code，还是升级为不透明 token 链接 | 建议链接 token 与请求验证码分离 |

## 9. 最终状态

按本方案完成后，后端可进入真实联调，但仍不能仅凭源码或单测宣称可上线。整体上线判断以 PRD `AC-PH1-072~082`、工作台/账号权限验收项、`E-01~E-07` 数据库证据和安全测试全部通过为准。
