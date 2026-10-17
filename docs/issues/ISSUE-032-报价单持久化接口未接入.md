# ISSUE-032：报价单持久化接口未接入，无法保存或转单

- 级别：P1
- 模块：销售管理
- 层级：L1 业务域层
- 影响范围：前端、后端
- 状态：🔴 待修复

## 问题

销售管理 → 产品报价页签顶部显示黄色警告横幅：

> 报价单持久化接口尚未接入，当前不能保存或转单。

用户无法创建、保存或转单报价。报价单总数为 0，列表为空。

### 复现步骤

1. 登录系统
2. 销售管理 → 产品报价
3. 页面顶部显示警告横幅"报价单持久化接口尚未接入"
4. 点击"新增报价单"→ 弹窗可打开但保存后数据仅存 localStorage，刷新丢失

## 原因

### 后端 API 已存在（✅）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/fulfillment/quotes` | 列表查询 |
| POST | `/api/v1/fulfillment/quotes` | 创建报价单 |

后端代码位置：`SalesFulfillmentController.java` 第 337~357 行。数据存储于 `module_document` 表（kind=quote）。

### 前端未对接（❌）

| 检查项 | 状态 | 说明 |
|---|---|---|
| API 客户端函数 | ❌ 缺失 | `fulfillment.ts` 中无 `listQuotes`/`createQuote` 函数 |
| 数据加载 | ❌ 未对接 | `useState(() => persistedWorkspace?.quotes || sales_quotesData)` 使用 localStorage |
| 保存操作 | ❌ 未对接 | 新建/编辑报价仅写入 localStorage，不调后端 API |
| 警告横幅 | ❌ 硬编码 | `App.tsx` line 3408 无条件显示"尚未接入"文案 |
| 转单操作 | ❌ 未对接 | 报价转单逻辑仅在本地 state 操作 |

### 根因

前端从 `projects-1014` 复制时，报价模块保留的是 **localStorage 原型代码**，未对接后端已有的 `/api/v1/fulfillment/quotes` API。警告横幅是硬编码的条件渲染，不是动态检测。

## 方案

### 前端修改

| 文件 | 具体改动 |
|---|---|
| `frontend/src/api/fulfillment.ts` | 新增 `listQuotes(context)` 和 `createQuote(context, body)` 函数 |
| `frontend/src/App.tsx` line 3408 | 移除硬编码警告横幅，替换为动态判断（API 失败时才显示） |
| `frontend/src/App.tsx` SalesManagement | 添加 `useEffect` 从 API 加载报价列表，替代 localStorage |
| `frontend/src/App.tsx` Sales_QuoteCreateModal | 提交时调用 `createQuote` API 而非仅写 localStorage |
| `frontend/src/App.tsx` Sales_QuotesView | 操作按钮（审批转单/编辑）调用后端 API |

### 后端修改

无需修改。后端 API 已完整。

## 验收标准

1. 产品报价页签不再显示"尚未接入"警告
2. 新增报价单后数据持久化到数据库（刷新不丢失）
3. 报价列表从后端 API 加载
4. 报价转单功能正常（转单后生成销售订单）

## 进展

🔴 待修复

