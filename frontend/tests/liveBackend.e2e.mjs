import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Real chain: PostgreSQL -> Java API -> Vite proxy -> browser. No route interception or synthetic session.
const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const apiUrl = process.env.BACKEND_TEST_URL || 'http://127.0.0.1:8081';
const account = process.env.E2E_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT?.split(',')[0];
const password = process.env.E2E_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
assert(account && password, 'Configure E2E_ACCOUNT/E2E_PASSWORD or enabled local demo credentials');
assert(process.env.DATABASE_URL, 'DATABASE_URL is required; an API-only check cannot pass this test');
const dbUrl = new URL(process.env.DATABASE_URL.replace(/^jdbc:/, ''));
const dbEnv = {
  ...process.env, PGHOST: dbUrl.hostname, PGPORT: dbUrl.port || '5432',
  PGDATABASE: decodeURIComponent(dbUrl.pathname.slice(1)),
  ...(dbUrl.username ? { PGUSER: decodeURIComponent(dbUrl.username) } : {}),
  ...(dbUrl.password ? { PGPASSWORD: decodeURIComponent(dbUrl.password) } : {}),
  ...(dbUrl.searchParams.get('sslmode') ? { PGSSLMODE: dbUrl.searchParams.get('sslmode') } : {}),
};
const sql = query => execFileSync('psql', ['--no-password', '-X', '-q', '-A', '-t', '-c', query],
  { env: dbEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const output = process.env.LIVE_REPORT_DIR || `${root}artifacts/live-integration`;
const report = { generatedAt: new Date().toISOString(), baseUrl, apiUrl, mocked: false, checks: [], pages: [], httpErrors: [] };
const check = (name, passed, evidence) => {
  report.checks.push({ name, passed, evidence });
  console.log(`${passed ? 'PASS' : 'BLOCKED'} ${name}: ${JSON.stringify(evidence)}`);
};
const browser = await chromium.launch({ headless: true });
let session;
let ownedCustomer;
let page;
const headers = () => ({ Authorization: `Bearer ${session.accessToken}`, 'X-Tenant-Id': session.tenantIds[0] });
const request = async (path, options = {}) => {
  const response = await page.request.fetch(`${baseUrl}${path}`, { headers: headers(), ...options });
  const body = response.headers()['content-type']?.includes('application/json') ? await response.json() : null;
  return { response, body };
};
const documents = (module, kind) => JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('docId',doc_id,'data',data)), '[]')
  FROM module_document WHERE tenant_id=${literal(session.tenantIds[0])} AND module=${literal(module)} AND kind=${literal(kind)}`));
const visit = async query => {
  await page.goto(`${baseUrl}/?${query}`);
  await page.waitForLoadState('networkidle');
  await page.locator('main').first().waitFor({ timeout: 10000 }).catch(() => {});
  return page.locator('body').innerText();
};

// Field sets are the shared persisted/public facts, not a comparison against unrelated legacy SQL tables.
const lists = [
  ['sales/orders', '/sales/sales-orders', 'fulfillment', 'order', ['orderNo', 'customerId', 'totalAmount', 'overallStatus', 'version'], 'module=sales&tab=orders', 'orderNo'],
  ['inventory/warehouses', '/inventory/warehouses', 'fulfillment', 'warehouse', ['code', 'name', 'status', 'version'], 'module=inventory&inventory=warehouses', 'name'],
  ['inventory/products', '/inventory/products', 'fulfillment', 'product', ['code', 'name', 'status', 'version'], 'module=inventory&inventory=products', 'name'],
  ['inventory/materials', '/inventory/materials', 'fulfillment', 'material', ['code', 'name', 'status', 'version'], 'module=inventory&inventory=materials', 'name'],
  ['inventory/shipments', '/inventory/shipment-tasks', 'fulfillment', 'shipmentTask', ['requestNo', 'salesOrderId', 'workflowStatus', 'postingStatus', 'version'], 'module=inventory&inventory=outbound', 'salesOrderNo'],
  ['inventory/transfers', '/inventory/transfer-orders', 'fulfillment', 'transferOrder', ['transferNo', 'status', 'version']],
  ['inventory/stocktakes', '/inventory/stocktake-tasks', 'fulfillment', 'stocktakeTask', ['stocktakeNo', 'warehouseId', 'status', 'version']],
  ['production/demands', '/production/demands', 'production', 'demand', ['code', 'status', 'productId', 'plannedQty', 'version'], 'module=production&production=mps', 'code'],
  ['production/work-orders', '/production/work-orders', 'production', 'workOrder', ['code', 'status', 'plannedQty', 'reportedGoodQty', 'version'], 'module=production&production=orders', 'code'],
  ['production/inspections', '/production/inspections', 'production', 'inspection', ['code', 'status', 'sampleQty', 'passedQty', 'version']],
  ['production/bom', '/production/bom-snapshots', 'production', 'bomSnapshot', ['productId', 'lines', 'version']],
  ['procurement/requests', '/procurement/purchase-requests', 'fulfillment', 'purchaseRequest', ['prNo', 'status', 'materialId', 'qty', 'version'], 'module=procurement&procurement=pr', 'prNo'],
  ['procurement/orders', '/procurement/purchase-orders', 'fulfillment', 'purchaseOrder', ['poNo', 'status', 'orderedQty', 'receivedQty', 'totalAmount', 'version'], 'module=procurement&procurement=order', 'poNo'],
  ['procurement/receipts', '/procurement/purchase-receipts', 'fulfillment', 'purchaseReceipt', ['receiptNo', 'purchaseOrderId', 'receivedQty', 'status', 'version'], 'module=procurement&procurement=receipts', 'receiptNo'],
  ['procurement/returns', '/procurement/purchase-returns', 'fulfillment', 'purchaseReturn', ['returnNo', 'status', 'version']],
  ['procurement/suppliers', '/procurement/suppliers', 'fulfillment', 'supplier', ['name', 'status', 'version'], 'module=procurement&procurement=supplier', 'name'],
  ['finance/receivables', '/finance/receivables', 'finance', 'receivable', ['docNo', 'totalAmount', 'receivedAmount', 'outstandingAmount', 'status', 'version'], 'module=finance&finance=receivable', 'docNo'],
  ['finance/payables', '/finance/payables', 'finance', 'payable', ['docNo', 'totalAmount', 'paidAmount', 'outstandingAmount', 'status', 'version'], 'module=finance&finance=payable', 'docNo'],
  ['finance/payments', '/finance/payments', 'finance', 'payment', ['docNo', 'amount', 'status', 'version'], 'module=finance&finance=payments', 'docNo'],
  ['finance/costs', '/finance/cost-accounting', 'finance', 'costAccounting', ['docNo', 'totalCost', 'status', 'version'], 'module=finance&finance=cost', 'docNo'],
  ['personnel/employees', '/personnel/employees', 'personnel', 'employee', ['employeeNo', 'name', 'department', 'status', 'version'], 'module=personnel', 'name', '员工档案表'],
  ['personnel/skills', '/personnel/skills', 'personnel', 'skill', ['certNo', 'employeeId', 'skillName', 'expiryDate', 'version'], 'module=personnel', 'skillName', '资质技能'],
  ['supply/customers', '/supply-chain/customers', 'supplychain', 'customer', ['customerNo', 'name', 'status', 'metadata', 'version'], 'module=sales&tab=customers', 'name'],
  ['supply/suppliers', '/supply-chain/suppliers', 'supplychain', 'supplier', ['supplierNo', 'name', 'status', 'version'], 'module=supply-chain', 'name', '供应商信息'],
  ['supply/risks', '/supply-chain/risk-events', 'supplychain', 'riskEvent', ['riskNo', 'companyName', 'status', 'version'], 'module=supply-chain', 'riskType', '风险数据中心'],
  ['ai/insights', '/ai/insights', 'ai', 'insight', ['insightNo', 'title', 'status', 'sourceId', 'version']],
  ['messages', '/message/messages', 'message', 'record', ['msgNo', 'title', 'isRead', 'isArchived', 'version'], 'module=messages', 'title'],
  ['sales/rmas', '/fulfillment/rmas', 'fulfillment', 'rma', ['rmaNo', 'orderId', 'orderNo', 'productName', 'requestedQty', 'approvedQty', 'receivedQty', 'qualifiedQty', 'status', 'creditArId', 'creditArAmount', 'currency', 'createdAt', 'version'], 'module=sales&tab=rma', 'rmaNo'],
  ['sales/customer-receipts', '/fulfillment/customer-receipts', 'fulfillment', 'receipt', ['receiptNo', 'orderId', 'orderNo', 'customerName', 'signedQty', 'rejectedQty', 'damagedQty', 'receiptStatus', 'status', 'signedAt', 'version'], 'module=sales&tab=receipts', 'receiptNo'],
];

try {
  const health = await pageHealth();
  check('backend readiness', health.status === 200, health);
  await mkdir(output, { recursive: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400) report.httpErrors.push({ path: url.pathname, status: response.status() });
  });
  await page.goto(baseUrl);
  const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
  await image.waitFor();
  const source = await image.getAttribute('src');
  assert(source?.startsWith('data:image/svg+xml'), 'Local integration requires the existing local captcha renderer');
  // Read the actual locally rendered challenge; do not bypass captcha validation or inject a token.
  const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
  assert(captcha, 'Rendered captcha has no readable challenge');
  await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
  await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/session/login'),
    page.getByRole('button', { name: '立即登录', exact: true }).click(),
  ]);
  assert.equal(login.status(), 200, 'Real UI login failed');
  await page.waitForFunction(() => !!sessionStorage.getItem('industrial-ai-session:v2'));
  session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')));
  assert(session.tenantIds?.[0] && session.accessToken);
  report.tenantId = session.tenantIds[0];
  check('UI captcha/password -> real session', true, { status: login.status(), tenantId: report.tenantId });
  // A nonempty ledger can contain placeholders; verify the deployed migration names and SHA-256.
  const migrationDirectory = `${root}backend/target/classes/db/migrations`;
  const migrationFiles = readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort();
  const ledger = JSON.parse(sql("SELECT coalesce(json_agg(json_build_object('filename',filename,'checksum',checksum)), '[]') FROM schema_migrations"));
  const missing = [];
  const mismatched = [];
  for (const filename of migrationFiles) {
    const entry = ledger.find(row => row.filename === filename);
    if (!entry) { missing.push(filename); continue; }
    const hash = createHash('sha256').update(readFileSync(`${migrationDirectory}/${filename}`)).digest('hex');
    if (entry.checksum !== hash) mismatched.push(filename);
  }
  check('migration ledger', migrationFiles.length > 0 && !missing.length && !mismatched.length,
    { applied: ledger.length, expected: migrationFiles.length, missing, mismatched });

  for (const [name, endpoint, module, kind, fields, query, textKey, tab] of lists) {
    try {
      const { response, body } = await request(`/api/v1${endpoint}?page=1&pageSize=200`);
      assert(response.ok(), `HTTP ${response.status()}`);
      const items = Array.isArray(body) ? body : body.items;
      assert(Array.isArray(items), 'Expected array or items array');
      const allRows = documents(module, kind);
      // The production list intentionally excludes archived demands.
      const rows = allRows.filter(row => !(module === 'production' && kind === 'demand' && row.data.archived === true));
      const issues = [];
      const dbById = new Map();
      for (const row of rows) {
        const id = row.data.id;
        if (!id) issues.push(`missing persisted id: ${row.docId}`);
        if (dbById.has(id)) issues.push(`duplicate persisted business id: ${id}`);
        dbById.set(id, [...(dbById.get(id) || []), row.data]);
      }
      // Never treat a truncated first page as a complete database comparison.
      if (!Array.isArray(body) && body.total > items.length) issues.push('collection exceeds first 200 rows; full-page verification required');
      if (rows.length !== items.length) issues.push(`DB/API row count ${rows.length}/${items.length}`);
      const seen = new Set();
      for (const item of items) {
        if (seen.has(item.id)) issues.push(`duplicate API id: ${item.id}`);
        seen.add(item.id);
        const matches = dbById.get(item.id);
        if (!matches) { issues.push(`API id absent in database: ${item.id}`); continue; }
        if (matches.length !== 1) continue;
        for (const field of fields) {
          // Compare JSON structurally; object key order is not a data mismatch.
          try { assert.deepEqual(item[field], matches[0][field]); }
          catch { issues.push(`${item.id}.${field} differs`); }
        }
      }
      for (const id of dbById.keys()) if (!seen.has(id)) issues.push(`database id absent in API: ${id}`);
      check(`DB/API ${name}`, !issues.length, { status: response.status(), dbRows: rows.length, excludedArchived: allRows.length - rows.length, apiRows: items.length, issues });
      if (query) {
        await visit(query);
        if (tab) {
          await page.getByRole('button', { name: tab, exact: true }).click();
          await page.waitForLoadState('networkidle');
        }
        const text = await page.locator('body').innerText();
        const samples = items.slice(0, 10).filter(item => item[textKey]);
        const missing = samples.filter(item => !text.includes(String(item[textKey]))).map(item => item.id);
        check(`API/UI ${name}`, !missing.length, { sampled: samples.length, missing, empty: !items.length });
        if (name === 'sales/rmas' || name === 'sales/customer-receipts') {
          const differences = [];
          for (const item of samples) {
            const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: item[textKey], exact: true }) });
            if (await row.count() !== 1) { differences.push(`${item.id}: row missing or ambiguous`); continue; }
            const cells = await row.getByRole('cell').allInnerTexts();
            const quantityFields = name === 'sales/rmas'
              ? ['requestedQty', 'approvedQty', 'receivedQty', 'qualifiedQty']
              : ['signedQty', 'rejectedQty', 'damagedQty'];
            for (const [index, field] of quantityFields.entries()) {
              if (cells[index + 3] !== (item[field] || '-')) differences.push(`${item.id}.${field}: UI differs`);
            }
            if (name === 'sales/customer-receipts') {
              const labels = { PENDING: '待签收', PARTIALLY_SIGNED: '部分签收', SIGNED: '全部签收', REJECTED: '拒收', DISPUTED: '争议中' };
              const status = item.receiptStatus || item.status;
              if (cells[6] !== (labels[status] || status || '-')) differences.push(`${item.id}: receipt status differs`);
            } else if (!item.currency && cells[9] !== '-') {
              differences.push(`${item.id}: amount without currency displayed`);
            }
          }
          check(`API/UI field facts ${name}`, !differences.length, { sampled: samples.length, differences });
          await page.screenshot({ path: `${output}/${name.endsWith('/rmas') ? 'sales-rmas' : 'sales-receipts'}.png`, fullPage: true });
        }
      }
    } catch (error) {
      check(`DB/API ${name}`, false, { error: error.message });
    }
  }

  const availability = await request('/api/v1/inventory/availability');
  const facts = documents('fulfillment', 'availability').map(row => row.data);
  const sortFacts = values => [...values].sort((a, b) => `${a.warehouseId}:${a.productId}`.localeCompare(`${b.warehouseId}:${b.productId}`));
  let availabilityMatches = false;
  try { assert.deepEqual(sortFacts(availability.body), sortFacts(facts)); availabilityMatches = availability.response.ok(); } catch {}
  check('DB/API inventory availability', availabilityMatches, { dbRows: facts.length, apiRows: availability.body?.length });

  const platform = await request('/api/v1/platform/snapshot');
  check('platform tenant bootstrap', platform.response.ok(), { status: platform.response.status(), code: platform.body?.error?.code });
  const search = await request(`/api/v1/workbench/dashboard?role=${encodeURIComponent(session.role)}&search=${crypto.randomUUID()}`);
  const searchedRows = [search.body?.todos, search.body?.alerts, search.body?.activities];
  check('workbench server search', search.response.ok() && searchedRows.every(items => Array.isArray(items) && items.length === 0),
    { status: search.response.status(), lengths: searchedRows.map(items => items?.length ?? null) });
  const insights = await request('/api/v1/sales/ai-insights');
  // A fresh timestamp plus fixed zeros is not evidence of a real aggregate.
  check('sales insights availability contract', ['AVAILABLE', 'EMPTY', 'UNAVAILABLE'].includes(insights.body?.availability),
    { status: insights.response.status(), availability: insights.body?.availability || 'MISSING' });
  if (!['AVAILABLE', 'EMPTY'].includes(insights.body?.availability)) {
    const text = await visit('module=sales');
    const values = await page.locator('[data-metric="本月订单数"] [data-metric-value], [data-metric="订单销售额"] [data-metric-value]').allInnerTexts();
    check('sales UI rejects unverified zero facts', text.includes('数据待核实') && values.length === 2 && values.every(value => value === '-'), { values });
    await page.screenshot({ path: `${output}/sales-unverified.png`, fullPage: true });
  }
  for (const endpoint of ['/sales/sales-orders', '/fulfillment/rmas', '/fulfillment/customer-receipts', '/sales/ai-insights']) {
    const unauthenticated = await page.request.get(`${baseUrl}/api/v1${endpoint}`);
    check(`auth guard ${endpoint}`, [401, 403].includes(unauthenticated.status()), { status: unauthenticated.status() });
  }
  for (const [name, sourceModule, sourceKind, field, targetModule, targetKind] of [
    ['sales customer', 'fulfillment', 'order', 'customerId', 'supplychain', 'customer'],
    ['sales line product', 'fulfillment', 'order', 'lines.productId', 'fulfillment', 'product'],
    ['work-order product', 'production', 'workOrder', 'productId', 'fulfillment', 'product'],
    ['procurement supplier', 'fulfillment', 'purchaseOrder', 'supplierId', 'fulfillment', 'supplier'],
    ['receipt source order', 'fulfillment', 'purchaseReceipt', 'purchaseOrderId', 'fulfillment', 'purchaseOrder'],
    ['AR source order', 'finance', 'receivable', 'sourceId', 'fulfillment', 'order'],
    ['AP source order', 'finance', 'payable', 'sourceId', 'fulfillment', 'purchaseOrder'],
  ]) {
    const targets = documents(targetModule, targetKind);
    const issues = [];
    for (const { data } of documents(sourceModule, sourceKind)) {
      const references = field === 'lines.productId' ? (data.lines || []).map(line => line.productId) : [data[field]];
      for (const id of references) {
        const matches = targets.filter(row => row.data.id === id);
        if (!id || matches.length !== 1) issues.push({ sourceId: data.id, field, targetId: id || null, matchedRows: matches.length });
      }
    }
    check(`cross-module ${name}`, !issues.length, { issues });
  }

  const routes = [
    'module=workbench',
    ...['dashboard', 'quotes', 'orders', 'rma', 'receipts', 'customers', 'basic-data'].map(tab => `module=sales&tab=${tab}`),
    ...['dashboard', 'stock', 'inbound', 'outbound', 'warehouses', 'products', 'materials'].map(tab => `module=inventory&inventory=${tab}`),
    ...['dashboard', 'mps', 'mrp', 'aps', 'orders', 'execution', 'qc_cost', 'equipment', 'bom', 'routing'].map(tab => `module=production&production=${tab}`),
    ...['dashboard', 'pr', 'order', 'supplier', 'receipts', 'returns'].map(tab => `module=procurement&procurement=${tab}`),
    ...['dashboard', 'receivable', 'payable', 'cost', 'payments'].map(tab => `module=finance&finance=${tab}`),
    'module=personnel', 'module=supply-chain', 'module=ai-hub', 'module=analytics', 'module=messages',
    'module=platform', 'module=platform&platform=access', 'module=feedback',
  ];
  for (const query of routes) {
    const start = pageErrors.length;
    const httpStart = report.httpErrors.length;
    const text = await visit(query);
    const errors = pageErrors.slice(start);
    const passed = text.includes('退出登录') && text.length > 150 && !errors.length;
    report.pages.push({ query, passed, errors, httpErrors: report.httpErrors.slice(httpStart) });
    if (query === 'module=workbench') {
      check('workbench hides attendance', !text.includes('今日出勤率'), {});
      await page.screenshot({ path: `${output}/workbench.png`, fullPage: true });
    }
    if (query === 'module=personnel') check('personnel hides attendance entry', !text.includes('考勤与排班'), {});
    if (query === 'module=platform') await page.screenshot({ path: `${output}/platform.png`, fullPage: true });
    if (query === 'module=platform&platform=access') await page.screenshot({ path: `${output}/platform-access.png`, fullPage: true });
  }
  check('module/subtab render smoke (not feature acceptance)', report.pages.every(item => item.passed),
    { pages: report.pages.length, failed: report.pages.filter(item => !item.passed).map(item => item.query), pageErrors });
  if (process.env.LIVE_WRITE === '1') await customerWriteRoundTrip();
  else report.checks.push({ name: 'customer UI create/edit/DB/reload/delete', passed: null, evidence: { skipped: 'Set LIVE_WRITE=1 to create and delete a dedicated integration record' } });
} catch (error) {
  check('live integration execution', false, { error: error.message });
} finally {
  if (ownedCustomer && session && page) {
    try {
      const { body } = await request(`/api/v1/supply-chain/customers/${ownedCustomer.id}`);
      if (body?.id === ownedCustomer.id) {
        const removed = await request(`/api/v1/supply-chain/customers/${body.id}`, {
          method: 'DELETE', headers: { ...headers(), 'If-Match': `"${body.version}"`, 'X-Idempotency-Key': `live-cleanup:${body.id}` },
        });
        const remains = documents('supplychain', 'customer').some(row => row.data.id === body.id);
        check('owned customer cleanup', removed.response.ok() && !remains, { status: removed.response.status(), remains });
      }
    } catch (error) { check('owned customer cleanup', false, { id: ownedCustomer.id, error: error.message }); }
  }
  await browser.close();
  report.summary = {
    passed: report.checks.filter(item => item.passed === true).length,
    blocked: report.checks.filter(item => item.passed === false).length,
    skipped: report.checks.filter(item => item.passed === null).length,
    pages: report.pages.length,
  };
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log('LIVE RESULT', JSON.stringify(report.summary));
  console.log(`Report: ${output}/report.json`);
  if (report.summary.blocked || report.summary.skipped) process.exitCode = 1;
}

async function pageHealth() {
  const response = await fetch(`${apiUrl}/readyz`, { signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  return { status: response.status, checks: body.checks };
}

async function customerWriteRoundTrip() {
  // Only this run's new UUID is modified/deleted. Existing financial/order/customer facts are untouched.
  const name = `联调验证-${Date.now()}`;
  await visit('module=sales&tab=customers');
  await page.getByRole('button', { name: '新增客户', exact: true }).click();
  await page.getByPlaceholder('输入企业全称，保存时自动查重').fill(name);
  await page.getByLabel('主联系人 *', { exact: true }).fill('联调联系人');
  await page.getByLabel('联系电话 *', { exact: true }).fill('13900000001');
  const [created] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/supply-chain/customers' && response.request().method() === 'POST'),
    page.getByRole('button', { name: '保存', exact: true }).click(),
  ]);
  const createdBody = await created.json();
  assert.equal(created.status(), 201, `Customer create failed: ${createdBody.error?.code}`);
  ownedCustomer = createdBody.customer;
  assert(ownedCustomer?.id);
  let rows = documents('supplychain', 'customer').filter(row => row.data.id === ownedCustomer.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.name, name);
  assert.equal(rows[0].data.metadata.phone, '13900000001');
  await page.reload(); await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('搜索客户名称、编码', { exact: true }).fill(name);
  const row = page.locator('tr').filter({ hasText: name });
  await row.waitFor();
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByPlaceholder('输入企业全称，保存时自动查重').fill(`${name}-已编辑`);
  const [updated] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/supply-chain/customers/${ownedCustomer.id}` && response.request().method() === 'PATCH'),
    page.getByRole('button', { name: '保存', exact: true }).click(),
  ]);
  assert.equal(updated.status(), 200);
  const { body } = await request(`/api/v1/supply-chain/customers/${ownedCustomer.id}`);
  rows = documents('supplychain', 'customer').filter(value => value.data.id === ownedCustomer.id);
  assert.equal(body.name, `${name}-已编辑`);
  assert.equal(rows[0].data.name, body.name);
  assert.equal(body.version, ownedCustomer.version + 1);
  await page.reload(); await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('搜索客户名称、编码', { exact: true }).fill(name);
  await page.locator('tr').filter({ hasText: `${name}-已编辑` }).waitFor();
  await page.screenshot({ path: `${output}/customer-roundtrip.png`, fullPage: true });
  check('customer UI create/edit/DB/reload', true, { createdStatus: created.status(), updatedStatus: updated.status(), version: body.version });
}
