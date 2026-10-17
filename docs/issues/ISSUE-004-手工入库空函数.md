# ISSUE-004：手工入库空函数（P0）
- 级别：P0 | 模块：库存 | 状态：✅ 已修复
## 问题
手工入库按钮 onclick 空函数，点击无响应。
## 方案
实现手工入库弹窗，调用 inventoryApi.importAvailability。
## 验收
点击按钮打开弹窗，填写后创建库存。
## 进展
✅ 已修复
