import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Controlled API fixtures only; this test never contacts or mutates the backend.
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.ACCOUNT_ROLE_REPORT_DIR || '/tmp/industrial-ai-issue035-platform';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const report = { checks: [], errors: [], commands: [] };
const employee = (id, name) => ({ id, name, employeeNo: id.toUpperCase(), primaryOrgId: 'org', mobile: '13800000000', email: 'test@example.com', status: 'active', version: 1 });
const account = (id, employeeId, status = 'enabled') => ({ id, loginName: id, employeeId, status, authType: 'password', roleId: 'sales', lastLoginAt: '-', version: 1 });
let snapshot = {
  tenant: { id: 'tenant', name: '角色测试企业', code: 'TEST', status: 'running' },
  orgUnits: [{ id: 'org', code: 'ORG', name: '测试部门', type: 'company', parentId: null, managerEmployeeId: 'emp-1', status: 'enabled' }],
  employees: [employee('emp-1', '已开户员工'), employee('emp-2', '未开户员工'), employee('emp-3', '历史多角色员工')],
  accounts: [account('test-account', 'emp-1', 'disabled'), { ...account('legacy-account', 'emp-3'), roleId: undefined, directRoleIds: ['sales', 'admin'] }],
  roles: ['sales', 'admin'].map(id => ({ id, code: id.toUpperCase(), name: id === 'sales' ? '销售角色' : '管理角色', status: 'enabled', description: '', dataScope: 'org_tree', scopeValues: ['org'], version: 1 })),
  approvalRules: [{ id: 'legacy-rule', module: '销售管理', documentType: '销售订单', resolver: 'by_position', resolverValue: 'org', fallback: 'block', status: 'enabled', version: 1 }],
  permissions: [], roleGrants: [], resources: [], capabilities: [], adapters: [], dictionaries: [], parameters: [], audits: [],
};
const registeredAccounts = [];
let rejectNextAccount = true;
let ignoreNextAccountRole = false;
let effectivePermissions = ['*'];
const check = name => { report.checks.push(name); console.log(`PASS ${name}`); };
page.on('pageerror', error => report.errors.push(error.message));
await context.addInitScript(() => {
  if (sessionStorage.getItem('issue035-platform')) return;
  sessionStorage.setItem('issue035-platform', '1');
  sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
    account: 'admin-test', name: '测试管理员', role: '超级管理员', tenantIds: ['tenant'],
    permissions: ['*'], accessToken: 'controlled-role', expiresAt: '2099-01-01T00:00:00Z',
  }));
});
await context.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return route.fallback();
  const path = url.pathname;
  const json = value => route.fulfill({ json: value });
  if (path.endsWith('/session/refresh')) {
    effectivePermissions = ['workbench.dashboard.read'];
    return json({
      accessToken: 'renewed-controlled-role', expiresAt: '2099-01-01T00:00:00Z', tokenType: 'Bearer',
      user: { account: 'admin-test', name: '测试管理员', role: '销售', tenantIds: ['tenant'], permissions: effectivePermissions, permissionVersion: 'new-role' },
    });
  }
  if (request.method() !== 'GET') {
    const body = request.postDataJSON();
    report.commands.push({ path, method: request.method(), body });
    assert(!Object.hasOwn(body, 'primaryPositionId'));
    assert(!Object.hasOwn(body, 'directRoleIds'));
    assert(!Object.hasOwn(body, 'position'));
    if (path.endsWith('/platform/employees')) {
      snapshot.employees.push({ ...body, version: 1 });
      return json(body);
    }
    if (/\/platform\/accounts(?:\/[^/]+)?$/.test(path)) {
      assert.equal(typeof body.roleId, 'string');
      assert(!Object.hasOwn(body, 'roleIssue'));
      if (rejectNextAccount) {
        rejectNextAccount = false;
        return route.fulfill({ status: 422, json: { error: { code: 'PLATFORM_422_ROLE_INVALID', message: '角色服务暂不可用' } } });
      }
      if (ignoreNextAccountRole) {
        ignoreNextAccountRole = false;
        return json(body);
      }
      if (request.method() === 'POST') snapshot.accounts.push({ ...body, version: 1 });
      else snapshot.accounts = snapshot.accounts.map(item => item.id === body.id ? { ...body, version: item.version + 1 } : item);
      return json(body);
    }
    if (path.endsWith('/platform/employee-accounts')) {
      assert.equal(typeof body.roleId, 'string');
      registeredAccounts.push({ ...body, id: 'created-login', status: 'active' });
      // Simulate the currently incomplete backend response: no role confirmation.
      return json({ id: 'created-login', account: body.account, temporaryPassword: 'TEST-ONLY' });
    }
    throw new Error(`Unexpected controlled write: ${path}`);
  }
  if (path.endsWith('/platform/snapshot')) return json(snapshot);
  if (path.endsWith('/platform/employee-accounts')) return json({ items: registeredAccounts });
  if (path.endsWith('/production/readiness')) return json({ permissions: effectivePermissions });
  if (path.endsWith('/workbench/dashboard')) return json({ schemaVersion: '1.1', data: {
    role: url.searchParams.get('role'), generatedAt: new Date().toISOString(), sources: [], metrics: {},
    todos: { items: [], total: 0 }, alerts: { items: [], total: 0 }, activities: { items: [], hasMore: false },
  } });
  return json({ items: [], total: 0 });
});
const go = async view => {
  await page.goto(`${baseUrl}/?module=platform&platform=${view}`);
  await page.getByTestId(`platform-view-${view}`).waitFor();
  await page.getByText('角色测试企业', { exact: true }).waitFor();
};
const drawer = name => page.getByRole('dialog', { name, exact: true });

