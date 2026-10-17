import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// ISSUE-035 supersedes position display. Live mode only authenticates and reads.
const live = process.env.IDENTITY_TEST_MODE === 'live';
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.IDENTITY_REPORT_DIR || `/tmp/industrial-ai-issue035-identity-${live ? 'live' : 'controlled'}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report = { live, baseUrl, checks: [], errors: [], businessWrites: [], workbenchRoles: [], platform: [] };
const reads = [];
let signedAccount = '';
page.on('response', response => {
  if (!live) return;
  const path = new URL(response.url()).pathname;
  if (response.request().method() !== 'GET' || !path.startsWith('/api/')) return;
  reads.push((async () => {
    if (!response.ok()) (report.apiErrors ||= []).push({ path, status: response.status() });
    if (!path.endsWith('/platform/snapshot') || !response.ok()) return;
    const value = await response.json();
    const account = value.accounts?.find(item => item.loginName === signedAccount);
    const role = value.roles?.find(item => item.id === account?.roleId);
    report.snapshotContract = {
      containsPositions: Object.hasOwn(value, 'positions'),
      employeesWithLegacyPosition: value.employees?.filter(item => Object.hasOwn(item, 'primaryPositionId')).length,
      accountsWithLegacyRoles: value.accounts?.filter(item => Object.hasOwn(item, 'directRoleIds')).length,
      accountsWithScalarRole: value.accounts?.filter(item => typeof item.roleId === 'string' && item.roleId).length,
      currentAccountFound: Boolean(account), currentAccountRoleName: role?.name ?? null,
      sessionRoleMatchesAccountRoleName: role ? role.name === report.sessionContract?.role : null,
    };
  })().catch(cause => { (report.observationErrors ||= []).push(cause.message); }));
});
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return;
  if (request.method() !== 'GET' && !url.pathname.includes('/session/')) report.businessWrites.push(url.pathname);
  if (url.pathname.endsWith('/workbench/dashboard')) report.workbenchRoles.push(url.searchParams.get('role'));
});
const check = name => { report.checks.push(name); console.log(`PASS ${name}`); };
const sidebarRole = () => page.getByLabel('当前账号角色', { exact: true });
const workbenchRole = () => page.getByLabel('工作台账号角色', { exact: true });
const ready = async (expected, mapped = true) => {
  await workbenchRole().waitFor();
  assert.equal(await sidebarRole().innerText(), `账号角色：${expected}`);
  assert.equal(await workbenchRole().innerText(), `账号角色：${expected}`);
  if (mapped) await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新工作台"]')?.disabled);
  else {
    await page.getByRole('alert').filter({ hasText: '当前账号角色尚未匹配工作台展示分组' }).waitFor();
    assert(await page.getByRole('button', { name: '刷新工作台', exact: true }).isDisabled());
  }
};
const fixture = {
  account: 'issue035-controlled', name: '角色回归', role: '老板',
  permissions: ['workbench.dashboard.read'], permissionVersion: 'test-v1',
  tenantIds: ['tenant-1'], accessToken: 'controlled-issue035', expiresAt: '2099-01-01T00:00:00Z',
};
const restore = async user => {
  await page.evaluate(user => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(user)), user);
  await page.goto(`${baseUrl}/?module=workbench`);
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
    signedAccount = user.account;
    const role = typeof user.role === 'string' && user.role.trim() ? user.role.trim() : '角色信息未提供';
    report.sessionContract = { role: user.role, hasRoleId: Object.hasOwn(user, 'roleId') };
    await ready(role, ['老板', '超级管理员', '管理员', '系统管理员', '销售', '计划员', '仓管', '采购', '财务', '人事'].includes(user.role));
    check('真实会话角色与侧栏、工作台一致；未证明数据库角色来源');
    await page.reload();
    assert.equal(await workbenchRole().innerText(), `账号角色：${role}`);
    check('真实会话刷新后角色保持一致');
    await page.screenshot({ path: `${output}/workbench.png` });
    if (await page.getByRole('button', { name: '平台管理', exact: true }).count()) {
      for (const view of ['org', 'identity', 'employee-accounts', 'governance']) {
        await page.goto(`${baseUrl}/?module=platform&platform=${view}`);
        await page.getByTestId(`platform-view-${view}`).waitFor();
        await page.waitForTimeout(500);
        const root = page.getByTestId('platform-v3-root');
        const text = await root.innerText();
        report.platform.push({ view, hasPosition: /岗位|主岗/.test(text) });
        assert(!/岗位|主岗/.test(text), `${view} still contains positions`);
        await page.screenshot({ path: `${output}/platform-${view}.png` });
      }
      check('平台组织、员工、登录账号、审批页面不显示岗位（只读）');
    }
  } else {
    await context.addInitScript(user => {
      if (sessionStorage.getItem('issue035-initialized')) return;
      sessionStorage.setItem('issue035-initialized', '1');
      sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(user));
    }, fixture);
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return route.fallback();
      assert.equal(route.request().method(), 'GET', 'Controlled identity test cannot write business data');
      if (url.pathname.endsWith('/production/readiness')) return route.fulfill({ json: { permissions: fixture.permissions } });
      if (url.pathname.endsWith('/workbench/dashboard')) return route.fulfill({ json: {
        schemaVersion: '1.1', data: {
          role: url.searchParams.get('role'), generatedAt: new Date().toISOString(), sources: [],
          metrics: {}, todos: { items: [], total: 0 }, alerts: { items: [], total: 0 }, activities: { items: [], hasMore: false },
        },
      } });
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto(`${baseUrl}/?module=workbench`);
    await ready('老板');
    assert.equal(await page.getByRole('button', { name: '平台管理', exact: true }).count(), 0);
    check('角色名称不授予菜单，有效权限决定菜单');
    await page.getByRole('button', { name: '打开用户菜单', exact: true }).focus();
    await page.getByRole('button', { name: '个人信息', exact: true }).click();
    const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: '个人信息', exact: true }) });
    await modal.getByText('账号角色', { exact: true }).waitFor();
    assert(!/主岗位/.test(await modal.innerText()));
    await modal.getByRole('button', { name: '知道了', exact: true }).click();
    check('个人信息展示账号角色');
    await page.screenshot({ path: `${output}/desktop.png` });
    for (const role of [undefined, null, '', '   ', 42, '自定义角色']) {
      const count = report.workbenchRoles.length;
      await restore({ ...fixture, role });
      await ready(role === '自定义角色' ? role : '角色信息未提供', false);
      assert.equal(await page.getByText('正在读取业务预警', { exact: true }).count(), 0);
      assert.equal(await page.getByText('正在读取业务动态', { exact: true }).count(), 0);
      await page.waitForTimeout(200);
      assert.equal(report.workbenchRoles.length, count, 'Unknown role cannot request owner dashboard');
    }
    check('缺失、异常、自定义角色不回退老板、不发出老板工作台请求');
    const longRole = '生产与质量体系协同管理负责人兼集团制造中心跨组织业务与安全质量管理负责人';
    await restore({ ...fixture, role: longRole });
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(longRole, false);
    const bounds = await workbenchRole().boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert(bounds.height > 30, 'Long role should wrap');
    await page.screenshot({ path: `${output}/mobile.png` });
    check('移动端长角色名称换行，不溢出');
  }
  assert.deepEqual(report.businessWrites, []);
  assert.deepEqual(report.errors, []);
  check('无业务写入和浏览器运行异常');
} catch (cause) {
  report.failure = cause.message;
  console.error(`FAILED ${cause.message}`);
  process.exitCode = 1;
} finally {
  await Promise.all(reads);
  report.passed = !process.exitCode;
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
