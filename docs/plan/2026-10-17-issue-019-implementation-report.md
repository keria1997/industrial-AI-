# 生产 BOM 阻断恢复前端实施与验收报告

> 日期：2026-10-17
> 关联：[实施方案](2026-10-17-issue-019-root-cause-and-frontend-plan.md)、[ISSUE-024（原 ISSUE-019）](../issues/ISSUE-024-生产BOM阻断与Toast过短.md)
> 结论：方案内前端修复已实施，本地真实页面/API/数据库闭环通过；不代表原部署需求的数据问题已解决。

## 1. 交付

| 内容 | 实施结果 |
| --- | --- |
| 契约及需求 | 新增 `docs/openapi/backend/v1/production-bom-demand.yaml`，同步 PRD、技术文档；复用正式 BOM 发布及需求校验，不新增后端代码 |
| 阻断恢复 | 持续展示并换行显示原因；按维护权限进入正式 BOM 配置，携带真实产品 ID；返回原筛选、定位原需求并读取最新版本，等待用户重新校验 |
| 主数据与发布 | 正式产品/物料/仓库/工作中心选择器；显示与提交 ID 分离；字段校验、权限、完整集合检查和异常重试；无示例或本地业务事实回退 |
| 命令可靠性 | 校验请求 `{}`；保留租户、认证、版本和双幂等头；防连点、迟到响应隔离、冲突回读、发布不确定结果核对与原请求重试 |
| 暂缓与提示 | 两处暂缓占位入口禁用并说明原因；生产 Toast 完整 5 秒，替换/关闭/卸载/身份切换清理计时器；共享提示兼容原入参和其他模块时长 |

## 2. 自动验证

执行目录为仓库的 `frontend/`。

| 命令 | 结果与边界 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run test:frontend` | 36 个文件、224 条测试通过 |
| `npm run build` | 通过；仍有既有大于 500 kB 的 bundle 提示，未在本轮拆包 |
| `node tests/productionBomRecovery.e2e.mjs` | 11 组通过；覆盖无 BOM/工艺阻断、稳定 ID、返回重校验、冲突、未知结果/响应丢失、读取失败、权限、移动布局和真实 Toast hook 时序。API 拦截仅在测试脚本中，不作为数据库证据 |
| `node tests/productionBomRecovery.live.e2e.mjs` | 本地真实链路通过；无请求拦截，SQL 只读，使用既有隔离测试租户；经正式 API 创建专用产品和需求，页面执行校验/发布/返回/重校验 |
| `node tests/numericDraft.e2e.mjs` | 额外回归失败，停止于销售快速开单的“所选发货仓库不可用”，未运行到其 BOM 段；不能声称全模块数字回归通过。生产数字约束由独立规则单测及本次专用浏览器用例验证 |

受控脚本及真实脚本均无浏览器运行异常。真实脚本需要本地 `.env.local` 数据库配置和 `ISSUE019_LIVE_STATE` 指向的隔离租户凭据文件，默认路径见脚本；凭据不入库。不以其他环境的凭据静默回退。

## 3. 真实链路证据

环境：前端 `http://127.0.0.1:5173`，现有后端 `http://127.0.0.1:8081`，PostgreSQL `industrial_ai`。租户 `TENANT-C561AA20` 为既有联调隔离企业；未操作原部署环境。

本次复测：

- 产品 ID `aea575b3-dac9-47d9-a2ca-4d18e6e436cd`，与显示编码不同。
- 需求 ID `3a60ed2d-971f-4822-a26d-d306a3de90f0`。
- BOM ID `bdef4701-efa2-49b2-ab23-f791ebc2eb3a`。
- 首次页面校验：数据库需求为 `BLOCKED v2`，包含“缺少服务端生效 BOM”，同产品无 BOM。
- 页面发布：API 与 `module_document` 中 `production/bomSnapshot` 的 ID、版本、物料行、内嵌工艺完全一致，状态 `EFFECTIVE v1`；此时数据库需求仍为 `BLOCKED`。
- 返回并主动重新校验：请求体 `{}`，版本头为 `"2"`；页面、API、数据库为 `PENDING_REVIEW v3`，原因清空，强刷新保持一致。

本机原始记录：`/tmp/industrial-ai-issue019-controlled/report.json`、`/tmp/industrial-ai-issue019-live/report.json`。截图位于相同真实报告目录及 `/tmp/industrial-ai-issue019-mobile.png`；临时证据不包含在 Git 提交内。

## 4. 遗留与验收限制

1. 原部署需求 `DM-MVCBRHE4D10A` 不在当前隔离租户可见范围。需要在原环境以相同租户核对需求 `productId`、BOM/工艺记录、发布历史及部署版本，不能断言缺 BOM 或已修好。
2. 当前需求暂缓/恢复尚无冻结状态机与接口，本轮修复入口表达，未实现该业务能力。
3. 后端目前对产品/工厂启用状态仍接受显式 `false` 作为附加阻断；去掉前端四项 `true` 不意味着这些权威校验已经由后端补齐。角色是否拥有跨模块主数据查询权限也需按实际授权配置验收。
4. 额外数字回归的销售问题：夹具仓库 `id=w1`、`code=WH-NUM`，页面选择值为 `WH-NUM`；快速开单传入转换后的 `warehouseId/warehouse` 选项，而 `quickSalesOrderInput` 按 `id/code` 查找，导致请求发送前被拒绝。该结论基于受控回归与代码，不代表原部署所有销售订单均失败；本次未改销售业务代码。
5. 切换身份的 Toast、命令作用域和卸载保护有实现；受控测试的权限会话、Toast 旧回调/卸载已验证，未穷举所有页面级身份切换时序或所有 HTTP 错误码。生产权限与数据范围仍以后端为准。
