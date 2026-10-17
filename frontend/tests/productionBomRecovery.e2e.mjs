import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Controlled frontend regression only. All business API traffic is intercepted.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.ISSUE019_REPORT_DIR || '/tmp/industrial-ai-issue019-controlled';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const requests = [];
const errors = [];
const checks = [];
let permissions = ['*'];
let bom;
let publishMode = 'success';
let failRead = false;
let failMaterials = false;
let validationMode = 'normal';
let releaseValidation;
const demand = { id: 'demand-uuid-019', code: 'DM-019', productId: 'product-uuid-019', productName: '正式产品',
  sourceType: 'MANUAL', qty: '2', uom: 'PCS', dueDate: '2026-10-30', factoryResourceId: 'factory-uuid',
  status: 'RECEIVED', version: 1, blockReasons: [], createdBy: 'other', correlationId: 'corr-019', updatedAt: '2026-10-17T00:00:00Z' };
const product = { id: demand.productId, code: 'DISPLAY-PRODUCT-019', name: '正式产品', status: 'active', uom: 'PCS' };
const material = { id: 'material-uuid-019', code: 'DISPLAY-MATERIAL-019', name: '正式物料', status: 'active', uom: 'PCS' };
const warehouse = { id: 'warehouse-uuid-019', code: 'DISPLAY-WAREHOUSE-019', name: '授权仓库', status: 'active' };
const center = { id: 'center-uuid-019', code: 'DISPLAY-CENTER-019', name: '授权工作中心', status: 'enabled', type: 'work_center' };
await context.addInitScript(() => {
  if (sessionStorage.getItem('industrial-ai-session:v2')) return;
  sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
  account: 'issue019-controlled', name: '受控测试', role: '超级管理员', permissions: ['*'],
  tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-issue019', expiresAt: '2099-01-01T00:00:00Z',
  }));
});
await context.route('**/api/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (!path.startsWith('/api/')) return route.fallback();
  const method = request.method();
  const body = request.postData() ? request.postDataJSON() : undefined;
  requests.push({ path, method, body, headers: request.headers() });
  const json = (value, status = 200) => route.fulfill({ status, json: value });
  const failure = (message, status, code = 'CONTROLLED_ERROR') => json({ error: { code, message, traceId: 'trace-019', suggestion: '核对后重试' } }, status);
  if (path.endsWith('/production/readiness')) return json({ permissions });
  if (path.endsWith('/platform/snapshot')) return json({ tenant: { id: 'TENANT-SHWS', status: 'running' },
    resources: [center], orgUnits: [], employees: [], accounts: [], positions: [], roles: [], permissions: [], roleGrants: [], adapters: [], dictionaries: [], parameters: [], approvalRules: [], capabilities: [], audits: [] });
  if (path.endsWith('/platform/permission-resources')) return json([center]);
  if (path.endsWith('/inventory/products')) return json({ items: [product], total: 1 });
  if (path.endsWith('/inventory/materials')) return failMaterials ? failure('物料查询不可用', 503) : json({ items: [material], total: 1 });
  if (path.endsWith('/inventory/warehouses')) return json({ items: [warehouse], total: 1 });
  if (path.endsWith('/production/demands')) return json({ items: [{ ...demand }], total: 1 });
  if (path.endsWith('/validate')) {
    assert.deepEqual(body, {}, 'Validation must not hardcode master-data facts');
    if (validationMode === 'delay') {
      validationMode = 'normal';
      await new Promise(resolve => { releaseValidation = resolve; });
    }
    if (validationMode === 'conflict') {
      validationMode = 'normal'; demand.version++;
      return failure('需求版本冲突', 409, 'PRODUCTION_409_VERSION_CONFLICT');
    }
    demand.version++;
    const reasons = !bom ? ['缺少服务端生效 BOM']
      : !bom.routingSnapshot?.operations?.length || bom.routingSnapshotId !== bom.routingSnapshot.id
        ? ['缺少服务端生效工艺快照'] : [];
    demand.status = reasons.length ? 'BLOCKED' : 'PENDING_REVIEW';
    demand.blockReasons = reasons;
    return json({ ...demand });
  }
  if (path.endsWith('/production/bom-snapshots')) {
    if (method === 'GET') return failRead ? failure('BOM 回读不可用', 503) : json(bom ? [bom] : []);
    if (publishMode === 'conflict') {
      publishMode = 'success'; bom.version++;
      return failure('BOM 版本冲突', 409, 'PRODUCTION_409_VERSION_CONFLICT');
    }
    if (publishMode === 'uncommitted') {
      publishMode = 'success';
      return failure('发布结果未知', 503);
    }
    const mode = publishMode;
    publishMode = 'success';
    bom = { ...body, id: 'bom-uuid-019', version: (bom?.version || 0) + 1, status: 'EFFECTIVE', publishedBy: 'publisher', updatedAt: '2026-10-17T00:00:00Z' };
    if (mode === 'committed') return failure('发布响应丢失', 503);
    if (mode === 'read-fail') failRead = true;
    return json(bom, 201);
  }
  if (['/inventory/availability', '/production/completions', '/production/inspections', '/production/work-order-closes'].some(suffix => path.endsWith(suffix))) return json([]);
  return json({ items: [], total: 0 });
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const visit = async query => { await page.goto(`${baseUrl}/?module=production&${query}`); await page.waitForLoadState('networkidle'); };
const posts = suffix => requests.filter(request => request.method === 'POST' && request.path.endsWith(suffix));
const row = () => page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'DM-019', exact: true }) });
const dialog = () => page.getByRole('dialog', { name: '发布生效 BOM', exact: true });
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
const revision = async () => { await visit('production=bom'); await page.getByRole('button', { name: '修订发布', exact: true }).click(); };
try {
  await visit('production=mps&probe=019');
  await row().waitFor();
  assert(await row().getByRole('button', { name: '暂缓', exact: true }).isDisabled());
  await page.getByText('暂缓暂未开放', { exact: true }).waitFor();
  await row().getByRole('button', { name: '需求校验', exact: true }).click();
  await row().getByText('缺少服务端生效 BOM', { exact: true }).waitFor();
  assert.equal(demand.status, 'BLOCKED');
  assert.equal(await row().getByRole('button', { name: '审批需求', exact: true }).count(), 0);
  record('无 BOM 保持阻断，暂缓禁用且无暂缓请求');

  await row().getByRole('button', { name: '维护 BOM', exact: true }).click();
  await page.getByRole('button', { name: '发布生效 BOM', exact: true }).click();
  assert.equal(await dialog().getByLabel('产品 ID', { exact: true }).inputValue(), product.id);
  assert(await dialog().getByLabel('产品 ID', { exact: true }).getAttribute('readonly') !== null);
  await dialog().getByRole('button', { name: '添加物料', exact: true }).click();
  await dialog().getByRole('button', { name: '添加工序', exact: true }).click();
  await dialog().getByLabel('materialId-0', { exact: true }).selectOption(material.id);
  await dialog().getByLabel('warehouseId-0', { exact: true }).selectOption(warehouse.id);
  await dialog().getByLabel('workCenterResourceId-0', { exact: true }).selectOption(center.id);
  for (const [name, value] of [['sequence-0', '10'], ['code-0', 'OP10'], ['name-0', '组装'], ['standardMinutes-0', '5']]) await dialog().getByLabel(name, { exact: true }).fill(value);
  const beforeInvalid = posts('/bom-snapshots').length;
  await dialog().getByRole('button', { name: '确认发布', exact: true }).click();
  await dialog().getByText('用量须为大于 0 的十进制数', { exact: true }).waitFor();
  assert.equal(posts('/bom-snapshots').length, beforeInvalid);
  await dialog().getByLabel('qtyPer-0', { exact: true }).fill('1.25');
  publishMode = 'read-fail';
  await dialog().getByRole('button', { name: '确认发布', exact: true }).click();
  await page.getByText(/发布已成功，回读失败/).waitFor();
  assert.equal(demand.status, 'BLOCKED', 'Publication cannot validate the demand');
  const published = posts('/bom-snapshots').at(-1);
  assert.equal(published.body.productId, product.id);
  assert.equal(published.body.lines[0].materialId, material.id);
  assert.equal(published.body.lines[0].warehouseId, warehouse.id);
  assert.equal(published.body.routingSnapshot.operations[0].workCenterResourceId, center.id);
  assert.equal(published.headers['idempotency-key'], published.headers['x-idempotency-key']);
  failRead = false;
  await page.getByRole('button', { name: '刷新生效版本', exact: true }).click();
  await page.getByRole('button', { name: '发布生效 BOM', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '返回原需求', exact: true }).click();
  await row().waitFor();
  assert.equal(new URL(page.url()).searchParams.get('probe'), '019');
  assert.equal(await row().getAttribute('aria-current'), 'true');
  await row().getByRole('button', { name: '需求校验', exact: true }).click();
  await row().getByText('待审批', { exact: true }).waitFor();
  assert.equal(posts('/validate').at(-1).headers['if-match'], '"2"');
  record('稳定 ID 发布、成功与回读失败区分、保留导航、主动重新校验');
  await page.screenshot({ path: '/tmp/industrial-ai-issue019-mps.png' });

  const effectiveBom = bom;
  bom = { ...bom, routingSnapshot: { ...bom.routingSnapshot, operations: [] } };
  demand.status = 'RECEIVED'; demand.blockReasons = [];
  await visit('production=mps');
  await row().getByRole('button', { name: '需求校验', exact: true }).click();
  await row().getByText('缺少服务端生效工艺快照', { exact: true }).waitFor();
  assert.equal(await row().getByRole('button', { name: '审批需求', exact: true }).count(), 0);
  assert.equal(await row().getByRole('button', { name: '维护 BOM', exact: true }).count(), 1);
  bom = effectiveBom;
  record('BOM 存在但无工艺时仍展示正式阻断，不提前进入审批');

  await revision();
  await dialog().getByLabel('qtyPer-0', { exact: true }).fill('3');
  publishMode = 'conflict';
  await dialog().getByRole('button', { name: '确认发布', exact: true }).click();
  await dialog().getByText(/BOM 版本冲突.*trace-019/).waitFor();
  assert(await dialog().getByRole('button', { name: '确认发布', exact: true }).isDisabled());
  await dialog().getByRole('button', { name: '读取最新版本并核对', exact: true }).click();
  await dialog().getByText(/已保留输入，请核对后再确认发布/).waitFor();
  assert.equal(await dialog().getByLabel('qtyPer-0', { exact: true }).inputValue(), '3');
  await dialog().getByRole('button', { name: '确认发布', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  assert.equal(posts('/bom-snapshots').at(-1).headers['if-match'], '"2"');
  record('BOM 冲突保留输入，读取最新版本后显式确认');

  await revision();
  publishMode = 'uncommitted';
  await dialog().getByRole('button', { name: '确认发布', exact: true }).click();
  await dialog().getByText('发布结果待确认，请先核对服务端结果。', { exact: true }).waitFor();
  assert(await dialog().getByLabel('qtyPer-0', { exact: true }).isDisabled());
  assert(await dialog().getByRole('button', { name: '重试同一次发布', exact: true }).isDisabled());
  await dialog().getByRole('button', { name: '核对发布结果', exact: true }).click();
  await dialog().getByText(/尚未确认本次发布结果/).waitFor();
  await dialog().getByRole('button', { name: '重试同一次发布', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  const attempts = posts('/bom-snapshots').slice(-2);
  assert.deepEqual(attempts[0].body, attempts[1].body);
  assert.equal(attempts[0].headers['idempotency-key'], attempts[1].headers['idempotency-key']);
  assert.equal(attempts[0].headers['if-match'], attempts[1].headers['if-match']);
  record('未知发布结果先核对，按相同 key/body/version 重试');

  await revision();
  publishMode = 'committed';
  await dialog().getByRole('button', { name: '确认发布', exact: true }).click();
  await dialog().getByRole('button', { name: '核对发布结果', exact: true }).waitFor();
  const committedCount = posts('/bom-snapshots').length;
  await dialog().getByRole('button', { name: '核对发布结果', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  assert.equal(posts('/bom-snapshots').length, committedCount);
  record('发布响应丢失时通过正式回读确认，无第二次发布');

  failRead = true;
  await visit('production=bom');
  await page.getByText(/读取失败：BOM 回读不可用/).waitFor();
  assert.equal(await page.getByText('正在加载生效版本', { exact: true }).count(), 0);
  failRead = false;
  await page.getByRole('button', { name: '刷新生效版本', exact: true }).click();
  await page.getByRole('button', { name: '修订发布', exact: true }).click();
  await dialog().getByRole('button', { name: '取消', exact: true }).click();
  failMaterials = true;
  await page.getByRole('button', { name: '修订发布', exact: true }).click();
  await dialog().getByText(/物料读取失败/).waitFor();
  assert(await dialog().getByRole('button', { name: '确认发布', exact: true }).isDisabled());
  failMaterials = false;
  await dialog().getByRole('button', { name: '重试读取物料', exact: true }).click();
  await dialog().getByRole('button', { name: '取消', exact: true }).click();
  record('BOM 与主数据的读取失败、重试、空态不混淆');

  demand.status = 'BLOCKED'; demand.blockReasons = ['缺少服务端生效 BOM'];
  validationMode = 'conflict';
  await visit('production=mps');
  await row().getByRole('button', { name: '需求校验', exact: true }).click();
  await row().getByText(/需求版本冲突.*已核对服务端最新状态/).waitFor();
  validationMode = 'delay';
  const validationsBefore = posts('/validate').length;
  await row().getByRole('button', { name: '需求校验', exact: true }).evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(() => document.querySelector('button[aria-busy="true"]'));
  while (!releaseValidation) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(posts('/validate').length, validationsBefore + 1);
  releaseValidation();
  await row().getByText('待审批', { exact: true }).waitFor();
  record('需求版本冲突回读，同一需求快速连点只提交一次');

  permissions = ['production.demand.read', 'production.demand.review'];
  await page.evaluate(permissions => {
    const session = JSON.parse(sessionStorage.getItem('industrial-ai-session:v2'));
    sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({ ...session, permissions }));
  }, permissions);
  demand.status = 'BLOCKED'; demand.blockReasons = ['缺少服务端生效 BOM'];
  await visit('production=mps');
  await row().getByText('请由具备 BOM 管理权限的人员维护。', { exact: true }).waitFor();
  assert.equal(await row().getByRole('button', { name: '维护 BOM', exact: true }).count(), 0);
  await visit('production=bom');
  assert(await page.getByRole('button', { name: '发布生效 BOM', exact: true }).isDisabled());
  record('校验权限不等于 BOM 发布权限');

  permissions = ['*'];
  await page.evaluate(permissions => {
    const session = JSON.parse(sessionStorage.getItem('industrial-ai-session:v2'));
    sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({ ...session, permissions }));
  }, permissions);
  await visit('production=bom');
  await page.getByRole('button', { name: '修订发布', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dialog().boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391);
  await page.screenshot({ path: '/tmp/industrial-ai-issue019-mobile.png' });
  await dialog().getByRole('button', { name: '取消', exact: true }).click();
  record('移动视口 BOM 编辑组件不越界');

  // Exercise the actual hook with deterministic browser timers and stale callbacks.
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useProductionToast } = await import('/src/features/production/model/useProductionToast.ts');
    const host = document.createElement('div'); host.id = 'toast-019'; document.body.append(host);
    window.toastScope = 'a';
    function Harness() {
      const toast = useProductionToast(window.toastScope);
      window.toast019 = toast;
      return React.createElement('p', null, toast.toast.show ? toast.toast.msg : '');
    }
    window.toastRoot019 = (ReactDOM.createRoot || ReactDOM.default.createRoot)(host);
    window.renderToast019 = () => window.toastRoot019.render(React.createElement(Harness));
    window.renderToast019();
  });
  await page.waitForFunction(() => !!window.toast019);
  await page.clock.install();
  await page.evaluate(() => window.toast019.showToast('A'));
  await page.clock.runFor(2000);
  await page.evaluate(() => window.toast019.showToast('B'));
  await page.clock.runFor(3100);
  assert.equal(await page.locator('#toast-019').textContent(), 'B');
  await page.clock.runFor(2000);
  assert.equal(await page.locator('#toast-019').textContent(), '');
  await page.evaluate(() => { window.toast019.showToast('C'); window.toast019.closeToast(); window.toast019.showToast('D'); });
  await page.clock.runFor(4900);
  assert.equal(await page.locator('#toast-019').textContent(), 'D');
  await page.evaluate(() => { window.oldToast019 = window.toast019.showToast; window.toastScope = 'b'; window.renderToast019(); });
  await page.clock.runFor(100);
  await page.evaluate(() => window.oldToast019('旧身份消息'));
  await page.clock.runFor(100);
  assert.equal(await page.locator('#toast-019').textContent(), '');
  await page.evaluate(() => window.toastRoot019.unmount());
  await page.clock.runFor(6000);
  record('Toast 完整 5 秒、替换竞态、手动关闭、身份切换及卸载');
  assert(!requests.some(request => /\/demands\/[^/]+\/(hold|resume)$/.test(request.path)));
  assert.deepEqual(errors, []);
  console.log(`PASS ISSUE-019 controlled regression: ${checks.length} groups`);
} finally {
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/last-page.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/report.json`, JSON.stringify({ mocked: true, checks, requests, errors }, null, 2));
  await browser.close();
}
