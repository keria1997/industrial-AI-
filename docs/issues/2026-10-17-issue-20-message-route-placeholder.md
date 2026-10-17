# ISSUE-20：消息路由规则新建表单占位符作为值写入，无法消失

> 发现日期：2026-10-17
> 环境：http://124.222.114.67/
> 模块：消息管理 → 新建路由规则
> 级别：P2 体验
> 状态：未修复

## 问题描述

新建路由规则弹窗中，"触发条件"输入框显示"请选择业务事件与触发阈值"，用户点击后文字被选中（蓝色高亮），但无法消失——因为它是输入框的**实际值**而非 HTML `placeholder` 属性。

同样受影响的字段：
- "发送给"：`请选择接收人或岗位`
- "规则名称"：`新建消息路由规则`
- 消息模板：`请输入消息模板，支持 {变量名} 作为动态变量。`

## 根因分析

**文件**：`frontend/src/App.tsx` 第 9361-9370 行

`createEmptyRule()` 函数将提示文字直接设为表单字段的**初始值**：

```javascript
const createEmptyRule = (index = 1) => ({
    name: '新建消息路由规则',            // ← 值，非 placeholder
    trigger: '请选择业务事件与触发阈值',   // ← 值，非 placeholder
    target: '请选择接收人或岗位',          // ← 值，非 placeholder
    template: '请输入消息模板，支持 {变量名} 作为动态变量。',  // ← 值
});
```

表单输入框使用受控组件绑定：

```jsx
<input value={draft.trigger} onChange={...} className="..." />
```

`draft.trigger` 初始值为 `'请选择业务事件与触发阈值'`，所以输入框显示的是**实际值**而非 placeholder。

## 修复方案

将 `createEmptyRule()` 的提示文字改为空字符串，在 JSX 的 `<input>` 上添加 `placeholder` 属性：

```javascript
// createEmptyRule 修改
const createEmptyRule = (index = 1) => ({
    name: '',
    trigger: '',
    target: '',
    channels: ['系统站内信'],
    aiRewrite: false,
    status: true,
    freq: '即时触达',
    template: ''
});
```

```jsx
// input 添加 placeholder
<input value={draft.trigger} placeholder="请选择业务事件与触发阈值" onChange={...} />
<input value={draft.target} placeholder="请选择接收人或岗位" onChange={...} />
<input value={draft.name} placeholder="新建消息路由规则" onChange={...} />
<textarea value={draft.template} placeholder="请输入消息模板，支持 {变量名} 作为动态变量。" ... />
```

## 验证步骤

1. 打开消息管理 → 新建路由规则
2. "触发条件"输入框应显示灰色占位文字"请选择业务事件与触发阈值"
3. 点击输入框输入内容后占位文字消失
4. 清空内容后占位文字重新出现
5. 同样验证"发送给"、"规则名称"、"消息模板"字段
