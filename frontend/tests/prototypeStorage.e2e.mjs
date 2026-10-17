import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Controlled API responses isolate browser cache cleanup from database contents.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const legacyKeys = [
  'industrial-ai-sales:v7:TENANT-A', 'industrial-ai-sales:v8:TENANT-B',
  'industrial-ai-inventory-master-data:v1:TENANT-A', 'industrial-ai-inventory-workflow:v1:TENANT-B',
  'industrial-ai-production-legacy:TENANT-A', 'industrial-ai-production-v2:TENANT-B',
  'industrial-ai-platform-v2:TENANT-A',
  'industrial-ai-personnel:v2:TENANT-A', 'industrial-ai-supply-chain:v1:TENANT-A',
  'industrial-ai-ai-hub:v2:TENANT-A', 'industrial-ai-analytics:v1:TENANT-A',
  'industrial-ai-finance:v1:TENANT-A', 'industrial-ai-procurement:v1:TENANT-A',
  'industrial-ai-messages:v1:TENANT-A', 'industrial-ai-feedback:v1:TENANT-A',
];
const queries = [
  'module=sales', 'module=sales&tab=basic-data', 'module=sales&tab=orders',
  'module=inventory&inventory=outbound', 'module=inventory&inventory=inbound',
  'module=inventory&inventory=products', 'module=production',
  'module=production&production=equipment', 'module=production&production=routing',
  'module=platform', 'module=platform&platform=access',
  'module=sales&tab=customers', 'module=sales&tab=quotes', 'module=sales&tab=rma', 'module=sales&tab=receipts',
  'module=inventory&inventory=materials', 'module=inventory&inventory=stock',
  'module=production&production=bom', 'module=procurement', 'module=finance',
  'module=personnel', 'module=supply-chain', 'module=ai-hub', 'module=analytics',
  'module=messages', 'module=feedback', 'module=workbench',
];
const snapshot = {
  tenant: { id: 'TENANT-SHWS', code: 'SHWS', name: 'API snapshot', status: 'running', expireAt: '2099-01-01', edition: '' },
  capabilities: [], orgUnits: [], resources: [], positions: [], employees: [], accounts: [],
  roles: [], permissions: [], roleGrants: [], adapters: [], approvalRules: [], dictionaries: [], parameters: [], audits: [],
};

