# 后端交付清单、前后端联调范围与验收标准

- 日期：2026-10-17。
- 复核代码基线：`7009f61`；项目目录保持 `frontend/`、`backend/`，不迁移路径。
- 本文性质：后端交接与联调验收方案。本轮只新增文档，未修改应用代码、接口契约或数据库，未执行新的真实业务写入、数据库比对、邮件/短信投递或压测。
- 依据：PRD、技术设计、当前模块 OpenAPI、306 条路由清单，以及前端实施计划和实施记录。业务规则以 PRD 和用户后续确认优先；接口差异必须修订并冻结，不能自动以实现覆盖需求。
- 结论：**后端需要修复领域事实与守卫、补齐字段级契约和来源元数据，再与前端共同完成真实数据库闭环验收。当前不能认定整体联调完成。**

## 1. 当前证据与交付边界

### 1.1 已有证据的含义

| 证据 | 能证明的内容 | 不能据此认定的内容 |
| --- | --- | --- |
| 当前路由清单与生成 OpenAPI 均为 306 个操作，public 295、internal 4、retired 7 | 方法和路径覆盖基线一致 | 生成文件目前没有 requestBody 和 DTO schemas；不代表字段、权限、事务或数据正确 |
| 前端实施记录中的类型检查、186 项单测、构建及受控 Playwright 通过 | 已实施的前端协议、交互、默认态与隔离逻辑经过对应测试 | 这些 Playwright 拦截业务请求，不能证明实际数据库、邮件、WMS 或外部 ERP 成功 |
| 独立最终回归报告记录页面可达、列表有数据 | 对应环境和用例的页面可达性 | 不能用“库存页有数据”验收手工入库，用“生产页有工单”验收 MRP，或用产品下拉验收仓库配置持久化 |
| 本文对 Controller、Service、JDBC Store 的复核 | 下表列出的静态实现差异 | 不证明本机 8081 或远端部署正在运行同一提交；需先核验运行基线 |

### 1.2 前后端责任

1. 后端负责鉴权与数据范围、状态机、数量和金额守恒、并发/幂等、正式持久化、来源事件、任务结果、审计和业务接口。产品参与冻结业务口径。
2. 前端负责按已冻结契约办理、展示真实状态、输入校验、身份隔离、未知结果恢复、来源跳转。剩余前端办理表单、旧命令迁移和 Excel 解析不能全部转列为后端缺陷。
3. AI 推理、prompt、Embedding、RAG、Agent 仍在独立 AI 服务。浏览器只访问 Java 业务后端，Java 通过 client 访问 AI 服务。
4. 优先级是同一次完整交付中的实施顺序，不代表分期或允许删减 PRD。尚未验收项继续记录未完成。

## 2. 后端要完成的内容

编号延续既有计划 B-01～B-12，避免前后端使用不同问题编号。性质区分“源码已确认差异”“契约待冻结”“真实环境待验证”；同一项可包含多种性质。

