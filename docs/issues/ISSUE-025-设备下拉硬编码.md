# ISSUE-020：设备注册弹窗硬件种类和健康状态下拉为硬编码固定值

> 发现日期：2026-10-17
> 环境：http://124.222.114.67/（部署环境）
> 模块：生产管理 → 基础主数据 → 设备机台 → 注册物理设备
> 级别：P2 可维护性
> 状态：后端已实现分类筛选和字典校验；前端待接入。部署环境 Playwright 验证确认下拉仍为硬编码 2+3 个选项，未接入字典 API。

## 问题描述

注册物理生产机台弹窗中，"硬件种类"和"健康状态"两个下拉框的选项为代码内硬编码固定值，未从平台字典或后端 API 获取。

- 硬件种类仅有 2 个选项（贴片加工设备 / 装配装配站）
- 健康状态仅有 3 个选项（运行正常 / 闲置待产 / 故障停机）

无法通过平台管理 → 字典功能扩展设备类型或健康状态选项。

## 代码定位

**文件**：`frontend/src/App.tsx` 第 3808~3816 行

```tsx
// 硬件种类 - 硬编码 2 个选项
<select value={type} onChange={e=>setType(e.target.value)} ...>
    <option value="SMT">贴片加工设备</option>
    <option value="Assembly">装配装配站</option>
</select>

// 健康状态 - 硬编码 3 个选项
<select value={status} onChange={e=>setStatus(e.target.value)} ...>
    <option>运行正常</option>
    <option>闲置待产</option>
    <option>故障停机</option>
</select>
```

## 后端字典 API

后端已有字典管理 API：
- `GET /api/v1/platform/dictionaries` — 查询字典列表
- `POST /api/v1/platform/dictionaries` — 新增字典
- `PATCH /api/v1/platform/dictionaries/{id}` — 修改字典

> 2026-10-17 后端实施：`GET /api/v1/platform/dictionaries` 已支持 `category` 和 `status` 查询参数，结果按 `sortOrder/code/name` 排序。新增/修改专用校验 `category/code/name/status/sortOrder`，并在租户内强制 `category + code` 唯一；重复返回 `PLATFORM_409_DICTIONARY_DUPLICATE`。后端不预置 `equipment_type` 或 `equipment_health_status` 数据。

平台管理页面已有字典管理功能，可维护字典条目。

## 修改方案

依赖字典 API，从平台字典动态加载下拉选项。**不预置字典条目**，由用户在平台管理 → 字典中自行维护。

### 实现方式

1. 前端在设备注册弹窗打开时，调用 `GET /api/v1/platform/dictionaries` 按分类过滤：
   - 硬件种类：分类 `equipment_type`
   - 健康状态：分类 `equipment_health_status`
2. 将返回的字典条目动态渲染为 `<option>`
3. 字典无条目时下拉为空，提示"请先在平台管理 → 字典中配置"

### 数据流

```
用户操作: 平台管理 → 字典 → 新增条目（分类: equipment_type）
                              新增条目（分类: equipment_health_status）
    ↓
设备注册弹窗打开
    → GET /api/v1/platform/dictionaries?category=equipment_type
    → GET /api/v1/platform/dictionaries?category=equipment_health_status
    → 动态渲染 <option>
```

## 修改范围

| 文件 | 修改内容 |
|---|---|
| `frontend/src/App.tsx` 设备注册弹窗 | 硬件种类和健康状态 `<select>` 的 `<option>` 替换为从字典 API 动态加载 |
| `frontend/src/api/platform/client.ts` | 确认已有字典查询方法（`listDictionaries` 或等效） |

## 前置条件

- 用户在平台管理 → 字典中自行添加 `equipment_type` 和 `equipment_health_status` 分类的字典条目
- 未添加条目时下拉为空，不影响保存（允许值为空）

## 验证步骤

1. 平台管理 → 字典 → 新增分类 `equipment_type` 条目（如"贴片加工设备"）
2. 平台管理 → 字典 → 新增分类 `equipment_health_status` 条目（如"运行正常"）
3. 生产管理 → 设备机台 → 注册物理设备
4. 硬件种类下拉应显示步骤 1 添加的条目
5. 健康状态下拉应显示步骤 2 添加的条目
6. 保存后列表中显示所选值


### 部署环境验证（2026-10-17）

Playwright 访问 https://erp.wanshen.top/ 确认：

| 下拉框 | 当前选项 | 状态 |
|---|---|---|
| 硬件种类 | `["贴片加工设备","装配装配站"]` | ❌ 仍为硬编码 2 个选项 |
| 健康状态 | `["运行正常","闲置待产","故障停机"]` | ❌ 仍为硬编码 3 个选项 |

**结论：ISSUE-025 未修复。** 前端设备注册弹窗中的下拉选项仍为代码内硬编码 `<option>` 元素，未对接字典 API。