const browser = await chromium.launch({ headless: true });
try {
  for (const mode of ['empty', 'unavailable']) {
    const context = await browser.newContext();
    try {
      await context.addInitScript(({ legacyKeys }) => {
        sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
          account: 'storage-audit', name: 'Storage audit', role: '超级管理员', permissions: ['*'],
          tenantIds: ['TENANT-SHWS'], accessToken: 'browser-test-only', expiresAt: '2099-01-01T00:00:00Z',
        }));
        for (const storage of [localStorage, sessionStorage]) {
          legacyKeys.forEach(key => storage.setItem(key, '{"schemaVersion":1,"orders":[{"id":"PROTOTYPE-ONLY"}]}'));
        }
        localStorage.setItem('industrial-ai-runtime:tenant:v1:storage-audit', 'TENANT-SHWS');
        sessionStorage.setItem('industrial-ai:outbound-command:v1:TENANT-SHWS:OUT-1:1', 'test-command');
      }, { legacyKeys });

      await context.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        // Vite serves source modules under /src/api; those are not business requests.
        if (!path.startsWith('/api/')) return route.fallback();
        if (mode === 'unavailable' || path.includes('/workbench/')) {
          return route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: 'API unavailable' } } });
        }
        if (path.endsWith('/platform/snapshot')) return route.fulfill({ status: 200, json: snapshot });
        if (path.endsWith('/production/readiness')) return route.fulfill({ status: 200, json: { permissions: [] } });
        const arrayPaths = ['/inventory/availability', '/production/inspections', '/production/completions',
          '/production/work-order-closes', '/production/bom-snapshots'];
        return route.fulfill({ status: 200, json: arrayPaths.some(item => path.endsWith(item)) ? [] : { items: [], total: 0 } });
      });

      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const query of queries) {
        await page.goto(`${baseUrl}/?${query}`);
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => document.body.innerText.length > 100, undefined, { timeout: 15000 }).catch(() => {});
        const text = await page.locator('body').innerText();
        assert(text.length > 100, `${mode}: blank page at ${query}; body=${text}; ${errors.join(', ')}`);
        for (const example of ['PROTOTYPE-ONLY', 'SO-20260508-001', 'WO-260101', 'RM201', 'FG001']) {
          assert(!text.includes(example), `${mode}: example ${example} at ${query}`);
        }
        const keys = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
        assert.deepEqual([...keys.local, ...keys.session].filter(key =>
          /^industrial-ai-(sales|inventory|platform|personnel|supply-chain|ai-hub|analytics|finance|procurement|messages|feedback|production-(legacy|v\d))/.test(key)), [], `${query}: prototype recreated`);
        assert(keys.session.includes('industrial-ai-session:v2'));
        assert(keys.local.includes('industrial-ai-runtime:tenant:v1:storage-audit'));
        assert(keys.session.includes('industrial-ai:outbound-command:v1:TENANT-SHWS:OUT-1:1'));
      }
      const rejectedWrite = await page.evaluate(() => {
        try { localStorage.setItem('industrial-ai-sales:v99:TENANT-C', 'new'); return ''; }
        catch (error) { return error.message; }
      });
      assert(rejectedWrite.length > 0, 'A retired business write was accepted');
      assert.equal(await page.evaluate(() => {
        localStorage.setItem('industrial-ai-runtime:tenant:v1:storage-audit', 'TENANT-SHWS');
        return localStorage.getItem('industrial-ai-runtime:tenant:v1:storage-audit');
      }), 'TENANT-SHWS', 'Tenant preference must remain writable in dev and production');
      assert.deepEqual(errors, []);
      console.log(`PASS ${mode}: ${queries.length} pages; historical caches removed, no re-creation, session retained`);
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
        account: 'storage-audit', name: 'Storage audit', role: '超级管理员', permissions: ['*'],
        tenantIds: ['TENANT-SHWS'], accessToken: 'browser-test-only', expiresAt: '2099-01-01T00:00:00Z',
      }));
      localStorage.setItem('industrial-ai-sales:v88:TENANT-SHWS', JSON.stringify({ customers: [{ name: 'PROTOTYPE-ONLY' }] }));
    });
    let customer = {
      id: 'customer-api-uuid', customerNo: 'API-CUSTOMER-ONLY', name: '接口客户测试',
      creditCode: '', industry: '', status: 'active', version: 2,
      metadata: { contact: '接口联系人', phone: '13900000000' }, remark: '',
    };
    let resultMode = 'data';
    let rejectSave = true;
    const saves = [];
    const pageErrors = [];
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      if (path.endsWith('/supply-chain/customers/customer-api-uuid') && request.method() === 'PATCH') {
        saves.push({ headers: request.headers(), body: request.postDataJSON() });
        if (rejectSave) return route.fulfill({ status: 403, json: { error: { message: 'TEST_SAVE_DENIED' } } });
        const draft = request.postDataJSON();
        customer = { ...customer, ...draft, version: customer.version + 1 };
        return route.fulfill({ json: { customer } });
      }
      if (path.endsWith('/supply-chain/customers')) {
        if (resultMode === 'error') return route.fulfill({ status: 503, json: { error: { message: 'TEST_CUSTOMERS_UNAVAILABLE' } } });
        const items = resultMode === 'empty' ? [] : [customer];
        return route.fulfill({ json: { items, total: items.length } });
      }
      if (path.endsWith('/inventory/products')) return route.fulfill({ json: { items: [{
        id: 'product-api-uuid', code: 'API-PRODUCT-ONLY', name: '接口产品测试', specification: '接口规格',
        uom: 'PCS', unitPrice: '12', safetyStockQty: '3', status: 'active', version: 4,
      }], total: 1 } });
      if (path.endsWith('/platform/snapshot')) return route.fulfill({ json: snapshot });
      if (path.endsWith('/production/readiness')) return route.fulfill({ json: { permissions: [] } });
      if (path.includes('/workbench/')) return route.fulfill({ status: 503, json: { error: { message: 'TEST_UNAVAILABLE' } } });
      const arrayPaths = ['/inventory/availability', '/production/inspections', '/production/completions',
        '/production/work-order-closes', '/production/bom-snapshots'];
      return route.fulfill({ json: arrayPaths.some(item => path.endsWith(item)) ? [] : { items: [], total: 0 } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/?module=sales&tab=customers`);
    await page.getByRole('cell', { name: 'API-CUSTOMER-ONLY', exact: true }).waitFor();
    assert(!(await page.locator('body').innerText()).includes('PROTOTYPE-ONLY'));
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByPlaceholder('输入企业全称，保存时自动查重').fill('接口客户已更新');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('TEST_SAVE_DENIED', { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder('输入企业全称，保存时自动查重').inputValue(), '接口客户已更新');
    assert.equal(await page.getByRole('cell', { name: '接口客户测试', exact: true }).count(), 1);
    assert.equal(saves[0].headers['if-match'], '"2"');
    assert.equal(saves[0].headers['x-tenant-id'], 'TENANT-SHWS');
    rejectSave = false;
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('cell', { name: '接口客户已更新', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('cell', { name: '接口客户已更新', exact: true }).waitFor();
    resultMode = 'empty';
    await page.reload();
    await page.getByText('没有符合条件的客户', { exact: true }).waitFor();
    assert.equal(await page.getByRole('cell', { name: '接口客户已更新', exact: true }).count(), 0);
    resultMode = 'error';
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'TEST_CUSTOMERS_UNAVAILABLE' }).waitFor();
    assert.equal(await page.getByRole('cell', { name: '接口客户已更新', exact: true }).count(), 0);
    await page.goto(`${baseUrl}/?module=inventory&inventory=products`);
    await page.getByText('API-PRODUCT-ONLY', { exact: true }).waitFor();
    await page.getByText('接口产品测试', { exact: true }).waitFor();
    assert.deepEqual(pageErrors, []);
    console.log('PASS API data: customer/product display; failed save retained draft; successful save and reload; empty/error removed old rows');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
