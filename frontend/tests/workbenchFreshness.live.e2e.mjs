import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// UI login and read-only workbench queries. Credentials are configuration, never report content.
if (existsSync('../.env.local')) process.loadEnvFile('../.env.local');
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.WORKBENCH_REPORT_DIR || '/tmp/industrial-ai-issue029-live';
const account = process.env.E2E_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT?.split(',')[0];
const password = process.env.E2E_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
assert(account && password, 'Configure E2E_ACCOUNT/E2E_PASSWORD');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const report = { mocked: false, businessWrites: false, baseUrl, checks: [], errors: [], responses: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/') && request.method() !== 'GET' && !path.includes('/session/')) report.businessWrites = true;
});
page.on('response', async response => {
  if (!new URL(response.url()).pathname.endsWith('/workbench/dashboard')) return;
  const body = await response.json().catch(() => null);
  report.responses.push({
    status: response.status(), sections: new URL(response.url()).searchParams.get('sections'),
    generatedAt: body?.data?.generatedAt, dataAsOf: body?.data?.dataAsOf,
    sources: body?.data?.sources?.map(source => ({ source: source?.source, status: source?.status, availability: source?.availability })),
    metrics: body?.data?.metrics,
  });
});
const check = name => { report.checks.push(name); console.log(`PASS ${name}`); };
try {
  await mkdir(output, { recursive: true });
  await page.goto(baseUrl);
  const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
  await image.waitFor();
  const source = await image.getAttribute('src');
  assert(source?.startsWith('data:image/svg+xml'), 'Login challenge cannot be read automatically in this environment');
  const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
  assert(captcha, 'Login challenge has no readable value');
  await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
  await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/session/login')),
    page.getByRole('button', { name: '立即登录', exact: true }).click(),
  ]);
  assert.equal(login.status(), 200, 'Real login failed; no repeated credential attempts');
  await page.getByRole('button', { name: '刷新工作台', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新工作台"]')?.disabled);
  check('真实页面登录并完成工作台分区查询');
  const refreshed = [
    page.waitForResponse(response => response.url().includes('/workbench/dashboard') && new URL(response.url()).searchParams.get('sections') === 'metrics'),
    page.waitForResponse(response => response.url().includes('/workbench/dashboard') && new URL(response.url()).searchParams.get('sections') === 'todos,alerts,activities'),
  ];
  await page.getByRole('button', { name: '刷新工作台', exact: true }).click();
  const responses = await Promise.all(refreshed);
  for (const response of responses) {
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.schemaVersion, '1.1');
    assert(Number.isFinite(Date.parse(body.data.generatedAt)), 'Server generatedAt must be valid');
  }
  await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新工作台"]')?.disabled);
  const text = await page.locator('body').innerText();
  report.ui = {
    hasUndefined: text.includes('undefined'), hasPendingWarning: text.includes('SOURCE_PENDING'),
    hasExpired: text.includes('数据已失效'), hasUpdated: text.includes('数据已更新'),
  };
  assert(!text.includes('undefined'));
  assert(!text.includes('SOURCE_PENDING'));
  assert(!text.includes('数据已失效'));
  assert(text.includes('数据已更新'));
  check('真实刷新后无误报失效、无undefined与待接入警告');
  const closeToast = page.getByRole('button', { name: '关闭提示', exact: true });
  if (await closeToast.count()) await closeToast.click();
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png` });
  assert(!report.businessWrites);
  assert.deepEqual(report.errors, []);
  check('只读查询、桌面与移动截图完成，浏览器无运行异常');
} catch (cause) {
  report.failure = cause.message;
  console.error(`BLOCKED ${cause.message}`);
  process.exitCode = 1;
} finally {
  // Never capture login fields containing credentials after an unsuccessful probe.
  if (await page.getByRole('button', { name: '刷新工作台', exact: true }).count()) {
    await page.screenshot({ path: `${output}/last-page.png` }).catch(() => {});
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
