# 销售履约接口更新影响与待确认问题

- 记录日期：2026-10-17
- 检查基线：`0873e93`（`feat: implement PRD sales aftercare APIs`）
- 状态：暂存，待后端确认及后续安排；不代表已修复。
- 层级：L1 业务域层
- 影响范围：前端, 后端
- 检查方式：接口文档与当前前端消费方式静态对照，必要时核对后端实现；未执行本轮业务写入、数据库一致性或运行时验收。
- 本清单仅记录问题和影响，不授权修改前后端代码。

## 1. 检查范围与结论

正式契约：[api-contract.md §4.1.1](../api-contract.md)、
[backend-prd-v1.yaml](../openapi/backend-prd-v1.yaml)。

本次更新主要涉及销售退货、客户签收、订单完成关闭、销售监控和 SLA。
现有查询路径保留，但字段和数据状态需要适配；新增办理入口仍有契约与实现问题需要澄清，不能仅替换 URL 后直接开放。

## 2. 实施前问题清单

### B-01【阻断】审批驳回枚举与状态校验冲突

- 位置：[契约 RmaTransitionRequest](../openapi/backend-prd-v1.yaml)；[SalesAftercareService.java](../../backend/src/main/java/com/wanshen/platform/fulfillment/SalesAftercareService.java)，基线第 139–152 行。
- 问题：契约规定 `decision=REJECT`，实现判断 `REJECTED`；进入分支前又要求目标状态为 `APPROVED`，与驳回目标 `REJECTED` 冲突。
- 影响：前端按契约提交驳回，也无法正常进入驳回分支。
- 修改建议：后端统一 decision 枚举及迁移校验，分别验证审批通过、驳回和非法组合；契约同步说明制单人与审批人分离要求。
- 验证状态：静态确认代码矛盾，未实际提交审批。

### B-02【阻断】部分签收缺少后续办理契约

- 位置：[签收契约](../openapi/backend-prd-v1.yaml)；[SalesAftercareService.java](../../backend/src/main/java/com/wanshen/platform/fulfillment/SalesAftercareService.java)，基线第 316–375 行。
- 问题：创建签收可产生 `PARTIALLY_SIGNED` 或 `DISPUTED`；已有签收聚合时再次提交返回 `RECEIPT_409_ALREADY_SIGNED`，提示使用签收更新接口，但本次契约未提供更新或争议解除接口。
- 影响：部分签收后的补签、差额登记及争议处理没有明确入口，无法据本次契约验证订单最终关闭闭环。
- 修改建议：明确补签、拒收、破损与争议解除的业务动作、权限、版本、幂等和数量累计规则，并发布对应接口。
- 待确认：是否已有其他正式接口覆盖上述动作；若存在，需在契约中引用。

### B-03【严重】新增写操作权限检查不完整

- 位置：[SalesFulfillmentController.java](../../backend/src/main/java/com/wanshen/platform/controller/SalesFulfillmentController.java)；[SalesAftercareService.java](../../backend/src/main/java/com/wanshen/platform/fulfillment/SalesAftercareService.java)。
- 问题：当前调用链中，RMA 创建、签收登记、订单完成未见对应业务操作权限检查；RMA 状态迁移已有分动作权限。
- 影响：前端按钮权限与服务端授权可能不一致，不能仅凭前端隐藏入口保障操作边界。
- 修改建议：后端确认是否存在其他统一拦截机制，明确每个命令的权限码和数据范围，补齐缺失检查；前端依据最终矩阵控制入口。
- 验证状态：静态检查，尚未用无权限账号执行请求，不能视作已验证的越权利用。

### B-04【待确认】命令字段级契约与关闭检查标识未完整定义

- 位置：[backend-prd-v1.yaml](../openapi/backend-prd-v1.yaml)；[SalesAftercareService.java](../../backend/src/main/java/com/wanshen/platform/fulfillment/SalesAftercareService.java)，基线第 296–313 行。
- 问题：多个命令的成功响应只有描述、缺少响应 Schema；RMA 不同动作的条件必填字段未分别定义；关闭要求 `closureCheckId`，但未定义其获取方式。
- 影响：无法仅凭文档确定响应对象结构、表单校验及关闭操作参数来源。
- 修改建议：补齐请求和成功/失败响应 Schema，逐动作定义字段必填性、枚举和错误码；明确 `closureCheckId` 的生成、有效性及获取流程。

### B-05【待确认】新旧契约字段定义冲突

