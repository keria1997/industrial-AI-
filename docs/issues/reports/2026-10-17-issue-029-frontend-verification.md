# ISSUE-029 前端修复与验证记录

日期：2026-10-17。关联 [ISSUE-029](../ISSUE-029-工作台数据失效与来源undefined.md)。

## 结论

前端代码修复及本地真实页面/API 验证通过。部署站点仍展示 SOURCE_PENDING 警告，部署验收未通过；本报告不把本地结果当作线上修复完成。本轮没有后端代码或数据库修改。

## 修改

| 文件 | 内容 |
| --- | --- |
| `frontend/src/api/workbenchProjection.ts` | 优先服务端 `generatedAt` 判断缓存时效，兼容缺失时的 `dataAsOf`；不注入客户端当前时间。SOURCE_PENDING 不进警告；保留 PARTIAL/UNAVAILABLE/STALE/未知状态，补齐来源名称、状态及 null 条目兜底，非数组来源响应明确失败 |
| `frontend/src/App.tsx` | 已更新、过期/失效、异常、加载分别使用绿、橙、红、灰色徽标；添加可访问状态区域 |
| `frontend/src/app/tests/workbenchFreshness.test.ts` | 6 个针对性用例覆盖新鲜度、别名优先级、来源状态分类、缺失字段和真实指标/空态 |
| `frontend/src/app/tests/backendDeliveryResiduals.test.ts` | 更新 SOURCE_PENDING 不进入警告的断言，保留真实异常断言 |
| `frontend/tests/workbenchFreshness.e2e.mjs` | 全部业务 API 拦截的受控浏览器回归，时钟推进验证过期和恢复 |
| `frontend/tests/workbenchFreshness.live.e2e.mjs` | 配置化站点和凭据，真实登录与只读分区查询/刷新；凭据不写入报告 |

## 白盒与构建

在 `frontend/` 执行：

- `npm run typecheck`：通过。
- `npm run test:frontend`：37 个文件，230 条通过。
- `npm run build`：通过；仍有既有大于 500 kB 的 bundle 提示，本轮未拆包。

按技能编译验证要求，在 `backend/` 执行 `mvn compile -q`：通过。只编译，未修改或重启后端。

## 受控浏览器验证

`node tests/workbenchFreshness.e2e.mjs`，7 组通过，无浏览器运行异常：

1. 业务截止时间较旧、响应生成时间新鲜：显示真实金额和已更新，不显示 SOURCE_PENDING 警告。
2. 缺失来源/状态有明确兜底；PARTIAL/STALE/UNAVAILABLE 及其原因仍可见。
3. 空指标响应清除旧金额，保留“暂无岗位指标”，不伪造零。
4. 成功快照实际超过 5 分钟、30 分钟分别过期/失效，使用橙色；失效指标显示 `-`。
5. 手动刷新准确重读指标和业务两个分区，恢复绿色状态。
6. 轮询查询失败后保留最后成功时间，红色显示异常；超过 30 分钟隐藏旧金额。
7. 查询恢复后状态与金额恢复，无运行异常。

本机证据：`/tmp/industrial-ai-issue029-controlled/report.json`、`fresh.png`、`expired.png`。模拟数据仅在测试中，不进入线上业务代码。

## 本地真实联调

执行 `node tests/workbenchFreshness.live.e2e.mjs`。页面 `http://127.0.0.1:5173` 使用现有本地后端 `8081`，无业务 API 拦截，无业务写入。

- 真实登录、两个分区查询、刷新完成，HTTP 200，`schemaVersion=1.1`。
- 响应 `generatedAt` 为本次生成时间，`dataAsOf=2026-10-16T00:57:54Z`；来源包含 AVAILABLE 和 SOURCE_PENDING。
- 页面显示“数据已更新”，无误报失效、无 undefined、无 SOURCE_PENDING 警告。
- 桌面 1440×1000、移动 390×844 截图完成，无浏览器运行异常。

本机证据：`/tmp/industrial-ai-issue029-live/report.json`、`desktop.png`、`mobile.png`。

## 部署真实探查与剩余动作

以 `FRONTEND_TEST_URL=https://erp.wanshen.top` 运行同一真实探查脚本，报告写入独立目录。

- 登录和手动刷新成功，两个分区均 HTTP 200；接口已有四个来源状态字段，不能认定后端仍缺少 status。
- 页面不含 undefined，但仍展示 SOURCE_PENDING 警告及绿色“数据已失效”徽标，脚本在警告验收条件返回失败；截图同时复现了失效误报和徽标颜色问题。
- 部署响应中 `generatedAt` 新鲜，`dataAsOf` 比它更早；页面完整观察记录及截图保存在下面的本机证据中。
- 当前未执行部署。需发布本轮前端构建产物后，重跑同一脚本，确认状态、警告和正常/缺失指标均符合验收要求，再关闭整项 Issue。

本机证据：`/tmp/industrial-ai-issue029-deployed/report.json`、`last-page.png`。这次失败是部署页面仍存在待修复表现，不计为本地回归通过。

凭据来自环境变量或本地 `.env.local`，未写入 Git；真实探查不提交业务命令，不直接操作数据库。本地未使用真实金额数据补造事实；数据库一致性全量核对不在本轮前端展示修复的验收范围。