| 编号/顺序 | 当前问题与性质 | 后端及产品具体交付 | 解除条件 |
| --- | --- | --- | --- |
| B-01 / 优先 | 工作台声明 1.1，实际返回平铺数据，前端 1.1 解析要求嵌套 `data`；工作台 YAML 未定义完整响应。金额及来源完整性的接口表达待冻结 | 发布完整 1.1 schema、正常/空/部分/失败样例及兼容策略；覆盖角色、scope、三项营收、交期达成量、按授权仓库去重物料低水位、分区、来源状态、日期/时区、真实数据时间/版本。按币种与税口径分组；不能用当前时间减固定秒数冒充实际数据时间 | AC-01；前端 projection 接受正式样例，金额可回查权威来源，缺事实为不可用 |
| B-02 / 优先 | 工作台以查询 `role` 推导 tenantWide；先取 50 条消息再过滤 KEY/搜索；越界 offset 被压回末条。源码已确认 | 从签名身份和实时授权推导数据范围，角色参数仅控制展示；授权与筛选在分页前完成；发布稳定排序、游标推进/结束/失效规则和事件目录，明确 ALL 的业务事件范围。落实 PRD 的预警阈值、待办责任人/逾期/关闭动作、刷新和缓存时效；未覆盖的接口规则列差异后确认 | AC-02；低权限不能通过切“老板”扩权，超过 50 条及边界翻页无漏读或重复末条 |
| B-03 / 优先 | 收付款确认扣 AR/AP，却未写 Allocation；独立核销再次扣余额，累计额度校验不足；`lines` 缺失存在空引用风险。源码已确认 | 按 PRD 实现有来源收付款“确认→原子生成核销事实→更新余额”；如支持未指定来源款项，另行冻结可分配余额语义。核销校验累计剩余额度、正数、方向、往来方、币种、有效状态和并发；补齐 400/409/422 对应业务码、缺行校验及响应 | AC-03；确认/核销只产生一次财务效果，任何校验失败均不部分落账 |
| B-04 / 优先 | 冲销先写 `reversed` 再判断是否 `done`，余额恢复分支无法进入；审批 token 仅非空校验，未见预期版本验证。源码已确认 | 冻结可冲销单据/状态与反向事实规则；校验真实审批凭证、有效期/单据绑定、职责分离和预期版本；关联原单、反向单、核销撤销/反向事实、余额与事件。验证跨 Store 写入的原子性或正式补偿机制，不能只证明单个 Store 有事务 | AC-04；有效冲销恢复应恢复的余额，重复冲销无二次效果，中途失败无半笔账 |
| B-05 / 优先 | RMA 先限制目标 APPROVED，驳回分支不能正常到达，且 REJECT/REJECTED 与契约冲突；CLOSE 要求无获取来源的 `closureCheckId`；贷项受原 AR 未收余额限制。销售完成只取一个来源 AR，缺 REQUIRED 发票/凭证守卫 | 修复逐动作状态矩阵、必填字段和驳回释放可退额度；冻结 `taxBasis` 实际金额含义、已收款退货的退款/抵扣及红字关联；发布关闭检查结果来源或服务端推导协议。销售完成校验来源全部 AR、签收、未闭售后/争议及 REQUIRED 发票/凭证，实际 complete 时重新校验 | AC-05、AC-07；审批通过/驳回及已收款退货可办理；关闭条件不全准确拒绝 |
| B-06 / 优先 | 签收创建后已有聚合即冲突，但未发布补签/争议续办接口；当前要求整单全部发货，部分发货后的签收链需产品确认。源码/范围差异 | 发布正常/部分/拒收/破损、补签、争议解除的状态与命令契约；定义增量/累计、来源行全覆盖、重复/遗漏行、版本和幂等。明确分批出库可否分批登记签收；不通过重复创建替代更新 | AC-06；多次登记可合法收敛到终态，累计不超已过账量，遗漏行不能误判全签 |
| B-07 / 优先 | 新 RMA、签收、销售关闭调用链未见与读取相同完整的分动作权限守卫；RMA 幂等指纹未纳入路径 ID。来源仓库与流水需核验 | 发布动作→IAM 权限→租户/组织/工厂/仓库范围表，强制服务端守卫；来源单/行及已过账状态权威验证；回入库采用标准库存流水。幂等指纹覆盖租户、命令、聚合路径、版本和业务输入；跨模块财务/库存事实失败需原子回滚或明确可恢复状态 | AC-08；直接调用 API 同样拒绝越权；同键跨不同 RMA 不回放错误对象，库存/财务无孤立事实 |
| B-08 / 优先 | `/platform/permissions` 当前返回企业资源；审计 total 为估算；撤销要求真实 jti，但缺供选择的会话来源。账号 ID 映射待冻结 | 明确 Platform account、Auth user、employee 的稳定映射；发布真实权限目录、授权发布/撤销及版本刷新协议；提供可用的会话标识来源和撤销范围；审计返回准确 total，或明确采用 hasMore 协议并同步契约。适配器同步须返回真实外部结果/任务/错误，当前仅本地标记 synced 不足以验收 | AC-09；角色发布立即生效、会话可实际撤销、审计结果可对库，不能以资源清单代替权限目录 |
| B-09 / 优先 | 完工 preview 仅含 workOrderId/qty/allocations，前端缺可靠追溯、分配修订和资源映射来源；主数据与业务字典归属待冻结 | 在正式响应提供完工必需的工厂/工作中心/库存仓库与平台资源映射、traceMode、allocationRevision 和生产业务日期的来源/录入约束；服务端验证最新修订。冻结主数据默认与可编辑字段、采购与产业链供应商 ID 归属；业务用户能按自身权限查询负责人/客户/工厂/仓库等选项，不为选项额外授予平台管理权限 | AC-10；前端能使用真实来源组装正常完工请求，资源不能互相冒充，无授权选项明确阻断 |
| B-10 / 完整范围 | 库存、生产、采购及 AI/反馈等剩余能力有的已有路由但未验收，有的尚缺正式契约；不是统一“无 API” | 按 PRD 条目逐项交付能力矩阵：库存入库/盘点/调拨；路线、设备、委外、退料；PR→PO→收货/IQC→库存/AP及采购退货；产业链附件/风险策略；AI 配置/分析/反馈等。已有路由补齐字段和测试，未映射能力先发布契约；异步/跨模块链提供正式任务、事件、重试与追溯 | AC-11、E-02；每个必验条目均有公开业务能力和数据库证据，内部回调不能替代页面办理 |
| B-11 / 完整范围 | SLA 多选/小时阈值/升级规则、客户等级/行业属性及多渠道触达与新契约不完全对应；报价写路由已经存在 | 冻结 SLA 参数组合、计时/时区、升级、停用、通知去重与投递回执；定义客户等级/行业归属并持久化；核验报价保存/查询/授权和 PRD 所需生命周期，不重复造另一套报价 API。业务事件产生、站内消息落库、外部实际送达分开记录 | AC-11、E-06；保存重开一致、越权拒绝，扫描重试不重复通知；报价页面接入仍属前端任务 |
| B-12 / 优先 | 找回现为 email/code/newPassword，六位码 600 秒，链接 token 实为六位码；通用受理吞掉邮件发送错误。登录仅 IP 频控，未见 PRD 连续失败锁定路径 | 冻结当前邮箱验证码及链接协议，或另发有版本的 opaque token 迁移；真实邮件/短信可观测投递，一次性码、并发消费、限流与多实例一致性；实现连续 5 次失败锁定 15 分钟及安全审计，核验统一密码策略/历史。注册初始化、首登改密、禁用/离职、登出及授权变更即时失效需闭环 | AC-12、E-07；真实邮件/短信完成流程；受理不泄露账号存在性；锁定、过期、重用和撤销均有反例证据 |

产品仓库规则单列：**产品新增允许不关联；修改可关联或替换；标签为“库存仓库”。** 当前 PATCH 的 null 不清除，空 ID 无效。“取消已有仓库关联”是否属于本次能力待产品确认；如需要，后端先发布明确清除协议，前端不能提示虚假成功。物料当前创建协议要求有效仓库。变更主数据关联不等于移动已有库存。

## 3. 需要联调的接口与页面功能

下表使用当前路由清单中已发布的 public 方法/路径。`{id}` 等是原始路径变量；所有实际值来自真实来源。未发布能力在表中明确写“待发布”，不臆造 URL。完整基础 CRUD 仍按模块 OpenAPI 逐项回归，下表聚焦受本轮整改影响的操作和闭环。

### 3.1 工作台、销售、库存

