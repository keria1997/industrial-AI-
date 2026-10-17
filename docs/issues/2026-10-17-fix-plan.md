# 测试缺陷修复计划

> 基于：`docs/issues/2026-10-17-test-execution-summary.md`
> 分析方式：逐个定位代码、确认根因、给出精确修改方案

## 修复总览

| 优先级 | 缺陷 | 修改范围 | 预估工作量 |
|---|---|---|---|
| Sprint 1（立即） | DE-03 产品仓库配置 | 前端 1 行 | 5 分钟 |
| Sprint 1（立即） | DE-04 手工入库 | 前端 1 个组件 | 2 小时 |
| Sprint 1（立即） | BUG-01 登录锁定 | 后端 3 个文件 | 4 小时 |
| Sprint 2（本周） | BUG-02 深链接恢复 | 前端 1 处 | 1 小时 |
| Sprint 2（本周） | DE-05 MRP 展算 | 无需修改（DE-03 修复后自动解锁） | 0 |

---

## DE-03：产品默认仓库不可配置（P0 阻断）

### 代码分析

**文件**：`frontend/src/features/inventory/pages/InventoryMasterDataPanel.tsx` 第 248 行

```typescript
<MasterEditorSelect {...controlProps} label="库存仓库" name="defaultWarehouseId"
  options={productWarehouseOptions} placeholder="暂不关联"
  placeholderDisabled={state.mode !== 'create' && !!state.record.defaultWarehouseId} />
```

**根因**：`placeholderDisabled={state.mode !== 'create' && !!state.record.defaultWarehouseId}`
当编辑模式（`mode !== 'create'`）且产品已有 `defaultWarehouseId` 时，下拉被禁用。
新建的产品没有 `defaultWarehouseId`，所以新建时可以选但保存后编辑时被锁定。

**后端已支持**：`inventoryApi.updateProduct` 的 `input` 类型已包含 `defaultWarehouseId`。

### 修改方案

**文件**：`frontend/src/features/inventory/pages/InventoryMasterDataPanel.tsx`

```typescript
// 修改前
placeholderDisabled={state.mode !== 'create' && !!state.record.defaultWarehouseId}

// 修改后（移除禁用条件，始终可选）
placeholderDisabled={false}
```

同时确保保存逻辑将 `defaultWarehouseId` 传给 `updateProduct` API。

### 验证步骤

1. 库存管理 → 产品 → 编辑任意产品
2. "库存归属仓库"下拉应可选
3. 选择仓库后保存
4. 快速开单 → 选择该仓库 → 产品下拉应出现该产品

---

## DE-04：库存手工入库按钮空函数（P0）

### 代码分析

**文件**：`frontend/src/App.tsx` 第 6516 行

```typescript
const handleManualInbound = () => showToast('未执行：手工入库尚缺正式提交契约...', 'error');
```

纯占位函数，无任何业务逻辑。

**已有 API**：`inventoryApi.importAvailability` 可创建库存事实（line 260 of fulfillment.ts）。

### 修改方案

**文件 1**：`frontend/src/App.tsx` — 替换 `handleManualInbound` 为打开弹窗

**文件 2**：新建 `frontend/src/features/inventory/components/ManualInboundModal.tsx`

弹窗字段：
- 仓库（下拉，从 `inventoryApi.listWarehouses` 获取）
- 产品/物料（下拉，从 `inventoryApi.listProducts/listMaterials` 获取）
- 数量（数字输入，> 0）
- 单位（自动带出）
- 批次号（可选）

提交调用 `inventoryApi.importAvailability(context, { eventId: crypto.randomUUID(), warehouseId, objectId, onHandQty, ... })`

### 验证步骤

1. 库存管理 → 点击"手工入库"
2. 弹窗填写仓库、产品、数量
3. 提交后现存量台账出现该记录
4. 可用量公式生效（现存 - 预留 - 冻结 - 安全库存）

---

## BUG-01：登录失败不锁定（P0 安全）

### 代码分析

**文件**：`backend/src/main/java/com/wanshen/platform/auth/AuthController.java` 第 78-90 行

登录方法验证密码后直接成功或失败，**无失败计数和锁定逻辑**。

**`RegisteredUser.java`** 无 `failedLoginCount` 和 `lockedUntil` 字段。

**`registered_users` 表**也无这些列（需添加）。

### 修改方案

**文件 1**：`backend/src/main/java/com/wanshen/platform/auth/RegisteredUser.java`

添加 2 个字段：
```java
public record RegisteredUser(
    // ... existing fields ...
    String status,
    int failedLoginCount,          // 新增
    String lockedUntil,            // 新增（ISO-8601 或 null）
    List<String> permissions,
    // ... rest
) {}
```

