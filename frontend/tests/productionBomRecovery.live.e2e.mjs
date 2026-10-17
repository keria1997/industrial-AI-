import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Real local UI -> API -> PostgreSQL. API fixtures only in a previously isolated E2E tenant.
if (existsSync('../.env.local')) process.loadEnvFile('../.env.local');
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname), 'This write regression only targets a local server');
const seed = JSON.parse(await readFile(process.env.ISSUE019_LIVE_STATE || '/tmp/industrial-ai-delivery-write-final/private-state.json', 'utf8'));
assert(seed.tenantName?.startsWith('联调隔离企业-') && seed.account && seed.password && seed.production?.material && seed.production?.workCenter, 'Use a previously provisioned isolated E2E tenant');
assert(process.env.DATABASE_URL, 'DATABASE_URL is required for read-only verification');
const database = new URL(process.env.DATABASE_URL.replace(/^jdbc:/, ''));
const output = process.env.ISSUE019_REPORT_DIR || '/tmp/industrial-ai-issue019-live';
const report = { mocked: false, sqlWrites: false, baseUrl, tenantId: seed.tenant, checks: [], errors: [], writes: [] };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/') && request.method() !== 'GET' && !path.includes('/session/')) report.writes.push({ method: request.method(), path });
});
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const documents = (module, kind) => JSON.parse(execFileSync('psql', ['--no-password', '-X', '-qAt', '-c',
  `SELECT coalesce(json_agg(data), '[]') FROM module_document WHERE tenant_id=${literal(seed.tenant)} AND module=${literal(module)} AND kind=${literal(kind)}`], {
  env: { ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432',
    PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
    ...(database.username ? { PGUSER: decodeURIComponent(database.username) } : {}),
    ...(database.password ? { PGPASSWORD: decodeURIComponent(database.password) } : {}),
    PGOPTIONS: `-c default_transaction_read_only=on -c app.tenant_id=${seed.tenant}` },
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim());
const check = (name, evidence) => {
  report.checks.push({ name, passed: true, evidence });
  console.log(`PASS ${name}: ${JSON.stringify(evidence)}`);
};
await mkdir(output, { recursive: true, mode: 0o700 });
try {
  await page.goto(baseUrl);
  const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
  await image.waitFor();
  const source = await image.getAttribute('src');
  const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
  assert(captcha, 'Local captcha unavailable');
  await page.getByPlaceholder('请输入账号', { exact: true }).fill(seed.account);
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(seed.password);
  await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
  await page.getByRole('button', { name: '立即登录', exact: true }).click();
  await page.waitForFunction(() => !!sessionStorage.getItem('industrial-ai-session:v2'));
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')));
  assert(session.tenantIds.includes(seed.tenant), 'The authenticated owner must belong to the isolated tenant');
  const request = async (path, body) => {
    if (body) report.writes.push({ method: 'POST', path, fixtureSetup: true });
    const response = await page.request.fetch(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'X-Tenant-Id': seed.tenant, ...(body ? { 'Idempotency-Key': randomUUID() } : {}) },
      ...(body ? { data: body } : {}),
    });
    const result = await response.json();
    assert(response.ok(), `${path}: ${response.status()} ${JSON.stringify(result?.error || {})}`);
    return result;
  };
  const original = await request('/api/v1/production/demands?search=DM-MVCBRHE4D10A&page=1&pageSize=200');
  check('原 ISSUE 需求在当前隔离环境的可见性', { found: original.items?.some(item => item.code === 'DM-MVCBRHE4D10A') || false, note: '不据此断言原部署环境缺 BOM' });
  const resources = await request('/api/v1/platform/permission-resources');
  assert(resources.some(item => item.id === seed.production.workCenter.id && item.status === 'enabled'), 'Existing E2E work center must be queryable before creating fixtures');
  const suffix = randomUUID().slice(0, 8);
  const product = (await request('/api/v1/inventory/products', {
    code: `P019-${suffix}`, name: `BOM闭环回归产品-${suffix}`, uom: 'PCS', productType: 'finished',
    specification: 'ISSUE-019 隔离回归', category: '成品', unitPrice: '1', safetyStockQty: '0', maxStockQty: '100',
    defaultWarehouseId: seed.warehouse.id,
  })).product;
  assert(product.id !== product.code, 'Exercise stable ID distinct from business code');
  const demand = await request('/api/v1/production/demands', {
    code: `DM019-${suffix}`, sourceType: 'MANUAL', sourceDescription: 'ISSUE-019 独立回归需求',
    productId: product.id, productName: product.name, qty: '2', uom: 'PCS',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    factoryResourceId: seed.production.demand.factoryResourceId, inventoryWarehouseId: seed.warehouse.id, priority: 50,
  });
  report.fixtureIds = { productId: product.id, demandId: demand.id };
  await page.goto(`${baseUrl}/?module=production&production=mps&focusMps=${demand.id}&probe=019-live`);
  const row = () => page.getByRole('row').filter({ has: page.getByRole('cell', { name: demand.code, exact: true }) });
  await row().getByRole('button', { name: '需求校验', exact: true }).click();
  await row().getByText('缺少服务端生效 BOM', { exact: true }).waitFor();
  const blocked = documents('production', 'demand').find(item => item.id === demand.id);
  assert.equal(blocked.status, 'BLOCKED');
  assert(blocked.blockReasons.includes('缺少服务端生效 BOM'));
  assert(!documents('production', 'bomSnapshot').some(item => item.productId === product.id));
  check('页面校验与数据库缺 BOM 阻断一致', { demandId: demand.id, status: blocked.status, version: blocked.version });
  await row().getByRole('button', { name: '维护 BOM', exact: true }).click();
  await page.getByRole('button', { name: '发布生效 BOM', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '发布生效 BOM', exact: true });
  assert.equal(await dialog.getByLabel('产品 ID', { exact: true }).inputValue(), product.id);
  await dialog.getByRole('button', { name: '添加物料', exact: true }).click();
  await dialog.getByRole('button', { name: '添加工序', exact: true }).click();
  await dialog.getByLabel('materialId-0', { exact: true }).selectOption(seed.production.material.id);
  await dialog.getByLabel('warehouseId-0', { exact: true }).selectOption(seed.warehouse.id);
  await dialog.getByLabel('workCenterResourceId-0', { exact: true }).selectOption(seed.production.workCenter.id);
  for (const [label, value] of [['qtyPer-0', '2'], ['sequence-0', '10'], ['code-0', 'OP-019'], ['name-0', '装配'], ['standardMinutes-0', '5']]) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  const [publishedResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/production/bom-snapshots') && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: '确认发布', exact: true }).click(),
  ]);
  assert.equal(publishedResponse.status(), 201);
  const published = await publishedResponse.json();
  await dialog.waitFor({ state: 'hidden' });
  const saved = documents('production', 'bomSnapshot').find(item => item.productId === product.id);
  assert.equal(saved.id, published.id);
  assert.equal(saved.status, 'EFFECTIVE');
  assert.equal(saved.version, published.version);
  assert.deepEqual(saved.lines, published.lines);
  assert.deepEqual(saved.routingSnapshot, published.routingSnapshot);
  assert.equal(documents('production', 'demand').find(item => item.id === demand.id).status, 'BLOCKED');
  check('页面发布结果与数据库 BOM/工艺一致，未自动推进需求', { bomId: saved.id, productId: product.id, version: saved.version });
  await page.getByRole('button', { name: '返回原需求', exact: true }).click();
  await row().getByText('缺少服务端生效 BOM', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('probe'), '019-live');
  const [validatedResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/validate') && response.request().method() === 'POST'),
    row().getByRole('button', { name: '需求校验', exact: true }).click(),
  ]);
  assert.equal(validatedResponse.status(), 200);
  assert.deepEqual(validatedResponse.request().postDataJSON(), {});
  assert.equal(validatedResponse.request().headers()['if-match'], `"${blocked.version}"`);
  const validated = await validatedResponse.json();
  assert.equal(validated.status, 'PENDING_REVIEW');
  await row().getByText('待审批', { exact: true }).waitFor();
  const stored = documents('production', 'demand').find(item => item.id === demand.id);
  assert.equal(stored.status, validated.status);
  assert.equal(stored.version, validated.version);
  assert.deepEqual(stored.blockReasons, []);
  await page.reload();
  await row().getByText('待审批', { exact: true }).waitFor();
  check('返回并重新校验后 UI/API/数据库及强刷新一致', { demandId: stored.id, status: stored.status, version: stored.version });
  await row().getByText('待审批', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/mps-validated.png`, fullPage: true });
  assert.deepEqual(report.errors, []);
} catch (cause) {
  report.failure = cause.message;
  console.error(`BLOCKED ISSUE-019 live: ${cause.message}`);
  process.exitCode = 1;
} finally {
  await page.screenshot({ path: `${output}/last-page.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