| 编号 | 页面/功能与依赖 | 已发布接口 | 重点联调内容 |
| --- | --- | --- | --- |
| I-01 | 工作台，B-01/02 | `GET /api/v1/workbench/dashboard` | role/date/sections/search/eventScope/limit/cursor；完整 1.1 `data`，真实 dataAsOf/sourceVersion/scope；租户时区如何取得及传递仍需冻结 |
| I-02 | 销售列表、快速开单、编辑，B-09 | `GET /api/v1/sales/sales-orders`；`POST /api/v1/sales/sales-orders`；`GET /api/v1/sales/sales-orders/{id}`；`PATCH /api/v1/sales/sales-orders/{id}`；`GET /api/v1/fulfillment/customers` | 客户/负责人/工厂/仓库稳定 ID、收货信息、单位/金额、版本和来源快照；确认后锁定，刷新可恢复 |
| I-03 | 复核、确认、取消、发货申请 | `POST /api/v1/sales/sales-orders/{id}/review-submit`；`POST /api/v1/sales/sales-orders/{id}/review-decisions`；`POST /api/v1/sales/sales-orders/{id}/confirm`；`POST /api/v1/sales/sales-orders/{id}/cancel`；`POST /api/v1/sales/sales-orders/{id}/shipment-requests` | 职责分离、合法状态、剩余可申请量及并发；确认不自动等同出库/完成 |
| I-04 | 发货校验、预留、补货及过账，B-07/09 | `GET /api/v1/inventory/availability`；`GET /api/v1/inventory/shipment-tasks`；`GET /api/v1/inventory/shipment-tasks/{id}`；`POST /api/v1/inventory/shipment-tasks/{id}/check-and-reserve`；`POST /api/v1/inventory/shipment-tasks/{id}/production-requests`；`POST /api/v1/inventory/outbounds/{id}/post` | 同一仓库/产品来源的现存、预留、可用量、事实版本；缺货不冒充预留成功；过账产生库存与订单真实状态，不由 localStorage 模拟 |
| I-05 | 结果未知查询与穿透 | `GET /api/v1/inventory/reservations/query/{idempotencyKey}`；`GET /api/v1/inventory/outbounds/query/{idempotencyKey}`；`GET /api/v1/inventory/releases/query/{idempotencyKey}`；`GET /api/v1/inventory/transactions`；`GET /api/v1/sales/sales-orders/{id}/fulfillment-trace` | 超时后查询原命令；不能换新键重复写入。校验实际出库行、订单累计量、库存流水、财务来源与 trace |
| I-06 | 退货列表、申请与逐动作办理，B-03/05/07 | `GET /api/v1/fulfillment/rmas`；`POST /api/v1/rmas`；`POST /api/v1/rmas/{id}/transition` | orderId/outboundId/outboundLineId、requestedQty、evidence；transition/toStatus/decision、If-Match；正式贷项字段 creditNoteFinanceId/creditNoteAmount；关闭检查标识获取协议待发布 |
| I-07 | 客户签收，B-06/07 | `GET /api/v1/fulfillment/customer-receipts`；`POST /api/v1/sales-orders/{orderId}/receipts` | lines 中订单行/出库行/数量/来源版本，receiptStatus、证据与时间；补签、纠错、争议解除的命令契约待发布 |
| I-08 | 销售完成，B-03/05/06/07 | `POST /api/v1/sales-orders/{orderId}/complete-check`；`POST /api/v1/sales-orders/{orderId}/complete` | canComplete/missingConditions，检查和执行之间并发变化；全部来源 AR 和 REQUIRED 发票/凭证；完成结果中的 closureFactId |
| I-09 | 销售 AI 卡片、趋势、SLA 与报价，B-01/11 | `GET /api/v1/sales/ai-insights`；`GET /api/v1/sales/sla-rules`；`POST /api/v1/sales/sla-rules`；`PATCH /api/v1/sales/sla-rules/{id}`；`GET /api/v1/sales/sla-notifications`；`GET /api/v1/fulfillment/quotes`；`POST /api/v1/fulfillment/quotes` | 来源完整性与风险零值区分；超过 30 天未互动客户为 0 时显示“暂未发现”且无推荐；无临期订单无协同建议，有风险时仅保留已确认行动文案；SLA 规则落库、报价持久化 |
| I-10 | 仓库/产品/物料，B-09 | `GET /api/v1/inventory/warehouses`；`POST /api/v1/inventory/warehouses`；`PATCH /api/v1/inventory/warehouses/{id}`；`GET /api/v1/inventory/products`；`POST /api/v1/inventory/products`；`PATCH /api/v1/inventory/products/{id}`；`GET /api/v1/inventory/materials`；`POST /api/v1/inventory/materials`；`PATCH /api/v1/inventory/materials/{id}` | 授权可选仓库、defaultWarehouseId、新建/修改/回显/409；配置与库存余额分离；真实数字输入及焦点稳定是前端回归项 |
| I-11 | 库存导入、盘点、调拨，B-10 | `POST /api/v1/inventory/import/availability`；`GET /api/v1/inventory/stocktake-tasks`；`POST /api/v1/inventory/stocktake-tasks`；`POST /api/v1/inventory/stocktake-tasks/{id}/start`；`POST /api/v1/inventory/stocktake-tasks/{id}/count`；`POST /api/v1/inventory/stocktake-tasks/{id}/approve`；`POST /api/v1/inventory/stocktake-tasks/{id}/adjust`；`GET /api/v1/inventory/transfer-orders`；`POST /api/v1/inventory/transfer-orders`；`POST /api/v1/inventory/transfer-orders/{id}/approve`；`POST /api/v1/inventory/transfer-orders/{id}/ship`；`POST /api/v1/inventory/transfer-orders/{id}/receive`；`POST /api/v1/inventory/transfer-orders/{id}/cancel` | 导入是已发布 public 能力，核验真实来源/权限/公式，不能冒充手工入库。盘点差异经审批调整；调拨源仓扣减、在途、目标收货守恒。手工入库须先映射 PRD 所需命令，尚不能凭上述路由认定已覆盖 |

### 3.2 生产、采购、财务

