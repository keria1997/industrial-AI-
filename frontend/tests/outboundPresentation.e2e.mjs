import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Controlled fixtures are intercepted here only; live mode performs login and read-only API/UI checks.
const live = process.env.OUTBOUND_LIVE === '1';
if (live && existsSync('../.env.local')) process.loadEnvFile('../.env.local');
const baseUrl = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.OUTBOUND_REPORT_DIR || `/tmp/industrial-ai-issue023-${live ? 'live' : 'controlled'}`;
const productId = '2c4bf33d-78df-4d3c-b418-46683d010d2e';
const secondProductId = 'e3fc9267-0113-48ca-95b9-10f98585f018';
const warehouseId = '7d907d3b-73f4-4d3c-8215-6b0ebc6fca68';
const line = (id, product = productId) => ({
  id, orderLineId: `order-${id}`, productId: product, requestedQty: '5', postedQty: '0',
  reservedQty: '0', shortageQty: '5', uom: 'PCS', allowPartialShipment: true,
});
let task = {
  id: 'task-023', shipmentRequestId: 'request-023', salesOrderId: 'order-023', salesOrderNo: 'SO-ISSUE023',
  warehouseId, workflowStatus: 'ACTIVE', availabilityStatus: 'UNCHECKED', replenishmentStatus: 'NOT_REQUIRED',
  postingStatus: 'NOT_STARTED', allowPartialShipment: true, version: 1, orderRevision: 1,
  updatedAt: '2026-10-17T06:00:00Z', lines: [line('line-a')],
};
const fact = {
  productId, warehouseId, qualifiedOnHandQty: '5', allocatedReservedQty: '0', frozenQty: '0',
  safetyStockQty: '0', inTransitQty: '0', fulfillableQty: '5', uom: 'PCS', factVersion: 2,
};
let facts = [], failAvailability = false, metadataMissing = false;
let grants = ['*'];
const requests = [], errors = [], checks = [];
let failure;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/')) requests.push({ path, method: request.method(), search: new URL(request.url()).search });
});
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
await mkdir(output, { recursive: true });

