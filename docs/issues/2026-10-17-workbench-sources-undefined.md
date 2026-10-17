# ISSUE-18：工作台来源状态缺失导致 undefined 警告

> 发现日期：2026-10-17
> 环境：http://124.222.114.67/
> 级别：P1 体验
> 状态：未修复

## 问题描述

工作台页面显示来源状态警告，但警告内容包含 `undefined`：

```
SalesOrder： undefined； RevenueRecognition： undefined； ShipmentRecognition： undefined； 消息管理： undefined
```

## 根因分析

### 后端返回数据

`GET /api/v1/workbench/dashboard?role=老板&sections=todos,alerts,activities` 返回的 `data.sources` 数组：

```json
[
  {"source": "SalesOrder"},
  {"source": "RevenueRecognition"},
  {"source": "ShipmentRecognition"},
  {"source": "Message"}
]
```

**每个来源条目只有 `source` 字段，缺少 `status` 和 `errorCode` 字段。**

### 前端处理逻辑

`frontend/src/api/workbenchProjection.ts` 中的来源警告构建：

```typescript
sourceWarnings: (data.sources || [])
  .filter(source => source.status !== 'AVAILABLE')
  .map(source => `${moduleLabel(source.source)}：${source.status}${source.errorCode ? ` (${source.errorCode})` : ''}`)
```

由于 `status` 为 `undefined`，`undefined !== 'AVAILABLE'` 为 true，全部来源进入警告列表。
`source.status` 输出为 `undefined`，导致警告文本中出现 `undefined`。

## 修复方案

### 后端修改

**文件**：`backend/src/main/java/com/wanshen/platform/WorkbenchController.java`

在构建 `sources` 数组时，为每个来源添加 `status` 字段。来源状态应根据来源模块是否返回有效数据确定：

| 来源 | 有数据时的 status | 无数据时的 status |
|---|---|---|
| SalesOrder | `AVAILABLE` | `SOURCE_PENDING` |
| RevenueRecognition | `AVAILABLE`（有出库 POSTED 行时） | `SOURCE_PENDING` |
| ShipmentRecognition | `AVAILABLE`（有发货任务时） | `SOURCE_PENDING` |
| Message | `AVAILABLE`（有消息数据时） | `AVAILABLE` |

```java
// 修改前（推测）：
sources.add(Map.of("source", "SalesOrder"));

// 修改后：
sources.add(Map.of("source", "SalesOrder", "status", hasOrders ? "AVAILABLE" : "SOURCE_PENDING"));
```

### 前端可选防护（非必须）

`frontend/src/api/workbenchProjection.ts` 中可添加空值防护：

```typescript
.map(source => `${moduleLabel(source.source)}：${source.status ?? '未知'}${...}`)
```

## 验证步骤

1. 后端修改后部署
2. 刷新工作台页面
3. 来源警告应显示 `SalesOrder： SOURCE_PENDING` 而非 `SalesOrder： undefined`
4. 有数据后（如创建销售订单）`SalesOrder` 状态变为 `AVAILABLE`，从警告列表中消失

## 关联

| 关联项 | 说明 |
|---|---|
| PRD 7.2.3 | 工作台来源状态字段定义（`availability`、`sourceVersion`） |
| PRD 7.2.2 | 刷新与缓存策略（超过 5 分钟未同步显示"待核对"） |
| `AC-PH1-040` | 角色指标矩阵与事实缺失策略 |

