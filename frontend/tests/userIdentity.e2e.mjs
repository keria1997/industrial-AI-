import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Controlled mode tests UI contracts; live mode performs configured login and read-only queries.
const live = process.env.IDENTITY_TEST_MODE === 'live';
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.IDENTITY_REPORT_DIR || `/tmp/industrial-ai-issue031-${live ? 'live' : 'controlled'}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const report = { live, baseUrl, checks: [], errors: [], businessWrites: [], workbenchRoles: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return;
  if (request.method() !== 'GET' && !url.pathname.includes('/session/')) {
    report.businessWrites.push({ path: url.pathname, method: request.method() });
  }
  if (url.pathname.endsWith('/workbench/dashboard')) report.workbenchRoles.push(url.searchParams.get('role'));
});
const check = name => { report.checks.push(name); console.log(`PASS ${name}`); };
const sidebarPosition = () => page.getByLabel('当前用户主岗位', { exact: true });
const workbenchPosition = () => page.getByLabel('工作台用户主岗位', { exact: true });
const ready = async expected => {
  await workbenchPosition().waitFor();
  assert.equal(await sidebarPosition().innerText(), `主岗位：${expected}`);
  assert.equal(await workbenchPosition().innerText(), `主岗位：${expected}`);
  await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新工作台"]')?.disabled);
};
const fixture = {
  account: 'issue031-controlled', name: '岗位回归', role: '老板', displayPosition: '租户管理员',
  permissions: ['workbench.dashboard.read'], permissionVersion: 'test-v1',
  tenantIds: ['tenant-1'], accessToken: 'controlled-issue031', expiresAt: '2099-01-01T00:00:00Z',
};
const restore = async user => {
  await page.evaluate(user => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(user)), user);
  await page.reload();
};

try {
  await mkdir(output, { recursive: true });
  if (live) {
    if (existsSync('../.env.local')) process.loadEnvFile('../.env.local');
    const account = process.env.E2E_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT?.split(',')[0];
    const password = process.env.E2E_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
    assert(account && password, 'Configure E2E_ACCOUNT/E2E_PASSWORD');
    await page.goto(baseUrl);
    const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
    await image.waitFor();
    const source = await image.getAttribute('src');
    assert(source?.startsWith('data:image/svg+xml'), 'Login challenge is not automatically readable');
    const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
    assert(captcha, 'Login challenge has no readable value');
    await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
    await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
    await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/session/login')),
      page.getByRole('button', { name: '立即登录', exact: true }).click(),
    ]);
    assert.equal(response.status(), 200, 'Login failed; no repeated credential attempts');
    const { user } = await response.json();
    const singleTenant = Array.isArray(user.tenantIds) && new Set(user.tenantIds).size === 1;
    const position = singleTenant && typeof user.displayPosition === 'string' && user.displayPosition.trim()
      ? user.displayPosition.trim() : '岗位信息未提供';
    report.sessionContract = {
      hasDisplayPosition: Object.hasOwn(user, 'displayPosition'),
      displayPosition: user.displayPosition ?? null, role: user.role, tenantCount: user.tenantIds?.length,
      employeePositionComparison: '未查询员工档案或数据库；仅验证真实会话与页面一致',
    };
    await page.getByRole('button', { name: '刷新工作台', exact: true }).waitFor();
    report.uiContract = { hasWorkbench: true, hasPositionBadge: await workbenchPosition().count() > 0 };
    await ready(position);
    check('真实登录响应与侧栏、工作台岗位显示一致');
    await page.reload();
    await ready(position);
    check('真实会话刷新页面后保持岗位或明确缺失状态');
  } else {
    await context.addInitScript(() => {
      if (sessionStorage.getItem('industrial-ai-issue031-test')) return;
      sessionStorage.setItem('industrial-ai-issue031-test', 'initialized');
      sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
        account: 'issue031-controlled', name: '岗位回归', role: '老板', displayPosition: '租户管理员',
        permissions: ['workbench.dashboard.read'], permissionVersion: 'test-v1',
        tenantIds: ['tenant-1'], accessToken: 'controlled-issue031', expiresAt: '2099-01-01T00:00:00Z',
      }));
    });
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return route.fallback();
      assert.equal(route.request().method(), 'GET', 'Controlled identity test must not write business data');
      if (url.pathname.endsWith('/production/readiness')) return route.fulfill({ json: { permissions: ['workbench.dashboard.read'] } });
      if (url.pathname.endsWith('/workbench/dashboard')) return route.fulfill({ json: {
        schemaVersion: '1.1', data: {
          role: url.searchParams.get('role'), generatedAt: new Date().toISOString(), sources: [],
          metrics: {}, todos: { items: [], total: 0 }, alerts: { items: [], total: 0 }, activities: { items: [], hasMore: false },
        },
      } });
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto(`${baseUrl}/?module=workbench`);
    await ready('租户管理员');
    assert.deepEqual([...new Set(report.workbenchRoles)], ['老板']);
    assert.equal(await page.getByRole('button', { name: '平台管理', exact: true }).count(), 0);
    assert.equal(await page.getByText('老板 · 经营驾驶舱', { exact: true }).count(), 0);
    check('显示实际岗位，工作台仍请求老板分组，管理员岗位不增加平台菜单');

    await page.getByRole('button', { name: '打开用户菜单', exact: true }).focus();
    await page.getByRole('button', { name: '个人信息', exact: true }).click();
    const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: '个人信息', exact: true }) });
    await modal.getByText('主岗位', { exact: true }).waitFor();
    await modal.getByText('租户管理员', { exact: true }).waitFor();
    await modal.getByText('工作台视图', { exact: true }).waitFor();
    await modal.getByText('经营驾驶舱', { exact: true }).waitFor();
    await modal.getByRole('button', { name: '知道了', exact: true }).click();
    check('个人信息分别展示主岗位和工作台视图');
    await page.screenshot({ path: `${output}/desktop.png` });

    await page.reload();
    await ready('租户管理员');
    check('刷新恢复会话后岗位保持正确');
    for (const displayPosition of [undefined, null, '', '   ', 42]) {
      await restore({ ...fixture, displayPosition });
      await ready('岗位信息未提供');
    }
    check('字段缺失、null、空串、空白和错误类型均明确显示缺失，不沿用旧岗位');

    await restore({ ...fixture, account: 'another-user', role: '未知角色', displayPosition: '质检主管' });
    await ready('质检主管');
    assert.deepEqual([...new Set(report.workbenchRoles)], ['老板']);
    check('更换账号和未知角色不会把工作台默认分组当成实际岗位');
    await restore({ ...fixture, tenantIds: ['tenant-1', 'tenant-2'] });
    await ready('岗位信息未提供');
    check('多租户会话未提供岗位所属租户时不猜测或跨租户沿用');

    const longPosition = '生产与质量体系协同管理岗位负责人兼集团制造中心跨组织业务与安全质量管理负责人';
    await restore({ ...fixture, displayPosition: longPosition });
    await ready(longPosition);
    await page.setViewportSize({ width: 390, height: 844 });
    await workbenchPosition().waitFor();
    const bounds = await workbenchPosition().boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Position badge must fit mobile viewport');
    assert(bounds.height > 30, 'Long position should wrap instead of truncating');
    await page.screenshot({ path: `${output}/mobile.png` });
    check('长岗位名称在移动端换行，工作台岗位组件不溢出');
  }
  assert.deepEqual(report.businessWrites, []);
  assert.deepEqual(report.errors, []);
  if (live) await page.screenshot({ path: `${output}/desktop.png` });
  check('无业务写入，浏览器无运行异常');
} catch (cause) {
  report.failure = cause.message;
  console.error(`FAILED ${cause.message}`);
  process.exitCode = 1;
} finally {
  // Do not screenshot a failed login form containing credentials.
  if (await page.getByRole('button', { name: '刷新工作台', exact: true }).count()) {
    await page.screenshot({ path: `${output}/last-page.png` }).catch(() => {});
  }
  report.passed = !process.exitCode;
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