const openOutbound = async () => {
  await page.goto(`${baseUrl}/?module=inventory&inventory=outbound`);
  await page.getByText('SO-ISSUE023', { exact: true }).waitFor();
  await page.getByRole('button', { name: '去发货', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认销售发货', exact: true });
  await dialog.getByRole('combobox').selectOption(warehouseId);
  await dialog.getByRole('button', { name: '重新查询库存', exact: true }).waitFor();
  return dialog;
};

try {
  if (!live) {
    await context.addInitScript(() => {
      if (!sessionStorage.getItem('industrial-ai-session:v2')) sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify({
        account: 'issue023-controlled', name: '出库回归员', role: '仓管', permissions: ['*'],
        tenantIds: ['TENANT-SHWS'], accessToken: 'controlled-023', expiresAt: '2099-01-01T00:00:00Z',
      }));
    });
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      assert.equal(request.method(), 'GET', 'Regression must not submit stock import, reservation or posting');
      const json = value => route.fulfill({ json: value });
      if (path.endsWith('/production/readiness')) return json({ permissions: grants });
      if (path.endsWith('/platform/snapshot')) return json({
        tenant: { id: 'TENANT-SHWS', name: '出库回归租户', status: 'running' }, roles: [], permissions: [],
        roleGrants: [], orgUnits: [], resources: [], employees: [], accounts: [], positions: [],
        capabilities: [], adapters: [], dictionaries: [], parameters: [], approvalRules: [], audits: [],
      });
      if (path.endsWith('/inventory/warehouses')) return json({ items: [
        { id: warehouseId, code: 'AAA', name: 'saa', status: 'active', type: '成品仓', version: 1, updatedAt: '' },
      ], total: 1 });
      if (path.endsWith('/inventory/products')) return json({ items: metadataMissing ? [] : [
        { id: productId, code: 'SAS', name: 'ssa', uom: 'PCS', status: 'active', version: 1, defaultWarehouseId: warehouseId },
        { id: secondProductId, code: 'PART', name: '配件', uom: 'PCS', status: 'active', version: 1 },
      ], total: metadataMissing ? 0 : 2 });
      if (path.endsWith('/inventory/availability')) {
        if (url.searchParams.has('warehouseId') && failAvailability) {
          return route.fulfill({ status: 503, json: { error: { code: 'STOCK_UNAVAILABLE', message: `库存查询失败：${productId}` } } });
        }
        return json(facts);
      }
      if (path.endsWith('/inventory/shipment-tasks')) return json({ items: [task], total: 1 });
      const arrayPaths = ['/production/inspections', '/production/completions', '/production/bom-snapshots', '/production/work-order-closes'];
      return json(arrayPaths.some(suffix => path.endsWith(suffix)) ? [] : { items: [], total: 0 });
    });

    let dialog = await openOutbound();
    await dialog.getByRole('status').filter({ hasText: '未查询到以下产品的库存记录：ssa（SAS）' }).waitFor();
    assert(!(await dialog.innerText()).includes(productId));
    assert(!(await dialog.innerText()).includes('请重新选择发货仓库以加载真实可用量'));
    assert(await dialog.getByRole('button', { name: '确认发货', exact: true }).isDisabled());
    await page.screenshot({ path: `${output}/missing-stock.png` });
    check('无库存仍显示正式产品名称与编码，缺库存阻断发货并提供办理指引');

    facts = [fact];
    const before = requests.filter(item => item.path.endsWith('/inventory/availability') && item.search).length;
    await dialog.getByRole('button', { name: '重新查询库存', exact: true }).click();
    await dialog.getByRole('button', { name: '去发货', exact: true }).waitFor();
    assert(!(await dialog.getByRole('button', { name: '去发货', exact: true }).isDisabled()));
    assert.equal(await dialog.getByRole('combobox').inputValue(), warehouseId);
    assert.equal(requests.filter(item => item.path.endsWith('/inventory/availability') && item.search).length, before + 1);
    const query = new URLSearchParams(requests.filter(item => item.path.endsWith('/inventory/availability') && item.search).at(-1).search);
    assert.equal(query.get('warehouseId'), warehouseId);
    assert.equal(query.get('productIds'), productId);
    assert.equal(await dialog.getByLabel('ssa（SAS） 本次发货数量', { exact: true }).inputValue(), '5');
    await page.screenshot({ path: `${output}/stock-recovered.png` });
    check('同仓重新查询实际接口并恢复可发状态，API仍使用稳定UUID');

    failAvailability = true;
    await dialog.getByRole('button', { name: '重新查询库存', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: '库存查询失败：ssa（SAS）' }).waitFor();
    assert(await dialog.getByRole('button', { name: '确认发货', exact: true }).isDisabled());
    failAvailability = false;
    await dialog.getByRole('button', { name: '重新查询库存', exact: true }).click();
    await dialog.getByRole('button', { name: '去发货', exact: true }).waitFor();
    check('接口失败保留仓库、翻译产品标识并禁止发货，重试成功可恢复');

    facts = [{ ...fact, fulfillableQty: '0', qualifiedOnHandQty: '0' }];
    await dialog.getByRole('button', { name: '重新查询库存', exact: true }).click();
    await dialog.getByRole('button', { name: '去生产', exact: true }).waitFor();
    assert.equal(await dialog.getByText(/未查询到以下产品的库存记录/).count(), 0);
    check('真实零库存与缺少库存事实分开显示，不伪造可用量');

    facts = [{ ...fact, uom: '套' }];
    await dialog.getByRole('button', { name: '重新查询库存', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'ssa（SAS）：订单单位 PCS，库存单位 套' }).waitFor();
    assert(await dialog.getByRole('button', { name: '确认发货', exact: true }).isDisabled());
    check('单位不匹配按产品名称说明差异，保持出库阻断');

    facts = [];
    task = { ...task, lines: [line('line-a'), line('line-b')] };
    dialog = await openOutbound();
    await dialog.getByRole('status').filter({ hasText: '未查询到以下产品的库存记录：ssa（SAS）' }).waitFor();
    assert(await dialog.getByRole('button', { name: '确认发货', exact: true }).isDisabled());
    check('同产品多行全部缺事实时仍阻断，不因产品ID去重误判为可发');

    facts = [fact];
    task = { ...task, lines: [line('line-a'), line('line-b', secondProductId)] };
    dialog = await openOutbound();
    await dialog.getByRole('button', { name: '部分发货', exact: true }).waitFor();
    assert(!(await dialog.getByRole('button', { name: '部分发货', exact: true }).isDisabled()));
    await dialog.getByRole('status').filter({ hasText: '未查询到以下产品的库存记录：配件（PART）' }).waitFor();
    assert(!(await dialog.innerText()).includes(secondProductId));
    check('部分产品缺事实保留明确警告和合法部分发货入口');

    task = { ...task, allowPartialShipment: false, lines: task.lines.map(item => ({ ...item, allowPartialShipment: false })) };
    dialog = await openOutbound();
    await dialog.getByRole('button', { name: '去生产', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: '部分发货', exact: true }).count(), 0);
    check('禁止分批订单不会因部分产品有库存而开放部分发货');

    facts = [];
    task = { ...task, allowPartialShipment: true, lines: [line('line-a')] };
    dialog = await openOutbound();
    await dialog.getByRole('button', { name: '查看入库办理指引', exact: true }).click();
    const guide = page.getByRole('dialog', { name: '入库办理指引', exact: true });
    await guide.waitFor();
    await guide.getByText(/手工入库暂不可用/).waitFor();
    assert.equal(await guide.getByRole('textbox').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await guide.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.screenshot({ path: `${output}/mobile-guide.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await guide.getByRole('button', { name: '前往采购收货', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('module') === 'procurement' && url.searchParams.get('procurement') === 'receipts');
    check('入库指引正常挂载、移动端可见，采购收货跳转使用正式模块参数');

    await page.goto(`${baseUrl}/?module=inventory`);
    await page.getByRole('button', { name: '手工入库', exact: true }).click();
    await guide.getByRole('button', { name: '前往生产完工入库', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('module') === 'production' && url.searchParams.get('production') === 'qc_cost');
    check('生产完工入库跳转至质量与结案页，不触发快照导入');

    dialog = await openOutbound();
    await dialog.getByRole('button', { name: '查看库存台账', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('inventory') === 'stock');
    await page.getByRole('heading', { name: '库存查询', exact: true }).waitFor();
    check('缺库存可跳转正式库存台账并刷新真实事实');

    metadataMissing = true;
    dialog = await openOutbound();
    await dialog.getByText(/产品名称未获取/).first().waitFor();
    assert(!(await dialog.innerText()).includes(productId));
    check('主数据缺失显示明确未知状态，不把UUID伪装为名称或编码');

    grants = ['inventory.read', 'inventory.warehouse.read', 'inventory.product.read', 'inventory.availability.read'];
    await page.evaluate(permissions => {
      const session = JSON.parse(sessionStorage.getItem('industrial-ai-session:v2'));
      session.permissions = permissions;
      sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(session));
    }, grants);
    await page.goto(`${baseUrl}/?module=inventory`);
    await page.getByRole('button', { name: '手工入库', exact: true }).click();
    await guide.waitFor();
    assert.equal(await guide.getByRole('button', { name: '前往采购收货', exact: true }).count(), 0);
    assert.equal(await guide.getByRole('button', { name: '前往生产完工入库', exact: true }).count(), 0);
    await guide.getByText('当前账号无可用的入库业务入口，请联系具有相应权限的人员处理。', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await guide.waitFor({ state: 'hidden' });
    check('入库路径按有效权限隐藏，关闭与Escape可用');
  } else {
    const account = process.env.E2E_ACCOUNT || process.env.DEMO_AUTH_ACCOUNT?.split(',')[0];
    const password = process.env.E2E_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
    assert(account && password, 'Configure E2E_ACCOUNT/E2E_PASSWORD');
    await page.goto(baseUrl);
    const captchaImage = page.getByRole('button', { name: '刷新验证码', exact: true }).locator('img');
    await captchaImage.waitFor();
    const source = await captchaImage.getAttribute('src');
    assert(source?.startsWith('data:image/svg+xml'), 'Login captcha cannot be read automatically');
    const captcha = decodeURIComponent(source.slice(source.indexOf(',') + 1)).match(/<text\b[^>]*>([^<]+)<\/text>/)?.[1];
    assert(captcha, 'No readable login captcha');
    await page.getByPlaceholder('请输入账号', { exact: true }).fill(account);
    await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
    await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
    const [login] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/session/login')),
      page.getByRole('button', { name: '立即登录', exact: true }).click(),
    ]);
    assert.equal(login.status(), 200, 'Login unsuccessful; do not repeat credentials');
    await page.locator('main').first().waitFor();
    const reads = ['/inventory/products', '/inventory/shipment-tasks'].map(suffix =>
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith(suffix)));
    await page.goto(`${baseUrl}/?module=inventory&inventory=outbound`);
    const [productsResponse, tasksResponse] = await Promise.all(reads);
    assert.equal(productsResponse.status(), 200);
    assert.equal(tasksResponse.status(), 200);
    const products = (await productsResponse.json()).items || [];
    const tasks = (await tasksResponse.json()).items || [];
    await page.getByRole('button', { name: '手工入库', exact: true }).waitFor();
    check(`真实登录与出库、产品API查询成功（任务${tasks.length}项，产品${products.length}项）`);
    if (tasks.length) {
      const known = tasks.flatMap(item => item.lines).map(item => products.find(product => product.id === item.productId)).find(Boolean);
      if (known) await page.getByText(`${known.name}（${known.code}）`, { exact: false }).first().waitFor();
      await page.getByRole('button', { name: '查看出库单', exact: true }).first().click();
      if (known) await page.getByRole('cell', { name: known.code, exact: true }).first().waitFor();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      check(known ? '真实出库列表与详情按API产品身份显示名称和编码'
        : '真实出库详情可打开；无可匹配产品主数据，名称映射未验收');
    }
    await page.getByRole('button', { name: '手工入库', exact: true }).click();
    const guide = page.getByRole('dialog', { name: '入库办理指引', exact: true });
    await guide.getByText(/手工入库暂不可用/).waitFor();
    await page.screenshot({ path: `${output}/live-guide.png` });
    check('真实页面手工入库入口显示办理指引');
    await guide.getByRole('button', { name: '关闭入库指引', exact: true }).click();
    const shipButton = page.getByRole('button', { name: '去发货', exact: true }).first();
    if (await shipButton.count()) {
      await shipButton.click();
      const dialog = page.getByRole('dialog', { name: '确认销售发货', exact: true });
      const selector = dialog.getByRole('combobox');
      const allowedWarehouse = await selector.locator('option').evaluateAll(options =>
        options.find(option => option.value)?.value);
      if (allowedWarehouse) {
        const availabilityResponse = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname.endsWith('/inventory/availability') && url.searchParams.has('warehouseId');
        });
        await selector.selectOption(allowedWarehouse);
        assert.equal((await availabilityResponse).status(), 200);
        await dialog.getByRole('button', { name: '重新查询库存', exact: true }).waitFor();
        await page.screenshot({ path: `${output}/live-stock-query.png` });
        check('真实发货弹窗按授权仓库查询库存API，不执行预留和过账');
      }
    }
  }
  assert.deepEqual(errors, []);
  assert.equal(requests.filter(item => item.method !== 'GET' && !item.path.startsWith('/api/v1/session/')).length, 0);
  assert.equal(requests.filter(item => item.path.includes('/import/availability')).length, 0);
  check('浏览器无运行异常，未导入库存快照、未写入业务数据');
} catch (cause) {
  failure = cause.message;
  console.error(`FAIL ${cause.message}`);
  process.exitCode = 1;
  await writeFile(`${output}/failure.txt`, cause.stack || cause.message);
  // Do not capture password fields on login failures.
  if (await page.getByRole('button', { name: '手工入库', exact: true }).count()) {
    await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ baseUrl, live, checks, failure, errors, requests }, null, 2));
  await browser.close();
}
