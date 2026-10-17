import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Default: controlled UI regression. FOCUS_LIVE=1: real login/reads, cancel every draft without writing.
const live = process.env.FOCUS_LIVE === '1';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (live && existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const writes = [];
try {
  if (!live) {
    await context.addInitScript(() => {
      sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
        account: 'focus-regression', name: '焦点验证员', role: '超级管理员', permissions: ['*'],
        tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-focus', expiresAt: '2099-01-01T00:00:00Z',
      }));
    });
    await context.route('**/api/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      if (request.method() !== 'GET') {
        writes.push({ path, body: request.postDataJSON() });
        return route.fulfill({ status: 503, json: { error: { message: 'FOCUS_SAVE_UNAVAILABLE' } } });
      }
      if (path.endsWith('/production/readiness')) return route.fulfill({ json: { permissions: ['*'] } });
      if (path.endsWith('/inventory/warehouses')) return route.fulfill({ json: {
        items: [{ id: 'focus-warehouse', code: 'WH-FOCUS', name: '焦点回归仓库', type: '原材料仓',
          organization: '回归组织', manager: '回归负责人', address: '回归地址', capacity: '100',
          usedCapacity: '0', status: 'active', version: 3, updatedAt: '2026-10-17T00:00:00Z' }], total: 1,
      } });
      if (path.endsWith('/platform/snapshot')) return route.fulfill({ json: {
        tenant: { id: 'TENANT-SHWS', name: '焦点回归租户', status: 'running' },
        roles: [], permissions: [], roleGrants: [], orgUnits: [], resources: [], employees: [], accounts: [],
        positions: [], capabilities: [], adapters: [], dictionaries: [], parameters: [], approvalRules: [], audits: [],
      } });
      const arrays = ['/inventory/availability', '/production/inspections', '/production/completions', '/production/bom-snapshots', '/production/work-order-closes'];
      return route.fulfill({ json: arrays.some(suffix => path.endsWith(suffix)) ? [] : { items: [], total: 0 } });
    });
  }
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (live) {
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET'
        && !new URL(request.url()).pathname.startsWith('/api/v1/session/')) writes.push({ path: new URL(request.url()).pathname });
    });
    const account = process.env.E2E_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT?.split(',')[0];
    const password = process.env.E2E_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
    assert(account && password, 'Configure local E2E credentials for real login');
    await page.goto(baseUrl);
    const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
    await image.waitFor();
    const source = await image.getAttribute('src');
    assert(source?.startsWith('data:image/svg+xml'), 'Use the existing local SVG captcha');
    const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
    assert(captcha, 'Cannot read the locally rendered captcha');
    await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
    await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
    await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
    await page.getByRole('button', { name: '立即登录', exact: true }).click();
    await page.locator('main').first().waitFor();
  }

  const typeContinuously = async (field, value) => {
    await field.fill('');
    await field.focus();
    // Numeric controls may restore their existing zero after clearing; replace it as a user would.
    await field.press('ControlOrMeta+A');
    const original = await field.elementHandle();
    try {
      for (const character of value) {
        await page.keyboard.insertText(character);
        assert(await original.evaluate(node => node.isConnected && document.activeElement === node),
          `Input remounted or lost focus while typing ${value}`);
      }
      assert.equal(await field.inputValue(), value);
    } finally { await original.dispose(); }
  };

  for (const [tab, entity] of [['warehouses', '仓库'], ['products', '产品'], ['materials', '物料']]) {
    await page.goto(`${baseUrl}/?module=inventory&inventory=${tab}`);
    await page.getByRole('button', { name: `新建${entity}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `新建${entity}`, exact: true });
    await typeContinuously(dialog.getByLabel(`${entity}编码`, { exact: true }), 'FOCUS-CHECK-123');
    const name = dialog.getByLabel(`${entity}名称`, { exact: true });
    await typeContinuously(name, '连续输入中文测试ABC');
    await name.press('Home');
    await page.keyboard.insertText('开头');
    assert.equal(await name.inputValue(), '开头连续输入中文测试ABC');
    assert(await name.evaluate(node => document.activeElement === node));
    await name.press('End');
    await name.press('Backspace');
    assert.equal(await name.inputValue(), '开头连续输入中文测试AB');
    if (tab === 'warehouses') {
      for (const [label, value] of [['所属组织', '第一工厂'], ['负责人', '仓库管理员'], ['仓库地址', '园区一号楼']]) {
        await typeContinuously(dialog.getByLabel(label, { exact: true }), value);
      }
      await typeContinuously(dialog.locator('textarea'), '连续输入备注');
      const capacity = dialog.getByLabel('仓库容量', { exact: true });
      await typeContinuously(capacity, '12345');
      const kind = dialog.getByRole('combobox', { name: '仓库类型', exact: true });
      await kind.focus();
      const original = await kind.elementHandle();
      await kind.selectOption({ label: '成品仓' });
      assert(await original.evaluate(node => node.isConnected && document.activeElement === node));
      await original.dispose();
      await kind.press('Tab');
      assert(await dialog.getByLabel('所属组织', { exact: true }).evaluate(node => document.activeElement === node));
      if (!live) {
        await dialog.getByRole('button', { name: '保存', exact: true }).click();
        await dialog.getByRole('alert').filter({ hasText: 'FOCUS_SAVE_UNAVAILABLE' }).waitFor();
        assert.equal(await name.inputValue(), '开头连续输入中文测试AB');
        assert.equal(await capacity.inputValue(), '12345');
        await name.focus();
        await page.keyboard.insertText('继续');
        assert(await name.evaluate(node => document.activeElement === node));
        assert.equal(writes.length, 1);
        assert.equal(writes[0].body.name, '开头连续输入中文测试AB');
      }
    } else {
      await typeContinuously(dialog.getByLabel('规格型号', { exact: true }), 'SPEC-123-连续');
      await typeContinuously(dialog.getByLabel('基本单位', { exact: true }), 'PCS');
      await typeContinuously(dialog.getByLabel('安全库存', { exact: true }), '123');
    }
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    console.log(`PASS ${live ? 'live' : 'controlled'} ${entity}: continuous input, stable nodes/focus and canceled draft`);
  }
  if (!live) {
    await page.goto(`${baseUrl}/?module=inventory&inventory=warehouses`);
    await page.getByRole('button', { name: '编辑仓库', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑仓库', exact: true });
    assert(await dialog.getByLabel('仓库编码', { exact: true }).evaluate(node => node.readOnly));
    await typeContinuously(dialog.getByLabel('仓库名称', { exact: true }), '编辑仓库连续输入');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    console.log('PASS controlled warehouse edit: locked code, continuous input, failed save preserves draft');
  } else assert.equal(writes.length, 0, 'Live focus verification must not modify business data');
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await browser.close();
}