| 编号 | 页面/功能与依赖 | 已发布接口 | 重点联调内容 |
| --- | --- | --- | --- |
| I-12 | 生产需求接收、MRP/APS，B-09/10 | `GET /api/v1/production/demands`；`POST /api/v1/production/demands/{id}/validate`；`POST /api/v1/production/demands/{id}/approve`；`POST /api/v1/production/demands/{id}/claim`；`POST /api/v1/production/mrp-runs`；`POST /api/v1/production/schedule-runs`；`GET /api/v1/production/tasks/{id}` | 来源订单/行/发货任务、工作中心授权、BOM 版本与参数快照；任务受理/执行/失败区分；不按成功受理推算需求状态或版本 |
| I-13 | 工单齐套、生产执行、质检与返工，B-09/10 | `GET /api/v1/production/work-orders`；`GET /api/v1/production/work-orders/{id}`；`POST /api/v1/production/work-orders`；`POST /api/v1/production/work-orders/{id}/kitting-check`；`POST /api/v1/production/work-orders/{id}/release`；`POST /api/v1/production/work-orders/{id}/start`；`POST /api/v1/production/work-orders/{id}/reports`；`POST /api/v1/production/inspections`；`POST /api/v1/production/inspections/{id}/result`；`POST /api/v1/production/inspections/{id}/rework`；`POST /api/v1/production/inspections/{id}/scrap`；`POST /api/v1/production/rework-orders/{id}/complete` | 齐套/领料扣减、良品/不良品、检验、返工复检/报废数量守恒，正常路径及不合格拦截 |
| I-14 | 完工入库及结案，B-09/10 | `POST /api/v1/production/work-orders/{id}/completion-allocation-preview`；`POST /api/v1/production/work-orders/{id}/completions`；`GET /api/v1/production/completions/{id}`；`POST /api/v1/production/completions/{id}/retry`；`POST /api/v1/production/work-orders/{id}/close-check`；`POST /api/v1/production/work-orders/{id}/close-submit`；`POST /api/v1/production/work-order-closes/{id}/approve` | inspectionId、qty/uom、inventoryWarehouseId、warehouseResourceId、traceMode、productionDate、allocationRevision；202 后查 task/completion；库存 POSTED 后才算入库。失败用原任务恢复，不能重复创建占用；异人结案 |
| I-15 | 采购申请、审批与订单，B-09/10 | `GET /api/v1/procurement/purchase-requests`；`POST /api/v1/procurement/purchase-requests`；`POST /api/v1/procurement/purchase-requests/{id}/approve`；`POST /api/v1/procurement/purchase-requests/{id}/reject`；`GET /api/v1/procurement/purchase-orders`；`POST /api/v1/procurement/purchase-orders/{id}/cancel`；`GET /api/v1/procurement/suppliers` | 实际 MRP 来源与建议行、数量/价格/供应商映射；核验审批后 PO 的生成触发与一一/分拆关系，不能假设存在未发布的通用 PO 创建接口 |
| I-16 | 采购收货/IQC、退货及 AP，B-03/09/10 | `POST /api/v1/procurement/purchase-orders/{id}/receipts`；`GET /api/v1/procurement/purchase-receipts`；`POST /api/v1/procurement/purchase-receipts/{id}/inspect`；`GET /api/v1/procurement/purchase-returns`；`POST /api/v1/procurement/purchase-returns`；`POST /api/v1/procurement/purchase-returns/{id}/process` | 分批/累计收货、合格入库/不合格处置、库存与 AP 实际形成时点；退货扣减和财务调整；复查 PR/PO/receipt 来源稳定 ID、任务事件及重复回调 |
| I-17 | 财务看板、AR/AP、合并台账 | `GET /api/v1/finance/dashboard`；`GET /api/v1/finance/receivables`；`GET /api/v1/finance/payables`；`GET /api/v1/finance/ar-aps` | 单据金额十进制字符串、币种/税口径/来源行；合并台账当前裸数组且每类最多 1000 条，需冻结分页/截断和单类授权语义；看板缺完整口径不显示全盘人民币金额 |
| I-18 | 收付款、核销、冲销，B-03/04 | `GET /api/v1/finance/payments`；`POST /api/v1/finance/payments`；`POST /api/v1/finance/payments/{id}/confirm`；`GET /api/v1/finance/allocations`；`POST /api/v1/finance/allocations`；`POST /api/v1/finance-documents/{id}/reverse` | 有来源收付款确认直接生成核销事实，前端不得再串联相同核销；独立分配只使用正式未分配额度；真实审批凭证、版本、余额恢复和跨表事务证据 |
| I-19 | 发票、凭证、成本与销售关闭，B-05/10 | `GET /api/v1/finance/invoices`；`POST /api/v1/finance/invoices`；`GET /api/v1/finance/vouchers`；`POST /api/v1/finance/vouchers`；`POST /api/v1/finance/vouchers/{id}/post`；`GET /api/v1/finance/cost-accounting`；`POST /api/v1/finance/cost-accounting` | REQUIRED 规则及来源关联；凭证 POSTED 与保存分开；生产材料/人工/制造费用事实和成本归集来源，不用固定零成本验收 |

### 3.3 平台、认证、人员、产业链、AI 与消息

