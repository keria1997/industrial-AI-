# ISSUE-033：一号工厂数据来源为后端种子数据，未持久化到结构化组织表

- 级别：P1 数据一致性
- 模块：平台管理
- 层级：L4 基础层
- 影响范围：后端
- 状态：🔴 待修复

## 问题

平台管理 → 组织与岗位页面显示"一号工厂"（FAC-01，负责人 liyi，隶属江苏汇鸿），但该数据**不存在于** `iam_org_unit` SQL 表（0 行）。

数据实际来源于后端硬编码种子类 `TenantCatalog.java`，在租户注册时由 `TenantProvisioningService` 写入 `module_document` JSONB 文档表，而非结构化组织表。

**复现步骤：**
1. 访问 https://erp.wanshen.top/ → 平台管理 → 组织与岗位
2. 页面显示"一号工厂 FAC-01 负责人: liyi"
3. SSH 查数据库：`SELECT * FROM iam_org_unit;` → 0 行
4. `SELECT count(*) FROM module_document;` → 197 行（含种子数据）

## 原因

`TenantCatalog.java`（后端硬编码种子类）定义了初始化组织架构：

```java
public static final String FACTORY_ORG_ID = "ORG-FAC-01";
// orgUnits() 方法生成:
// { code: "FAC-01", name: "一号工厂", type: "factory", ... }
```

`TenantProvisioningService.java` 在租户注册时调用 `TenantCatalog` 并通过 `store.save(...)` 写入 `module_document` JSONB 表，**未写入** `iam_org_unit` 结构化表。

前端组织架构页面从 `module_document` JSON 文档读取数据（通过 API 返回 JSON），因此页面能显示"一号工厂"，但结构化组织表为空。

## 方案

后端在租户初始化时，将组织架构数据同时写入 `iam_org_unit` 结构化表（而非仅存 JSONB 文档），确保：

1. 组织架构数据持久化到 `iam_org_unit` 表（可通过 SQL 查询和 JOIN）
2. 前端组织架构页面从后端 API 读取结构化数据
3. 组织架构支持 CRUD 操作（新增/编辑/停用下级组织）
4. 种子数据仅在首次租户初始化时写入，后续由用户通过 UI 维护

| 修改层面 | 文件 | 具体改动 |
|---|---|---|
| 后端 | `TenantProvisioningService.java` | 在写入 `module_document` 的同时，将组织数据写入 `iam_org_unit` 表 |
| 后端 | `PlatformController.java` | 组织架构 API 改为从 `iam_org_unit` 表读取（而非 `module_document`） |
| 前端 | `PlatformManagement.tsx` | 确认组织架构 API 调用正确对接后端 |

## 验收标准

1. 新租户注册后，`iam_org_unit` 表中存在对应的组织架构记录（含"一号工厂"）
2. 平台管理 → 组织与岗位页面从 `iam_org_unit` 表读取数据
3. 新增/编辑/停用组织后数据同步到 `iam_org_unit` 表
4. `SELECT * FROM iam_org_unit;` 返回非空结果

## 进展

🔴 待修复（已确认根因：种子数据仅存 JSONB 文档，未写入结构化组织表）

