# ISSUE-19：工作台刷新后仍显示"数据已失效"且来源警告包含 SOURCE_PENDING

> 发现日期：2026-10-17
> 环境：http://124.222.114.67/
> 级别：P1 体验
> 状态：未修复

## 问题描述

点击刷新按钮后，工作台仍显示"数据已失效"，并持续显示来源警告：

```
RevenueRecognition：SOURCE_PENDING (SOURCE_MISSING)
ShipmentRecognition：SOURCE_PENDING (SOURCE_MISSING)
```

## 根因分析

### 子问题 1：刷新后"数据已失效"不消失

后端 WorkbenchController.java 第 306-307 行：

```java
data.put("generatedAt", Instant.now().toString());
data.put("dataAsOf", latestSourceTime(salesOrders, receivables, messageRecords));
```

前端 workbenchProjection.ts 优先使用 dataAsOf：

```typescript
generatedAt: data.dataAsOf || data.generatedAt,
```

前端 useWorkbenchDashboard.ts 用它计算数据新鲜度：

```typescript
const at = Date.parse(data.generatedAt);  // 实际是 dataAsOf
expired: age > 1800 && Boolean(m.data),
```

根因：当数据库无业务数据变更时，dataAsOf 不变，age 始终 > 1800 秒。即使点击刷新（API 重新响应），dataAsOf 仍为旧值。

### 子问题 2：RevenueRecognition/ShipmentRecognition 来源警告

WorkbenchController.java 第 369-377 行：

RevenueRecognition 硬编码为 SOURCE_PENDING（无条件判断）。
ShipmentRecognition 依赖 shipmentRecognized 标志（无发货任务时为 false）。

这是正确的业务状态（没有发货数据），但前端将其显示为警告样式。

## 修复方案

### 子问题 1：前端 workbenchProjection.ts 修改新鲜度时间来源

修改前：`generatedAt: data.dataAsOf || data.generatedAt`
修改后：`generatedAt: data.generatedAt || data.dataAsOf`

优先使用 API 响应时间而非业务数据时间，刷新后 age 归零。

### 子问题 2：前端 workbenchProjection.ts 区分警告和提示

将 sourceWarnings 过滤条件从 `status !== 'AVAILABLE'` 改为 `status === 'UNAVAILABLE'`，
SOURCE_PENDING 状态不进入警告列表（正常空态不是错误）。

## 验证步骤

1. 修复后部署
2. 刷新工作台 → "数据已失效"应消失
3. 来源警告不再显示 SOURCE_PENDING 项
