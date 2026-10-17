# 生产管理前端

生产页面入口仍为 `src/App.tsx` 的 `LegacyProductionManagement`。本目录承载正式业务组件和模型，不保存业务原型数据。

- `components/FormalBomPanel.tsx`：BOM 正式列表、产品需求上下文、发布回读及返回入口。
- `components/FormalBomEditor.tsx`：正式主数据选择、字段草稿、版本冲突及未知发布结果处理。
- `model/bomDraft.ts`：发布输入校验与十进制归一化，不生成服务端事实。
- `model/bomMasterData.ts`：读取产品、物料、库存仓库及工作中心；不依赖库存可用量。
- `model/useProductionToast.ts`：生产提示的 5 秒生命周期与身份隔离。
- `model/productionError.ts`：展示已有 API 错误、建议及追踪号。

浏览器仅请求业务后端。接口契约见 `docs/openapi/backend/v1/production-bom-demand.yaml`；没有生产需求暂缓接口，禁用入口不调用工单暂停命令。

验证：`npm run typecheck`、`npm run test:frontend`、`npm run build`，以及 `node tests/productionBomRecovery.e2e.mjs`。后者为受控前端回归，不代表真实数据库验收。

本地真实闭环：`node tests/productionBomRecovery.live.e2e.mjs`，需配置本地数据库和已创建的联调隔离租户状态文件 `ISSUE019_LIVE_STATE`。脚本只允许本地站点，经 API 创建专用产品和需求，页面执行发布/校验，SQL 只读核对；状态文件含凭据，不得提交。结果及部署验收边界见 `docs/plan/2026-10-17-issue-019-implementation-report.md`。
