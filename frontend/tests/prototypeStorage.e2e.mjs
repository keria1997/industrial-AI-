import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Controlled API responses isolate browser cache cleanup from database contents.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const legacyKeys = [
  'industrial-ai-sales:v7:TENANT-A', 'industrial-ai-sales:v8:TENANT-B',
  'industrial-ai-inventory-master-data:v1:TENANT-A', 'industrial-ai-inventory-workflow:v1:TENANT-B',
  'industrial-ai-production-legacy:TENANT-A', 'industrial-ai-production-v2:TENANT-B',
  'industrial-ai-platform-v2:TENANT-A',
];
const queries = [
  'module=sales', 'module=sales&tab=basic-data', 'module=sales&tab=orders',
  'module=inventory&inventory=outbound', 'module=inventory&inventory=inbound',
  'module=inventory&inventory=products', 'module=production',
  'module=production&production=equipment', 'module=production&production=routing',
  'module=platform', 'module=platform&platform=access',
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
        const text = await page.locator('body').innerText();
        assert(text.length > 100, `${mode}: blank page at ${query}; ${errors.join(', ')}`);
        for (const example of ['PROTOTYPE-ONLY', 'SO-20260508-001', 'WO-260101', 'RM201', 'FG001']) {
          assert(!text.includes(example), `${mode}: example ${example} at ${query}`);
        }
        const keys = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
        assert.deepEqual([...keys.local, ...keys.session].filter(key =>
          /^industrial-ai-(sales|inventory|platform|production-(legacy|v\d))/.test(key)), [], `${query}: prototype recreated`);
        assert(keys.session.includes('industrial-ai-session:v2'));
        assert(keys.local.includes('industrial-ai-runtime:tenant:v1:storage-audit'));
        assert(keys.session.includes('industrial-ai:outbound-command:v1:TENANT-SHWS:OUT-1:1'));
      }
      const rejectedWrite = await page.evaluate(() => {
        try { localStorage.setItem('industrial-ai-sales:v99:TENANT-C', 'new'); return ''; }
        catch (error) { return error.message; }
      });
      assert(rejectedWrite.length > 0, 'A retired business write was accepted');
      assert.deepEqual(errors, []);
      console.log(`PASS ${mode}: ${queries.length} pages; historical caches removed, no re-creation, session retained`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