**文件 2**：数据库迁移脚本 `036_add_login_lockout.sql`

```sql
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
```

**文件 3**：`backend/src/main/java/com/wanshen/platform/auth/AuthController.java`

在 `login()` 方法中添加锁定逻辑：

```java
// 检查锁定状态
if (registered != null && registered.lockedUntil() != null) {
    Instant lockUntil = Instant.parse(registered.lockedUntil());
    if (Instant.now().isBefore(lockUntil)) {
        long remainingMin = Duration.between(Instant.now(), lockUntil).toMinutes() + 1;
        throw forbidden("账号已锁定，请 " + remainingMin + " 分钟后重试", "连续失败次数过多");
    }
}

// 密码验证失败时递增计数
if (registered != null && !passwordHasher.verify(request.password(), registered.passwordHash())) {
    int newCount = registered.failedLoginCount() + 1;
    if (newCount >= 5) {
        users.updateLockout(request.account(), newCount, Instant.now().plus(Duration.ofMinutes(15)));
        throw forbidden("账号已锁定 15 分钟", "连续失败次数过多");
    }
    users.updateFailedCount(request.account(), newCount);
    throw unauthorized("账号或密码不正确", "检查凭据后重试");
}

// 登录成功时重置计数
if (registered != null && registered.failedLoginCount() > 0) {
    users.resetFailedCount(request.account());
}
```

**文件 4**：`backend/src/main/java/com/wanshen/platform/auth/RegisteredUserStore.java` + `JdbcRegisteredUserStore.java`

添加 3 个方法：
```java
void updateFailedCount(String account, int count);
void updateLockout(String account, int count, Instant lockedUntil);
void resetFailedCount(String account);
```

### 验证步骤

1. 连续输入 4 次错误密码 → 每次提示"账号或密码不正确"
2. 第 5 次错误密码 → 提示"账号已锁定 15 分钟"
3. 锁定期间输入正确密码 → 仍被拒绝，提示剩余锁定时间
4. 15 分钟后输入正确密码 → 登录成功

---

## BUG-02：深链接登录后不恢复（P1）

### 代码分析

登录成功后 `handleLogin` 固定执行 `setActiveModule('工作台')`，未检查 URL 中的 `?module=` 参数。

### 修改方案

**文件**：`frontend/src/App.tsx`

在 `handleLogin` 函数末尾，检查当前 URL 是否包含 `module` 参数：

```typescript
const handleLogin = (name: string) => {
    setIsLoggedIn(true);
    setUserName(name);
    // 恢复深链接目标模块
    const params = new URLSearchParams(window.location.search);
    const targetModule = params.get('module');
    if (targetModule) {
        setActiveModule(resolveModule(window.location.search));
    } else {
        setActiveModule('工作台');
    }
};
```

### 验证步骤

1. 未登录状态访问 `http://124.222.114.67/?module=production`
2. 被重定向到登录页
3. 登录成功 → 应直接进入生产管理页面（而非工作台）

---

## DE-05：MRP 展算（无需修改）

### 代码分析

`handleGlobalMrp` 函数（line 5039）**已完整实现**：
- 过滤已接收且无工单的需求
- 调用 `productionOperationsApi.startPlanningTask`
- 更新需求和 MPS 状态

按钮已正确连接：`onRunGlobalMrp={handleGlobalMrp}`（line 5319）。

测试报告说"onclick 空函数"是因为**数据库中无已接收需求**（`eligible.length === 0`），
函数在第一行就 return 了（显示"没有可展算的已接收需求"警告）。

**根因是 DE-03**：无法创建销售订单 → 无缺货需求 → MRP 无可展算对象。

**修改方案**：无。DE-03 修复后，完整业务流将使 MRP 展算正常工作。

### 验证步骤

DE-03 修复后：
1. 快速开单创建销售订单
2. 库存不足触发生产需求
3. 接收需求后点击"执行全局 MRP 展算"
4. MRP 应正常运行并产出缺料清单

---

## 修复后回归测试清单

修复完成并部署后，按以下顺序回归：

| 顺序 | 测试项 | 对应用例 | 前置 |
|---|---|---|---|
| 1 | 产品编辑配置默认仓库 | DE-03 | 无 |
| 2 | 手工入库创建库存 | DE-04 | 产品已配置仓库 |
| 3 | 销售快速开单 | TC-FLOW-001 | 产品 + 库存就绪 |
| 4 | MRP 展算 | TC-FLOW-003 | 销售订单已创建 |
| 5 | PR → PO → 收货 | TC-FLOW-004 | MRP 产出缺料 |
| 6 | AR → 核销 | TC-FLOW-005 | 销售已发货 |
| 7 | 登录失败锁定 | BUG-01 | 无 |
| 8 | 深链接恢复 | BUG-02 | 无 |

