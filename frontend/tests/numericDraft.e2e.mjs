import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Default: intercepted API regression. NUMERIC_LIVE=1: real login/reads, cancel every draft.
const live = process.env.NUMERIC_LIVE === '1';
if (live && existsSync('../.env.local')) process.loadEnvFile('../.env.local');
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const results = [];
const writes = [];
const errors = [];
const warehouse = { id: 'w1', code: 'WH-NUM', name: '数字回归仓库', type: '成品仓', status: 'active', version: 1, updatedAt: '2026-10-17T00:00:00Z' };
const product = { id: 'P-NUM', code: 'P-NUM', name: '数字回归产品', defaultWarehouseId: 'w1', specification: '规格', category: '成品', uom: 'PCS', unitPrice: '10', safetyStockQty: '0', status: 'active', version: 1, updatedAt: '2026-10-17T00:00:00Z' };
const inspection = { id: 'qc-num', code: 'QC-NUM', workOrderId: 'wo-num', sampleQty: '10', passedQty: '0', failedQty: '0', status: 'CREATED', version: 1 };
const fulfill = (route, json) => route.fulfill({ json });
const reportDir = `../artifacts/numeric-input-${live ? 'live' : 'controlled'}`;

try {
  if (!live) {
    await context.addInitScript(() => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
      account: 'numeric-regression', name: '数字输入回归', role: '超级管理员', permissions: ['*'],
      tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-numeric', expiresAt: '2099-01-01T00:00:00Z',
    })));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      if (request.method() !== 'GET') {
        writes.push({ path, method: request.method(), body: request.postDataJSON() });
        return route.fulfill({ status: 422, json: { error: { code: 'NUMERIC_TEST_FAILURE', message: '数字回归保存失败' } } });
      }
      if (path.endsWith('/inventory/warehouses')) return fulfill(route, { items: [warehouse], total: 1 });
      if (path.endsWith('/inventory/products')) return fulfill(route, { items: [product], total: 1 });
      if (path.endsWith('/inventory/availability')) return fulfill(route, [{
        warehouseId: 'w1', productId: 'P-NUM', qualifiedOnHandQty: '20', allocatedReservedQty: '0',
        frozenQty: '0', safetyStockQty: '0', fulfillableQty: '20', inTransitQty: '0', uom: 'PCS', factVersion: 1,
      }]);
      if (path.endsWith('/supply-chain/customers')) return fulfill(route, { items: [{ id: 'c-num', name: '数字回归客户', contactPerson: '联系人', phone: '13800000000', status: 'active', version: 1 }], total: 1 });
      if (path.endsWith('/production/inspections')) return fulfill(route, [inspection]);
      if (path.endsWith('/production/readiness')) return fulfill(route, { permissions: ['*'] });
      if (path.endsWith('/platform/snapshot')) return fulfill(route, {
        tenant: { id: 'TENANT-SHWS', name: '数字回归企业', status: 'running' }, roles: [], permissions: [], roleGrants: [],
        orgUnits: [], resources: [], employees: [], accounts: [], positions: [], capabilities: [], adapters: [],
        dictionaries: [], parameters: [], approvalRules: [], audits: [],
      });
      const arrays = ['/production/bom-snapshots', '/production/completions', '/production/work-order-closes'];
      return fulfill(route, arrays.some(suffix => path.endsWith(suffix)) ? [] : { items: [], total: 0 });
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  if (live) {
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/') && request.method() !== 'GET' && !path.startsWith('/api/v1/session/')) writes.push({ path });
    });
    await page.goto(baseUrl);
    const image = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
    await image.waitFor();
    const source = await image.getAttribute('src');
    const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
    const account = process.env.E2E_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT?.split(',')[0];
    const password = process.env.E2E_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
    assert(account && password && captcha, 'Configure local E2E credentials and captcha');
    await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
    await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
    await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
    await page.getByRole('button', { name: '立即登录', exact: true }).click();
    await page.locator('main').first().waitFor();
  }
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const visit = query => page.goto(`${baseUrl}/?${query}`);
  const probe = async (name, input, decimal = false) => {
    const initial = await input.inputValue();
    await input.fill('0');
    await input.press('End');
    await input.press('Backspace');
    await settle();
    assert.equal(await input.inputValue(), '', `${name}: deleting zero must retain empty draft`);
    await input.blur();
    await settle();
    assert.equal(await input.inputValue(), '', `${name}: blur must not refill zero`);
    await input.fill('25');
    await input.press('ControlOrMeta+A');
    await input.press('Delete');
    await settle();
    assert.equal(await input.inputValue(), '', `${name}: deleting nonzero must retain empty draft`);
    await page.keyboard.insertText('7');
    await settle();
    assert.equal(await input.inputValue(), '7', `${name}: no forced leading zero`);
    if (decimal) {
      await input.fill('0');
      await input.press('End');
      await page.keyboard.insertText('.');
      await settle();
      assert.equal(await input.inputValue(), '0.', `${name}: decimal editing state`);
      await page.keyboard.insertText('5');
      assert.equal(await input.inputValue(), '0.5');
    }
    const node = await input.elementHandle();
    await input.press('ControlOrMeta+A');
    await page.keyboard.insertText('12');
    await settle();
    assert.equal(await input.inputValue(), '12');
    assert(await node.evaluate(element => element.isConnected && document.activeElement === element), `${name}: focus`);
    await node.dispose();
    results.push({ name, initial, clear: '', replace: '12', decimal });
  };

  for (const [tab, entity] of [['products', '产品'], ['materials', '物料'], ['warehouses', '仓库']]) {
    await visit(`module=inventory&inventory=${tab}`);
    await page.getByRole('button', { name: `新建${entity}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `新建${entity}`, exact: true });
    for (const label of entity === '仓库' ? ['仓库容量'] : ['价格 (元)', '安全库存']) {
      await probe(`库存/${entity}/${label}`, dialog.getByLabel(label, { exact: true }), true);
    }
    if (!live && entity === '产品') {
      for (const [label, value] of [['产品编码', 'NUM-NEW'], ['产品名称', '数字输入草稿'], ['规格型号', '规格'], ['基本单位', 'PCS']]) {
        await dialog.getByLabel(label, { exact: true }).fill(value);
      }
      const price = dialog.getByLabel('价格 (元)', { exact: true });
      const safety = dialog.getByLabel('安全库存', { exact: true });
      const before = writes.length;
      for (const value of ['', '-1', '0.', '1e2', '0.0000001', 'NaN']) {
        await price.fill(value);
        await dialog.getByRole('button', { name: '保存', exact: true }).click();
        await dialog.getByRole('alert').waitFor();
        assert.equal(writes.length, before, 'Invalid price must not submit');
      }
      await price.fill('00.50');
      await safety.fill('');
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      assert.equal(writes.length, before);
      await safety.fill('00');
      const response = page.waitForResponse(res => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith('/inventory/products'));
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await response;
      await dialog.getByText('数字回归保存失败', { exact: true }).waitFor();
      assert.equal(writes.at(-1).body.unitPrice, '0.50');
      assert.equal(writes.at(-1).body.safetyStockQty, '0');
      assert.equal(await price.inputValue(), '00.50', 'Failure must retain raw draft');
      assert.equal(await safety.inputValue(), '00');
    }
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
  }

  await visit('module=sales&tab=orders');
  await page.getByRole('button', { name: '快速开单', exact: true }).click();
  const sales = page.getByRole('dialog', { name: '快速创建订单', exact: true });
  await sales.getByRole('button', { name: '添加产品', exact: true }).click();
  for (const name of ['数量', '单价', '折扣率', '优惠金额']) await probe(`销售/${name}`, sales.getByLabel(name, { exact: true }), true);
  if (!live) {
    await sales.getByLabel('客户', { exact: true }).fill('数字回归客户');
    await sales.locator('tbody select').nth(0).selectOption('WH-NUM');
    await sales.locator('tbody select').nth(1).selectOption('P-NUM');
    const qty = sales.getByLabel('数量', { exact: true });
    const price = sales.getByLabel('单价', { exact: true });
    const rate = sales.getByLabel('折扣率', { exact: true });
    const discount = sales.getByLabel('优惠金额', { exact: true });
    await qty.fill('2'); await price.fill('10'); await rate.fill('100'); await discount.fill('0');
    const save = sales.getByRole('button', { name: '创建订单', exact: true });
    const before = writes.length;
    for (const [field, invalid, restored] of [[qty, '', '2'], [price, '0.', '10'], [rate, '', '100'], [rate, '101', '100'], [discount, '', '0']]) {
      await field.fill(invalid);
      await sales.getByText('—', { exact: true }).first().waitFor();
      await save.click();
      assert.equal(writes.length, before, 'Invalid sales draft must not submit');
      await field.fill(restored);
    }
    await qty.fill('002'); await price.fill('010'); await discount.fill('00');
    const response = page.waitForResponse(res => res.request().method() === 'POST' && new URL(res.url()).pathname.includes('/sales/'));
    await save.click(); await response;
    await sales.getByText('数字回归保存失败', { exact: true }).waitFor();
    assert.equal(writes.at(-1).body.lines[0].orderedQty, '2');
    assert.equal(writes.at(-1).body.lines[0].unitPrice, '10');
    assert.equal(writes.at(-1).body.discountAmount, '0');
    assert.equal(await qty.inputValue(), '002');
  }
  await sales.getByRole('button', { name: '取消', exact: true }).click();
  await visit('module=sales&tab=basic-data');
  await page.getByRole('button', { name: '订单设置', exact: true }).click();
  await probe('销售/触发阈值', page.getByLabel('触发阈值', { exact: true }));

  await visit('module=production&production=bom');
  await page.getByRole('button', { name: '发布生效 BOM', exact: true }).click();
  const bom = page.getByRole('dialog', { name: '发布生效 BOM', exact: true });
  await bom.getByRole('button', { name: '添加工序', exact: true }).click();
  await probe('生产/BOM工序顺序', bom.getByLabel('sequence-0', { exact: true }));
  if (!live) {
    await bom.getByLabel('产品编码', { exact: true }).fill('P-NUM');
    await bom.getByLabel('产品名称', { exact: true }).fill('数字回归产品');
    await bom.getByRole('button', { name: '添加物料', exact: true }).click();
    for (const [label, value] of [['materialId-0', 'M-NUM'], ['warehouseId-0', 'w1'], ['uom-0', 'PCS'], ['code-0', 'OP10'], ['name-0', '组装'], ['workCenterResourceId-0', 'wc1']]) {
      await bom.getByLabel(label, { exact: true }).fill(value);
    }
    const sequence = bom.getByLabel('sequence-0', { exact: true });
    const before = writes.length;
    for (const value of ['', '0', '1.5', '9007199254740992']) {
      await sequence.fill(value); await bom.getByRole('button', { name: '确认发布', exact: true }).click();
      assert.equal(writes.length, before, 'Invalid BOM sequence must not publish');
    }
    await sequence.fill('20');
    const response = page.waitForResponse(res => res.request().method() === 'POST' && new URL(res.url()).pathname.includes('/bom-snapshots'));
    await bom.getByRole('button', { name: '确认发布', exact: true }).click(); await response;
    await bom.getByText('数字回归保存失败', { exact: true }).waitFor();
    assert.equal(writes.at(-1).body.routingSnapshot.operations[0].sequence, 20);
    assert.equal(await sequence.inputValue(), '20');
  }
  await bom.getByRole('button', { name: '取消', exact: true }).click();

  if (!live) {
    await visit('module=production&production=qc_cost');
    await page.getByRole('button', { name: '录入检验', exact: true }).click();
    const ng = page.getByLabel('不良品数', { exact: true });
    await ng.fill('3');
    const ok = page.getByLabel('合格良品数', { exact: true });
    const rework = page.getByLabel('退回车间返修', { exact: true });
    const scrap = page.getByLabel('直接报废扣账', { exact: true });
    const save = page.getByRole('button', { name: '提交检验结果', exact: true });
    await ng.fill('');
    assert.equal(await ok.inputValue(), '7');
    assert.equal(await rework.inputValue(), '3');
    assert(await save.isDisabled());
    await ng.fill('3');
    for (const field of [ok, ng, scrap, rework]) {
      const old = await field.inputValue();
      await field.fill(''); await field.blur();
      assert.equal(await field.inputValue(), '');
      assert(await save.isDisabled());
      await field.fill(old);
    }
    await ng.fill('1.0000001');
    assert(await save.isDisabled());
    await ng.fill('0.1');
    assert.equal(await ok.inputValue(), '9.9');
    assert.equal(await rework.inputValue(), '0.1');
    assert(await save.isEnabled(), 'Decimal quantities must conserve without floating point drift');
    await ng.fill('3');
    await scrap.fill('1'); await rework.fill('1');
    assert(await save.isDisabled(), 'MRB allocation must be conserved');
    await rework.fill('2');
    const response = page.waitForResponse(res => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith('/qc-num/result'));
    await save.click(); await response;
    await page.getByText('检验结果未保存，请检查错误后重试', { exact: true }).waitFor();
    assert.equal(await ng.inputValue(), '3');
    assert.deepEqual({ passedQty: writes.at(-1).body.passedQty, failedQty: writes.at(-1).body.failedQty }, { passedQty: '7', failedQty: '3' });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    results.push({ name: '质检/四个数量/空值不覆盖关联值/守恒/失败保留', passed: true });
  }

  await visit('module=procurement&procurement=supplier');
  await page.getByRole('button', { name: '新增供应商', exact: true }).click();
  await page.getByText('平均交期（天）', { exact: true }).waitFor();
  await probe('采购/供应商交期（正常对照）', page.locator('form input[type="number"]'));
  await page.getByRole('button', { name: '取消', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await visit('module=inventory&inventory=products');
  await page.getByRole('button', { name: '新建产品', exact: true }).click();
  const mobile = page.getByRole('dialog', { name: '新建产品', exact: true });
  await probe('移动视口/产品价格', mobile.getByLabel('价格 (元)', { exact: true }), true);
  await mkdir(reportDir, { recursive: true });
  await page.screenshot({ path: `${reportDir}/mobile.png`, fullPage: true });
  await mobile.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(errors.length, 0);
  if (live) assert.equal(writes.length, 0, 'Live regression must not write business data');
  console.log(`PASS numeric drafts (${live ? 'live read-only' : 'controlled API'}): ${results.length} checks, ${writes.length} writes, no browser errors`);
} finally {
  await mkdir(reportDir, { recursive: true });
  await writeFile(`${reportDir}/results.json`, JSON.stringify({ live, results, writes, errors }, null, 2));
  await browser.close();
}
