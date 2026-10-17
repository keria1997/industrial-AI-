# ISSUE-029：工作台提示数据已失效且来源显示 undefined

- 级别：P1
- 模块：工作台
- 层级：L4 基础层
- 影响范围：前端, 后端
- 状态：🔴 待修复

## 问题

工作台页面显示：
1. 绿色徽标"数据已失效"，搜索栏旁提示"数据已失效，请刷新"
2. 来源警告包含 `undefined`：`SalesOrder： undefined； RevenueRecognition： undefined； ShipmentRecognition： undefined； 消息管理： undefined`
3. 指标区域显示"暂无岗位指标——当前岗位暂无可统计的业务事实"
4. 点击刷新按钮后上述状态不变

复现步骤：登录 → 进入工作台 → 观察页面

## 原因

### 子问题 1：来源警告 undefined（关联 ISSUE-020 回归）

后端 `WorkbenchController` 返回的 `data.sources` 数组中，每个来源条目缺少 `status` 字段。前端 `workbenchProjection.ts` 过滤条件 `source.status !== 'AVAILABLE'` 对 `undefined` 值全部命中，拼接后输出 `undefined`。

ISSUE-020 已修复此问题（后端添加 `status` 字段），但当前部署环境仍返回 `undefined`，说明修复代码未部署或被覆盖。

### 子问题 2：数据已失效（关联 ISSUE-021 未修复）

后端返回 `dataAsOf`（业务数据最后变更时间）和 `generatedAt`（API 响应时间）。前端 `workbenchProjection.ts` 优先使用 `dataAsOf` 计算新鲜度。数据库无业务数据变更时 `dataAsOf` 不变，刷新后 `age` 仍 > 1800 秒，"数据已失效"持续显示。

ISSUE-021 已定位根因并给出修复方案（`workbenchProjection.ts` 将 `data.dataAsOf || data.generatedAt` 改为 `data.generatedAt || data.dataAsOf`），但尚未实施。

### 子问题 3：暂无岗位指标

后端返回 `data.metrics` 中 `revenue` 为 undefined（无出库数据导致收入指标被跳过），前端正确显示"暂无指标"。这是正确行为（缺失不伪造），但来源警告的 undefined 加剧了用户困惑。

## 方案

| 修改层面 | 文件 | 具体改动 |
|---|---|---|
| 后端 | backend/src/main/java/com/wanshen/platform/WorkbenchController.java | 确保 `sources` 数组每个条目包含 `status` 字段（`AVAILABLE` 或 `SOURCE_PENDING`） |
| 前端 | frontend/src/api/workbenchProjection.ts | 第 22 行：`generatedAt: data.generatedAt \|\| data.dataAsOf`（优先 API 响应时间） |
| 前端 | frontend/src/api/workbenchProjection.ts | `sourceWarnings` 过滤条件改为 `status === 'UNAVAILABLE'`（SOURCE_PENDING 不进警告） |

## 验收标准

1. 刷新工作台后"数据已失效"消失
2. 来源警告不再包含 `undefined`
3. SOURCE_PENDING 状态的来源不显示为警告（可改为提示或隐藏）
4. 有业务数据后指标卡片正常显示数值

## 进展

🔴 待修复
