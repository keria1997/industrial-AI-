import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Real database -> API -> browser checks. Authentication only; no business commands or API mocks.
const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const account = process.env.E2E_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT?.split(',')[0];
const password = process.env.E2E_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
assert(account && password && process.env.DATABASE_URL, 'Configure local E2E credentials and DATABASE_URL');
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const db = new URL(process.env.DATABASE_URL.replace(/^jdbc:/, ''));
const env = { ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432', PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
  ...(db.username ? { PGUSER: decodeURIComponent(db.username) } : {}),
  ...(db.password ? { PGPASSWORD: decodeURIComponent(db.password) } : {}) };
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = query => execFileSync('psql', ['--no-password', '-X', '-q', '-A', '-t', '-c', query],
  { env: { ...env, PGOPTIONS: '-c default_transaction_read_only=on' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const output = process.env.LIVE_REPORT_DIR || '/tmp/industrial-ai-backend-delivery-review';
const report = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  mocked: false, businessWrites: false, checks: [], pageErrors: [] };
const check = (name, passed, evidence) => {
  report.checks.push({ name, passed, evidence });
  console.log(`${passed ? 'PASS' : 'BLOCKED'} ${name}: ${JSON.stringify(evidence)}`);
};
const browser = await chromium.launch({ headless: true });
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(baseUrl);
  const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
  await image.waitFor();
  const source = await image.getAttribute('src');
  assert(source?.startsWith('data:image/svg+xml'), 'Expected the local captcha renderer');
  const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
  assert(captcha, 'Cannot read the locally rendered challenge');
  await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
  await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
  const [login] = await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/session/login'),
    page.getByRole('button', { name: '立即登录', exact: true }).click()]);
  assert.equal(login.status(), 200, 'Real UI login failed');
  await page.waitForFunction(() => !!sessionStorage.getItem('industrial-ai-session:v2'));
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')));
  const tenant = session.tenantIds[0];
  assert(/^[\w-]+$/.test(tenant), 'Unexpected tenant identifier');
  env.PGOPTIONS = `-c app.tenant_id=${tenant}`;
  // Keep RLS tenant binding and read-only transactions on the same database connection.
  const documents = (module, kind) => JSON.parse(execFileSync('psql', ['--no-password', '-X', '-q', '-A', '-t', '-c',
    `SELECT coalesce(json_agg(data), '[]') FROM module_document WHERE tenant_id=${literal(tenant)} AND module=${literal(module)} AND kind=${literal(kind)}`],
    { env: { ...env, PGOPTIONS: `${env.PGOPTIONS} -c default_transaction_read_only=on` }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  const get = async path => {
    const response = await page.request.get(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${session.accessToken}`, 'X-Tenant-Id': tenant } });
    const body = response.headers()['content-type']?.includes('application/json') ? await response.json() : null;
    return { status: response.status(), body };
  };
  check('real UI login', true, { status: login.status() });
  const ledger = JSON.parse(sql("SELECT coalesce(json_agg(json_build_object('filename', filename, 'checksum', checksum)), '[]') FROM schema_migrations"));
  const migrationPath = `${root}backend/src/main/resources/db/migrations`;
  const missing = [], mismatched = [];
  for (const filename of readdirSync(migrationPath).filter(value => value.endsWith('.sql'))) {
    const entry = ledger.find(row => row.filename === filename);
    if (!entry) missing.push(filename);
    else if (entry.checksum !== createHash('sha256').update(readFileSync(`${migrationPath}/${filename}`)).digest('hex')) mismatched.push(filename);
  }
  check('current source migration ledger', !missing.length && !mismatched.length, { missing, mismatched });
  for (const role of ['老板', '销售', '仓管']) {
    const { status, body } = await get(`/api/v1/workbench/dashboard?role=${encodeURIComponent(role)}&sections=metrics`);
    check(`workbench ${role} 1.1 contract`, status === 200 && body?.schemaVersion === '1.1' && !!body?.data?.metrics,
      { status, schemaVersion: body?.schemaVersion ?? null, nestedMetrics: !!body?.data?.metrics });
  }
  const audits = await get('/api/v1/platform/audits?page=1&pageSize=20');
  check('audit exact paging contract', audits.status === 200 && Number.isSafeInteger(audits.body?.total) && typeof audits.body?.hasMore === 'boolean' && audits.body?.page === 1,
    { status: audits.status, total: audits.body?.total, hasMore: audits.body?.hasMore ?? null, page: audits.body?.page ?? null });
  const resources = await get('/api/v1/platform/permission-resources');
  check('permission resource route', resources.status === 200 && Array.isArray(resources.body), { status: resources.status, array: Array.isArray(resources.body) });
  for (const [name, path, kind, query, textField, fields] of [
    ['warehouses', '/inventory/warehouses', 'warehouse', 'module=inventory&inventory=warehouses', 'name', ['code', 'name', 'status', 'version']],
    ['products', '/inventory/products', 'product', 'module=inventory&inventory=products', 'name', ['code', 'uom', 'defaultWarehouseId', 'version']],
    ['purchase requests', '/procurement/purchase-requests', 'purchaseRequest', 'module=procurement&procurement=pr', 'requestNo', ['mrpTaskId', 'demandId', 'materialId', 'status', 'version']],
  ]) {
    try {
      const { status, body } = await get(`/api/v1${path}?page=1&pageSize=200`);
      assert.equal(status, 200);
      assert(Array.isArray(body?.items));
      const persisted = documents('fulfillment', kind);
      const mismatches = [];
      for (const item of body.items) {
        const saved = persisted.find(row => row.id === item.id);
        for (const field of fields) if (!saved || JSON.stringify(saved[field]) !== JSON.stringify(item[field])) mismatches.push({ id: item.id, field });
      }
      check(`${name} API/database facts`, !mismatches.length && body.total === persisted.length,
        { apiCount: body.items.length, total: body.total, databaseCount: persisted.length, mismatches });
      await page.goto(`${baseUrl}/?${query}`);
      await page.waitForLoadState('networkidle');
      const text = await page.locator('body').innerText();
      const visibleCandidates = body.items.map(item => item[textField] || (textField === 'requestNo' ? item.prNo : '')).filter(Boolean);
      const visible = visibleCandidates.some(value => text.includes(value));
      check(`${name} API/page facts`, visibleCandidates.length > 0 ? visible : text.includes('暂无') || text.includes('没有'),
        { candidates: visibleCandidates.length, visible });
    } catch (error) { check(`${name} chain`, false, { message: error.message }); }
  }
  await page.goto(`${baseUrl}/?module=workbench`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${output}/workbench-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/workbench-mobile.png` });
  check('browser runtime', report.pageErrors.length === 0, { pageErrors: report.pageErrors });
} catch (error) { check('probe execution', false, { message: error.message }); }
finally {
  await browser.close();
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
}
if (report.checks.some(item => !item.passed)) process.exitCode = 1;
