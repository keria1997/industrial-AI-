# 浏览器验证

- `liveBackend.e2e.mjs`：真实数据库、Java API、Vite代理和页面联调；不拦截请求、不注入会话。运行方式、账号与写入清理边界见 `frontend/README.md`。
- `remediation.e2e.mjs`：受控 API 下的命令、幂等、分页和权限回归。
- `prototypeStorage.e2e.mjs`：受控空响应/异常响应及退役浏览器缓存清理回归。
- `businessFacts.e2e.mjs`：受控接口字段与组件事实映射回归。

后三者的通过结果不代表服务端已持久化，更不代表数据库业务闭环已验收。真实联调遇到就绪检查、鉴权或数据库不一致时保留阻断证据并返回非零退出码。
