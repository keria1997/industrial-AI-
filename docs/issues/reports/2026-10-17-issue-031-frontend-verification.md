# ISSUE-031 前端验证报告

- 日期：2026-10-17
- 范围：仅前端岗位展示、认证字段类型、回归测试及 Issue 记录
- 结论：前端本地修复通过，部署页面缺失状态复测通过；后端 `displayPosition` 及实际岗位一致性待联调，整个 Issue 尚未关闭
- 关联：[ISSUE-031](../ISSUE-031-用户角色显示为老板.md)

## 修复内容

侧栏、工作台和个人信息改用独立的 `displayPosition` 展示实际主岗位，工作台视图名称另列。未提供岗位时明确显示“岗位信息未提供”，不把默认工作台角色组当作员工岗位。

认证响应沿用现有字段展开逻辑，增加类型声明以支持账号/短信登录、刷新及会话恢复。没有新增人员列表查询，没有按账号、名称或管理员权限推断岗位。工作台 `role` 分组、菜单权限与后端请求路径保持原有规则。

标量岗位仅用于当前唯一授权租户；多租户缺少归属契约时显示缺失状态，避免不同租户主岗位混用。

## 编译与单元验证

| 验证 | 结果 |
|---|---|
| `cd frontend && npm run typecheck` | 通过 |
| `cd frontend && npm run test:frontend` | 40 文件、256 项测试通过 |
| `cd frontend && npm run build` | 通过；Vite 仍提示既有产物超过 500 kB，未在本轮扩大范围处理 |
| `cd backend && mvn compile -q` | 通过；未修改后端代码 |

新增单元用例验证字段流转、旧会话兼容、新响应缺少岗位不沿用旧值、无效字段兜底、岗位与工作台组独立、管理员岗位不新增权限以及跨租户保护。

## Playwright 受控验证

命令：`cd frontend && node tests/userIdentity.e2e.mjs`。

| 场景 | 结果 |
|---|---|
| `role=老板`、岗位为租户管理员 | 侧栏/工作台显示主岗位，接口仍传老板分组；只有工作台权限时无平台菜单 |
| 个人信息 | 主岗位和工作台视图分列展示 |
| 页面刷新 | 正式会话结构中的岗位正确恢复 |
| 字段缺失、null、空白、错误类型 | 均显示“岗位信息未提供”，不沿用旧岗位 |
| 账号变化与未知角色 | 展示新岗位；工作台默认分组不冒充实际岗位 |
| 多租户无岗位归属 | 显示岗位缺失，不推断 |
| 移动端长岗位 | 正常换行，岗位徽标未超出视口 |
| 请求与运行状态 | 无业务写入、无浏览器运行错误 |

输出：`/tmp/industrial-ai-issue031-controlled/report.json`、`desktop.png`、`mobile.png`。脚本中的测试岗位为受控夹具，不代表后端已提供此字段。

## 本地真实只读联调

命令：`cd frontend && IDENTITY_TEST_MODE=live node tests/userIdentity.e2e.mjs`。

- 页面：`http://127.0.0.1:5173`，代理本地 Java 服务。
- 使用根目录 `.env.local` 配置的测试账号登录，不注入会话、不拦截接口、不提交业务数据。
- 当前真实响应：`role=超级管理员`，两个授权租户，未提供 `displayPosition`。
- 页面与真实响应一致展示“岗位信息未提供”；刷新页面仍一致，查询继续使用超级管理员工作台组。
- 3 组检查通过，无业务写入或浏览器运行错误。
- 输出：`/tmp/industrial-ai-issue031-live/report.json`、`desktop.png`。
- 未查询员工档案/数据库，未使用 `liyi` 构造岗位对比，因此实际岗位一致性仍待后端字段交付后验证。

## 部署环境探查

命令：`cd frontend && IDENTITY_TEST_MODE=live FRONTEND_TEST_URL=https://erp.wanshen.top IDENTITY_REPORT_DIR=/tmp/industrial-ai-issue031-deployed node tests/userIdentity.e2e.mjs`。

- 真实登录成功，响应同样未提供 `displayPosition`。
- 首次探查工作台可打开，但未找到新版“工作台用户主岗位”标识，脚本等待超时并返回非零退出码。
- 最终复测已出现主岗位标识，真实响应与侧栏/工作台缺失状态一致，刷新恢复正常，3 组检查通过；最终报告 `uiContract.hasPositionBadge=true`、`passed=true`。未核对部署产物版本，也不把缺失状态通过等同于真实员工岗位一致性通过。
- 无业务写入或浏览器运行错误。最终输出为 `/tmp/industrial-ai-issue031-deployed/report.json`，截图为 `desktop.png`、`last-page.png`，不记录密码或访问令牌。

## 后端交付及剩余验收

1. 登录、短信登录及刷新响应的 `user` 增加 `displayPosition`，来源为账号在所属租户中关联员工的主岗位名称；无档案/主岗位时返回 null 或不提供，不能硬编码。
2. 保留 `role`，不直接用任意员工岗位替换工作台已有角色组。本轮未改会话签发、权限规则或数据库。
3. 多租户账号需另外明确岗位归属及切换后的获取方式；当前前端对无归属的标量字段保持缺失状态。
4. 字段交付及前端部署后，用 `liyi` 在同一租户登录，对比侧栏、工作台、个人信息和平台管理主岗位；随后覆盖岗位修改后刷新登录、多账号切换及权限不变。
5. 以上通过后才可将整个 ISSUE-031 标记为已修复；本轮未关闭 ISSUE-034。
