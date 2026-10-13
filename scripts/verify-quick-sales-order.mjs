import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.SALES_UI_URL || 'http://127.0.0.1:5175';
const outputDirectory = new URL(process.env.SALES_TEST_ARTIFACTS || '../docs/tests/artifacts/quick-sales-order-20261013/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence = [];
try {
  const page = await browser.newPage();
  let testTenant;
  if (process.env.SALES_TEST_ISOLATED === 'true') {
    process.loadEnvFile('.env.local');
    assert.ok(process.env.AUTH_SECRET, 'AUTH_SECRET is required for isolated tenant verification');
    testTenant = `quick-order-verification-${Date.now()}`;
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: 'quick-order-verification', name: 'Quick order verification', role: '销售专员',
      tenantIds: [testTenant], permissions: ['sales.order.read', 'sales.order.create'],
      permissionVersion: 'test', iat: now, exp: now + 1800, iss: 'industrial-ai-platform',
    })}`;
    const token = `${unsigned}.${createHmac('sha256', process.env.AUTH_SECRET).update(unsigned).digest('base64url')}`;
    await page.route('**/api/v1/sales/sales-orders**', route => route.continue({
      headers: { ...route.request().headers(), authorization: `Bearer ${token}`, 'x-tenant-id': testTenant },
    }));
  }
  const errors = [];
  const shipmentRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/shipment-requests')) {
      shipmentRequests.push(request.url());
    }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const captcha = page.locator('img[src^="data:image"]').first();
  const image = await captcha.getAttribute('src');
  const code = decodeURIComponent(image.split(',').slice(1).join(','))
    .match(/letter-spacing="7">([^<]+)</)?.[1];
  assert.ok(code);
  await page.locator('input').nth(0).fill(process.env.SALES_TEST_ACCOUNT || 'test01');
  await page.locator('input').nth(1).fill(process.env.SALES_TEST_PASSWORD || '123456');
  await page.locator('input').nth(2).fill(code);
  await page.getByRole('button', { name: '立即登录', exact: true }).click();
  await page.locator('aside').getByRole('button', { name: '销售管理', exact: true }).click();
  await page.getByText('登录成功，欢迎进入工业AI平台', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '产品报价', exact: true }).click();
  const quotesBefore = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('industrial-ai-sales:v8:TENANT-SHWS') || '{}').quotes?.length);
  assert.equal(typeof quotesBefore, 'number');
  const formFields = async dialog => ({
    labels: await dialog.locator('label').allTextContents(),
    headers: await dialog.locator('thead th').allTextContents(),
    inputTypes: await dialog.locator('input').evaluateAll(inputs => inputs.map(input => input.type)),
    remarks: await dialog.locator('textarea').count(),
  });

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: '产品报价', exact: true }).click();
    await page.getByRole('button', { name: '新增报价单', exact: true }).click();
    const quoteDialog = page.getByRole('dialog', { name: '新增报价单', exact: true });
    await quoteDialog.waitFor();
    const expectedForm = await formFields(quoteDialog);
    await quoteDialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '销售订单', exact: true }).click();
    await page.getByRole('button', { name: '已发货', exact: true }).click();
    await page.getByPlaceholder('搜索订单号、客户', { exact: true }).fill('SO-NO-MATCH');
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('focusOrder', 'SO-PREVIOUS-ORDER');
      history.replaceState({}, '', url);
    });
    await page.getByRole('button', { name: '快速开单', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '快速创建订单', exact: true });
    await dialog.waitFor();
    assert.deepEqual(await formFields(dialog), expectedForm, 'Quick order must share quotation fields');
    await page.screenshot({ path: new URL(`empty-${viewport.width}.png`, outputDirectory).pathname });
    await dialog.getByRole('button', { name: '创建订单', exact: true }).click();
    await dialog.getByRole('alert').getByText('请完整填写客户和有效期', { exact: true }).waitFor();
    const customer = await dialog.locator('datalist option').first().getAttribute('value');
    await dialog.getByLabel('客户', { exact: true }).fill(customer);
    await dialog.getByRole('alert').waitFor({ state: 'hidden' });
    await dialog.getByRole('button', { name: '创建订单', exact: true }).click();
    await dialog.getByRole('alert').getByText('请至少添加一个产品', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '添加产品', exact: true }).click();
    await dialog.getByRole('alert').waitFor({ state: 'hidden' });
    const firstRow = dialog.locator('tbody tr').first();
    const warehouses = await firstRow.locator('select').nth(0).locator('option').evaluateAll(options =>
      options.filter(option => option.value).map(option => option.value));
    let warehouse;
    let products = [];
    for (const candidate of warehouses) {
      await firstRow.locator('select').nth(0).selectOption(candidate);
      products = await firstRow.locator('select').nth(1).locator('option').evaluateAll(options =>
        options.filter(option => option.value).map(option => option.value));
      if (products.length) { warehouse = candidate; break; }
    }
    assert.ok(warehouse, 'Prepare a warehouse with at least one selectable product');
    const selectedProducts = [products[0], products[1] || products[0]];
    await firstRow.locator('select').nth(1).selectOption(selectedProducts[0]);
    await firstRow.locator('input[type="number"]').nth(0).fill('2');
    await firstRow.locator('input[type="number"]').nth(1).fill('120');
    await firstRow.locator('input').first().fill('QUICK-SPEC-1');
    await dialog.getByRole('button', { name: '添加产品', exact: true }).click();
    const secondRow = dialog.locator('tbody tr').nth(1);
    await secondRow.locator('select').nth(0).selectOption(warehouse);
    await secondRow.locator('select').nth(1).selectOption(selectedProducts[1]);
    await secondRow.locator('input[type="number"]').nth(0).fill('3');
    await secondRow.locator('input[type="number"]').nth(1).fill('80');
    await secondRow.locator('input').first().fill('QUICK-SPEC-2');
    const discounts = dialog.locator('input[type="number"]');
    await discounts.nth(4).fill('90');
    await discounts.nth(5).fill('12');
    const marker = `QUICK-ORDER-${viewport.width}-${Date.now()}`;
    const expectedOrderDate = await dialog.getByLabel('报价日期', { exact: true }).inputValue();
    const expectedValidUntil = await dialog.getByLabel('有效至', { exact: true }).inputValue();
    await dialog.locator('textarea').fill(marker);
    await dialog.getByText('¥420.00', { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`filled-${viewport.width}.png`, outputDirectory).pathname });

    let failedPosts = 0;
    let failedKey;
    await page.route('**/api/v1/sales/sales-orders', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      failedPosts += 1;
      failedKey = route.request().headers()['x-idempotency-key'];
      await new Promise(resolve => setTimeout(resolve, 350));
      await route.fulfill({ status: 403, json: { error: { code: 'DENIED', message: '快速开单验收：创建失败' } } });
    });
    await dialog.getByRole('button', { name: '创建订单', exact: true }).click();
    await dialog.getByRole('button', { name: '保存中...', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: '保存中...', exact: true }).isDisabled(), true);
    await dialog.getByRole('alert').getByText('快速开单验收：创建失败', { exact: true }).waitFor();
    assert.equal(failedPosts, 1);
    assert.equal(await dialog.locator('tbody tr').count(), 2);
    assert.equal(await dialog.locator('textarea').inputValue(), marker);
    assert.equal(new URL(page.url()).searchParams.get('module'), 'sales');
    await page.unroute('**/api/v1/sales/sales-orders');

    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/v1/sales/sales-orders'),
      dialog.getByRole('button', { name: '创建订单', exact: true }).click(),
    ]);
    const order = await response.json();
    assert.equal(response.status(), 201, JSON.stringify(order));
    assert.equal(response.request().headers()['x-idempotency-key'], failedKey);
    assert.equal(order.overallStatus, 'PENDING_CONFIRMATION');
    assert.equal(order.shipmentStatus, 'NOT_REQUESTED');
    assert.equal(Number(order.totalAmount), 420);
    assert.equal(order.remark, marker);
    assert.equal(order.orderDate, expectedOrderDate);
    assert.equal(order.validUntil, expectedValidUntil);
    assert.deepEqual(order.lines.map(line => line.specification), ['QUICK-SPEC-1', 'QUICK-SPEC-2']);
    assert.ok(order.lines.every(line => line.productName));
    assert.deepEqual(order.lines.map(line => line.productId), selectedProducts);
    assert.deepEqual(order.lines.map(line => line.orderedQty), ['2', '3']);
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'orders');
    assert.equal(new URL(page.url()).searchParams.has('focusOrder'), false);
    assert.equal(await page.getByPlaceholder('搜索订单号、客户', { exact: true }).inputValue(), '');
    assert.ok((await page.getByRole('button', { name: '待发货', exact: true }).getAttribute('class')).includes('text-blue-600'));
    const row = page.locator('tbody tr').filter({ hasText: order.orderNo });
    await row.getByTitle('查看', { exact: true }).waitFor();
    assert.match(await row.innerText(), /待发货/);
    await page.getByText('订单创建成功', { exact: true }).waitFor({ state: 'hidden' });
    await page.screenshot({ path: new URL(`pending-${viewport.width}.png`, outputDirectory).pathname });
    await row.getByTitle('查看', { exact: true }).click();
    await page.getByText(marker, { exact: true }).first().waitFor();
    await page.getByText('QUICK-SPEC-1', { exact: true }).waitFor();
    await page.getByText('QUICK-SPEC-2', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`details-${viewport.width}.png`, outputDirectory).pathname });
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.evaluate(() => localStorage.removeItem('industrial-ai-sales:v8:TENANT-SHWS'));
    await page.reload();
    await row.getByTitle('查看', { exact: true }).waitFor();
    assert.match(await row.innerText(), /待发货/);
    await row.getByTitle('查看', { exact: true }).click();
    await page.getByText(marker, { exact: true }).first().waitFor();
    await page.getByText('QUICK-SPEC-1', { exact: true }).waitFor();
    await page.getByText('QUICK-SPEC-2', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`reloaded-${viewport.width}.png`, outputDirectory).pathname });
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    const currentQuotes = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('industrial-ai-sales:v8:TENANT-SHWS') || '{}').quotes?.length);
    assert.equal(currentQuotes, quotesBefore, 'Quick creation must not create a quotation');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    evidence.push({ viewport, testTenant, orderId: order.id, orderNo: order.orderNo, amount: order.totalAmount,
      lineCount: order.lines.length, persistedMetadata: true, salesCacheCleared: true });
    console.log(`${viewport.width}x${viewport.height}: shared form, retry, pending order and refresh without sales cache passed`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(shipmentRequests, []);
  await writeFile(new URL('evidence.json', outputDirectory), JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
