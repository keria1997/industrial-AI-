import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Real browser -> business API -> PostgreSQL. Never intercept APIs or insert SQL fixtures.
const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5183';
const output = process.env.LIVE_REPORT_DIR || '/tmp/industrial-ai-delivery-write';
const statePath = `${output}/private-state.json`;
assert(process.env.DATABASE_URL, 'DATABASE_URL is required');
const database = new URL(process.env.DATABASE_URL.replace(/^jdbc:/, ''));
const dbEnv = {
  ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432',
  PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
  ...(database.username ? { PGUSER: decodeURIComponent(database.username) } : {}),
  ...(database.password ? { PGPASSWORD: decodeURIComponent(database.password) } : {}),
};
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = (query, tenant, authLookup = false) => execFileSync('psql', ['--no-password', '-X', '-qAt', '-c', query], {
  env: { ...dbEnv, PGOPTIONS: `-c default_transaction_read_only=on${tenant ? ` -c app.tenant_id=${tenant}` : ''}${authLookup ? ' -c app.auth_lookup=true' : ''}` },
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const documents = (tenant, module, kind) => JSON.parse(sql(
  `SELECT coalesce(json_agg(data), '[]') FROM module_document WHERE tenant_id=${literal(tenant)} AND module=${literal(module)} AND kind=${literal(kind)}`, tenant));
await mkdir(output, { recursive: true, mode: 0o700 });
await chmod(output, 0o700);
let state = existsSync(statePath) ? JSON.parse(await readFile(statePath, 'utf8')) : null;
if (!state) {
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  state = { suffix, account: `e2e_${suffix}`, password: `E2e${randomBytes(12).toString('hex')}A9`,
    tenantName: `联调隔离企业-${suffix}`, phone: `139${String(Date.now()).slice(-8)}`,
    email: `e2e_${suffix}@example.invalid` };
}
const saveState = () => writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
await saveState();
const report = { generatedAt: new Date().toISOString(), baseUrl,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  mocked: false, sqlWrites: false, isolatedTenant: null, checks: [], pageErrors: [], fixtureCompatibilityOverrides: [] };
const check = (name, layer, passed, evidence) => {
  report.checks.push({ name, layer, passed, evidence });
  console.log(`${passed ? 'PASS' : 'BLOCKED'} [${layer}] ${name}: ${JSON.stringify(evidence)}`);
};
const run = async (name, layer, fn) => {
  try { const evidence = await fn(); check(name, layer, true, evidence); return true; }
  catch (error) { check(name, layer, false, { message: error.message }); return false; }
};
const browser = await chromium.launch({ headless: true });
const makePage = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  return page;
};
const login = async (page, account, password) => {
  await page.goto(baseUrl);
  const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
  await image.waitFor();
  const source = await image.getAttribute('src');
  assert(source?.startsWith('data:image/svg+xml'), 'Expected real local captcha SVG');
  const code = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
  assert(code, 'Captcha cannot be read');
  await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
  await page.getByPlaceholder('请输入验证码', { exact: true }).fill(code);
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/session/login'),
    page.getByRole('button', { name: '立即登录', exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, 'UI login HTTP status');
  await page.waitForFunction(() => !!sessionStorage.getItem('industrial-ai-session:v2'));
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')));
};
const request = async (page, session, path, { method = 'GET', body, key, version } = {}) => {
  const headers = { Authorization: `Bearer ${session.accessToken}`, 'X-Tenant-Id': session.tenantIds[0] };
  if (method !== 'GET') headers['Idempotency-Key'] = key || randomUUID();
  if (version != null) headers['If-Match'] = `"${version}"`;
  const response = await page.request.fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { data: body }) });
  return { status: response.status(), body: response.headers()['content-type']?.includes('application/json') ? await response.json() : null };
};
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
const visit = async (page, query) => { await page.goto(`${baseUrl}/?${query}`); await page.waitForLoadState('networkidle'); };
const platformFixture = async (page, session, path, body) => {
  // Preserve the contract failure before a diagnostic fixture-only workaround.
  const result = await request(page, session, path, { method: 'POST', body });
  if (result.status !== 500) return ok(result, 201);
  const evidence = {
    status: result.status, error: result.body?.error, requestFields: Object.keys(body),
    note: '正常契约请求失败。以下诊断夹具额外提交type=status，仅用于继续探查，不代表该接口通过。',
  };
  const name = `平台${path.split('/').at(-1)}新增契约`;
  check(name, 'API/DB', false, evidence);
  state.platformContractFailures ||= [];
  state.platformContractFailures.push({ name, evidence });
  const override = { path, additionalField: 'type', value: body.status };
  state.platformFixtureOverrides ||= [];
  state.platformFixtureOverrides.push(override);
  await saveState();
  return ok(await request(page, session, path, { method: 'POST', body: { ...body, type: body.status } }), 201);
};