| 编号 | 页面/功能与依赖 | 已发布接口 | 重点联调内容 |
| --- | --- | --- | --- |
| I-20 | 认证与初始化，B-08/12 | `POST /api/v1/session/captcha`；`POST /api/v1/session/register`；`POST /api/v1/session/login`；`POST /api/v1/session/sms/send-code`；`POST /api/v1/session/sms/login`；`GET /api/v1/session/me`；`POST /api/v1/session/complete-first-login`；`POST /api/v1/session/change-password`；`POST /api/v1/session/logout` | 注册事务和租户初始化、签名租户、首登改密、无越权默认角色；手机输入初始为空、真实验证码、失败锁定、停用/离职与登出即时失效 |
| I-21 | 邮箱找回与链接重置，B-12 | `POST /api/v1/session/password/forgot`；`POST /api/v1/session/password/reset` | 当前请求 email/code/newPassword，成功 reset 为 204；链接六位码需补邮箱。不要求前端调用未实现的 token-only 协议；真实送达与通用受理分开验收 |
| I-22 | 企业资料、字典、授权及审计，B-08/09 | `GET /api/v1/platform/snapshot`；`PUT /api/v1/platform/tenant`；`GET /api/v1/platform/org-units`；`GET /api/v1/platform/employees`；`GET /api/v1/platform/positions`；`GET /api/v1/platform/resources`；`GET /api/v1/platform/permissions`；`GET /api/v1/platform/roles`；`PUT /api/v1/platform/roles/{id}/grants`；`GET /api/v1/platform/audits`；`POST /api/v1/platform/permission-adapters/{id}/sync`；`POST /api/v1/platform/session-revocation` | 白名单字段/version，岗位与 IAM 角色分离；字典不依赖过度授权；审计 startTime/endTime/page/pageSize；授权草稿/复核/历史/撤销能力、会话目录及同步预检仍须补完整契约 |
| I-23 | 平台员工账号，B-08/12 | `GET /api/v1/platform/employee-accounts`；`POST /api/v1/platform/employee-accounts`；`PUT /api/v1/platform/employee-accounts/{id}/status`；`POST /api/v1/platform/employee-accounts/{id}/reset-password` | Auth 域处理、完整租户头、账号映射、状态修改 204、临时口令一次显示；写入成功但响应丢失后的账号查询/恢复协议须冻结，禁止重复建号 |
| I-24 | 人员与产业链，B-09/10 | `GET /api/v1/personnel/employees`；`GET /api/v1/personnel/skills`；`GET /api/v1/supply-chain/suppliers`；`GET /api/v1/supply-chain/customers`；`GET /api/v1/supply-chain/risk-events`；`POST /api/v1/supply-chain/risk-events/{id}/resolve` | hr.employee.read/hr.skill.read、sc.supplier.read/customer.read/risk.read 独立验证；admittance 是 boolean。供应商风险级别为“低/中/高”，风险事件当前实现为“低风险/中风险/高风险”，后者与 YAML 冲突，须逐字段统一，不能全模块批量替换 |
| I-25 | AI 对话、洞察、导入、操作方案、分析与配置，B-10 | `POST /api/v1/ai/chat`；`GET /api/v1/ai/insights`；`POST /api/v1/ai/map-columns`；`GET /api/v1/ai/action-plans`；`POST /api/v1/ai/action-plans/submit`；`POST /api/v1/ai/action-plans/{id}/review`；`POST /api/v1/ai/nl2sql`；`GET /api/v1/ai/models` | 当前 chat 为 JSON，不能冒充 SSE；审核 If-Match、幂等与业务执行授权；模型配置/分析功能逐项映射；NL2SQL 租户/只读范围由后端约束。CSV 导入映射不直连模型；Excel 支持是剩余前端工作，不凭 map-columns 验收 |
| I-26 | 消息、业务待办与反馈，B-02/10/11 | `GET /api/v1/message/messages`；`POST /api/v1/message/messages/{id}/read`；`POST /api/v1/message/messages/{id}/archive`；`GET /api/v1/message/subscriptions`；`POST /api/v1/message/subscriptions`；`POST /api/v1/ai/messages/{id}/feedback` | 来源类型/ID 与页面 focus 实际定位、站内消息持久化和订阅生效；已读/归档不改变源业务。AI 消息反馈不能等同“问题反馈”全模块；问题反馈提交/附件/处理/关闭的公开能力映射待补 |

不允许调用 retired 写路径；保持其正式 410 行为。`/inventory/internal/*` 等内部能力仅供可信服务调用，不能作为前端办理捷径。当前路由基线没有统一 `/api/v2` 迁移，不沿用历史版本替换假设。

## 4. 字段级契约与环境交付要求

后端每个接口需交付可执行的 OpenAPI schema、样例与自测，不仅提供路径清单：

1. 方法/路径、有效版本、鉴权、具体 IAM 权限、数据范围、请求头、字段类型/必填/nullable/默认/长度/枚举/精度、响应结构、HTTP 和业务码、来源行/聚合 ID。
2. 写接口明确 `X-Idempotency-Key`、`If-Match` 或其他正式版本机制的适用性、同键重放、同键异体、跨聚合冲突及未知结果查询；查询能力缺失须发布协议，不由前端造 URL。不是所有现有写接口已支持这两种头。
3. `Authorization`、`X-Tenant-Id`、追踪标识及错误中的 traceId 一致；错误含可定位字段信息、是否可重试及恢复建议。分别冻结 400/401/403/404/409/422/429/5xx，不能把全部校验改写成 422。
4. 单据 DTO、分页集合、命令复合结果、裸数组和 204 保持各自正式协议；只有工作台 1.1 要求的 `data` 按该 schema 处理，不能全局统一解包。
5. 金额/数量使用精确十进制协议；币种、税口径、单位与换算来源明确。各模块卡片/趋势必须表达真实非空、成功空集、完整零值、缺事实、部分失败、无权限、AI 未生成等状态；状态和字段命名逐模块冻结，不擅自统一重命名。
6. 卡片和图表的标题/描述/框架在无数据时保留；无事实不画样例曲线，不生成正向经营结论；完整零风险不显示推荐行动。没有完成 AI 分析与“没有业务风险”是不同事实。
7. 提供运行提交、构建时间、Java 17 版本、端口 8081、profile、实际 PostgreSQL 数据库标识/迁移状态、Store 实现类型、任务 worker/事件消费者和依赖服务清单。凭据经独立安全渠道提供，不写入本文件。
8. 核验服务确实选用 JDBC Store；现有配置在无 DataSource 时可退为内存 Store，页面有数据不足以证明连接 `industrial_ai`。提供专用测试租户、双租户及低权限/审批双人账号，不使用管理员 `*` 代替权限验证。

