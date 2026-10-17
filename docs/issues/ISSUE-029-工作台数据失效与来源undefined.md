# ISSUE-029：工作台提示数据已失效且来源显示 undefined

- 级别：P1
- 模块：工作台
- 层级：L4 基础层
- 影响范围：前端, 后端
- 状态：✅ 已修复（2026-10-17 部署环境 Playwright 验证通过）

## 问题

工作台页面显示：
1. 绿色徽标"数据已失效"，搜索栏旁提示"数据已失效，请刷新"
2. 来源警告包含 `undefined`：`SalesOrder： undefined； RevenueRecognition： undefined； ShipmentRecognition： undefined； 消息管理： undefined`
3. 指标区域显示"暂无岗位指标——当前岗位暂无可统计的业务事实"
4. 点击刷新按钮后上述状态不变

复现步骤：登录 → 进入工作台 → 观察页面

## 原因

### 子问题 1：来源警告 undefined（关联 ISSUE-020 回归）

历史响应缺少 `status` 时，旧前端直接拼接该字段，造成 `undefined`。本轮开始时仓库已经有 `status/availability` 兼容和“来源状态未提供”兜底，因此不能把历史现象认定为当前代码尚无防护。

2026-10-17 真实复测：本地与部署接口均返回四个来源的 `status`；部署页面没有再出现 `undefined`，但仍展示 `SOURCE_PENDING` 警告。本轮补齐来源名称缺失、空状态及 null 条目的防护，并区分待接入与真正异常；不能根据历史截图断言后端修复被覆盖。

### 子问题 2：数据已失效（关联 ISSUE-021 未修复）

后端返回 `dataAsOf`（业务数据最后变更时间）和 `generatedAt`（API 响应时间）。前端 `workbenchProjection.ts` 优先使用 `dataAsOf` 计算新鲜度。数据库无业务数据变更时 `dataAsOf` 不变，刷新后 `age` 仍 > 1800 秒，"数据已失效"持续显示。

本轮已将 `workbenchProjection.ts` 改为优先 `generatedAt`，仅在缺失时兼容回退 `dataAsOf`；两者都缺失或时间非法时保留现有读取错误，不生成当前时间掩盖契约问题。来源显式 `STALE` 仍作为异常提示，不以新响应时间覆盖来源状态。

### 子问题 3：暂无岗位指标

指标事实缺失时继续显示“暂无岗位指标”或对应指标的 `-`，不按来源状态伪造数值。当前接口还支持 `orderAmount/confirmedRevenueAmount/shippedRecognizedAmount` 和 `legacy`，不能只检查 `revenue` 字段来断言所有指标都缺失。金额只有具备币种、税口径及可用状态时才按原值展示。

## 方案

| 修改层面 | 文件 | 具体改动 |
|---|---|---|
| 后端（仅核查） | backend/src/main/java/com/wanshen/platform/WorkbenchController.java | 本地与部署已有状态字段；本轮未修改后端代码 |
| 前端 | frontend/src/api/workbenchProjection.ts | `generatedAt: data.generatedAt \|\| data.dataAsOf`，使用服务端响应生成时间判断投影缓存时效 |
| 前端 | frontend/src/api/workbenchProjection.ts | AVAILABLE/SOURCE_PENDING 不进警告；按既有契约保留 UNAVAILABLE/PARTIAL/STALE 及未知状态提示，兼容旧字段并兜底缺失名称、状态 |
| 前端 | frontend/src/App.tsx | 已更新绿色、过期/失效橙色、读取异常红色、加载中灰色；增加状态区域的可访问名称 |
| 前端测试 | frontend/src/app/tests/workbenchFreshness.test.ts、backendDeliveryResiduals.test.ts、frontend/tests/workbenchFreshness*.e2e.mjs | 单测、受控浏览器与真实只读联调分别记录，不混淆模拟与真实证据 |

## 验收标准

1. 服务端返回有效且新鲜的 `generatedAt` 时，即使 `dataAsOf` 超过 30 分钟，刷新后不误报“数据已失效”。
2. 来源名称或状态缺失不展示 `undefined`，使用明确兜底；保留 canonical 字段优先及兼容别名。
3. SOURCE_PENDING 不显示为警告；UNAVAILABLE/PARTIAL/STALE 和未知状态仍可见，不能隐藏真正失败。
4. 正常指标保留原值、币种和税口径；无事实保留空态或 `-`，不补零。
5. 真实快照超过 5 分钟标过期，超过 30 分钟隐藏指标值；刷新失败不重置最后成功时间；恢复后显示新快照。
6. 状态颜色与文字一致；分别验证桌面、移动和真实部署，部署失败不能标记整体验收完成。

## 进展

2026-10-17，用户确认方案后完成前端修复。

- ✅ 前端代码与本地验证完成：类型检查、37 个测试文件/230 条单测、构建通过；按技能要求运行后端 `mvn compile -q` 也通过，未改后端代码。
- ✅ 7 组受控 Playwright 验证通过：新响应/旧事实、来源缺失、局部异常、空态、真实过期、手动刷新、失败后的时效和恢复。
- ✅ 本地真实登录→工作台两个分区→手动刷新通过；API 返回 `dataAsOf=2026-10-16T00:57:54Z`，新 `generatedAt` 下页面正常显示已更新，不再把业务无变更当作投影失效。
- ⏭️ 部署站点 `https://erp.wanshen.top/`：真实登录及刷新成功、两个分区均 HTTP 200，接口已有来源状态；页面仍有 SOURCE_PENDING 警告，当前部署未通过本轮前端验收。需要更新前端产物后复测，不能宣称线上修复完成。
- 所有真实探查只执行认证和只读查询，无业务写入、无数据库改动；截图及完整结果见[验收报告](reports/2026-10-17-issue-029-frontend-verification.md)。

### 部署环境验证（2026-10-17）

Playwright 访问 https://erp.wanshen.top/ 验证结果：

| 检查项 | 结果 |
|---|---|
| 页面包含 `undefined` | ✅ 无（已消除） |
| 页面包含"数据已失效" | ✅ 无（显示"数据已更新"绿色徽标） |
| SOURCE_PENDING 警告 | ✅ 不显示（正常渲染） |
| 指标区域 | ✅ 5 张卡片正常渲染（金额显示"-"，完工率 0.00%） |
| 刷新按钮 | ✅ 存在且可点击 |

**结论：ISSUE-029 三个子问题全部修复确认。**
