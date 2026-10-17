# 新增交付真实联调补充问题

日期：2026-10-17。状态：待后端处理，本轮没有修改后端源码。证据租户`TENANT-C561AA20`，候选Java8082、前端5183、PostgreSQL `industrial_ai`。

本表追加BD-12～15，原BD-01～11继续参照`docs/plan/2026-10-17-backend-delivery-review-and-frontend-residual-fixes.md`；完整执行范围和18项受阻检查见`docs/plan/2026-10-17-new-capabilities-end-to-end-integration.md`。

| 编号 / 等级 | 位置 → 问题 | 为什么阻断 | 修改及验收标准 |
| --- | --- | --- | --- |
| BD-12 / 阻断 | `backend/src/main/java/com/wanshen/platform/platform/PlatformController.java:375` → 员工/平台账号按契约新增不传type，返回500。必填校验通过后却用不可变Set.contains(null)检查type；traceId=61d/61f | 真实人员/账号开户链失败，不能只靠默认管理员验证后续审批 | 按kind检查对应字段，员工/账号检查status，资源检查type，参数检查valueType，审批检查resolver；不向契约添加无业务含义的type来兼容。正常新增/编辑成功并DB回读；缺必填/非法枚举400/422且不落库 |
| BD-13 / 阻断 | `backend/src/main/java/com/wanshen/platform/platform/TenantCatalog.java:15`及真实IAM展开 → 目录72条，TENANT_ADMIN有效75条，仍缺`finance.payment.read`、`finance.payment.confirm`、`sales.order.review.decide`、`sales.rma.approve`、`procurement.request.approve`、`production.quality.inspect` | 注册管理员的`*`掩盖普通账号授权缺口。实际独立RMA/采购审批403；财务确认和质检无法正常授权。前端不能伪造动作码或扩大范围 | 对齐全部Controller/Service动作码、菜单和角色授权；公开目录可选、真实角色配置可授权、重新登录生效；普通未授权403，独立复核员正常办理；覆盖字段权限、范围与职责分离，不把所有角色默认给`*` |
| BD-14 / 阻断 | `backend/src/main/java/com/wanshen/platform/fulfillment/FulfillmentService.java:1259`与财务来源链 → 正式出库POSTED10 PCS、客户SIGNED后，API/DB AR均为0；完成检查缺AR结算 | PRD第17章已冻结平台内来源行AR，缺正式AR使确认收款/Allocation/核销/销售完成无法联调；不允许前端按订单额补造 | 明确来源金额、币种、税口径和来源行，接通确权→AR、幂等/重试和审计。限定测试租户启用所需消费者后验证有界最终一致性；单次/部分出库/同事件重放生成正确AR，缺金额返回可追踪依赖状态。本轮候选定时Worker关闭，不能仅凭即时空查询断言所有异步路径均失败；当前源码检索也未找到普通来源AR创建消费实现，后端需给出可执行链路 |
| BD-15 / 阻断 | `backend/src/main/java/com/wanshen/platform/finance/FinanceController.java:476` → 登记人直接调用自己的Payment确认接口返回200，DB pending→done、version=2 | 仅前端禁用按钮，调用接口可绕过职责分离。会使真实复核要求失效 | 服务端按冻结规则验证登记人/确认人及显式例外；普通本人确认403且Payment/Allocation/余额不变，另一有权账号确认一次成功，旧版本/重放/并发有正式结果；不能用前端限制替代 |

BD-15隔离反例：Payment `0c74fa3c-86ee-4fdf-8304-e830e7f6c8f1`，7 CNY、无AR关联。该单随后用假审批凭证被冲销201，最终reversed/version=3，复现原BD-08。两次错误成功都是数据库实际写入，不是页面假状态；不代表已验证AR/AP余额恢复。

测试夹具说明：平台正常请求失败后，仅诊断夹具额外提交type=status继续独立场景，未修改正式前端或后端。两项500保留为阻断。采购未获审批、未生成采购收货，因此AP是前置受阻而非已复现的独立AP缺陷。