## 5. 逐项验收标准

以下是可执行的通过条件。案例金额和数量为专用测试数据，不是新增产品默认值。每项须同时检查 API、数据库事实、刷新/重登后的页面；未执行标“未验收”，环境或契约不具备标“阻断”。

| 用例 | 关联 | 必须通过的正例、反例与边界 |
| --- | --- | --- |
| AC-01 | B-01 / I-01、09、17 | 用已知来源金额核验订单金额、确认收入、发货确权三种口径，按币种/税口径分别展示；交期按工厂/单位，低水位按授权仓库的物料去重。真实空集显示空态、完整零值可显示 0、缺失显示 `-`/对应不可用态。分区部分失败不伪装全盘为零 |
| AC-02 | B-02 / I-01 | 构造超过 50 条及跨页关键/普通事件，含相同时间戳和无命中搜索；授权过滤和搜索后分页与数据库一致，结束游标不循环。低权限传老板/ALL/其他租户不扩权；刷新首屏不推进历史。按 PRD 指标 300 秒、其他分区 60 秒，超过 300 秒标过期、超过 1800 秒指标 `-`，过期事项处理守卫按技术设计验证；服务端来源时间不能随刷新伪造更新 |
| AC-03 | B-03 / I-18 | 来源 AR 总额 1000、已收 0，登记并确认 300 后有效核销事实恰为 300、余额 700；同键重放或确认成功后重复请求均不再减至 400。若允许独立核销，历史有效核销之和不超过款项可分配额。错方向/往来方/币种、缺 lines、零/负数、超额和并发均给正式错误，无 500 空引用或部分落账；AP 同验 |
| AC-04 | B-04 / I-18 | 对已确认的 300 收款合法冲销后，原单保留冲销状态、存在关联反向单/核销反向或失效事实，AR 余额按冲销规则恢复。假 token、过期 token、自审批、旧版本、重复及并发冲销拒绝或幂等重放；对每类支持单据分别验证。故障注入不能只生成反向单而未恢复余额 |
| AC-05 | B-05/07 / I-06 | 原出库行已发 10，可退余量为 10 减有效占用，两个并发申请不能合计超过 10；审批通过/驳回均符合正式枚举、异人守卫和额度释放。检验合格+返修+报废等于实收，回入库数量和实际库存流水一致；已收款退货也能按冻结退款/抵扣方案闭环。关闭引用可从正式来源取得，缺库存/财务事实不得关闭；跨 Store 中途失败有一致恢复证据 |
| AC-06 | B-06/07 / I-07 | 两个出库行及混单位数据分别验证正常、部分、拒收、破损、补签和争议解除；来源属于同单、已过账，数量累计遵循冻结规则且不超已发。重复行/遗漏行/零行/旧版本/源事实变化准确处理，不因只提交一行就判全签；不能跨单位合计。分批签收范围确认后补相应用例，未确认不得默认为通过 |
| AC-07 | B-05 / I-08、19 | 同单关联至少两张 AR，其中一张未结算必须 complete-check 不通过；REQUIRED 发票未 ISSUED、凭证未 POSTED，或有未闭 RMA/争议均返回具体差异。检查通过后制造并发变化，complete 仍重新校验；满足条件只写一次 closureFactId/完成事件，刷新恢复只读终态。客户签收不自动等于销售 COMPLETED |
| AC-08 | B-07 / I-03～08、11 | 只读用户、销售、仓管、财务分别直接调用未授权动作必须拒绝；跨租户、越权仓库、伪造来源单/行不得写入。两张 RMA 使用同键同体不得返回另一张聚合结果。双击、断网重试、服务重启、重复事件及并发不会重复扣库存、增加已发量或创建 AR/AP |
| AC-09 | B-08 / I-20、22、23 | 授权发布/撤销后下一请求按最新范围处理；员工账号关联准确且不能用错误 ID 修改他人；停用/撤销的真实 jti 不能继续业务。审计过滤/分页与同一筛选数据库结果一致，不估算 total；外部适配同步必须有外部结果或可追踪任务，不凭本地 synced 判通过 |
| AC-10 | B-09 / I-02、10、12～16 | 产品无仓库可创建，关联/替换仓库后数据库及重开回显一致，原库存不自动迁移；物料缺仓库拒绝。业务低权限仍可读自身可用选项。完工参数均有真实来源，旧 allocationRevision/错误映射/超检验量被拒绝，缺元数据前端不发写请求；202 仅受理，直到库存 POSTED 才验收入库成功 |
| AC-11 | B-10/11 / I-09、11～16、24～26 | 每个 PRD 必验条目绑定公开操作、正式数据及用例；PR/PO/IQC/入库/AP、盘点、调拨、委外/退料等分别验证，已有页面不算完成。SLA 保存/停用/阈值边界/时区/升级和重复扫描有事实及回执；供应商跨模块稳定 ID 相同或有正式映射；risk enum 不混用；AI/消息/反馈各按实际能力验收 |
| AC-12 | B-12 / I-20、21、23 | 正常注册、初始化/授权、首登改密、真实短信/邮件找回、重置后新密码登录、登出通过；图形/短信/邮箱码过期/重用/并发消费拒绝。连续 5 次失败锁定 15 分钟，跨 IP 不能绕过账号锁；密码不少于 10 位含大小写与数字、弱口令/前 5 次历史复用受控。错误/锁定/重置/撤销有审计；不存在邮箱同样通用受理但不假称真实送达 |

### 5.1 必跑跨模块业务链

