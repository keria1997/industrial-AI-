# 需求验收缺陷记录（2026-07-25）

## BUG-QA-20260725-001 登录后角色在刷新前后不一致

| 项目 | 内容 |
| --- | --- |
| 状态 | 开发已修复，待 QA 复验 |
| 严重级别 | P1 / 高 |
| 涉及需求 | UC-001、UC-002、P0-001、权限菜单 |
| 影响 | 用户看到的工作台指标、菜单和权限范围随刷新变化，可能造成错误的权限认知 |

**复现步骤**

1. 清除既有会话或正常退出。
2. 使用手机号 `13800138000` 和演示验证码 `2606` 登录。
3. 观察当前角色为“老板 · 经营驾驶舱”。
4. 刷新页面。
5. 观察角色变为“超级管理员 · 平台治理台”，平台管理菜单随之出现。

**实际结果**：登录回调只更新 `currentUser`，运行时 `activeRole` 仍保留 Provider 首次渲染时的默认“老板”；刷新后才从会话中的 `role: 超级管理员` 初始化。

**期望结果**：登录成功时即使用会话角色初始化运行时，刷新前后角色、菜单和数据范围一致。

**代码证据**：`src/app/AppRuntimeProvider.tsx` 的 `activeRole` 只在首次初始化读取用户；`src/App.tsx` 的 `handleLogin` 未同步调用 `setActiveRole`。

**修复建议**：把登录会话、当前角色和租户作为同一运行时状态提交；补充“无会话登录后立即取角色”和“刷新恢复角色”的组件/E2E 测试。

**开发修复（2026-07-26）**：账号登录已改用 `/api/v1/session/login` 签名会话；`AppRuntimeProvider` 通过 `resolveSessionRole` 同步新登录和恢复会话的角色，登录提交同时设置当前角色。新增运行时角色一致性测试。浏览器联调期间发现 5185 为过期进程并登记 `BUG-DEV-20260726-009`，当前接口已恢复返回“超级管理员”会话。

**修改范围**：`server/src/auth.ts`、`server/src/app.ts`、`src/api/session.ts`、`src/app/AppRuntimeProvider.tsx`、`src/App.tsx`、`server/test/session-auth.test.ts`、`src/app/tests/runtimeAccessibility.test.tsx`。

## BUG-QA-20260725-002 进入生产失败后 URL 与页面内容不一致

| 项目 | 内容 |
| --- | --- |
| 状态 | 开发已修复，待 QA 复验 |
| 严重级别 | P1 / 高 |
| 涉及需求 | UC-100、TASK-ARCH-001、路由恢复、无权限访问 |
| 影响 | 用户看到工作台但地址仍表示生产页，复制链接或刷新时行为不可预测 |

**复现步骤**

1. 使用未分配生产工厂范围的演示手机号登录并刷新。
2. 进入销售管理，依次点击“提交订单审批”“审批通过并校验库存”。
3. 在库存节点点击“库存不足，生成 MPS/MRP”。

**实际结果**：页面回到工作台，地址栏保留 `?production=dashboard`；本次流程没有稳定展示生产页或一致的无权限页。

**期望结果**：有权限时进入生产 MPS/MRP；无权限时显示明确、可持续的无权限状态，并使用 `replace` 将 URL 同步为工作台或专用 forbidden 路由。

**修复建议**：权限判断前不要挂载会写入生产查询参数的旧组件；路由守卫使用单一重定向动作原子更新页面状态和 URL；补充跨模块路由 E2E。

**开发修复（2026-07-26）**：生产权限守卫统一调用 `setActiveModule('工作台', { replace: true })`，由集中路由清理 `module` 与 `production` 所属查询参数，页面和地址同步回到工作台。新增生产守卫 URL 清理测试。

**修改范围**：`src/App.tsx`、`src/app/routing.ts`、`src/app/tests/routing.test.ts`。

## BUG-QA-20260725-003 生产主入口仍为旧版且未接生产 API

| 项目 | 内容 |
| --- | --- |
| 状态 | 已修复（用户批准保留旧版 UI 布局并接入正式 API） |
| 严重级别 | P0 / 阻断 |
| 涉及需求 | TASK-FE-001~004、UC-020~029、TASK-QA-002 |
| 影响 | 生产正式后端无法通过页面使用，需求到结案无法形成真实端到端交付 |

**实际结果**

- `ProductionManagementV2` 已导入，但主应用仍渲染 `LegacyProductionManagement`。
- 旧版生产把 MPS、需求、MRP、工单、报工和质量数据保存到 `localStorage`。
- `src` 中没有 `/api/v1/production` 调用。
- MRP/APS 页面动作仍是本地演示，不代表任务消费者或求解器执行成功。

**期望结果**：主入口只渲染 V2；需求、工单、报工、FQC、完工、结案、任务和 KPI 通过正式 API 读取和提交；具备加载、空、错、无权限、幂等和版本冲突状态。

**修复建议**：先完成类型安全 API client 和可信上下文，再切换 V2 入口；移除旧版入口和生产 `localStorage` 事实；补齐组件/API client 测试与生产核心 E2E 后再验收。

