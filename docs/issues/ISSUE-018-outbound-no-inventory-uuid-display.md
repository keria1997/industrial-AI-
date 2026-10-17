# ISSUE-018：出库管理发货时显示产品 UUID 而非名称，缺少"先入库"引导，且手工入库弹窗未渲染

> 发现日期：2026-10-17
> 环境：http://124.222.114.67/（部署环境）
> 模块：销售管理 → 出库管理
> 级别：P1 体验
> 状态：**新增**

## 问题描述

出库订单去发货时，选择仓库 `saa (AAA)` 后系统报错：

> saa未查询到库存记录： 2c4bf33d-78df-4d3c-b418-46683d010d2e

存在两个问题：

1. **错误信息显示 UUID 而非产品名称**：应显示"产品 ssa 在仓库 saa 中无库存记录"而非显示 UUID `2c4bf33d-78df-4d3c-b418-46683d010d2e`
2. **缺少解决引导**：错误提示"请重新选择发货仓库以加载真实可用量"，但实际原因是该仓库无库存，用户应被引导去"库存管理 → 手工入库"添加库存

## 排查数据

| 检查项 | 结果 |
|---|---|
| 产品 `ssa`（编码 SAS，ID `2c4bf33d...`） | ✅ 存在（`module_document` kind=product） |
| 仓库 `saa`（编码 AAA，ID `7d907d3b...`） | ✅ 存在（`module_document` kind=warehouse） |
| 销售订单 SO-20261017-68ECB5B5 | ✅ 存在 |
| 出库任务 f31a832f | ✅ 存在 |
| **库存可用量记录** | ❌ **不存在**（`module_document` 中无 availability 类型记录） |

## 业务逻辑判定

**系统阻止无库存发货是正确行为**（PRD 7.5.9 出库守卫）。这是新部署环境首次使用的正常场景——尚未入库。

## 关联问题：手工入库弹窗未渲染（DEF-D）

### 现象

库存管理页面"手工入库"按钮可点击，但点击后**无任何弹窗或界面变化**。

### 代码排查

| 检查项 | 文件 | 状态 | 说明 |
|---|---|---|---|
| 按钮绑定 | `App.tsx` line 7100 | ✅ 已绑定 | `onClick={handleManualInbound}` |
| 点击处理函数 | `App.tsx` line 6644 | ✅ 已修改 | `setShowInboundModal(true)`（替代了原来的 toast 占位） |
| `showInboundModal` state | `App.tsx` line 6160 | ✅ 已添加 | `useState(false)` |
| **`ManualInboundModal` 组件文件** | `features/inventory/components/ManualInboundModal.tsx` | ✅ **已创建** | 包含完整表单（仓库/产品/数量）+ `inventoryApi.importAvailability` API 调用 |
| **组件 JSX 渲染** | `App.tsx` InventoryManagement 组件 return 块 | ❌ **缺失** | **`<ManualInboundModal />` 仅被 import，从未作为 JSX 元素放入 return 语句中** |

### 根因

`InventoryManagement` 组件的 JSX 中缺少 `<ManualInboundModal />` 渲染。import、state、事件处理函数均已到位，但弹窗组件从未被挂载到 DOM。

### 需补充的代码（1 处）

在 `InventoryManagement` 组件 return JSX 的末尾（`</div>` 闭合前）添加：

```tsx
{showInboundModal && (
    <ManualInboundModal
        open={showInboundModal}
        context={formalContext}
        warehouses={formalInventory.warehouses}
        products={formalInventory.stockData}
        onClose={() => setShowInboundModal(false)}
        onSuccess={(msg) => showToast(msg, 'success')}
    />
)}
```

## 需修复的展示缺陷

| 编号 | 问题 | 修改位置 | 修改内容 |
|---|---|---|---|
| DEF-A | 错误提示显示 UUID | `FulfillmentController.java` 或前端出库页面 | 将 `productId` 映射为产品名称后拼接错误信息 |
| DEF-B | 缺少操作引导 | 前端出库管理页面 | 无库存时提示"请先通过库存管理 → 手工入库 添加库存"并提供跳转链接 |
| DEF-C | 产品字段显示 UUID | `frontend/src/App.tsx` 出库管理区域 | 从 `module_document` 加载产品名称，用 `productName` 替换 `productId` 展示 |
| DEF-D | 手工入库弹窗未渲染 | `App.tsx` InventoryManagement 组件 JSX | 在 return 块中添加 `<ManualInboundModal />` 渲染 |

## 复现步骤

1. 创建仓库 saa (AAA)
2. 创建产品 ssa (SAS)
3. 销售管理 → 快速开单 → 选仓库 saa → 选产品 ssa → 提交
4. 销售订单 → 去发货 → 生成出库任务
5. 出库管理 → 选择仓库 saa
6. **实际**：报错"saa未查询到库存记录： {UUID}"
7. **期望**：显示"产品 ssa 在仓库 saa 中无库存记录，请先入库"并提供入库引导链接

## 临时解决方案

**当前不可用**：手工入库弹窗因 DEF-D 未渲染，用户无法通过 UI 入库。

**解除阻塞方式（二选一）：**

1. **修复 DEF-D**（前端添加 1 行 JSX），然后手工入库功能即可用
2. **通过 API 直接调用**：
```bash
curl -X POST http://124.222.114.67/api/v1/inventory/import/availability \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -H "X-Tenant-Id: TENANT-6B94B1A4" \
  -d '{
    "eventId": "manual-inbound-001",
    "warehouseId": "7d907d3b-73f4-4d3c-8215-6b0ebc6fca68",
    "productId": "2c4bf33d-78df-4d3c-b418-46683d010d2e",
    "qualifiedOnHandQty": "100",
    "allocatedReservedQty": "0",
    "frozenQty": "0",
    "safetyStockQty": "0",
    "inTransitQty": "0",
    "fulfillableQty": "100",
    "uom": "dads",
    "factVersion": 1,
    "formulaVersion": "qualified-reserved-frozen-safety-v1",
    "sourceSystem": "MANUAL_INBOUND"
  }'
```