| 链路 | 页面操作顺序 | 数据库与结果核对 |
| --- | --- | --- |
| E-01 现货销售 | 开单→复核/确认→发货申请→预留→出库过账→客户签收→收款确认/核销事实→完成检查/关闭 | 同源订单/行、库存扣减和预留消耗、AR及有效核销、签收、关闭事实分别存在；出库响应中 order 与重新查询一致 |
| E-02 缺货与生产采购 | 缺货销售→生产需求→MRP→PR审批/PO→收货/IQC→物料入库/AP→生产/报工/FQC→成品入库→补发→E-01后续 | 原始来源贯穿；任务202不等于成功、入库与报工分开；物料/成品数量、AP和成本来源可追溯，重复消息不重复入账 |
| E-03 部分发货及签收异常 | 部分发货→续发→部分签收→补签/拒收/破损/争议处理→销售关闭 | 各行累计及剩余守恒，全部来源覆盖；具体签收时点按 B-06 冻结方案，不提前完成 |
| E-04 退货闭环 | RMA申请→驳回终止，或通过后→物流/收货→检验→回入库/返工/报废→红字/退款或抵扣→关闭 | 驳回验证额度释放；通过分支核验可退占用、处置数量、库存流水、红字和实际退款/抵扣，关闭检查真实可复查；未收款及已收款各一例 |
| E-05 财务闭环 | 登记→异人确认→查看核销事实→合法冲销 | AR/AP、款项、Allocation、反向事实、审批、版本、审计及事件对账；登记不等于确认、确认不重复扣账 |
| E-06 授权、消息及工作台 | 角色发布→低权限业务操作→消息/工作台定位来源→业务办理→撤销/换租户再查询 | 数据范围即时生效，来源业务状态变化才关闭待办；已读/归档不关闭业务；外部通知受理和送达分开 |
| E-07 账号生命周期 | 注册→企业初始化/授权→登录→首登/改密→邮件找回/链接重置→禁用/退出 | registered user、员工/平台账号映射、授权版本、凭证消费/撤销及审计一致，无重置码/临时口令本地持久化 |

### 5.2 数据库证据如何取

1. 用 Playwright 操作真实页面并记录真实业务请求；正式验收不拦截业务 API 返回成功。数据库查询由测试工具或后端只读连接完成，浏览器不直连数据库。
2. 先证明当前运行启用了 JDBC。当前 `JdbcFulfillmentStore`、`JdbcProductionStore`、`JdbcFinanceStore` 的主要事实映射为 `module_document`，按 `module + tenant_id + kind + doc_id` 回查 `data`；不能只因为迁移目录有 `sales_order` 或 `fin_payment` 就查询那些历史表认定无记录。
3. 源码映射举例：fulfillment 的 order、outbound、reservation、transaction、purchaseRequest/purchaseOrder/purchaseReceipt、rma、receipt；production 的 workOrder、inspection、completion、completionAllocation、operationTask；finance 的 receivable、payable、payment、allocation、invoice、voucher、costAccounting。以运行版本 Store 和来源 ID 为准。
4. 审计、幂等和 Outbox 的物理位置按实际 Store 确认：部分 JDBC 模块使用 `module_audit_log/module_idempotency_record/module_outbox_event`，fulfillment/production 还存在 JSON 集合映射。后端提供只读核对脚本及 RLS 会话绑定方式，不能以“查不到”直接判空或关闭隔离。
5. 每例留存操作前后事实，记录环境/提交、用例、租户、操作者、源单/行/聚合 ID、版本、动作、脱敏幂等键引用、traceId、请求响应、数据库核对、刷新及新会话回读结果。截图和统计条数只能作为辅助证据。
6. 对财务、库存、售后跨模块写入注入失败/重试，验证事务回滚或正式事件/补偿最终收敛。同步成功与异步处理中分别验收，任务失败不能当成功零值。
7. 测试使用隔离租户和唯一标记；清理通过批准的撤销/冲销或测试环境策略，不删除真实历史业务流水。本文不授权生产数据破坏性操作。

### 5.3 非功能验收

沿用 PRD §10.1/10.1.1 的容量与 P95：列表 1 秒、一般保存/审批 2 秒；工作台指标 1.5 秒、待办/预警/动态 800 毫秒；销售确认/审批、出库过账、采购收货、财务确认/核销 1.5 秒；库存预留 1 秒；MRP/APS 受理 500 毫秒。按 PRD 对应数据量及 200 在线用户等并发条件压测，不能用空库单请求代替。

MRP/APS 异步完成 SLA、失败重试上限/退避、跨模块投影延迟、外部投递超时按已有 PRD/契约执行；未明确的规则由后端和产品补齐后增加用例，不能凭受理耗时推断完成 SLA。同步接口达到 P95 也不能豁免权限、幂等和守恒。

## 6. 实施与联调顺序

| 顺序 | 后端进入条件与产物 | 前端/测试接续工作 | 退出条件 |
| --- | --- | --- | --- |
| 1 基线与契约 | 运行提交/数据库/迁移/依赖清单；逐项 B 状态、负责人及字段 schema；确认账号/字典/权限、锁定与撤销规则 | 对照真实 client/运行入口和字段，不批量换版本；建立专用数据与证据模板 | 路由/字段/错误/权限已冻结；低权限能取得必要业务选项 |
| 2 只读与默认态 | B-01/02、合并台账范围、真实来源完整性及分页 | 工作台/监控/卡片/趋势/台账/人员/产业链/审计真 API 回读；空/错/部分/越权测试 | 数据库→接口→页面逐字段一致，不能显示原型事实 |
| 3 交易与执行 | B-07/09/10 中库存、生产、采购来源及任务能力 | I-02～05、10～16；E-02 验证实际库存/AP与任务恢复 | 正常和异常均有事实证据；完工缺元数据阻断解除 |
| 4 财务核心 | B-03/04 自测和故障注入通过 | 补齐财务写表单、审批来源、版本与重试；执行 E-05 | 核销和冲销守恒、无重复财务效果 |
| 5 售后与关闭 | B-05/06 的状态机、续办、退款/抵扣及检查来源就绪 | 补齐 RMA/签收/销售关闭办理；执行 E-01/03/04 | 客户签收与销售完成独立；全部关闭条件可验 |
| 6 全范围收口 | B-08/10/11/12 剩余能力与真实依赖就绪 | 完成剩余前端、E-06/07及所有 PRD 必验项，执行容量与回归 | 所有必验项通过，无未解除的关键阻断；逐条保留可复查证据 |

