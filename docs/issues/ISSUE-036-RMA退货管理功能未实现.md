# ISSUE-036：RMA 退货管理功能未实现

- 级别：P1
- 模块：销售管理
- 层级：L1 业务域层
- 影响范围：前端、后端
- 状态：🔴 待修复

## 问题

销售管理 → 退货管理页签显示黄色警告横幅：

> 可查询退货记录。退货办理暂不可用，原出库行、检验、回入库和红字 AR 的业务校验待完善。金额缺少币种时显示"-"。

"创建 RMA"按钮可见但处于空态（无出库数据时合理禁用），且退货办理的完整流程（申请→审批→检验→回入库→红字AR→关闭）未实现。

## 原因

后端 `POST /api/v1/fulfillment/rmas` 等 RMA 相关 API 存在但**业务校验逻辑未完善**（原出库行关联、检验结果录入、回入库联动、红字 AR 生成的前置校验缺失）。前端 RmaManagementPanel 组件已创建但提交和流转操作未对接后端。

## 方案

| 修改层面 | 文件 | 具体改动 |
|---|---|---|
| 后端 | `backend/src/main/java/com/wanshen/platform/fulfillment/` | 完善 RMA 状态机（REQUESTED→APPROVED→INSPECTING→RESTOCKED→CLOSED）的业务校验 |
| 后端 | 同上 | 实现 RMA 关联原出库行 → 检验 → 回入库 → 红字 AR 联动 |
| 前端 | `frontend/src/features/sales/components/RmaManagementPanel.tsx` | 对接后端 RMA API（列表/创建/审批/检验/关闭） |

## 验收标准

1. 创建 RMA 后数据持久化到数据库
2. RMA 状态机逐步推进
3. 合格品回入库后库存增加
4. 红字 AR 自动生成并关联原 AR

## 进展

🔴 待修复
