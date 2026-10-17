import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Controlled frontend regression. All business requests are intercepted; no backend writes.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.WORKBENCH_REPORT_DIR || '/tmp/industrial-ai-issue029-controlled';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const checks = [], errors = [], requests = [];
const instant = new Date('2026-10-17T06:00:00Z');
let generatedAt = instant.toISOString();
let fail = false, empty = false;
let sources = [
  { source: 'SalesOrder', status: 'AVAILABLE' },
  { source: 'RevenueRecognition', status: 'SOURCE_PENDING', errorCode: 'SOURCE_MISSING' },
];
await context.addInitScript(() => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
  account: 'issue029-controlled', name: '工作台回归', role: '老板', permissions: ['*'],
  tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-issue029', expiresAt: '2099-01-01T00:00:00Z',
})));
await context.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return route.fallback();
  requests.push({ path: url.pathname, method: request.method(), section: url.searchParams.get('sections') });
  assert.equal(request.method(), 'GET', 'Controlled workbench must not submit business commands');
  const json = value => route.fulfill({ json: value });
  if (url.pathname.endsWith('/production/readiness')) return json({ permissions: ['*'] });
  if (url.pathname.endsWith('/platform/snapshot')) return json({
    tenant: { id: 'TENANT-SHWS', name: '工作台回归企业', status: 'running' },
    roles: [], permissions: [], roleGrants: [], orgUnits: [], resources: [], employees: [],
    accounts: [], positions: [], capabilities: [], adapters: [], dictionaries: [], parameters: [], approvalRules: [], audits: [],
  });
  if (url.pathname.endsWith('/workbench/dashboard')) {
    if (fail) return route.fulfill({ status: 503, json: { error: { code: 'CONTROLLED_OFFLINE', message: '工作台查询暂不可用' } } });
    return json({ schemaVersion: '1.1', data: {
      role: '老板', generatedAt, dataAsOf: '2026-10-01T00:00:00Z', scope: { tenantId: 'TENANT-SHWS' }, sources,
      metrics: empty ? {} : { orderAmount: { availability: 'AVAILABLE', value: '123.45', currency: 'USD', taxBasis: 'INCLUDING_TAX' } },
      todos: { items: [], total: 0 }, alerts: { items: [], total: 0 }, activities: { items: [], hasMore: false },
    } });
  }
  return json({ items: [], total: 0 });
});
page.on('pageerror', error => errors.push(error.message));
const badge = () => page.getByRole('status', { name: '工作台数据状态', exact: true });
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const ready = async () => { await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新工作台"]')?.disabled); };
const refresh = async () => {
  const before = requests.filter(request => request.path.endsWith('/workbench/dashboard')).length;
  await page.getByRole('button', { name: '刷新工作台', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新工作台"]')?.disabled);
  assert.equal(requests.filter(request => request.path.endsWith('/workbench/dashboard')).length, before + 2);
};
try {
  await mkdir(output, { recursive: true });
  await page.clock.install({ time: instant });
  await page.goto(`${baseUrl}/?module=workbench`);
  await badge().getByText('数据已更新', { exact: true }).waitFor();
  await page.getByText('123.45', { exact: true }).waitFor();
  assert((await badge().getAttribute('class')).includes('bg-emerald-50'));
  assert(!(await page.locator('body').innerText()).includes('SOURCE_PENDING'));
  assert.equal(await page.getByText('数据已失效，请刷新', { exact: true }).count(), 0);
  check('业务事实长期未变但响应新鲜时显示真实金额与已更新，不显示待接入警告');
  await page.screenshot({ path: `${output}/fresh.png` });

  sources = [{ source: 'SalesOrder' }, {}, { source: 'FINANCE', availability: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' },
    { source: 'INVENTORY', status: 'PARTIAL' }, { source: 'PRODUCTION', status: 'STALE' }];
  await refresh();
  const warning = page.getByRole('status').filter({ hasText: 'SalesOrder：来源状态未提供' });
  await warning.waitFor();
  const text = await warning.innerText();
  for (const expected of ['未知来源：来源状态未提供', '财务管理：UNAVAILABLE (TIMEOUT)', '库存管理：PARTIAL', '生产管理：STALE']) assert(text.includes(expected));
  assert(!text.includes('undefined'));
  check('来源缺失有文字兜底，局部异常与陈旧来源仍可见');

  sources = [];
  empty = true;
  await refresh();
  await page.getByText('暂无角色指标', { exact: true }).waitFor();
  assert.equal(await page.getByText('123.45', { exact: true }).count(), 0);
  check('无业务事实保留空态，不沿用旧数值或生成零');

  empty = false;
  generatedAt = new Date(instant.getTime() - 301000).toISOString();
  await refresh();
  await badge().getByText('数据已过期', { exact: true }).waitFor();
  assert((await badge().getAttribute('class')).includes('bg-amber-50'));
  await page.getByText('123.45', { exact: true }).waitFor();
  generatedAt = new Date(instant.getTime() - 1801000).toISOString();
  await refresh();
  await badge().getByText('数据已失效', { exact: true }).waitFor();
  assert((await badge().getAttribute('class')).includes('bg-amber-50'));
  assert.equal(await page.getByText('123.45', { exact: true }).count(), 0);
  await page.getByText('数据已失效，请刷新', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/expired.png` });
  check('真正超过5分钟与30分钟的快照分别过期/失效，徽标橙色且失效金额隐藏');

  generatedAt = instant.toISOString();
  await refresh();
  await badge().getByText('数据已更新', { exact: true }).waitFor();
  await page.getByText('123.45', { exact: true }).waitFor();
  check('手动刷新分别重读两个分区并恢复新鲜状态');

  fail = true;
  await page.clock.fastForward(301000);
  await badge().getByText('数据读取异常', { exact: true }).waitFor();
  await ready();
  assert((await badge().getAttribute('class')).includes('bg-rose-50'));
  await page.getByText('123.45', { exact: true }).waitFor();
  await page.clock.fastForward(1501000);
  await ready();
  await page.getByText('数据已失效，请刷新', { exact: true }).waitFor();
  assert.equal(await page.getByText('123.45', { exact: true }).count(), 0);
  check('轮询失败保留最后成功时间，不重置时效，超过30分钟隐藏旧指标');

  fail = false;
  generatedAt = await page.evaluate(() => new Date().toISOString());
  await refresh();
  await badge().getByText('数据已更新', { exact: true }).waitFor();
  await page.getByText('123.45', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  check('恢复查询后金额和状态一致，浏览器无运行异常');
} catch (cause) {
  console.error(cause);
  process.exitCode = 1;
} finally {
  await page.screenshot({ path: `${output}/last-page.png` }).catch(() => {});
  await writeFile(`${output}/report.json`, JSON.stringify({ controlled: true, checks, errors, requests, passed: !process.exitCode }, null, 2));
  await browser.close();
}