- 位置：[frontend-remediation.yaml](../openapi/frontend-remediation.yaml)、[backend-prd-v1.yaml](../openapi/backend-prd-v1.yaml)。
- 问题：旧契约仍定义 `creditArId/creditArAmount` 和顶层签收数量，与新契约不同。
- 影响：开发、类型生成及测试可能继续采用旧字段。
- 修改建议：统一契约来源，更新旧文档或显式标记失效范围；明确历史持久化记录的兼容规则。

## 3. 前端影响及后续适配清单

| 编号 | 分类 | 位置 | 问题与影响 | 后续建议 |
| --- | --- | --- | --- | --- |
| F-01 | 严重 | `frontend/src/api/sales-aftercare.ts`；`RmaManagementPanel.tsx` | 仍读取 `creditArId/creditArAmount`；新记录返回 `creditNoteFinanceId/creditNoteAmount`，有贷项也可能显示“-” | 更新 DTO 和展示映射，明确历史字段兼容；金额不得从数量推算 |
| F-02 | 严重 | `frontend/src/api/sales-aftercare.ts`；`CustomerReceiptPanel.tsx` | 仍读取顶层 `signedQty/rejectedQty/damagedQty`，新记录数量在 `lines[]`，展示可能为“-” | 按完整明细展示；如需汇总，先明确计量单位和缺失处理，不将缺失默认为零 |
| F-03 | 严重 | `frontend/src/api/fulfillment.ts`；`SalesMonitorFacts.tsx` | `EMPTY` 可返回空来源时间和版本，被前端判为“数据待核实”；未处理 `metricCompleteness=INCOMPLETE` | 区分空数据、不完整、不可用；冻结各指标显示规则，避免将不完整金额视作正式总额 |
| F-04 | 功能补齐 | `RmaManagementPanel.tsx`；`CustomerReceiptPanel.tsx` | 当前仍为只读页面，新创建/迁移/登记接口未接入 | 先解决 B 类问题，再补来源出库行、证据、各动作表单、权限和错误处理；不恢复本地模拟业务事实 |
| F-05 | 功能补齐 | `frontend/src/App.tsx`，订单“完成关闭”入口 | 新增 complete-check/complete，前端仍禁用 | 展示缺失条件，满足后显式提交，携带版本与幂等键；签收不等于订单完成，成功后重新获取来源事实 |
| F-06 | 功能补齐 | `frontend/src/App.tsx`，销售基础数据“自动化触达规则” | 当前为待确认订单超时天数、对象/渠道多选的未保存草稿；新契约为监听状态、小时阈值、单字符串对象/渠道和升级阈值 | 明确天/小时转换、多选组合、对象/渠道枚举及升级规则，接入 SLA 查询和保存，替换“缺少契约”提示 |

补充展示影响：交期风险明细新增 `orderNo/overallStatus/severity/overdueDays`，前端当前主要展示 `orderId`。
展示编号宜使用 `orderNo`，跳转继续使用稳定 `orderId`；旧类型中的风险行 `totalAmount` 不属于本次新定义的风险字段。

## 4. 影响边界与其他观察

1. 旧退货、签收写路径及 `GET/PUT /api/v1/platform/outreach-settings` 已被声明返回 `410 SALES_410_LEGACY_COMMAND_RETIRED`。当前前端未调用这些旧办理接口，不能据此判断现有查询全部失败。
2. SLA 通知和事件落库不等于短信、企微或站内信实际送达；后续验收应区分规则保存、扫描生成、渠道投递及送达状态。
3. 本次契约没有补齐产品 `defaultWarehouseId` 的读写；产品新增/编辑无法选择默认仓库仍是独立未解决问题，详见[技术设计说明书 §10.4.1](../02%20技术设计说明书-工业AI平台-V2.1.0.md)。
4. 本次销售监控更新没有提供完整的报价转化趋势与 AI 预测数据源，不能据此宣布所有 AI 卡片和趋势图已完成。
5. 同次提交调整了忘记密码响应，移除开发验证码等字段；当前前端仅依赖 `message`，响应结构基本兼容。真实邮件配置、送达及重置流程尚未验收。
6. 本次新增销售履约路径不代表其他模块接口版本迁移，不能批量替换现有销售订单 CRUD、生产、采购和财务接口路径。

## 5. 建议处理顺序

1. 后端澄清并修正 B-01 至 B-05，冻结字段、动作、权限和历史兼容规则。
2. 优先修复 F-01 至 F-03 的现有查询展示适配。
3. 根据最终契约补齐 F-04 至 F-06 的办理与配置交互。
4. 验证请求版本、幂等重试、权限、数量和金额边界，并进行“数据库事实 → API 返回 → 页面展示”的一致性验收。

后续解决时应逐条补充处理结论、验证依据和对应提交，保留本次基线记录，不以接口已发布替代端到端验收。
