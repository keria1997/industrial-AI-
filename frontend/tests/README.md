# 浏览器验证

- `liveBackend.e2e.mjs`：真实数据库、Java API、Vite代理和页面联调；不拦截请求、不注入会话。迁移台账逐份核对本地服务构建产物中的SQL文件名和SHA-256，不以非空台账替代迁移有效性。运行方式、账号与写入清理边界见 `frontend/README.md`。
- `remediation.e2e.mjs`：受控 API 下的命令、幂等、分页和权限回归；包含角色scopeValues缺失、null及错误类型时的页面、范围修复草稿和禁止发布检查。
- `prototypeStorage.e2e.mjs`：受控空响应/异常响应及退役浏览器缓存清理回归。
- `businessFacts.e2e.mjs`：受控接口字段与组件事实映射回归。
- `numericDraft.e2e.mjs`：数字输入清空、零值回显、小数中间态、提交校验、数量守恒和保存失败保留草稿回归。在 `frontend` 目录运行 `node tests/numericDraft.e2e.mjs` 使用受控 API；`NUMERIC_LIVE=1 node tests/numericDraft.e2e.mjs` 使用本地 `.env.local` 账号真实登录，仅读取和取消草稿，不提交业务数据。结果分别写入根目录 `artifacts/numeric-input-controlled` 和 `artifacts/numeric-input-live`。
- `backendDeliveryWrite.e2e.mjs`：新增交付的真实写入联调。执行注册/验证码登录、仓库和产品编辑、库存CSV导入、出库幂等、签收及补签、MRP到PR、生产报工、财务反例、重登回读；逐项以只读SQL核对PostgreSQL。报告明确区分UI写入和API写入后页面读取；不拦截请求、不注入会话、不写SQL夹具。

受控回归的通过结果不代表服务端已持久化，更不代表数据库业务闭环已验收。真实联调遇到就绪检查、鉴权或数据库不一致时保留阻断证据并返回非零退出码。

## 新增交付写入联调

在 `frontend` 执行：

```sh
FRONTEND_TEST_URL=http://127.0.0.1:5183 \
LIVE_REPORT_DIR=/tmp/industrial-ai-delivery-write-fresh \
npm run test:backend-delivery-write
```

- 要求根目录 `.env.local` 配置 `DATABASE_URL`，本地有 `psql`、Node.js和Playwright Chromium，前端代理到待验收Java服务；不在脚本中启动、替换或重启服务。默认前端端口5183。
- 这是写入测试：通过公开注册创建独立企业，随后仅在该租户使用公开业务接口写入明确标记的测试单据。财务反例会尝试自确认及假审批凭证；仅在隔离测试数据库运行。不会修改已有企业数据，不会直接删除数据库记录。
- 同一输出目录保存私有运行状态以便恢复；要验证全新的UI写入，使用不存在的新目录。目录权限0700，`private-state.json`权限0600，包含测试账号密码，禁止提交或分享。正式交付只保留不含凭据的`report.json`。
- 每个检查失败后继续独立场景，最终有任一阻断则退出1；不能因脚本运行结束宣布验收通过。复跑夹具回读也不等于再次执行UI新增，报告中的`uiCreatedThisRun`用于区分MRP请购。
- 当前平台员工/账号正常请求500时，脚本先记录失败，再只对诊断夹具增加`type=status`继续探查；原始失败和兼容字段保留在报告中，不计为平台新增通过，也不修改生产代码。修复后应以新目录重测无兼容字段的正常链。
- 采购审批阻断时，生产场景独立导入20 PCS测试物料继续核验报工；不能计为采购收货。质检使用真实注册管理员权限，仅为探查完工来源守卫，不能计为独立质检授权通过。
- 忘记密码仅在邮件提供方未配置或为console时探查，不调用外部邮件投递；无验证码入库、无AR/AP或无正式完工来源时记录阻断，不补造来源事实。
- 截图和单据保留供追踪。脚本不会自动清理测试租户；数据库保留规则由测试环境维护人处理。真实外部WMS、邮件、银行、ERP投递、并发及非特权数据库RLS需要另外验收。
