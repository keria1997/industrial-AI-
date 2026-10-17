# 数据迁移与切换方案

## 1. 原则

1. 优先把 `module_document.data` 迁入既有物理表。
2. 迁移前必须做表结构差异分析，不为迁移盲目 DROP/ALTER。
3. 每个模块独立迁移，可以独立回滚和验收。
4. 迁移期间 `module_document` 保持只读快照，不再作为新事实源。
5. 不允许迁移工具修改业务终态或补造缺失事实。

## 2. 迁移准备

### 2.1 表结构核对

对每个 `kind` 输出：

1. 当前 JSON 字段集合。
2. 既有表字段集合。
3. 必填字段缺失情况。
4. 稳定 ID 与内部 UUID 的映射。
5. 引用完整性检查。
6. 唯一键冲突检查。

### 2.2 基础设施

1. 增加 Spring Data JPA 依赖。
2. 关闭 JPA 自动建表。
3. 使用现有 `db/migrations` 机制管理 DDL。
4. 建立迁移审计表，记录批次、模块、文档数、成功数、失败数。
5. 为迁移 SQL 和 JPA Entity 建立字段级测试。

## 3. 存量数据迁移流程

```text
snapshot
  → 按 module/kind 冻结写入
  → 读取 module_document
  → 校验 JSON schema
  → 转换为具名迁移 DTO
  → upsert 到既有物理表
  → 写入子表
  → 校验数量、状态、余额、引用
  → 记录迁移结果
```

## 4. ID 映射

1. 现有 `doc_id` 是稳定业务 ID，必须保留。
2. 物理表已有 UUID 主键时，保留内部 UUID，并为 `source_id/doc_id` 建唯一索引。
3. 物理表主键本身就是稳定 text ID 时，可直接映射为业务 ID。
4. 禁止按名称或编码重新生成 ID。

示例：

| 模块 | `doc_id` | 物理主键 | 处理 |
| --- | --- | --- | --- |
| platform/orgUnit | `ORG-FAC-01` | `iam_org_unit.id uuid` | 保留内部 UUID，增加 `source_id` |
| fulfillment/order | UUID 字符串 | `sales_order.id uuid` | 直接转换 |
| production/workOrder | UUID 字符串 | `prod_work_order.id uuid` | 直接转换 |
| platform/role | `ROLE-ADMIN` | `iam_role.id uuid` | 增加 `source_id` 或转换为主键映射 |

## 5. 字段转换规则

| JSON/当前形态 | 物理字段 | 转换规则 |
| --- | --- | --- |
| `id` | 主键或 `source_id` | 保持原值，必要时映射 UUID |
| `tenantId` | `tenant_id` | 必须存在于租户范围 |
| `createdAt/updatedAt` | `created_at/updated_at` | ISO 时间转 timestamptz |
| `version` | `row_version` | 取最大值 |
| `status` | 状态列 | 映射为枚举字符串 |
| `amount` | numeric(20,6) | BigDecimal |
| `qty` | numeric(18,6) | BigDecimal |
| `lines[]` | 子表 | 每行一条记录 |
| `history[]` | 历史表 | 每条记录保留原时间 |
| `metadata` | 专用列或具名子表 | 禁止继续作为 Map |

## 6. 各模块迁移顺序

| 顺序 | 模块 | 原因 |
| --- | --- | --- |
| 1 | 消息 | 独立性强，风险低 |
| 2 | AI | 独立性强，只读分析多 |
| 3 | 人员 | 表简单，范围明确 |
| 4 | 产业链 | 主数据数量小 |
| 5 | 平台 | IAM 是授权基础，需要先冻结契约 |
| 6 | 财务 | 金额和核销守恒要求高 |
| 7 | 销售/库存/采购 | 跨模块单据最多 |
| 8 | 生产 | 状态机和异步任务最复杂 |
| 9 | 工作台 | 最后切换为 JPA Query Service 聚合 |

## 7. 双写与切换

推荐三阶段：

### 阶段 A：JPA 只读

1. 建立 JPA Entity/Repository。
2. 新增只读比对任务。
3. `module_document` 仍是写入口。

### 阶段 B：JPA 权威

1. Application Service 切换到 JPA Repository。
2. 同事务写入业务表和 Outbox。
3. `module_document` 停止写入。
4. 保留一段时间用于排查。

### 阶段 C：归档

1. 校验连续两个发布周期无差异。
2. 将 `module_document` 重命名或导出到归档表。
3. 删除文档 Store 代码。

## 8. 数据校验

每个模块必须校验：

1. 文档数与物理主表行数一致。
2. 主键唯一且无孤儿行。
3. 状态枚举合法。
4. 版本号不小于 JSON 版本。
5. 时间字段不晚于迁移时间。
6. 子表数量等于 JSON 数组长度。
7. 关联 ID 在同租户内存在。
8. 金额、数量校验和通过。
9. 状态机终态不可被覆盖。

示例：

```sql
SELECT doc.tenant_id, doc.doc_id
FROM module_document doc
LEFT JOIN sales_order so
  ON so.tenant_id = doc.tenant_id
 AND so.id::text = doc.doc_id
WHERE doc.module = 'fulfillment'
  AND doc.kind = 'order'
  AND so.id IS NULL;
```

## 9. 回滚

1. JPA 切换失败时，切回旧 Store 读取。
2. 若 `module_document` 已停止写入，必须先补录差额。
3. 不允许删除归档表。
4. 每个 DDL 迁移必须有反向说明，但反向执行必须人工审批。

## 10. 上线检查

1. `/readyz` 检查数据库和迁移。
2. 每模块冒烟用例通过。
3. 无 `module_document` 新写入。
4. 业务接口返回字段与旧响应兼容。
5. 数据库错误日志无类型转换和约束冲突。
