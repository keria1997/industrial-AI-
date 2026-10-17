# ISSUE-034：权限角色与展示岗位概念混用，7 处代码将 permission role 当作 display position

- 级别：P1 架构
- 模块：工作台 / 认证 / 全局
- 层级：L4 基础层
- 影响范围：前端, 后端
- 状态：⏭️ 已由 ISSUE-035 新模型接替，待单角色链路联调

> 2026-10-18：本文件的岗位展示和数据修正方案已被 ISSUE-035 取代。以下仅保留历史分析，不再执行增加 `displayPosition`、恢复岗位表或按岗位名称改写权限角色的方案。当前以前端展示账号唯一角色、菜单按有效权限、未知工作台分组不回退老板为准，见 [ISSUE-035](ISSUE-035-需求澄清移除岗位概念角色直接挂账号.md)。

## 问题

用户 `liyi` 数据库主岗位为"租户管理员"（`iam_employee.primary_position_id`），但侧栏和工作台显示"老板 · 经营驾驶舱"。`registered_users.role` 字段混淆了权限角色（访问控制）和展示岗位（UI 职务）两个概念。

## 原因

后端 4 处 + 前端 3 处将 `role`（权限角色）同时用于访问控制和 UI 展示，从未与员工档案 `position` 交叉引用：

### 后端混用位置

| 文件 | 行号 | 混用方式 |
|---|---|---|
| `JdbcRegisteredUserStore.java` | 50 | 注册时 `isTenantAdmin → role = "老板"` 硬编码 |
| `WorkbenchController.java` | 38-39 | `TENANT_ADMIN_ROLES = Set.of("老板",...)` 用于权限判断 |
| `WorkbenchController.java` | 146-225 | `case "老板" → 指标列表` 用于工作台指标过滤 |
| `PlatformService.java` | 558 | `case "老板" → "TENANT_ADMIN"` 用于权限码映射 |

### 前端混用位置

| 文件 | 行号 | 混用方式 |
|---|---|---|
| `moduleRegistry.ts` | 79 | `roleModuleAccess` 用 role 控制菜单可见性 |
| `AppRuntimeProvider.tsx` | 86-87 | `user.role` 归一化为 RoleName |
| `App.tsx` 侧栏/工作台 | - | `role` 直接显示为 UI 文本 |

### 根因链路

```
注册时 JdbcRegisteredUserStore.create()
  → isTenantAdmin = true → role = "老板"（硬编码）
  → INSERT INTO registered_users (role = "老板")

登录时 AuthController.login()
  → users.findByAccount() → RegisteredUser.role = "老板"
  → registeredUser(user) → SessionUser.role = "老板"
  → JWT payload role: "老板"

前端
  → AppRuntimeProvider → setActiveRole("老板")
  → 侧栏/工作台显示 "老板 · 经营驾驶舱"
```

实际岗位"租户管理员"存储在 `iam_employee.primary_position_id` → `iam_position` 表中，从未被登录链路读取。

## 方案

### 后端：分离 permission role 和 display position

| 字段 | 来源 | 用途 |
|---|---|---|
| `role` | `registered_users.role` | 仅用于权限判断（菜单可见、API 权限） |
| `displayPosition` | `iam_employee` → `iam_position.name` | 仅用于 UI 展示（侧栏、工作台 Badge） |

修改 `SessionUser` record 添加 `displayPosition` 字段，`registeredUser()` 方法查询员工档案填充。

### 前端：分离权限角色和展示文本

| 位置 | 改动 |
|---|---|
| 侧栏用户信息 | `displayPosition` 替代 `role` 显示 |
| 工作台角色 Badge | `displayPosition` 替代 `role` 显示 |
| `moduleRegistry.ts` | 保留 `role` 用于 `roleModuleAccess` 不变 |

### 数据修正

将 `registered_users.role` 中因硬编码产生的错误值修正为实际岗位：
```sql
UPDATE registered_users SET role = '租户管理员' WHERE account = 'liyi' AND role = '老板';
```

| 修改层面 | 文件 | 具体改动 |
|---|---|---|
| 后端 | SessionUser.java | 添加 `displayPosition` 字段 |
| 后端 | AuthController.java | `registeredUser()` 查询 `iam_employee` → `iam_position` 填充 `displayPosition` |
| 前端 | App.tsx | 侧栏和工作台 Badge 改用 `session.displayPosition` |

## 验收标准

1. `liyi` 登录后侧栏显示"租户管理员"而非"老板"
2. 工作台角色 Badge 显示"租户管理员"
3. `roleModuleAccess` 权限判断不受影响（仍基于 `role` 字段）
4. API 权限校验不受影响
5. 其他已注册用户的岗位显示正确

## 进展

2026-10-18：前端已按 ISSUE-035 移除岗位展示，历史方案停止实施；后端角色来源与部署验证仍待联调，未执行本文件历史 SQL。