try {
  await mkdir(output, { recursive: true });
  await go('org');
  assert(!/岗位|主岗/.test(await page.getByTestId('platform-v3-root').innerText()));
  await page.getByRole('tab', { name: '组织员工', exact: true }).click();
  await page.getByText('已开户员工 · EMP-1', { exact: true }).waitFor();
  check('组织与员工页签及组织员工列表，无岗位入口');

  await go('identity');
  await page.getByRole('button', { name: '新建员工档案', exact: true }).click();
  const employeeDrawer = drawer('新建员工档案');
  assert.equal(await employeeDrawer.getByLabel(/岗位/).count(), 0);
  await employeeDrawer.locator('#editor-name').fill('新增员工');
  await employeeDrawer.locator('#editor-employeeNo').fill('EMP-NEW');
  await employeeDrawer.locator('#editor-primaryOrgId').click();
  await employeeDrawer.getByRole('option').filter({ hasText: '测试部门' }).click();
  await employeeDrawer.locator('#editor-mobile').fill('13900000000');
  await employeeDrawer.locator('#editor-email').fill('new@example.com');
  await employeeDrawer.getByRole('button', { name: '创建员工', exact: true }).click();
  await employeeDrawer.waitFor({ state: 'hidden' });
  check('新建员工仅需组织归属，无岗位字段写入');

  await page.getByRole('button', { name: /未开户员工/ }).click();
  await page.getByRole('button', { name: '开通账号', exact: true }).click();
  const create = drawer('开通登录账号');
  const singleRole = create.locator('#editor-roleId');
  assert.equal(await singleRole.getAttribute('multiple'), null);
  await create.locator('#editor-loginName').fill('new-login');
  const before = report.commands.length;
  await create.getByRole('button', { name: '开通账号', exact: true }).click();
  await create.getByText('请选择或填写账号角色', { exact: true }).waitFor();
  assert.equal(report.commands.length, before);
  await singleRole.selectOption('sales');
  await create.getByRole('button', { name: '开通账号', exact: true }).click();
  await page.getByText('角色服务暂不可用', { exact: true }).waitFor();
  assert(await create.isVisible());
  assert.equal(await singleRole.inputValue(), 'sales');
  await create.getByRole('button', { name: '开通账号', exact: true }).click();
  await create.waitFor({ state: 'hidden' });
  check('账号必须单选 roleId，服务端拒绝时保留草稿，重试成功后再刷新');

  await page.getByRole('button', { name: /已开户员工/ }).click();
  assert.equal(await page.getByRole('button', { name: '开通账号', exact: true }).count(), 0);
  await page.getByRole('button', { name: '修改账号角色', exact: true }).click();
  const edit = drawer('修改账号角色');
  assert(await edit.locator('#editor-loginName').isDisabled());
  await edit.locator('#editor-roleId').selectOption('admin');
  await edit.getByRole('button', { name: '保存账号角色', exact: true }).click();
  await edit.waitFor({ state: 'hidden' });
  assert.equal(snapshot.accounts.find(item => item.id === 'test-account').roleId, 'admin');
  assert.equal(snapshot.accounts.find(item => item.id === 'test-account').status, 'disabled');
  check('停用账号仍占用员工绑定，可修改原账号角色，保留状态与版本');
  ignoreNextAccountRole = true;
  await page.getByRole('button', { name: '修改账号角色', exact: true }).click();
  const unconfirmed = drawer('修改账号角色');
  await unconfirmed.locator('#editor-roleId').selectOption('sales');
  await unconfirmed.getByRole('button', { name: '保存账号角色', exact: true }).click();
  await unconfirmed.waitFor({ state: 'hidden' });
  await page.getByText('操作已提交，但角色绑定未确认，请刷新核对并维护已有账号，勿重复创建', { exact: true }).waitFor();
  assert.equal(snapshot.accounts.find(item => item.id === 'test-account').roleId, 'admin');
  check('接口返回成功但快照未更新角色时，不报告角色保存成功');

  await page.getByRole('button', { name: /历史多角色员工/ }).click();
  await page.getByText('账号角色：历史角色数据待修正', { exact: true }).waitFor();
  await page.getByRole('button', { name: '修改账号角色', exact: true }).click();
  const legacy = drawer('修改账号角色');
  assert.equal(await legacy.locator('#editor-roleId').inputValue(), '');
  await legacy.locator('#editor-roleId').selectOption('sales');
  await legacy.getByRole('button', { name: '保存账号角色', exact: true }).click();
  await legacy.waitFor({ state: 'hidden' });
  check('历史多角色不自动取首项，管理员显式选择后提交新契约');

  await go('governance');
  await page.getByRole('alert').filter({ hasText: '历史审批规则待迁移' }).waitFor();
  await page.getByRole('button', { name: '测试规则', exact: true }).click();
  const preview = drawer('历史审批规则待迁移');
  assert(!/已找到候选审批人/.test(await preview.innerText()));
  await preview.getByRole('button', { name: '关闭结果', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const approval = drawer('编辑审批规则');
  assert.deepEqual(await approval.locator('#editor-resolver option').allTextContents(), ['请选择', '按角色', '按组织负责人']);
  await approval.getByRole('button', { name: '关闭', exact: true }).click();
  check('旧审批解析器提示迁移，不自动解析为组织负责人');

  await go('employee-accounts');
  await page.getByRole('button', { name: '新建员工账号', exact: true }).click();
  const combined = drawer('新建员工账号');
  await combined.getByLabel('姓名 *', { exact: true }).fill('测试员工');
  await combined.getByLabel('登录账号 *', { exact: true }).fill('new-employee');
  await combined.getByLabel('手机号 *', { exact: true }).fill('13700000000');
  await combined.getByLabel('邮箱 *', { exact: true }).fill('employee@example.com');
  await combined.getByLabel('员工编号 *', { exact: true }).fill('EMP-COMBINED');
  await combined.getByLabel('部门 *', { exact: true }).selectOption('org');
  await combined.getByLabel('账号角色 *', { exact: true }).selectOption('sales');
  await combined.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '账号已创建，但角色绑定未确认' }).waitFor();
  await page.getByText('TEST-ONLY', { exact: true }).waitFor();
  check('组合开户发送 roleId，响应未确认角色时保留初始密码并提示核实，避免假成功');
  await page.getByRole('button', { name: '完成', exact: true }).click();

  await go('identity');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${output}/desktop.png` });
  snapshot.employees.push(employee('self', '当前管理员'));
  snapshot.accounts.push({ ...account('self-account', 'self'), loginName: 'admin-test', roleId: 'admin' });
  await go('identity');
  await page.getByRole('button', { name: /当前管理员/ }).click();
  await page.getByRole('button', { name: '修改账号角色', exact: true }).click();
  const self = drawer('修改账号角色');
  await self.locator('#editor-roleId').selectOption('sales');
  await self.getByRole('button', { name: '保存账号角色', exact: true }).click();
  await page.getByLabel('工作台账号角色', { exact: true }).getByText('账号角色：销售', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '平台管理', exact: true }).count(), 0);
  check('修改当前账号角色后刷新签名会话和有效权限，工作台及菜单更新');
  assert.deepEqual(report.errors, []);
  check('桌面与移动页面可渲染，浏览器无运行异常');
} catch (cause) {
  report.failure = cause.message;
  console.error(`FAILED ${cause.message}`);
  await page.screenshot({ path: `${output}/failed.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.passed = !process.exitCode;
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
