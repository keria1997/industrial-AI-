# 浏览器验证

- `liveBackend.e2e.mjs`：真实数据库、Java API、Vite代理和页面联调；不拦截请求、不注入会话。迁移台账逐份核对本地服务构建产物中的SQL文件名和SHA-256，不以非空台账替代迁移有效性。运行方式、账号与写入清理边界见 `frontend/README.md`。
- `remediation.e2e.mjs`：受控 API 下的命令、幂等、分页和权限回归；包含角色scopeValues缺失、null及错误类型时的页面、范围修复草稿和禁止发布检查。
- `prototypeStorage.e2e.mjs`：受控空响应/异常响应及退役浏览器缓存清理回归。
- `businessFacts.e2e.mjs`：受控接口字段与组件事实映射回归。
- `numericDraft.e2e.mjs`：数字输入清空、零值回显、小数中间态、提交校验、数量守恒和保存失败保留草稿回归。在 `frontend` 目录运行 `node tests/numericDraft.e2e.mjs` 使用受控 API；`NUMERIC_LIVE=1 node tests/numericDraft.e2e.mjs` 使用本地 `.env.local` 账号真实登录，仅读取和取消草稿，不提交业务数据。结果分别写入根目录 `artifacts/numeric-input-controlled` 和 `artifacts/numeric-input-live`。

受控回归的通过结果不代表服务端已持久化，更不代表数据库业务闭环已验收。真实联调遇到就绪检查、鉴权或数据库不一致时保留阻断证据并返回非零退出码。