**开发修复（2026-07-26）**：主入口已切换为 `ProductionOperations`，旧版页面没有生产导航入口。操作台使用签名 Bearer 会话和租户上下文读取 KPI、需求、工单、FQC、完工与按 ID 查询的计划任务，并提交需求、工单、报工、FQC、完工及 MRP/APS 任务创建命令。MRP/APS 页面明确显示任务仅为 `RUNNING` 记录，不宣称求解完成。

**修改范围**：`src/features/production/pages/ProductionOperations.tsx`、`src/api/client.ts`、`src/api/production/operations.ts`、`src/App.tsx`、`src/app/tests/productionOperationsApi.test.ts`。

**保留边界**：MRP/APS 求解 Worker、Outbox 发布 Worker、真实 WMS Adapter、结案和返工/报废完整页面仍未完成，不属于本缺陷可误报为已交付的范围。

**回退记录（2026-07-26）**：用户确认需要恢复截图所示变化前的生产管理版本，主入口已从 `ProductionOperations` 恢复为 `LegacyProductionManagement`。正式 API 作业台与客户端代码保留但不再挂载；因此本缺陷重新开放，后续只有再次明确批准切换入口并完成验收后才能关闭。

**二次修复（2026-07-27）**：用户批准切换到正式 API 版本，但要求保留现有前端布局和风格不做大改。采用"旧版 UI + 正式 API"集成方案：保留 `LegacyProductionManagement` 组件的完整界面与交互布局，在组件内部接入 `productionOperationsApi` 正式客户端。

具体改动（均在 `src/App.tsx` 的 `LegacyProductionManagement` 组件内）：

1. 新增 `formalCtx`（基于 `currentUser.accessToken` 和 `currentTenant.id` 构建可信 API 上下文）。
2. 新增 `mapFormalWorkOrder` 和 `mapFormalInspection` 映射函数，将正式 API 返回的 `WorkOrderDto`/`InspectionDto` 转换为旧版 UI 数据结构，保留原有字段（`id`、`product`、`quantity`、`status`、`kitting`、`completedQty` 等），同时携带 `formalOrder`/`formalInspection` 原始 DTO 供后续操作使用。
3. 新增两个 `useEffect` 分别调用 `productionOperationsApi.listWorkOrders` 和 `listInspections` 加载正式数据，与 `localStorage` 演示数据合并（正式数据优先，保留非正式演示工单）。
4. `handleCheckKit`：对正式工单调用 `releaseImpact` API 进行下达预检，返回 `blockers` 时阻止下发。
5. `handleDispatch`：对正式工单调用 `workOrderCommand(release)` 下发车间，使用返回的最新 `WorkOrderDto` 更新工单和工序任务的 `formalOrder` 引用（保证后续报工版本号正确）。
6. `handleReportJob`：对带 `formalOrder` 的工序任务调用 `submitReport` 提交正式报工，同时保留本地状态更新确保 UI 即时响应。
7. `handleQcComplete`：对正式检验单调用 `passInspection` 登记合格结果，同步更新本地质量状态。
8. `handleConfirmInbound`：对正式检验单调用 `createCompletion` 提交完工入库，返回 `taskId` 等待 WMS 确认。

所有非正式工单（演示数据）的操作路径保持不变，确保向后兼容。TypeScript 类型检查零错误，89 项单元测试全部通过，Vite 生产构建 1599 模块成功。

## BUG-QA-20260725-004 侧栏与 AI 助手不满足可访问性要求

| 项目 | 内容 |
| --- | --- |
| 状态 | 开发已修复，待 QA 复验 |
| 严重级别 | P1 / 中 |
| 涉及需求 | UI 设计要素、NFR-005、通用可访问性 |
| 影响 | 键盘和辅助技术用户无法可靠切换模块或识别 AI 助手图标操作 |

**实际结果**

- 侧栏 12 个模块项和用户入口使用可点击 `div`，没有 `role`、`tabIndex` 或键盘事件。
- AI 助手关闭、上传和发送 3 个图标按钮没有可访问名称。

**期望结果**：导航使用语义化 `button`/链接并支持焦点、Enter 和 Space；每个图标按钮提供准确的 `aria-label` 或 `title`。

**代码证据**：`src/App.tsx` 的 `SidebarItem` 使用 `div onClick`；AI 助手图标按钮仅渲染 Lucide 图标。

**修复建议**：改用语义化元素，保留可见焦点样式；为按钮增加“关闭 AI 助手”“上传附件”“发送问题”等名称，并添加键盘回归测试。

**开发修复（2026-07-26）**：侧栏模块项和用户菜单入口已改为语义化 `button`，提供当前页语义和可见焦点；全局及工业 AI 助手的关闭、上传、发送按钮与输入框均补充准确无障碍名称和焦点样式。新增侧栏语义测试。

**修改范围**：`src/app/SidebarItem.tsx`、`src/App.tsx`、`src/app/tests/runtimeAccessibility.test.tsx`。

## 开发验证汇总（2026-07-26）

| 检查 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| 自动化测试 | 11 个测试文件、45 项测试通过；服务端 20 项、前端 25 项 |
| 生产构建 | 通过；主 JS 742.76 kB、gzip 185.79 kB |
| 变更格式 | `git diff --check` 通过 |
| 浏览器 | 会话接口 404 已排除；生产入口已按用户要求恢复旧版，待完成旧版页面回归 |
