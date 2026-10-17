# ISSUE-020：设备注册弹窗硬件种类和健康状态下拉为硬编码固定值

> 发现日期：2026-10-17
> 环境：http://124.222.114.67/（部署环境）
> 模块：生产管理 → 基础主数据 → 设备机台 → 注册物理设备
> 级别：P2 可维护性
> 状态：**新增**

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

平台管理页面已有字典管理功能，可维护字典条目。

## 修改方案

将硬编码 `<select>` 下拉框替换为自由文本输入框 `<input type="text">`，由用户自行输入设备种类和健康状态。

**不预置字典条目，不依赖字典 API。**

### 修改示例

```tsx
// 修改前：硬编码 <select> 下拉
<select value={type} onChange={e=>setType(e.target.value)} ...>
    <option value="SMT">贴片加工设备</option>
    <option value="Assembly">装配装配站</option>
</select>

// 修改后：自由文本输入
<input
    type="text"
    value={type}
    onChange={e=>setType(e.target.value)}
    placeholder="请输入硬件种类"
    className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white"
/>
```

健康状态同理，将 `<select>` 替换为 `<input type="text">`。

## 修改范围

| 文件 | 修改内容 |
|---|---|
| `frontend/src/App.tsx` 设备注册弹窗（line 3808~3816） | 硬件种类 `<select>` → `<input type="text">`，健康状态 `<select>` → `<input type="text">` |

## 验证步骤

1. 生产管理 → 基础主数据 → 设备机台 → 注册物理设备
2. 硬件种类和健康状态应为文本输入框，可自由输入任意值
3. 输入后保存，列表中显示用户输入的值

