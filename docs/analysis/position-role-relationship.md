# 岗位与角色关系完整梳理

> 分析日期：2026-10-17
> 分析范围：PRD 文档 + 技术设计 + 后端代码 + 前端代码 + 数据库

## 1. 概念定义

| 概念 | 说明 | 对应表 | 对应前端 |
|---|---|---|---|
| **组织 (Org Unit)** | 公司/部门/工厂/车间的层级结构 | `iam_org_unit` | 组织与岗位页签 |
| **岗位 (Position)** | 组织内的职位，关联默认角色 | `iam_position` | 新增岗位弹窗 |
| **角色 (Role)** | 权限的集合，定义数据范围 | `iam_role` | 角色与权限页签 |
| **权限授权 (Role Grant)** | 角色→权限的映射（allow/deny） | `iam_role_grant` | 权限矩阵 |
| **账号 (Account)** | 登录凭证，关联员工和角色 | `iam_account` | 员工账号页签 |
| **员工 (Employee)** | 人员档案，关联组织和岗位 | `iam_employee` | 人员管理 |

## 2. 关系模型

```
组织架构                          岗位体系                        权限体系
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│ iam_org_unit │          │ iam_position │          │   iam_role   │
│ (组织层级)    │  1:N     │ (岗位)        │  N:M     │ (角色)       │
│              │────────→│              │────────→│              │
│ id           │ org_id   │ id           │          │ id           │
│ name         │          │ org_id       │          │ code         │
│ type         │          │ code         │          │ data_scope   │
│ parent_id    │          │ name         │          │ scope_values │
└──────────────┘          │ default_     │          └──────┬───────┘
                          │ role_ids[] ──┼──→              │
                          └──────────────┘          │      ▼
                                             │  ┌──────────────┐
                                             │  │iam_role_grant│
                                             │  │ (角色→权限)   │
                                             │  │ role_id      │
                                             │  │ permission_id│
                                             │  │ effect       │
                                             │  │ field_mode   │
                                             │  └──────┬───────┘
                                             │         │
┌──────────────┐          ┌──────────────┐    │         ▼
│iam_employee  │          │ iam_account  │    │  ┌──────────────┐
│(员工档案)     │  1:1     │ (登录账号)    │    │  │iam_capability│
│              │────────→│              │    │  │ (能力开关)    │
│ primary_org  │ employee │ direct_      │    │  └──────────────┘
│ primary_     │  _id     │ role_ids[]───┼────┘
│ position_id  │          │              │
└──────────────┘          └──────────────┘
```

### 核心关系

| 关系 | 类型 | 实现方式 | 说明 |
|---|---|---|---|
| 组织 → 岗位 | 1:N | `iam_position.org_id` | 岗位归属组织 |
| 岗位 → 角色 | N:M（间接） | `iam_position.default_role_ids[]` | 岗位的**默认角色**，员工入职该岗位时自动继承 |
| 员工 → 账号 | 1:1 | `iam_account.employee_id` | 账号绑定员工 |
| 账号 → 角色 | N:M（直接） | `iam_account.direct_role_ids[]` | 账号的**直接角色**，独立于岗位 |
| 角色 → 权限 | N:M | `iam_role_grant` | 角色→权限的授权映射（allow/deny） |
| 角色 → 数据范围 | N:1 | `iam_role.data_scope` + `scope_values[]` | 角色的数据可见范围 |

## 3. 角色解析流程（后端 PlatformService.java）

```java
// 第 1 步：通过账号找到员工
account → employeeId → employee

// 第 2 步：收集角色 ID（两个来源）
roleIds.addAll(account.directRoleIds);        // 来源 1：账号直接角色
roleIds.addAll(position.defaultRoleIds);      // 来源 2：岗位默认角色

// 第 3 步：过滤只保留启用状态的角色
roleIds.removeIf(id -> !enabled(role));

// 第 4 步：加载角色详情（含数据范围和权限授权）
activeRoles = roles.filter(enabled);
```

**关键逻辑：** 有效角色 = 直接角色 ∪ 岗位默认角色（取并集）

## 4. PRD 定义

### 角色矩阵（PRD 7.2.3）

| 工作台角色组 | IAM 角色 | 数据范围 |
|---|---|---|
| 老板 | TENANT_OWNER 或持有 `*` | 当前租户 |
| 销售 | SALES_REP, SALES_MANAGER | SELF/ORG |
| 计划 | PRODUCTION_PLANNER, PRODUCTION_MANAGER | FACTORY_SET |
| 仓管 | WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER | WAREHOUSE_SET |
| 采购 | PROCUREMENT_MANAGER | 授权采购组织 |
| 财务 | FINANCE_ACCOUNTANT | 授权财务主体 |
| 系统管理员 | TENANT_ADMIN | 平台治理范围 |