各顺序可在依赖满足后并行推进，不要求所有后端工作结束才开始前端。固定新增功能流程仍为：OpenAPI→AI 服务实现/自测（涉及 AI 时）→Java client/业务接口→前端→文档与联调证据。

## 7. 待确认问题及不能误算为后端完成的内容

| 待确认项 | 需要的决定/证据 | 确认前的处理 |
| --- | --- | --- |
| 财务金额与税口径 | 工作台三种金额的权威来源、币种/税分组、贷项 `taxBasis` 目前是金额字符串的命名/兼容；退款/抵扣会计事实 | 不混币种合计、不把 INCLUDED/EXCLUDED 填入金额字段、不用缺失当零；不擅自新增暂缓验收范围 |
| 分批签收与售后关闭 | 是否允许部分出库就登记；补签/纠错/争议命令、关闭检查标识来源、全部 AR/REQUIRED 标记获取 | 不能用当前整单全发限制缩减 PRD 异常链；缺契约继续阻断 |
| 仓库与主数据归属 | 产品清除关联是否需要；供应商归属/ID映射，trace/procurement/default/status 字段默认和可编辑范围 | 关联/替换可用，取消不假成功；不以名称/编码猜 ID |
| 风险枚举与 SLA | 风险事件采用短值还是完整值及存量迁移；SLA 多选/升级/渠道及实际送达语义 | 按字段冻结后迁移，不全模块替换风险值；不恢复已退役 outreach 写入口 |
| 授权及会话 | 真实权限目录、账号映射、授权草稿/复核/发布/撤销、jti 选择来源及即时失效 | 不因平台快照有角色就认定完整 IAM 治理；岗位不等于角色 |
| 工作台与异步时效 | 租户时区来源、KEY/ALL 目录、游标快照一致性、阈值/逾期及异步 SLA | 按 PRD 已冻结刷新与过期规则执行；缺来源时间不可伪造，待定项不可默认通过 |
| 邮件安全与投递 | 当前 email/code 协议维持或版本化迁移；真实 provider 配置、回执与多实例一次性消费 | 通用受理不代表邮件送达；不自动切 token-only |
| PRD 与历史补丁冲突 | 例如早期产品仓库必填文本与后续用户确认“新增可不关联”；剩余能力的条目/接口映射 | 明确有效修订并同步需求/技术基线；本交接文件不自动改写 PRD |

前端仍需完成的工作：RMA/签收异常续办与销售关闭办理、核销/冲销写办理、未迁移的随机幂等键命令及完整 409 差异处理、Excel 支持、部分来源 focus 定位、手工入库/生产独立能力/分析/反馈等剩余页面动作。后端能力就绪不等于这些页面已经完成。

用户已明确隐藏人员考勤/排班及其监控指标；员工档案只展示/搜索，不恢复新增/导入/导出。相关后端路由存在不构成前端新增入口要求。

## 8. 最终签收门槛与交付清单

后端每个 B 项交付：修复提交/部署版本、正式 OpenAPI 与样例、数据库/事件映射、正反例及并发/幂等自测、迁移或历史数据修复方案（如有）、真实依赖配置状态、对应 AC/E 用例的证据。修复状态至少区分“待修复/待冻结/后端自测通过/待前端接入/待真实联调/验收通过”，不能以“已加接口”直接关闭。

整体签收必须同时满足：

1. PRD 必验能力全部有映射且已交付，所有阻断解除；范围疑问有明确确认，不能因“缺接口”改为通过。
2. 页面→真实 API→当前实际数据库→刷新/新会话回读一致；数量、余额、源单、状态、版本、关联事实、事件均正确。
3. 低权限、跨租户、职责分离、并发、重放、超时、失败回滚/补偿、过期来源等反例通过。
4. 无业务 localStorage 事实、硬编码经营值、样例曲线和虚假完成；默认态正确，禁用入口不能被误算为功能交付。
5. E-01～E-07、AC-01～AC-12及 PRD 其余必验用例均有证据；性能在约定容量下通过。任一关键链阻断，整体结论保持“未完成联调”。

## 9. 复核来源

- [前端接口对齐实施记录](2026-10-17-frontend-integration-execution-report.md)：本次已完成内容、测试边界与残余前端任务。
- [前端接口对齐方案与实施计划](2026-10-17-frontend-integration-implementation-plan.md)：B-01～B-12、FE 任务及原始差异矩阵。
- [PRD](../01%20需求规格说明书-工业AI平台-V2.1.0-PRD.md)：工作台 §7.2、销售/库存/生产/采购、财务 §7.7.5、权限、§10 与验收条目。
- [技术设计](../02%20技术设计说明书-工业AI平台-V2.1.0.md)、[通信契约](../api-contract.md)、[路由清单](../openapi/backend/v1/route-inventory.json)、[销售售后正式契约](../openapi/backend-prd-v1.yaml)及模块契约。
- 源码定位：`WorkbenchController.java` 的 dashboard；`SalesAftercareService.java` 的 approve/createCreditNote/close/createReceipt/completionMissings；`FinanceController.java` 的 createAllocation/confirmPayment/reversePayment；`ProductionService.java` 的 allocationPreview/createCompletion；`PlatformController.java` 的 permissions/audits；`PlatformService.java` 的 syncAdapter；`AuthController.java` 的 login/forgotPassword/resetPassword。
- 持久化定位：`JdbcFulfillmentStore`、`JdbcProductionStore`、`JdbcFinanceStore`、`JdbcJsonCollections`、`JdbcModuleStoreSupport`。本文依据源码复核，不冒充已经取得运行环境数据库证据。