try {
  // Reruns may reuse fixtures, but must not hide their original contract failures.
  for (const failure of state.platformContractFailures || []) {
    check(failure.name, 'API/DB', false, { ...failure.evidence, retainedFromOriginalRun: true });
  }
  const page = await makePage();
  if (!state.registered) {
    const registered = await run('注册独立企业并落库', 'UI/API/DB', async () => {
      await page.goto(baseUrl);
      await page.getByRole('button', { name: '注册账号', exact: true }).click();
      for (const [placeholder, value] of [
        ['请输入公司/租户名称', state.tenantName], ['请输入管理员姓名', '端到端测试管理员'],
        ['请输入登录账号', state.account], ['请输入邮箱', state.email], ['请输入手机号', state.phone],
        ['至少10位，含大小写字母和数字', state.password], ['请再次输入密码', state.password],
      ]) await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
      const industry = page.getByLabel('所属行业 (Industry)', { exact: false });
      await industry.selectOption({ index: 1 });
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/session/register'),
        page.getByRole('button', { name: '立即注册', exact: true }).click(),
      ]);
      assert.equal(response.status(), 201, JSON.stringify(await response.json()));
      assert.equal(await page.evaluate(() => sessionStorage.getItem('industrial-ai-session:v2')), null, 'Registration must not fabricate login');
      state.registered = true;
      await saveState();
      return { status: response.status(), automaticLogin: false };
    });
    assert(registered, 'Registration prerequisite failed');
  }
  const owner = await login(page, state.account, state.password);
  const tenant = owner.tenantIds[0];
  assert(/^TENANT-[\w-]+$/.test(tenant), 'Unexpected tenant ID');
  state.tenant = tenant;
  report.isolatedTenant = tenant;
  await saveState();
  await run('真实验证码登录、企业及管理员基线', 'UI/API/DB', async () => {
    const tenants = documents(tenant, 'platform', 'tenant');
    const accounts = documents(tenant, 'platform', 'account');
    assert.equal(tenants.length, 1);
    assert(accounts.some(a => a.loginName === state.account));
    assert.equal(documents(tenant, 'fulfillment', 'order').length, state.order ? 1 : 0);
    return { tenant, tenantRows: tenants.length, adminAccountRows: accounts.length };
  });
  for (const role of ['老板', '销售', '计划员', '仓管', '采购', '财务']) {
    await run(`工作台 ${role} 1.1`, 'API/DB', async () => {
      const result = await request(page, owner, `/api/v1/workbench/dashboard?role=${encodeURIComponent(role)}&sections=metrics`);
      const body = ok(result);
      assert.equal(body.schemaVersion, '1.1');
      assert(body.data?.metrics, 'Missing data.metrics');
      return { status: result.status, metricKeys: Object.keys(body.data.metrics), orderRows: documents(tenant, 'fulfillment', 'order').length };
    });
  }
  await run('工作台页面和不可用金额', 'UI/API/DB', async () => {
    await visit(page, 'module=workbench');
    const text = await page.locator('body').innerText();
    assert(!text.includes('NaN') && !text.includes('undefined'));
    await page.screenshot({ path: `${output}/workbench.png` });
    const body = ok(await request(page, owner, '/api/v1/workbench/dashboard?role=%E8%80%81%E6%9D%BF'));
    assert.equal(body.data.metrics.confirmedRevenueAmount.availability, 'UNAVAILABLE');
    return { confirmedRevenue: body.data.metrics.confirmedRevenueAmount, sources: body.data.sources };
  });
  await run('权限目录、资源及审计准确分页', 'API/DB', async () => {
    const permissions = ok(await request(page, owner, '/api/v1/platform/permissions'));
    const resources = ok(await request(page, owner, '/api/v1/platform/permission-resources'));
    assert(Array.isArray(permissions) && permissions.length);
    assert(Array.isArray(resources));
    const audits = ok(await request(page, owner, '/api/v1/platform/audits?page=1&pageSize=1'));
    const saved = documents(tenant, 'platform', 'auditLog');
    assert.equal(audits.total, saved.length);
    assert.equal(audits.hasMore, saved.length > 1);
    assert.equal(audits.items.length, Math.min(1, saved.length));
    return { permissions: permissions.length, resources: resources.length, total: audits.total, databaseCount: saved.length, hasMore: audits.hasMore };
  });
  await run('仓库页面新建、数字输入、刷新回读', 'UI/API/DB', async () => {
    await visit(page, 'module=inventory&inventory=warehouses');
    if (!state.warehouse) {
      await page.getByRole('button', { name: '新建仓库', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '新建仓库', exact: true });
      await dialog.getByLabel('仓库编码', { exact: true }).fill(`WH-${state.suffix}`);
      await dialog.getByLabel('仓库名称', { exact: true }).fill(`联调仓库-${state.suffix}`);
      await dialog.getByRole('combobox', { name: '仓库类型', exact: true }).selectOption({ label: '成品仓' });
      await dialog.getByLabel('所属组织', { exact: true }).fill(state.tenantName);
      await dialog.getByLabel('负责人', { exact: true }).fill('端到端测试管理员');
      await dialog.getByLabel('仓库地址', { exact: true }).fill('隔离测试仓库');
      const capacity = dialog.getByLabel('仓库容量', { exact: true });
      await capacity.fill('');
      assert.equal(await capacity.inputValue(), '');
      await capacity.pressSequentially('100');
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/inventory/warehouses' && r.request().method() === 'POST'),
        dialog.getByRole('button', { name: '保存', exact: true }).click(),
      ]);
      assert.equal(response.status(), 201, JSON.stringify(await response.json()));
      state.warehouse = (await response.json()).warehouse;
      assert(state.warehouse?.id, 'Missing saved warehouse');
      await saveState();
      await dialog.waitFor({ state: 'hidden' });
      const headers = response.request().headers();
      assert(headers['idempotency-key']);
      assert.equal(headers['idempotency-key'], headers['x-idempotency-key']);
    }
    const saved = documents(tenant, 'fulfillment', 'warehouse').find(row => row.id === state.warehouse.id);
    assert.equal(saved.code, state.warehouse.code);
    assert.equal(String(saved.capacity), '100');
    await page.reload(); await page.waitForLoadState('networkidle');
    await page.getByText(saved.name, { exact: true }).first().waitFor();
    return { id: saved.id, code: saved.code, capacity: saved.capacity, version: saved.version };
  });
  await run('产品页面不关联仓库创建、编辑关联及缺库存显示', 'UI/API/DB', async () => {
    assert(state.warehouse, 'Warehouse prerequisite failed');
    await visit(page, 'module=inventory&inventory=products');
    if (!state.product) {
      await page.getByRole('button', { name: '新建产品', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '新建产品', exact: true });
      await dialog.getByLabel('产品编码', { exact: true }).fill(`P-${state.suffix}`);
      await dialog.getByLabel('产品名称', { exact: true }).fill(`联调产品-${state.suffix}`);
      await dialog.getByLabel('规格型号', { exact: true }).fill('E2E-SPEC');
      await dialog.getByLabel('基本单位', { exact: true }).fill('PCS');
      assert.equal(await dialog.getByRole('combobox', { name: '库存仓库', exact: true }).inputValue(), '');
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/inventory/products' && r.request().method() === 'POST'),
        dialog.getByRole('button', { name: '保存', exact: true }).click(),
      ]);
      assert.equal(response.status(), 201, JSON.stringify(await response.json()));
      state.product = (await response.json()).product;
      await saveState();
      assert.equal(state.product.defaultWarehouseId, null);
      assert.equal(state.product.uom, 'PCS');
      await dialog.waitFor({ state: 'hidden' });
    }
    const row = page.getByRole('row').filter({ hasText: state.product.name });
    if (!state.product.defaultWarehouseId) {
      await row.getByRole('button', { name: '编辑产品', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '编辑产品', exact: true });
      await dialog.getByRole('combobox', { name: '库存仓库', exact: true }).selectOption(state.warehouse.code);
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/inventory/products/${state.product.id}` && r.request().method() === 'PATCH'),
        dialog.getByRole('button', { name: '保存', exact: true }).click(),
      ]);
      assert.equal(response.status(), 200, JSON.stringify(await response.json()));
      state.product = (await response.json()).product;
      await saveState(); await dialog.waitFor({ state: 'hidden' });
    }
    const saved = documents(tenant, 'fulfillment', 'product').find(item => item.id === state.product.id);
    assert.equal(saved.defaultWarehouseId, state.warehouse.id);
    assert.equal(saved.uom, 'PCS'); assert.equal(saved.version, state.product.version);
    await page.reload(); await page.waitForLoadState('networkidle');
    await row.getByRole('button', { name: state.warehouse.name, exact: true }).waitFor();
    const stocks = documents(tenant, 'fulfillment', 'availability').filter(item => item.productId === saved.id);
    if (!stocks.length) assert.equal((await row.getByRole('cell').allTextContents())[4], '-');
    await page.screenshot({ path: `${output}/product-warehouse.png` });
    return { id: saved.id, uom: saved.uom, defaultWarehouseId: saved.defaultWarehouseId, version: saved.version, stockFactRows: stocks.length };
  });
  await run('WMS库存CSV显式事实导入与数据库回读', 'UI/API/DB', async () => {
    assert(state.product && state.warehouse, 'Master data prerequisites failed');
    if (!state.inventoryImported) {
      await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
      const fields = ['warehouseId', 'productId', 'qualifiedOnHandQty', 'allocatedReservedQty', 'frozenQty',
        'safetyStockQty', 'inTransitQty', 'fulfillableQty', 'uom', 'factVersion', 'asOf', 'sourceSystem'];
      const values = [state.warehouse.id, state.product.id, '100', '0', '0', '0', '0', '100', 'PCS', '1', new Date().toISOString(), 'CUSTOMER_WMS_E2E'];
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '上传主数据文件', exact: true }).click()]);
      await chooser.setFiles({ name: 'e2e-stock.csv', mimeType: 'text/csv', buffer: Buffer.from(`${fields.join(',')}\n${values.join(',')}\n`) });
      const submit = page.getByRole('button', { name: '确认导入 1 条WMS库存快照', exact: true });
      await submit.waitFor();
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/inventory/import/availability' && r.request().method() === 'POST'),
        submit.click(),
      ]);
      assert.equal(response.status(), 200, JSON.stringify(await response.json()));
      const input = response.request().postDataJSON();
      for (let index = 0; index < fields.length; index++) assert.equal(String(input[fields[index]]), values[index]);
      const headers = response.request().headers();
      assert(headers['idempotency-key']); assert.equal(headers['idempotency-key'], headers['x-idempotency-key']);
      state.inventoryImported = true; state.inventoryInput = input;
      await saveState();
    }
    const facts = ok(await request(page, owner, `/api/v1/inventory/availability?warehouseId=${state.warehouse.id}&productIds=${state.product.id}`));
    assert.equal(facts.length, 1);
    const saved = documents(tenant, 'fulfillment', 'availability').find(row => row.productId === state.product.id);
    assert(saved, 'Availability not persisted in PostgreSQL');
    for (const field of ['qualifiedOnHandQty', 'allocatedReservedQty', 'frozenQty', 'safetyStockQty',
      'inTransitQty', 'fulfillableQty', 'uom', 'factVersion', 'asOf', 'sourceSystem']) assert.equal(saved[field], facts[0][field]);
    const duplicate = ok(await request(page, owner, '/api/v1/inventory/import/availability', { method: 'POST', body: state.inventoryInput }));
    assert.equal(duplicate.duplicate, true);
    await visit(page, 'module=inventory&inventory=products');
    const row = page.getByRole('row').filter({ hasText: state.product.name });
    await row.waitFor();
    assert.match((await row.getByRole('cell').allTextContents())[4], /\d/);
    return { id: saved.id ?? null, productId: saved.productId, qualifiedOnHandQty: saved.qualifiedOnHandQty,
      fulfillableQty: saved.fulfillableQty, uom: saved.uom, factVersion: saved.factVersion, duplicate };
  });
  const snapshot = ok(await request(page, owner, '/api/v1/platform/snapshot'));
  const factory = snapshot.orgUnits.find(row => row.type === 'factory');
  const adminEmployee = snapshot.employees.find(row => snapshot.accounts.some(account => account.loginName === state.account && account.employeeId === row.id));
  let reviewerPage, reviewer;
  await run('独立复核账号、首次改密、真实IAM授权', 'API/DB/UI', async () => {
    assert(factory && adminEmployee, 'Missing provisioned factory/admin employee');
    if (!state.reviewer) {
      const account = `rv_${state.suffix}`;
      const phone = `138${state.phone.slice(-8)}`;
      const email = `${account}@example.invalid`;
      const created = ok(await request(page, owner, '/api/v1/platform/employee-accounts', { method: 'POST',
        body: { account, name: '端到端复核员', phone, email, department: '联调测试', position: '复核员', employeeNo: `RV-${state.suffix}` } }), 201);
      state.reviewer = { account, phone, email, temporaryPassword: created.temporaryPassword, password: `Review${randomBytes(12).toString('hex')}A9` };
      await saveState();
    }
    if (!state.reviewer.passwordChanged) {
      const existing = ok(await request(page, owner, '/api/v1/platform/employee-accounts')).items.find(item => item.account === state.reviewer.account);
      assert(existing, 'Registered reviewer must exist');
      if (existing.firstLogin) ok(await request(page, owner, '/api/v1/session/complete-first-login', { method: 'POST',
        body: { account: state.reviewer.account, currentPassword: state.reviewer.temporaryPassword, newPassword: state.reviewer.password } }), 204);
      state.reviewer.passwordChanged = true; delete state.reviewer.temporaryPassword; await saveState();
    }
    if (!state.reviewer.employeeId) {
      const employee = await platformFixture(page, owner, '/api/v1/platform/employees',
        { employeeNo: `RV-${state.suffix}`, name: '端到端复核员', primaryOrgId: factory.id,
          primaryPositionId: adminEmployee.primaryPositionId, mobile: state.reviewer.phone, email: state.reviewer.email, status: 'active' });
      state.reviewer.employeeId = employee.id; await saveState();
    }
    if (!state.reviewer.accountId) {
      const adminRole = snapshot.roles.find(row => row.code === 'TENANT_ADMIN');
      assert(adminRole, 'Real IAM role required');
      const account = await platformFixture(page, owner, '/api/v1/platform/accounts',
        { loginName: state.reviewer.account, employeeId: state.reviewer.employeeId, authType: 'password', status: 'enabled', directRoleIds: [adminRole.id] });
      state.reviewer.accountId = account.id; await saveState();
    }
    reviewerPage = await makePage();
    reviewer = await login(reviewerPage, state.reviewer.account, state.reviewer.password);
    const permissions = ok(await request(reviewerPage, reviewer, '/api/v1/production/readiness'));
    assert(documents(tenant, 'platform', 'account').some(row => row.id === state.reviewer.accountId));
    state.reviewer.permissions = permissions.permissions;
    await saveState();
    const requiredPermissions = ['finance.payment.read', 'finance.payment.confirm', 'sales.order.review.decide',
      'sales.rma.approve', 'procurement.request.approve', 'production.quality.inspect'];
    check('IAM目录可配置财务、销售、采购与质检权限', 'API/DB',
      requiredPermissions.every(code => permissions.permissions.includes(code)), {
      role: 'TENANT_ADMIN', effectivePermissionCount: permissions.permissions.length,
      missing: requiredPermissions.filter(code => !permissions.permissions.includes(code)),
    });
    return { accountId: state.reviewer.accountId, employeeId: state.reviewer.employeeId, permissions: permissions.permissions.length,
      note: '复核员使用真实租户管理员角色；不代表低权限验收通过' };
  });
  await run('来源销售单、审批、确认及发货申请持久化', 'API/DB', async () => {
    assert(state.product && factory && adminEmployee && reviewer, 'Order prerequisites missing');
    if (!state.customer) {
      state.customer = ok(await request(page, owner, '/api/v1/supply-chain/customers', { method: 'POST',
        body: { customerNo: `C-${state.suffix}`, name: `联调客户-${state.suffix}`, status: 'active' } }), 201).customer;
      await saveState();
    }
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    if (!state.order) {
      state.order = ok(await request(page, owner, '/api/v1/sales/sales-orders', { method: 'POST', body: {
        customerId: state.customer.id, customerName: state.customer.name, ownerEmployeeId: adminEmployee.id,
        fulfillmentWarehouseId: state.warehouse.id, factoryResourceId: factory.id, requestedDeliveryDate: date,
        allowPartialShipment: false, currency: 'CNY', remark: '真实联调隔离订单',
        recipient: { name: '联调签收员', phone: state.phone, country: '中国', province: '上海', city: '上海', address: '联调隔离地址' },
        lines: [{ lineNo: 1, productId: state.product.id, productName: state.product.name, orderedQty: '10', uom: 'PCS',
          unitPrice: '100', taxRate: '0', promisedDate: date, allowPartialShipment: false }],
      } }), 201);
      await saveState();
    }
    if (state.order.reviewStatus === 'PENDING') {
      // Owner has the real explicit self-approval privilege via its signed "*" grant.
      // This exercises the documented exception, not independent sales review acceptance.
      state.order = ok(await request(page, owner, `/api/v1/sales/sales-orders/${state.order.id}/review-decisions`,
        { method: 'POST', version: state.order.version, body: { decision: 'APPROVE', comment: '注册管理员授权自审批例外测试' } }));
      await saveState();
    }
    if (state.order.overallStatus === 'PENDING_CONFIRMATION') {
      state.order = ok(await request(page, owner, `/api/v1/sales/sales-orders/${state.order.id}/confirm`,
        { method: 'POST', version: state.order.version, body: { requestedDeliveryDate: date } }));
      await saveState();
    }
    if (!state.shipmentRequest) {
      state.shipmentRequest = ok(await request(page, owner, `/api/v1/sales/sales-orders/${state.order.id}/shipment-requests`, {
        method: 'POST', version: state.order.version, body: { warehouseId: state.warehouse.id,
          lines: state.order.lines.map(line => ({ orderLineId: line.id, sourceLineRevision: line.version, requestedQty: '10', uom: line.uom })) },
      }), 202);
      await saveState();
    }
    state.order = ok(await request(page, owner, `/api/v1/sales/sales-orders/${state.order.id}`));
    const saved = documents(tenant, 'fulfillment', 'order').find(row => row.id === state.order.id);
    assert.equal(saved.version, state.order.version); assert.equal(saved.totalAmount, '1000');
    assert.notEqual(saved.recipient.phoneCiphertext, state.phone); assert(!saved.recipient.phone);
    assert.equal(documents(tenant, 'fulfillment', 'shipmentRequest').length, 1);
    await saveState();
    return { orderId: saved.id, orderNo: saved.orderNo, version: saved.version, totalAmount: saved.totalAmount, requestId: state.shipmentRequest.id,
      reviewMode: '注册管理员真实self-approve权限例外；非独立销售审批验收' };
  });
  await run('库存预留、出库过账、订单和库存事实一致', 'API/DB', async () => {
    assert(state.shipmentRequest && state.inventoryImported, 'Shipment/import prerequisite failed');
    const current = ok(await request(page, owner, `/api/v1/inventory/availability?warehouseId=${state.warehouse.id}&productIds=${state.product.id}`))[0];
    if (current && Date.now() - Date.parse(current.asOf) > 60000) {
      ok(await request(page, owner, '/api/v1/inventory/import/availability', { method: 'POST',
        body: { ...current, eventId: randomUUID(), factVersion: current.factVersion + 1, asOf: new Date().toISOString(), sourceSystem: 'CUSTOMER_WMS_E2E' } }));
    }
    const tasks = ok(await request(page, owner, `/api/v1/inventory/shipment-tasks?salesOrderId=${state.order.id}`)).items;
    assert.equal(tasks.length, 1, 'No shipment task delivered');
    let task = tasks[0];
    if (!task.outboundId) {
      const result = ok(await request(page, owner, `/api/v1/inventory/shipment-tasks/${task.id}/check-and-reserve`, {
        method: 'POST', version: task.version, body: { shipmentRequestId: task.shipmentRequestId, orderRevision: task.orderRevision, warehouseId: state.warehouse.id },
      }));
      task = result.task; state.outbound = result.outbound; await saveState();
    }
    let outbound = ok(await request(page, owner, `/api/v1/inventory/outbounds/${task.outboundId}`));
    if (outbound.status !== 'POSTED') {
      state.postKey ||= randomUUID(); state.shippedAt ||= new Date().toISOString(); await saveState();
      const input = { shippedAt: state.shippedAt, lines: outbound.lines.map(line => ({ outboundLineId: line.id, qty: '10', uom: line.uom })) };
      const result = ok(await request(page, owner, `/api/v1/inventory/outbounds/${outbound.id}/post`,
        { method: 'POST', version: outbound.version, key: state.postKey, body: input }));
      assert.equal(result.order.id, state.order.id); assert.equal(result.order.overallStatus, 'SHIPPED');
      state.postInput = input; state.postVersion = outbound.version;
      state.order = result.order; outbound = result.outbound;
    }
    state.outbound = outbound; await saveState();
    assert.equal(outbound.status, 'POSTED');
    const savedOrder = documents(tenant, 'fulfillment', 'order').find(row => row.id === state.order.id);
    const facts = ok(await request(page, owner, `/api/v1/inventory/availability?warehouseId=${state.warehouse.id}&productIds=${state.product.id}`));
    assert.equal(savedOrder.overallStatus, 'SHIPPED'); assert.equal(savedOrder.lines[0].shippedQty, '10');
    assert.equal(facts[0].qualifiedOnHandQty, '90'); assert.equal(facts[0].allocatedReservedQty, '0');
    if (state.postInput) ok(await request(page, owner, `/api/v1/inventory/outbounds/${outbound.id}/post`,
      { method: 'POST', version: state.postVersion, key: state.postKey, body: state.postInput }));
    const transactions = documents(tenant, 'fulfillment', 'transaction').filter(row => row.sourceId === outbound.id);
    assert.equal(transactions.length, 1, 'Replay duplicated outbound transaction');
    return { outboundId: outbound.id, orderStatus: savedOrder.overallStatus, shippedQty: savedOrder.lines[0].shippedQty,
      qualifiedOnHandQty: facts[0].qualifiedOnHandQty, transactionCountAfterReplay: transactions.length };
  });
  await run('客户签收数量守卫、争议及补签回读', 'API/DB/UI-read', async () => {
    assert(state.outbound?.status === 'POSTED', 'Posted outbound prerequisite failed');
    const line = state.outbound.lines[0];
    const source = { orderLineId: line.orderLineId, outboundId: state.outbound.id, outboundLineId: line.id };
    if (!state.receipt) {
      const invalid = await request(page, owner, `/api/v1/sales-orders/${state.order.id}/receipts`, { method: 'POST', body: {
        signedBy: '测试签收员', signedAt: new Date().toISOString(), lines: [{ ...source, signedQty: '8', rejectedQty: '0', damagedQty: '0' }],
      } });
      assert.equal(invalid.status, 422); assert.equal(documents(tenant, 'fulfillment', 'receipt').length, 0);
      state.receipt = ok(await request(page, owner, `/api/v1/sales-orders/${state.order.id}/receipts`, { method: 'POST', body: {
        signedBy: '测试签收员', signedAt: new Date().toISOString(), lines: [{ ...source, signedQty: '8', rejectedQty: '2', damagedQty: '0' }],
      } }));
      assert.equal(state.receipt.receiptStatus, 'DISPUTED'); await saveState();
    }
    if (state.receipt.receiptStatus !== 'SIGNED') {
      state.receipt = ok(await request(page, owner, `/api/v1/sales-orders/${state.order.id}/receipts/${state.receipt.id}`, {
        method: 'PATCH', version: state.receipt.version, body: { lines: [{ orderLineId: line.orderLineId, signedQty: '10', rejectedQty: '0', damagedQty: '0' }] },
      }));
      await saveState();
    }
    const saved = documents(tenant, 'fulfillment', 'receipt').find(row => row.id === state.receipt.id);
    assert.equal(saved.receiptStatus, 'SIGNED'); assert.equal(saved.lines[0].signedQty, '10');
    await visit(page, 'module=sales&tab=receipts');
    await page.getByText(saved.receiptNo, { exact: true }).waitFor();
    await page.getByText('全部签收', { exact: true }).first().waitFor();
    await page.screenshot({ path: `${output}/receipt.png` });
    return { receiptId: saved.id, receiptStatus: saved.receiptStatus, signedQty: saved.lines[0].signedQty,
      version: saved.version, note: '通过API创建和补签，页面只读；不计UI写入验收' };
  });
  await run('客户已签收不能冒充销售订单已完成', 'API/DB', async () => {
    assert(state.receipt?.receiptStatus === 'SIGNED', 'Receipt prerequisite failed');
    const order = ok(await request(page, owner, `/api/v1/sales/sales-orders/${state.order.id}`));
    const result = ok(await request(page, owner, `/api/v1/sales-orders/${order.id}/complete-check`,
      { method: 'POST', version: order.version, body: {} }));
    assert.equal(result.canComplete, false); assert(result.missingConditions.includes('AR结算完成'));
    const complete = await request(page, owner, `/api/v1/sales-orders/${order.id}/complete`,
      { method: 'POST', version: order.version, body: {} });
    assert.equal(complete.status, 409);
    assert.equal(documents(tenant, 'fulfillment', 'order').find(item => item.id === order.id).overallStatus, 'SHIPPED');
    return { receiptStatus: 'SIGNED', orderStatus: 'SHIPPED', missingConditions: result.missingConditions, completeStatus: complete.status };
  });
  await run('RMA独立驳回、原因持久化及可退额度释放', 'API/DB/UI-read', async () => {
    assert(state.outbound?.status === 'POSTED' && reviewer, 'RMA prerequisites failed');
    const line = state.outbound.lines[0];
    const input = { orderId: state.order.id, outboundId: state.outbound.id, outboundLineId: line.id,
      reason: '联调驳回验证', evidence: [{ description: '隔离测试证据' }], requestedQty: '10', sourceOutboundVersion: state.outbound.version };
    if (!state.rma) {
      state.rma = ok(await request(page, owner, '/api/v1/rmas', { method: 'POST', body: input })); await saveState();
    }
    if (state.rma.status === 'REQUESTED') {
      const own = await request(page, owner, `/api/v1/rmas/${state.rma.id}/transition`, {
        method: 'POST', version: state.rma.version, body: { transition: 'APPROVE', toStatus: 'REJECTED', decision: 'REJECTED', comment: '隔离验证驳回' },
      });
      assert.equal(own.status, 403);
      state.rma = ok(await request(reviewerPage, reviewer, `/api/v1/rmas/${state.rma.id}/transition`, {
        method: 'POST', version: state.rma.version, body: { transition: 'APPROVE', toStatus: 'REJECTED', decision: 'REJECTED', comment: '隔离验证驳回' },
      }));
      await saveState();
    }
    assert.equal(state.rma.status, 'REJECTED'); assert.equal(state.rma.rejectedReason, '隔离验证驳回');
    if (!state.secondRma) {
      state.secondRma = ok(await request(page, owner, '/api/v1/rmas', { method: 'POST', body: input })); await saveState();
    }
    const persisted = documents(tenant, 'fulfillment', 'rma');
    assert.equal(persisted.filter(row => row.id === state.rma.id && row.status === 'REJECTED').length, 1);
    assert.equal(state.secondRma.requestedQty, '10');
    await visit(page, 'module=sales&tab=returns');
    await page.getByText(state.rma.rmaNo, { exact: true }).waitFor();
    return { rejectedRmaId: state.rma.id, rejectedReason: state.rma.rejectedReason, replacementRmaId: state.secondRma.id, requestedQty: '10',
      note: 'API写入、DB核对及页面读取；非UI办理' };
  });
  await run('销售出库生成正式AR、登记及核销链前置', 'API/DB', async () => {
    assert(state.outbound?.status === 'POSTED', 'Posted outbound prerequisite failed');
    const ar = ok(await request(page, owner, `/api/v1/finance/receivables?sourceOrder=${state.order.id}`));
    const saved = documents(tenant, 'finance', 'receivable').filter(row => row.sourceId === state.order.id);
    assert(saved.length > 0, `销售订单${state.order.id}已过账出库，但数据库同源AR=${saved.length}、接口条数=${ar.items.length}；不能补造AR继续验收`);
    state.receivable = saved[0]; await saveState();
    return { receivableId: saved[0].id, apiCount: ar.items.length, databaseCount: saved.length };
  });
  await run('独立真实收款登记、复核人页面确认、幂等及刷新', 'API-create/UI-confirm/DB', async () => {
    assert(state.customer && reviewer, 'Payment prerequisites failed');
    if (!state.payment) {
      const created = ok(await request(page, owner, '/api/v1/finance/payments', { method: 'POST', body: {
        direction: 'INBOUND', counterpartyId: state.customer.id, counterpartyName: state.customer.name,
        amount: '300', currency: 'CNY', paymentMethod: 'bank_transfer', paymentDate: new Date().toISOString().slice(0, 10), remark: '联调独立收款，无AR关联',
      } }), 201);
      state.payment = created.payment; await saveState();
    }
    await visit(page, 'module=finance&finance=payments');
    const ownerRow = page.getByRole('row').filter({ hasText: state.payment.docNo });
    await ownerRow.waitFor(); assert(await ownerRow.getByRole('button', { name: '确认', exact: true }).isDisabled());
    assert(state.reviewer.permissions.includes('finance.payment.confirm'), '真实IAM目录缺finance.payment.confirm，不能伪造复核员权限继续页面确认');
    await visit(reviewerPage, 'module=finance&finance=payments');
    const row = reviewerPage.getByRole('row').filter({ hasText: state.payment.docNo });
    await row.waitFor();
    if (state.payment.status === 'pending') {
      await row.getByRole('button', { name: '确认', exact: true }).click();
      const dialog = reviewerPage.getByRole('dialog', { name: '确认收付款', exact: true });
      const [response] = await Promise.all([
        reviewerPage.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/finance/payments/${state.payment.id}/confirm` && r.request().method() === 'POST'),
        dialog.getByRole('button', { name: '确认收付款', exact: true }).click(),
      ]);
      assert.equal(response.status(), 200, JSON.stringify(await response.json()));
      const result = await response.json(); assert.equal(result.allocation, null);
      state.payment = result.payment;
      state.paymentConfirm = { key: response.request().headers()['idempotency-key'], version: 1 };
      assert(state.paymentConfirm.key); await saveState();
      await dialog.waitFor({ state: 'hidden' });
      await reviewerPage.getByRole('status').filter({ hasText: '已确认' }).waitFor();
    }
    const allocationsBefore = documents(tenant, 'finance', 'allocation').length;
    ok(await request(reviewerPage, reviewer, `/api/v1/finance/payments/${state.payment.id}/confirm`, {
      method: 'POST', version: state.paymentConfirm.version, key: state.paymentConfirm.key,
    }));
    assert.equal(documents(tenant, 'finance', 'allocation').length, allocationsBefore);
    const saved = documents(tenant, 'finance', 'payment').find(item => item.id === state.payment.id);
    assert.equal(saved.status, 'done'); assert.equal(saved.version, 2); assert.equal(saved.amount, '300');
    await reviewerPage.reload(); await reviewerPage.waitForLoadState('networkidle');
    await row.getByText('已确认', { exact: true }).waitFor();
    await reviewerPage.screenshot({ path: `${output}/payment.png` });
    return { paymentId: saved.id, status: saved.status, version: saved.version, amount: saved.amount,
      allocationCount: allocationsBefore, note: '无AR关联款项，只验独立款项确认；不代表核销闭环' };
  });
  state.production ||= {};
  const production = state.production;
  await run('生产正式BOM、需求校验审批、MRP缺口', 'API/DB', async () => {
    assert(state.warehouse && state.product && factory && reviewer, 'Production prerequisites missing');
    if (!production.workCenter) {
      production.workCenter = ok(await request(page, owner, '/api/v1/platform/resources', { method: 'POST', body: {
        code: `WC-${state.suffix}`, name: '联调工作中心', type: 'work_center', ownerOrgId: factory.id,
        factoryOrgId: factory.id, specification: '联调资源', status: 'enabled',
      } }), 201); await saveState();
    }
    if (!production.material) {
      production.material = ok(await request(page, owner, '/api/v1/inventory/materials', { method: 'POST', body: {
        code: `M-${state.suffix}`, name: `联调物料-${state.suffix}`, uom: 'PCS', defaultWarehouseId: state.warehouse.id,
        materialType: 'purchased', unitPrice: '1', safetyStockQty: '0', maxStockQty: '1000',
      } }), 201).material; await saveState();
    }
    if (!production.initialFact) {
      ok(await request(page, owner, '/api/v1/inventory/import/availability', { method: 'POST', body: {
        eventId: randomUUID(), warehouseId: state.warehouse.id, productId: production.material.id,
        qualifiedOnHandQty: '0', allocatedReservedQty: '0', frozenQty: '0', safetyStockQty: '0', inTransitQty: '0',
        fulfillableQty: '0', uom: 'PCS', factVersion: 1, asOf: new Date().toISOString(), sourceSystem: 'CUSTOMER_WMS_E2E', formulaVersion: 'FULFILLABLE-V1',
      } }));
      production.initialFact = true; await saveState();
    }
    if (!production.bom) {
      const routingId = randomUUID();
      production.bom = ok(await request(page, owner, '/api/v1/production/bom-snapshots', { method: 'POST', body: {
        productId: state.product.id, productName: state.product.name, routingSnapshotId: routingId,
        lines: [{ materialId: production.material.id, materialName: production.material.name, warehouseId: state.warehouse.id, qtyPer: '2', uom: 'PCS' }],
        routingSnapshot: { id: routingId, productId: state.product.id, operations: [
          { sequence: 1, code: 'ASSEMBLE', name: '装配', workCenterResourceId: production.workCenter.id, standardMinutes: '5' },
        ] },
      } }), 201); await saveState();
    }
    if (!production.demand) {
      production.demand = ok(await request(page, owner, '/api/v1/production/demands', { method: 'POST', body: {
        code: `DM-${state.suffix}`, sourceType: 'MANUAL', sourceDescription: '联调隔离手工生产需求',
        productId: state.product.id, productName: state.product.name, qty: '10', uom: 'PCS',
        dueDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
        factoryResourceId: factory.id, inventoryWarehouseId: state.warehouse.id, priority: 50,
      } }), 201); await saveState();
    }
    if (production.demand.status === 'RECEIVED') {
      production.demand = ok(await request(page, owner, `/api/v1/production/demands/${production.demand.id}/validate`,
        { method: 'POST', version: production.demand.version, body: {} }));
      await saveState();
    }
    if (production.demand.status === 'PENDING_REVIEW') {
      production.demand = ok(await request(reviewerPage, reviewer, `/api/v1/production/demands/${production.demand.id}/approve`,
        { method: 'POST', version: production.demand.version, body: { remark: '联调复核通过' } }));
      await saveState();
    }
    if (!production.demand.acceptedAt) {
      production.demand = ok(await request(page, owner, `/api/v1/production/demands/${production.demand.id}/claim`,
        { method: 'POST', version: production.demand.version }));
      await saveState();
    }
    if (!production.mrp) {
      production.mrp = ok(await request(page, owner, '/api/v1/production/mrp-runs',
        { method: 'POST', body: { demandIds: [production.demand.id] } }), 202); await saveState();
    }
    assert.equal(production.mrp.status, 'SUCCEEDED');
    assert.equal(production.mrp.result.materialShortages[0].shortageQty, '20');
    const task = documents(tenant, 'production', 'operationTask').find(row => row.id === production.mrp.taskId);
    assert(task, 'MRP task not persisted');
    assert.equal(task.result.materialShortages[0].shortageQty, '20');
    return { demandId: production.demand.id, taskId: task.id, shortageQty: '20', bomId: production.bom.id };
  });
  await run('MRP页面创建PR、刷新恢复关联且禁止重复申请', 'UI/API/DB', async () => {
    assert(production.mrp, 'MRP prerequisite failed');
    await visit(page, 'module=production&production=mrp');
    const row = page.getByRole('row').filter({ hasText: production.material.id });
    // After a later successful MRP, the old shortage disappears legitimately.
    const firstWrite = !production.purchaseRequest;
    if (firstWrite || !production.readyMrp) await row.waitFor();
    if (!production.purchaseRequest) {
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/procurement/purchase-requests' && r.request().method() === 'POST'),
        row.getByRole('button', { name: '采购申请', exact: true }).click(),
      ]);
      assert.equal(response.status(), 201, JSON.stringify(await response.json()));
      production.purchaseRequest = await response.json(); await saveState();
    }
    await page.reload(); await page.waitForLoadState('networkidle');
    if (firstWrite || !production.readyMrp) {
      const linked = row.getByRole('button', { name: '已有关联采购申请', exact: true });
      await linked.waitFor(); assert(await linked.isDisabled());
    } else {
      await visit(page, 'module=procurement&procurement=pr');
      await page.getByText(production.purchaseRequest.requestNo, { exact: true }).first().waitFor();
    }
    const persisted = documents(tenant, 'fulfillment', 'purchaseRequest').filter(item =>
      item.mrpTaskId === production.mrp.taskId && item.demandId === production.demand.id && item.materialId === production.material.id);
    assert.equal(persisted.length, 1); assert.equal(persisted[0].requiredQty, '20');
    const replay = ok(await request(page, owner, '/api/v1/procurement/purchase-requests', { method: 'POST',
      body: { mrpTaskId: production.mrp.taskId, demandId: production.demand.id, materialId: production.material.id } }));
    assert.equal(replay.id, persisted[0].id);
    await page.screenshot({ path: `${output}/mrp-purchase-link.png` });
    return { requestId: persisted[0].id, requiredQty: persisted[0].requiredQty, status: persisted[0].status,
      countAfterReplay: persisted.length, uiCreatedThisRun: firstWrite };
  });
  await run('采购独立审批、收货、库存事实及流水', 'API/DB/UI-read', async () => {
    assert(production.purchaseRequest && reviewer, 'PR prerequisite failed');
    if (!production.supplier) {
      production.supplier = ok(await request(page, owner, '/api/v1/procurement/suppliers', { method: 'POST',
        body: { code: `SUP-${state.suffix}`, name: `联调供应商-${state.suffix}`, paymentTerms: 'net30' } }), 201); await saveState();
    }
    if (!production.purchaseOrder) {
      const created = ok(await request(reviewerPage, reviewer, `/api/v1/procurement/purchase-requests/${production.purchaseRequest.id}/approve`, {
        method: 'POST', version: production.purchaseRequest.version,
        body: { supplierId: production.supplier.id, supplierName: production.supplier.name,
          promisedDate: production.demand.dueDate, unitPrice: '5', taxRate: '0', currency: 'CNY' },
      }), 201);
      production.purchaseOrder = created.order; production.purchaseRequest = created.request; await saveState();
    }
    if (!production.receipt) {
      const received = ok(await request(page, owner, `/api/v1/procurement/purchase-orders/${production.purchaseOrder.id}/receipts`, {
        method: 'POST', version: production.purchaseOrder.version,
        body: { externalTransactionId: `E2E-${randomUUID()}`, receivedAt: new Date().toISOString(), receivedQty: '20', requireInspection: false },
      }), 201);
      production.receipt = received.receipt; production.purchaseOrder = received.order; await saveState();
    }
    const receipts = documents(tenant, 'fulfillment', 'purchaseReceipt').filter(row => row.id === production.receipt.id);
    assert.equal(receipts.length, 1); assert.equal(receipts[0].receivedQty, '20'); assert.equal(receipts[0].status, 'POSTED');
    const facts = ok(await request(page, owner, `/api/v1/inventory/availability?warehouseId=${state.warehouse.id}&productIds=${production.material.id}`));
    assert.equal(facts[0].qualifiedOnHandQty, production.workOrder?.status === 'IN_PROGRESS' ? '0' : '20');
    await visit(page, 'module=procurement&procurement=receipts');
    await page.getByText(production.receipt.receiptNo, { exact: true }).waitFor();
    return { orderId: production.purchaseOrder.id, receiptId: production.receipt.id, receivedQty: receipts[0].receivedQty,
      status: receipts[0].status, inventoryFactVersion: facts[0].factVersion };
  });
  await run('采购入库生成正式AP', 'API/DB', async () => {
    assert(production.receipt?.status === 'POSTED', 'Posted procurement receipt prerequisite failed');
    const ap = ok(await request(page, owner, `/api/v1/finance/payables?sourceOrder=${production.purchaseOrder.id}`));
    const persisted = documents(tenant, 'finance', 'payable').filter(row => row.sourceId === production.purchaseOrder.id || row.sourceId === production.receipt.id);
    assert(persisted.length > 0, `采购收货已POSTED，数据库同源AP=${persisted.length}、接口条数=${ap.items.length}；不补造AP`);
    return { apiCount: ap.items.length, databaseCount: persisted.length };
  });
  await run('齐套后MRP与APS、正式工单和开工', 'API/DB', async () => {
    assert(production.material && production.mrp && factory, 'Production source prerequisite failed');
    if (production.workOrder) {
      production.workOrder = ok(await request(page, owner, `/api/v1/production/work-orders/${production.workOrder.id}`));
      await saveState();
    }
    // A real explicit WMS import is an independent production fixture; never claim this is a PO receipt.
    if (!production.receipt && !production.independentMaterialFact) {
      const current = ok(await request(page, owner, `/api/v1/inventory/availability?warehouseId=${state.warehouse.id}&productIds=${production.material.id}`))[0];
      assert.equal(current.qualifiedOnHandQty, '0');
      ok(await request(page, owner, '/api/v1/inventory/import/availability', { method: 'POST', body: {
        eventId: randomUUID(), warehouseId: state.warehouse.id, productId: production.material.id,
        qualifiedOnHandQty: '20', allocatedReservedQty: '0', frozenQty: '0', safetyStockQty: '0', inTransitQty: '0',
        fulfillableQty: '20', uom: 'PCS', factVersion: current.factVersion + 1, asOf: new Date().toISOString(),
        sourceSystem: 'CUSTOMER_WMS_E2E', formulaVersion: 'FULFILLABLE-V1',
      } }));
      production.independentMaterialFact = true; await saveState();
    }
    if (!production.workOrder) {
      production.readyMrp = ok(await request(page, owner, '/api/v1/production/mrp-runs',
        { method: 'POST', body: { demandIds: [production.demand.id] } }), 202);
      assert.equal(production.readyMrp.result.materialShortages.length, 0);
      production.aps = ok(await request(page, owner, '/api/v1/production/schedule-runs',
        { method: 'POST', body: { demandIds: [production.demand.id] } }), 202);
      const candidate = production.aps.result.scheduleCandidates[0];
      production.workOrder = ok(await request(page, owner, '/api/v1/production/work-orders', { method: 'POST', body: {
        code: `WO-${state.suffix}`, productId: state.product.id, productName: state.product.name, factoryResourceId: factory.id,
        workCenterResourceId: production.workCenter.id, inventoryWarehouseId: state.warehouse.id, plannedQty: '10', inputQty: '0',
        uom: 'PCS', dueDate: production.demand.dueDate, scheduleCandidateId: candidate.id,
        demandLinks: [{ demandId: production.demand.id, allocatedQty: '10' }],
      } }), 201); await saveState();
    }
    if (production.workOrder.kittingStatus !== 'READY') {
      production.workOrder = ok(await request(page, owner, `/api/v1/production/work-orders/${production.workOrder.id}/kitting-check`,
        { method: 'POST', version: production.workOrder.version, body: {} })); await saveState();
    }
    if (production.workOrder.status === 'PLANNED') {
      production.workOrder = ok(await request(page, owner, `/api/v1/production/work-orders/${production.workOrder.id}/release`,
        { method: 'POST', version: production.workOrder.version, body: {} })); await saveState();
    }
    if (production.workOrder.status === 'RELEASED') {
      production.workOrder = ok(await request(page, owner, `/api/v1/production/work-orders/${production.workOrder.id}/start`,
        { method: 'POST', version: production.workOrder.version, body: {} })); await saveState();
    }
    assert.equal(production.workOrder.status, 'IN_PROGRESS');
    const saved = documents(tenant, 'production', 'workOrder').find(row => row.id === production.workOrder.id);
    assert.equal(saved.status, 'IN_PROGRESS'); assert.equal(saved.version, production.workOrder.version);
    return { workOrderId: saved.id, status: saved.status, version: saved.version, materialReservation: !!saved.materialReservation,
      materialSource: production.receipt ? 'POSTED采购收货' : '独立WMS测试导入；不代表采购入库闭环' };
  });
  await run('页面真实报工、缺工序不补造、数量达标不提前完工', 'UI/API/DB', async () => {
    assert(production.workOrder?.status === 'IN_PROGRESS', 'Running work order prerequisite failed');
    await visit(page, 'module=production&production=execution');
    await page.getByText(`JOB-${production.workOrder.code}`, { exact: true }).first().waitFor();
    if (!production.report) {
      await page.getByRole('button', { name: '登记报工', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `登记报工 · ${production.workOrder.code}`, exact: true });
      for (const [label, value] of [['良品数量', '10'], ['不良品数量', '0'], ['报废数量', '0'], ['新增投入数量', '10']]) await dialog.getByLabel(label, { exact: true }).fill(value);
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/production/work-orders/${production.workOrder.id}/reports` && r.request().method() === 'POST'),
        dialog.getByRole('button', { name: '确认报工', exact: true }).click(),
      ]);
      assert.equal(response.status(), 201, JSON.stringify(await response.json()));
      assert(!('operationId' in response.request().postDataJSON()), 'Frontend invented operation ID');
      const body = await response.json(); production.report = body.report; production.workOrder = body.workOrder;
      await saveState(); await dialog.waitFor({ state: 'hidden' });
    }
    const saved = documents(tenant, 'production', 'workOrder').find(row => row.id === production.workOrder.id);
    assert.equal(saved.status, 'IN_PROGRESS'); assert.equal(saved.reportedGoodQty, '10');
    const reports = documents(tenant, 'production', 'workReport').filter(row => row.workOrderId === saved.id);
    assert.equal(reports.length, 1); assert(!reports[0].operationId); assert.equal(reports[0].reportedBy, owner.account);
    await page.reload(); await page.waitForLoadState('networkidle');
    await page.getByText('加工中', { exact: true }).first().waitFor();
    await page.screenshot({ path: `${output}/production-report.png` });
    return { workOrderId: saved.id, status: saved.status, reportedGoodQty: saved.reportedGoodQty, reportRows: reports.length, operationId: reports[0].operationId ?? null };
  });
  await run('生产完工预览必须提供正式仓库资源映射', 'API/DB', async () => {
    assert(production.workOrder, 'Work order prerequisite failed');
    const preview = ok(await request(page, owner, `/api/v1/production/work-orders/${production.workOrder.id}/completion-allocation-preview`,
      { method: 'POST', body: { qty: '10' } }));
    production.preview = preview; await saveState();
    assert(preview.warehouseResourceId && preview.traceMode && preview.sourceVersions.routingSnapshotVersion > 0,
      `预览缺正式来源：${JSON.stringify(preview)}`);
    return preview;
  });
  await run('生产完工缺来源时前端阻止写入', 'UI/API/DB', async () => {
    assert(production.report, 'Work report prerequisite failed');
    if (!production.inspection) {
      production.inspection = ok(await request(page, owner, '/api/v1/production/inspections', { method: 'POST',
        body: { workOrderId: production.workOrder.id, sampleQty: '10' } }), 201); await saveState();
    }
    if (production.inspection.status === 'CREATED') {
      // The owner has real "*" authority; this continues the source guard probe only.
      // Missing inspector IAM is a separate failure, not an independent-quality pass.
      production.inspection = ok(await request(page, owner, `/api/v1/production/inspections/${production.inspection.id}/result`, {
        method: 'POST', version: production.inspection.version, body: { passedQty: '10', failedQty: '0', reason: '联调合格' },
      })); await saveState();
    }
    await visit(page, 'module=production&production=qc_cost');
    const requests = [];
    const listener = req => { if (/\/completions$/.test(new URL(req.url()).pathname) && req.method() === 'POST') requests.push(req.url()); };
    page.on('request', listener);
    try {
      await page.getByRole('button', { name: /确认.*入库|入库.*确认/ }).click();
      await page.getByText(/缺少已确认的仓库资源映射/).waitFor();
      assert.equal(requests.length, 0);
      assert.equal(documents(tenant, 'production', 'completion').length, 0);
      return { completionRequests: 0, completionRows: 0, inspectionId: production.inspection.id, inspectionStatus: production.inspection.status,
        inspectionMode: '注册管理员真实权限提交，仅用于完工来源守卫探查；非独立质检权限验收' };
    } finally { page.off('request', listener); }
  });
  await run('平台资源新路由、审计非空分页及页面读取', 'API/DB/UI-read', async () => {
    assert(factory, 'Missing factory');
    if (!state.resource) {
      state.resource = ok(await request(page, owner, '/api/v1/platform/resources', { method: 'POST',
        body: { code: `RES-${state.suffix}`, name: `联调仓库资源-${state.suffix}`, type: 'warehouse', ownerOrgId: factory.id,
          factoryOrgId: factory.id, specification: '隔离资源', status: 'enabled' } }), 201); await saveState();
    }
    const resources = ok(await request(page, owner, '/api/v1/platform/permission-resources'));
    const saved = documents(tenant, 'platform', 'resource').find(row => row.id === state.resource.id);
    assert(resources.some(row => row.id === saved.id && row.version === saved.version));
    const audits = ok(await request(page, owner, '/api/v1/platform/audits?page=1&pageSize=1'));
    const savedAudits = documents(tenant, 'platform', 'auditLog');
    assert.equal(audits.total, savedAudits.length); assert.equal(audits.hasMore, true);
    const second = ok(await request(page, owner, '/api/v1/platform/audits?page=2&pageSize=1'));
    assert.notEqual(audits.items[0].id, second.items[0].id);
    await visit(page, 'module=platform&platform=audit');
    const panel = page.getByTestId('platform-view-audit');
    await panel.getByText(`共 ${audits.total} 条`, { exact: false }).waitFor();
    await page.screenshot({ path: `${output}/platform-audit.png` });
    return { resourceId: saved.id, resourceVersion: saved.version, total: audits.total, databaseCount: savedAudits.length, hasMore: audits.hasMore };
  });
  await run('财务核销缺少lines应返回字段错误', 'API/DB-negative', async () => {
    assert(state.payment, 'Payment prerequisite failed');
    const count = documents(tenant, 'finance', 'allocation').length;
    const result = await request(page, owner, '/api/v1/finance/allocations',
      { method: 'POST', body: { paymentId: state.payment.id } });
    assert.equal(documents(tenant, 'finance', 'allocation').length, count);
    assert([400, 422].includes(result.status), `缺lines返回${result.status}：${JSON.stringify(result.body)}`);
    return { status: result.status, allocationRowsUnchanged: true };
  });
  await run('财务确认服务端职责分离', 'API/DB-negative', async () => {
    assert(state.customer, 'Customer prerequisite failed');
    if (!state.guardPayment) {
      state.guardPayment = ok(await request(page, owner, '/api/v1/finance/payments', { method: 'POST', body: {
        direction: 'INBOUND', counterpartyId: state.customer.id, counterpartyName: state.customer.name,
        amount: '7', currency: 'CNY', paymentMethod: 'bank_transfer', paymentDate: new Date().toISOString().slice(0, 10), remark: '隔离自确认反例',
      } }), 201).payment; await saveState();
    }
    if (!state.selfConfirmEvidence) {
      const result = await request(page, owner, `/api/v1/finance/payments/${state.guardPayment.id}/confirm`,
        { method: 'POST', version: state.guardPayment.version });
      const saved = documents(tenant, 'finance', 'payment').find(row => row.id === state.guardPayment.id);
      state.guardPayment = saved;
      state.selfConfirmEvidence = { status: result.status, paymentId: saved.id, statusInDatabase: saved.status, version: saved.version };
      await saveState();
    }
    assert.equal(state.selfConfirmEvidence.status, 403, `登记人自确认未被拒绝：${JSON.stringify(state.selfConfirmEvidence)}`);
    return state.selfConfirmEvidence;
  });
  await run('财务冲销拒绝伪造审批凭证', 'API/DB-negative', async () => {
    assert(state.guardPayment?.status === 'done' || state.guardPayment?.status === 'reversed', 'Confirmed isolated payment prerequisite failed');
    if (!state.reverseEvidence) {
      const result = await request(page, owner, `/api/v1/finance/finance-documents/${state.guardPayment.id}/reverse`, {
        method: 'POST', version: state.guardPayment.version, body: { reason: '隔离假审批反例', approverToken: 'invalid-e2e-approval-token' },
      });
      const saved = documents(tenant, 'finance', 'payment').find(row => row.id === state.guardPayment.id);
      state.guardPayment = saved;
      state.reverseEvidence = { status: result.status, paymentId: saved.id, statusInDatabase: saved.status, version: saved.version };
      await saveState();
    }
    assert([400, 403, 409, 422].includes(state.reverseEvidence.status),
      `伪造审批凭证被接受：${JSON.stringify(state.reverseEvidence)}`);
    return state.reverseEvidence;
  });
  await run('忘记密码页面申请后验证码事实入库', 'UI/API/DB', async () => {
    assert(!process.env.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER === 'console', '真实邮件服务未纳入本轮，不调用外部邮件');
    const forgot = await makePage();
    await forgot.goto(baseUrl);
    await forgot.getByRole('button', { name: '忘记密码？', exact: true }).click();
    await forgot.getByPlaceholder('请输入注册邮箱', { exact: true }).fill(state.email);
    const [response] = await Promise.all([
      forgot.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/session/password/forgot'),
      forgot.getByRole('button', { name: '获取验证码', exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    await forgot.getByPlaceholder('请输入邮箱验证码', { exact: true }).waitFor();
    const hash = createHash('sha256').update(state.email.toLowerCase()).digest('hex');
    const count = Number(sql(`SELECT count(*) FROM auth_email_code WHERE email_hash=${literal(hash)} AND consumed_at IS NULL`, null, true));
    await forgot.screenshot({ path: `${output}/forgot-password.png` });
    assert.equal(count, 1, `页面进入重置步骤但数据库有效验证码条数=${count}；无外部投递成功验收`);
    return { status: response.status(), activeCodeRows: count, provider: 'console', externalDeliveryVerified: false };
  });
  await run('重新登录读取本轮真实单据及localStorage无业务事实', 'UI/API/DB', async () => {
    const newPage = await makePage();
    const again = await login(newPage, state.account, state.password);
    assert.equal(again.tenantIds[0], tenant);
    for (const [query, text] of [
      ['module=inventory&inventory=products', state.product?.name],
      [state.receipt ? 'module=sales&tab=receipts' : 'module=sales&tab=orders', state.receipt?.receiptNo || state.order?.orderNo],
      ['module=finance&finance=payments', state.payment?.docNo],
    ]) {
      assert(text, `Missing fixture for ${query}`); await visit(newPage, query);
      await newPage.getByText(text, { exact: true }).first().waitFor();
    }
    const keys = await newPage.evaluate(() => Object.keys(localStorage));
    assert(!keys.some(key => /prototype|seed|sales-order|inventory-fact/i.test(key)), 'Prototype business storage found');
    return { tenant, reauthenticated: true, localStorageKeys: keys, verifiedIds: [state.product.id, state.receipt.id, state.payment.id] };
  });
} catch (error) {
  check('执行前置条件', 'RUNNER', false, { message: error.message });
} finally {
  check('浏览器运行异常', 'UI', report.pageErrors.length === 0, { pageErrors: report.pageErrors });
  await browser.close();
  await saveState();
  report.fixtureCompatibilityOverrides = state.platformFixtureOverrides || [];
  report.summary = { passed: report.checks.filter(item => item.passed).length, blocked: report.checks.filter(item => !item.passed).length };
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
}
if (report.checks.some(item => !item.passed)) process.exitCode = 1;