### 数据范围类型

| 类型 | 说明 |
|---|---|
| `tenant_all` | 租户全量 |
| `org_tree` | 组织树范围内 |
| `factory_set` | 指定工厂集合 |
| `warehouse_set` | 指定仓库集合 |
| `customer_owner` | 仅本人客户 |
| `supplier_buyer` | 仅本人供应商 |

## 5. 实现现状

### 结构化表（SQL 表）—— 存在但为空

| 表 | 字段 | 数据量 | 说明 |
|---|---|---|---|
| `iam_position` | 含 `default_role_ids text[]` | **0 行** | 结构已定义，未写入数据 |
| `iam_role` | 含 `data_scope`, `scope_values[]` | **0 行** | 结构已定义，未写入数据 |
| `iam_role_grant` | 含 `effect`, `field_mode` | **0 行** | 结构已定义，未写入数据 |
| `iam_account` | 含 `direct_role_ids text[]` | **0 行** | 结构已定义，未写入数据 |

### JSONB 文档表（实际数据存储）

| document kind | 说明 | 数据量 |
|---|---|---|
| `module_document.position` | 岗位数据（含 `defaultRoleIds`） | 种子数据 |
| `module_document.role` | 角色数据 | 种子数据 |
| `module_document.account` | 账号数据（含 `directRoleIds`） | 种子数据 |
| `module_document.employee` | 员工数据 | 种子数据 |

**实际存储路径：** `TenantCatalog.java`（硬编码种子）→ `TenantProvisioningService.java`（`store.save()`）→ `module_document` JSONB 表

### 前端角色管理

**文件**：`frontend/src/platform/PlatformManagement.tsx`

- 新增岗位弹窗含 `roleId`（默认角色）下拉选择
- 创建岗位时写入 `defaultRoleIds: [roleId]`
- 角色与权限页签支持角色权限矩阵配置（草稿 + 发布）

### 前端权限解析

**文件**：`frontend/src/app/AppRuntimeProvider.tsx`

登录后从后端获取权限列表，前端根据权限码控制 UI 可见性。

## 6. 架构差距分析

| 维度 | 设计（PRD + 结构化表） | 实现（当前代码） | 差距 |
|---|---|---|---|
| 数据存储 | `iam_position` / `iam_role` / `iam_role_grant` 结构化表 | `module_document` JSONB 文档 | 结构化表未使用 |
| 数据来源 | 用户通过 UI 维护 | `TenantCatalog.java` 硬编码种子 | 硬编码种子，用户数据未持久化到结构化表 |
| 角色解析 | 从结构化表 JOIN 查询 | 从 JSONB 文档解析 | 解析逻辑依赖 JSONB，不走 SQL JOIN |
| 岗位→角色 | `default_role_ids` 数组字段 | JSONB 文档中 `defaultRoleIds` 数组 | 字段名和存储方式不同 |
| 数据范围 | `data_scope` + `scope_values[]` 结构化字段 | JSONB 文档中硬编码 | 结构化表未使用 |
| RLS 租户隔离 | `current_setting('app.tenant_id')` | JSONB 无 RLS | 结构化表有 RLS 但未使用 |

## 7. 影响与风险

| 风险 | 说明 |
|---|---|
| 数据不一致 | JSONB 文档与结构化表数据可能不同步 |
| 无 RLS 隔离 | JSONB 文档无行级安全策略，依赖应用层过滤 |
| 无外键约束 | JSONB 文档中角色 ID 无外键约束，可能出现孤儿引用 |
| 无法 SQL JOIN | 无法用 SQL 直接关联岗位、角色和权限 |
| 扩展受限 | 新增权限类型需修改 JSONB 结构，不如结构化表灵活 |

## 8. 修复建议

### 短期（不改变架构）

1. 租户初始化时，同时将 `TenantCatalog` 种子数据写入结构化表（`iam_position` / `iam_role` / `iam_role_grant` / `iam_account`）
2. 平台管理的角色/岗位/授权操作同步写入结构化表
3. 保持 `module_document` 作为兼容层，逐步迁移

### 中期（架构优化）

1. `PlatformService` 角色解析逻辑改为从结构化表查询（SQL JOIN）
2. 前端平台管理 CRUD 操作全部走结构化 API
3. 删除 `TenantCatalog.java` 硬编码种子，改为数据库迁移脚本预置默认数据

### 长期（完全迁移）

1. 移除 `module_document` 中平台管理相关 JSONB 文档
2. 所有 IAM 数据仅存在于结构化表中
3. RLS 策略覆盖全部 IAM 表

