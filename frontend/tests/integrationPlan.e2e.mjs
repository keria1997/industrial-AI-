import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Controlled frontend protocol/state tests. Never writes to the running business backend or database.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const requests = [];
const errors = [];
let permissions = ['*'];
let resetFails = false;
let commandFails = true;
let skillFails = true;
let importFails = true;
let cursorInvalid = false;
let paymentConfirmed = false;
let releaseDelayed;
let delayCommand = false;
const tenant = 'TENANT-SHWS';
const platform = {
  tenant: { id: tenant, name: '接口测试企业', version: 8, status: 'running' },
  orgUnits: [{ id: 'org-factory', code: 'FACTORY-ACTUAL', name: '授权工厂', type: 'factory', status: 'enabled' }],
  resources: [{ id: 'wc-uuid', code: 'WORK-CENTER-ACTUAL', name: '授权工作中心', type: 'work_center', factoryOrgId: 'org-factory', status: 'enabled' }],
  employees: [], positions: [], roles: [], permissions: [], roleGrants: [], accounts: [],
  adapters: [], dictionaries: [], parameters: [], capabilities: [], approvalRules: [], audits: [],
};
await context.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  if (!path.startsWith('/api/')) return route.fallback();
  const body = request.postData() ? request.postDataJSON() : undefined;
  requests.push({ path, method: request.method(), query: Object.fromEntries(url.searchParams), body, headers: request.headers() });
  const json = (value, status = 200) => route.fulfill({ status, json: value });
  if (path.endsWith('/session/captcha')) return json({ captchaId: 'captcha-id', image: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22/%3E', expiresIn: 120 });
  if (path.endsWith('/session/password/forgot')) return json({ message: '如果邮箱存在，已受理申请' });
  if (path.endsWith('/session/password/reset')) return resetFails
    ? json({ error: { code: 'RESET_EXPIRED', message: '验证码已过期' } }, 400) : route.fulfill({ status: 204 });
  if (path.endsWith('/production/readiness')) return json({ permissions });
  if (path.endsWith('/platform/snapshot')) return json(platform);
  if (path.endsWith('/platform/org-units')) return json(platform.orgUnits);
  if (path.endsWith('/platform/permission-resources')) return json(platform.resources);
  if (path.endsWith('/platform/employees')) return json([]);
  if (path.endsWith('/platform/employee-accounts')) return json({ items: [] });
  if (path.endsWith('/platform/audits')) return json({ items: [{ id: 'audit-api', time: '2026-10-17 08:00:00', operator: 'reviewer', module: '销售管理', action: '复核', target: 'server-order-id', result: 'success' }], total: 99, hasMore: true, page: Number(url.searchParams.get('page')), pageSize: 20 });
  if (path.endsWith('/personnel/employees')) return json({ items: [{ id: 'employee-db', employeeNo: 'EMP-ACTUAL', name: '接口员工', department: '真实部门', position: '真实岗位', status: '在职' }], total: 1 });
  if (path.endsWith('/personnel/skills')) return skillFails ? json({ error: { message: 'SKILL_NOT_AVAILABLE' } }, 503) : json({ items: [], total: 0 });
  if (path.endsWith('/finance/ar-aps')) return json([{ financeId: 'finance-id', documentType: 'RECEIVABLE', partyName: '接口往来方', currency: 'USD', totalAmount: '9007199254740993.01', allocatedAmount: '1.00', outstandingAmount: '9007199254740992.01', status: 'REVERSED' }]);
  if (path.endsWith('/finance/allocations')) return json({ items: [{ id: 'allocation-id', allocationNo: 'ALLOCATION-ACTUAL', paymentId: 'payment-id', currency: 'USD', status: 'CONFIRMED', lines: [{ documentType: 'RECEIVABLE', documentId: 'finance-id', amount: '1.00' }] }], total: 1 });
  const payment = { id: 'payment-api', docNo: 'PAY-API', receivableId: 'finance-id', direction: 'INBOUND', amount: '1.00', currency: 'USD', paymentDate: '2026-10-17', status: paymentConfirmed ? 'done' : 'pending', version: paymentConfirmed ? 2 : 1, createdBy: 'other-registrar' };
  if (path.endsWith('/finance/payments') && request.method() === 'GET') return json({ items: [payment], total: 1 });
  if (path.endsWith('/finance/payments/payment-api/confirm')) {
    paymentConfirmed = true;
    return json({ payment: { ...payment, status: 'done', version: 2 }, allocation: { id: 'system-allocation', paymentId: 'payment-api', status: 'CONFIRMED' } });
  }
  if (path.endsWith('/test-plan-command')) {
    if (delayCommand) await new Promise(resolve => { releaseDelayed = resolve; });
    return commandFails ? json({ error: { message: 'UNKNOWN_COMMAND_RESULT' } }, 503) : json({ saved: true });
  }
  if (path.endsWith('/ai/map-columns')) return json({ source: 'unavailable', mapping: {} });
  if (path.endsWith('/inventory/warehouses') && request.method() === 'POST') {
    if (body.code === 'IMPORT-B' && importFails) return json({ error: { message: 'IMPORT_RESULT_UNKNOWN' } }, 503);
    return json({ warehouse: { id: body.code, ...body } }, 201);
  }
  if (path.endsWith('/test-work-center')) return json({ id: 'created-order', workCenterResourceId: body.workCenterResourceId });
  if (path.endsWith('/workbench/dashboard')) {
    const history = url.searchParams.get('cursor');
    if (history && cursorInvalid) return json({ error: { code: 'WORKBENCH_400_INVALID_CURSOR', message: '游标已失效' } }, 400);
    const metrics = url.searchParams.get('sections') === 'metrics';
    return json({ schemaVersion: '1.1', data: {
      role: '老板', dataAsOf: new Date().toISOString(), scope: { tenantId: tenant }, metrics: metrics ? {} : undefined,
      todos: { items: [], total: 0 }, alerts: { items: [], total: 0 },
      activities: { items: metrics ? [] : [{ activityId: history ? 'event-old' : 'event-new', title: history ? '历史动态' : '最新动态',
        sourceModule: 'SALES', sourceType: 'SalesOrder', sourceId: 'order-id', occurredAt: history ? '2026-10-16T00:00:00Z' : '2026-10-17T00:00:00Z' }],
      hasMore: !history, nextCursor: history ? null : 'cursor-history' },
    } });
  }
  if (['/inventory/availability', '/production/bom-snapshots', '/production/completions', '/production/inspections', '/production/work-order-closes'].some(suffix => path.endsWith(suffix))) return json([]);
  return json({ items: [], total: 0 });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const go = async path => { await page.goto(`${baseUrl}${path}`); await page.waitForLoadState('networkidle'); };
const loginFixture = async () => page.evaluate(() => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
  account: 'frontend-test', name: '前端测试', role: '超级管理员', permissions: window.testPermissions || ['*'],
  tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-plan-test', expiresAt: '2099-01-01T00:00:00Z',
})));
try {
  await go('/');
  await page.getByRole('button', { name: '手机号登录', exact: true }).click();
  assert.equal(await page.getByPlaceholder('请输入手机号', { exact: true }).inputValue(), '');
  await page.getByRole('button', { name: '忘记密码？', exact: true }).click();
  await page.getByPlaceholder('请输入注册邮箱').fill('reset@example.test');
  await page.getByRole('button', { name: '获取验证码', exact: true }).click();
  await page.getByText(/申请已受理/).waitFor();
  await page.getByPlaceholder('请输入邮箱验证码').fill('123456');
  await page.getByPlaceholder('至少10位，含大小写字母和数字').fill('NewPassword123!');
  await page.getByPlaceholder('请再次输入密码').fill('NewPassword123!');
  await page.getByRole('button', { name: '重置密码', exact: true }).click();
  await page.getByRole('button', { name: '立即登录', exact: true }).waitFor();
  assert.deepEqual(requests.find(request => request.path.endsWith('/password/reset')).body,
    { email: 'reset@example.test', code: '123456', newPassword: 'NewPassword123!' });
  resetFails = true;
  await go('/reset-password?token=123456');
  await page.getByPlaceholder('请输入注册邮箱').fill('reset@example.test');
  await page.getByPlaceholder('至少10位，含大小写字母和数字').fill('NewPassword123!');
  await page.getByPlaceholder('请再次输入新密码').fill('NewPassword123!');
  await page.getByRole('button', { name: '确认重置', exact: true }).click();
  await page.getByText('验证码已过期', { exact: true }).waitFor();
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.getByPlaceholder('请输入注册邮箱').inputValue(), '');
  await go('/reset-password?token=opaque');
  assert(await page.getByRole('button', { name: '确认重置', exact: true }).isDisabled());
  console.log('PASS auth: empty phone, generic acceptance, email/code protocol, expired and invalid links, refresh clears inputs');

  await loginFixture();
  await go('/?module=personnel');
  await page.getByRole('button', { name: '员工档案表', exact: true }).click();
  await page.getByText('接口员工', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '考勤与排班', exact: true }).count(), 0);
  permissions = ['hr.employee.read'];
  await page.evaluate(() => { window.testPermissions = ['hr.employee.read']; });
  await loginFixture();
  const before = requests.filter(request => request.path.endsWith('/personnel/skills')).length;
  await go('/?module=personnel');
  await page.getByRole('button', { name: '员工档案表', exact: true }).click();
  await page.getByText('接口员工', { exact: true }).waitFor();
  assert.equal(requests.filter(request => request.path.endsWith('/personnel/skills')).length, before);
  console.log('PASS personnel: employee facts survive skill failure, no request without skill permission, attendance hidden');
  permissions = ['*']; skillFails = false;
  await page.evaluate(() => { window.testPermissions = ['*']; });
  await loginFixture();

  await go('/?module=finance&finance=ledger');
  await page.getByText('9,007,199,254,740,993.01', { exact: true }).waitFor();
  await page.getByText('已冲销', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/industrial-ai-integration-ledger-desktop.png' });
  await page.getByRole('button', { name: '核销事实', exact: true }).click();
  await page.getByText('ALLOCATION-ACTUAL', { exact: true }).waitFor();
  assert(!requests.some(request => request.method === 'POST' && request.path.endsWith('/finance/allocations')));
  await go('/?module=finance&finance=payments');
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: '确认收付款', exact: true }).click();
  await page.getByText('已确认并生成系统核销事实', { exact: true }).waitFor();
  assert(!requests.some(request => request.method === 'POST' && request.path.endsWith('/finance/allocations')));
  const paymentCommand = requests.find(request => request.path.endsWith('/finance/payments/payment-api/confirm'));
  assert(paymentCommand.headers['idempotency-key']);
  assert.equal(paymentCommand.headers['idempotency-key'], paymentCommand.headers['x-idempotency-key']);
  await go('/?module=platform&platform=audit');
  await page.getByLabel('审计操作人', { exact: true }).fill('reviewer');
  await page.getByLabel('审计开始时间', { exact: true }).fill('2026-10-17T08:00');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await page.getByRole('cell', { name: 'server-order-id', exact: true }).waitFor();
  assert(requests.some(request => request.path.endsWith('/platform/audits') && request.query.operator === 'reviewer'
    && request.query.startTime === '2026-10-17 08:00:00'));
  await page.getByText(/共 99 条/).waitFor();
  await page.screenshot({ path: '/tmp/industrial-ai-integration-audit-desktop.png' });
  console.log('PASS finance/audit: exact decimal/currency, system allocation after confirmation without a second write, canonical keys and exact audit totals');

  // Mount the real shared hook to exercise closure snapshots across rerenders, retries and scope changes.
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useBusinessCommand } = await import('/src/hooks/useBusinessCommand.ts');
    const { apiRequest } = await import('/src/api/client.ts');
    const mount = document.createElement('div'); mount.id = 'command-harness'; document.body.append(mount);
    window.commandProps = { scope: 'scope-a', version: 3, text: 'original' };
    window.commandResults = [];
    function Harness() {
      const props = window.commandProps;
      const command = useBusinessCommand(props.scope);
      window.commandApi = command;
      window.executeCommand = async () => {
        const result = await command.execute(key => apiRequest('/api/v1/test-plan-command', null, {
          method: 'POST', idempotencyKey: key, body: JSON.stringify({ version: props.version, text: props.text }),
        }));
        window.commandResults.push(result);
      };
      return React.createElement('span', { 'data-uncertain': String(command.uncertain) }, command.error);
    }
    window.commandRoot = (ReactDOM.createRoot || ReactDOM.default.createRoot)(mount);
    window.renderCommand = () => window.commandRoot.render(React.createElement(Harness));
    window.renderCommand();
  });
  await page.waitForFunction(() => typeof window.executeCommand === 'function');
  await page.evaluate(() => window.executeCommand());
  await page.locator('#command-harness [data-uncertain="true"]').waitFor();
  await page.evaluate(() => { window.commandProps = { scope: 'scope-a', version: 99, text: 'edited' }; window.renderCommand(); });
  await page.waitForFunction(() => window.commandApi.uncertain);
  commandFails = false;
  await page.evaluate(() => window.executeCommand());
  const commands = requests.filter(request => request.path.endsWith('/test-plan-command'));
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0].body, commands[1].body);
  assert.equal(commands[0].headers['x-idempotency-key'], commands[1].headers['x-idempotency-key']);
  assert.equal(commands[1].body.version, 3);
  delayCommand = true;
  await page.evaluate(() => { window.commandProps = { scope: 'scope-b', version: 4, text: 'old-scope' }; window.renderCommand(); });
  await page.waitForFunction(() => !window.commandApi.uncertain);
  await page.evaluate(() => { void window.executeCommand(); });
  await page.waitForFunction(() => window.commandApi.pending);
  await page.evaluate(() => { window.commandProps = { scope: 'scope-c', version: 8, text: 'new-scope' }; window.renderCommand(); });
  await page.waitForFunction(() => !window.commandApi.pending);
  assert.equal(typeof releaseDelayed, 'function');
  releaseDelayed();
  await page.waitForFunction(() => window.commandResults.length === 3);
  assert.equal(await page.evaluate(() => window.commandResults[2] === undefined), true);
  assert.equal(await page.evaluate(() => window.commandApi.error), '');
  delayCommand = false;
  await page.evaluate(() => window.commandRoot.unmount());
  console.log('PASS command: original body/version/key on unknown retry, late old-scope result ignored');

  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { DataImportPanel } = await import('/src/features/ai-hub/import/DataImportPanel.tsx');
    const mount = document.createElement('div'); mount.id = 'import-harness'; document.body.append(mount);
    window.importResults = [];
    window.importRoot = (ReactDOM.createRoot || ReactDOM.default.createRoot)(mount);
    window.importRoot.render(React.createElement(DataImportPanel, {
      file: new File(['code,name\nIMPORT-A,实际仓库A\nIMPORT-B,实际仓库B'], 'warehouses.csv', { type: 'text/csv' }),
      apiContext: { tenantId: 'TENANT-SHWS', accessToken: 'controlled-plan-test' }, allowedEntities: ['warehouse'],
      onClose() {}, onComplete(summary) { window.importResults.push(summary); },
    }));
  });
  await page.getByRole('button', { name: '确认导入 2 条仓库' }).click();
  await page.waitForFunction(() => window.importResults.length === 1);
  assert.match(await page.evaluate(() => window.importResults[0]), /成功 1 条，失败 0 条，待核实 1 条/);
  importFails = false;
  await page.getByRole('button', { name: '按原请求重试未成功行' }).click();
  await page.waitForFunction(() => window.importResults.length === 2);
  assert.match(await page.evaluate(() => window.importResults[1]), /成功 2 条，失败 0 条，待核实 0 条/);
  const imports = requests.filter(request => request.method === 'POST' && request.path.endsWith('/inventory/warehouses'));
  assert.equal(imports.filter(request => request.body.code === 'IMPORT-A').length, 1);
  const retries = imports.filter(request => request.body.code === 'IMPORT-B');
  assert.equal(retries.length, 2);
  assert.deepEqual(retries[0].body, retries[1].body);
  assert.equal(retries[0].headers['x-idempotency-key'], retries[1].headers['x-idempotency-key']);
  assert.equal(retries[0].headers['x-tenant-id'], tenant);
  await page.evaluate(() => window.importRoot.unmount());
  console.log('PASS import: partial success stays distinct from unknown, successful rows skipped and original row key/body reused');

  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { ProductionWorkCenterModal } = await import('/src/features/production/components/ProductionWorkCenterModal.tsx');
    const { apiRequest } = await import('/src/api/client.ts');
    const mount = document.createElement('div'); mount.id = 'work-center-harness'; document.body.append(mount);
    window.centerCreated = null;
    const context = { tenantId: 'TENANT-SHWS', accessToken: 'controlled-plan-test' };
    window.centerRoot = (ReactDOM.createRoot || ReactDOM.default.createRoot)(mount);
    window.centerRoot.render(React.createElement(ProductionWorkCenterModal, {
      context, demandId: 'actual-demand', factoryResourceId: 'FACTORY-ACTUAL',
      onSubmit(workCenterResourceId, key) {
        return apiRequest('/api/v1/test-work-center', context, {
          method: 'POST', idempotencyKey: key, body: JSON.stringify({ workCenterResourceId }),
        });
      },
      onClose() {}, onCreated(order) { window.centerCreated = order; },
    }));
  });
  await page.getByRole('option', { name: '授权工作中心（WORK-CENTER-ACTUAL）' }).waitFor({ state: 'attached' });
  await page.getByLabel('工单工作中心', { exact: true }).selectOption('WORK-CENTER-ACTUAL');
  await page.getByRole('button', { name: '创建工单', exact: true }).click();
  await page.waitForFunction(() => window.centerCreated?.id === 'created-order');
  assert.equal(requests.find(request => request.path.endsWith('/test-work-center')).body.workCenterResourceId, 'WORK-CENTER-ACTUAL');
  await page.evaluate(() => window.centerRoot.unmount());
  console.log('PASS work center: actual authorized factory relationship and selected resource code, no FAC/WC fallback');

  await page.clock.install({ time: new Date('2026-10-17T16:30:00Z') });
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useWorkbenchDashboard } = await import('/src/hooks/useWorkbenchDashboard.ts');
    const mount = document.createElement('div'); mount.id = 'workbench-harness'; document.body.append(mount);
    function Harness() {
      const state = useWorkbenchDashboard({ tenantId: 'TENANT-SHWS', accessToken: 'controlled-plan-test' }, '老板', 'actor', '', 'KEY');
      window.workbenchApi = state;
      return React.createElement('div', null, state.dashboard?.activities.map(item => item.id).join(','));
    }
    window.workbenchRoot = (ReactDOM.createRoot || ReactDOM.default.createRoot)(mount);
    window.workbenchRoot.render(React.createElement(Harness));
  });
  await page.waitForFunction(() => window.workbenchApi?.dashboard?.activities?.length === 1);
  assert(requests.some(request => request.path.endsWith('/workbench/dashboard') && request.query.date === '2026-10-18'));
  await page.evaluate(() => window.workbenchApi.loadMore());
  await page.waitForFunction(() => window.workbenchApi?.dashboard?.activities?.length === 2);
  assert.deepEqual(await page.evaluate(() => window.workbenchApi.dashboard.activities.map(item => item.id)), ['event-new', 'event-old']);
  const historyRequests = requests.filter(request => request.path.endsWith('/workbench/dashboard') && request.query.cursor).length;
  await page.clock.fastForward(60000);
  await page.waitForFunction(() => window.workbenchApi?.dashboard?.activities?.length === 1);
  assert.equal(requests.filter(request => request.path.endsWith('/workbench/dashboard') && request.query.cursor).length, historyRequests);
  cursorInvalid = true;
  const firstPages = requests.filter(request => request.path.endsWith('/workbench/dashboard') && request.query.sections !== 'metrics' && !request.query.cursor).length;
  await page.evaluate(() => window.workbenchApi.loadMore());
  await page.waitForFunction(() => !window.workbenchApi.loading && !window.workbenchApi.error);
  await page.waitForTimeout(150);
  assert.equal(requests.filter(request => request.path.endsWith('/workbench/dashboard') && request.query.cursor).length, historyRequests + 1);
  assert.equal(requests.filter(request => request.path.endsWith('/workbench/dashboard') && request.query.sections !== 'metrics' && !request.query.cursor).length, firstPages + 1);
  assert.deepEqual(await page.evaluate(() => window.workbenchApi.dashboard.activities.map(item => item.id)), ['event-new']);
  await page.evaluate(() => window.workbenchRoot.unmount());
  console.log('PASS workbench: Shanghai business date, explicit history append, polling and invalid cursor reset the first page');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('Frontend runtime errors:', errors);
  console.error('Page text:', (await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await browser.close();
}
