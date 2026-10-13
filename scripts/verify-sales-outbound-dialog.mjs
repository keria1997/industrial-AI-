import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.SALES_UI_URL || 'http://127.0.0.1:5175';
const outputDirectory = new URL('../docs/tests/artifacts/sales-outbound-dialog-20261013/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];
  const shipmentPosts = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/shipment-requests')) shipmentPosts.push(request);
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const captcha = page.locator('img[src^="data:image"]').first();
  await captcha.waitFor();
  const image = await captcha.getAttribute('src');
  const captchaCode = decodeURIComponent(image.split(',').slice(1).join(','))
    .match(/letter-spacing="7">([^<]+)</)?.[1];
  assert.ok(captchaCode, 'The local development captcha must be readable');
  await page.locator('input').nth(0).fill(process.env.SALES_TEST_ACCOUNT || 'test01');
  await page.locator('input').nth(1).fill(process.env.SALES_TEST_PASSWORD || '123456');
  await page.locator('input').nth(2).fill(captchaCode);
  await page.getByRole('button', { name: '立即登录', exact: true }).click();
  await page.getByRole('button', { name: /销售管理/ }).first().waitFor();
  const ordersResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/v1/sales/sales-orders' && response.status() === 200);
  await page.getByRole('button', { name: /销售管理/ }).first().click();
  const { items } = await (await ordersResponse).json();
  // Reuse an existing warehouse task so browser verification does not create business data.
  const order = items.find(item => item.overallStatus === 'CONFIRMED' && item.shipmentStatus === 'REQUESTED');
  assert.ok(order, 'Prepare a confirmed sales order with an existing shipment request');
  await page.getByRole('button', { name: '销售订单', exact: true }).click();
  await page.getByRole('button', { name: '已确认', exact: true }).click();
  await page.getByPlaceholder('搜索订单号、客户', { exact: true }).fill(order.orderNo);
  const row = page.locator('tbody tr').filter({ hasText: order.orderNo });
  await row.waitFor();
  await page.getByText('登录成功，欢迎进入工业AI平台', { exact: true }).waitFor({ state: 'hidden' });

  const dialog = page.getByRole('dialog', { name: '已通知仓库准备发货' });
  const verifyDialog = async expectedUrl => {
    await dialog.waitFor();
    assert.equal(page.url(), expectedUrl, 'Opening the success dialog must keep the sales URL');
    assert.ok(await dialog.getByText(order.orderNo, { exact: true }).isVisible());
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 &&
      bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  };

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const salesUrl = page.url();
    await row.getByRole('button', { name: `订单 ${order.orderNo} 去发货`, exact: true }).click();
    await verifyDialog(salesUrl);
    await page.screenshot({ path: new URL(`dialog-${viewport.width}.png`, outputDirectory).pathname });
    await dialog.getByRole('button', { name: '我知道了', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(page.url(), salesUrl, 'Acknowledging must keep the sales URL');

    await row.getByRole('button', { name: `订单 ${order.orderNo} 更多操作`, exact: true }).click();
    await page.getByRole('menuitem', { name: '去发货', exact: true }).click();
    await verifyDialog(salesUrl);
    await dialog.getByRole('button', { name: '关闭发货申请弹窗', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(page.url(), salesUrl, 'Closing must keep the sales URL');

    await row.getByTitle('查看', { exact: true }).click();
    await page.getByRole('button', { name: '去发货', exact: true }).click();
    await verifyDialog(salesUrl);
    await dialog.getByRole('button', { name: '我知道了', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(page.url(), salesUrl, 'Shipping from details must keep the sales URL');
    console.log(`${viewport.width}x${viewport.height}: row, menu, details and dismissal passed`);
  }
  assert.equal(shipmentPosts.length, 0, 'Reopening an existing task must not create duplicate shipment requests');

  const salesUrl = page.url();
  const orderPath = `/api/v1/sales/sales-orders/${order.id}`;
  const getOrderRoute = `**${orderPath}`;
  const postShipmentRoute = `**${orderPath}/shipment-requests`;

  // Exercise first submission and failure through controlled HTTP responses.
  // These cases verify UI behavior without modifying the existing order on the server.
  let submitted = false;
  await page.route(getOrderRoute, route => route.fulfill({
    json: submitted ? order : { ...order, shipmentStatus: 'NOT_REQUESTED' },
  }));
  await page.route(postShipmentRoute, route => {
    submitted = true;
    return route.fulfill({ status: 202, json: {} });
  });
  await row.getByRole('button', { name: `订单 ${order.orderNo} 去发货`, exact: true }).click();
  await verifyDialog(salesUrl);
  assert.equal(shipmentPosts.length, 1);
  await dialog.getByRole('button', { name: '我知道了', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });

  submitted = false;
  await page.unroute(postShipmentRoute);
  await page.route(postShipmentRoute, route => route.fulfill({
    status: 403,
    json: { error: { code: 'DENIED', message: '发货申请验收：权限不足' } },
  }));
  await row.getByRole('button', { name: `订单 ${order.orderNo} 去发货`, exact: true }).click();
  await page.getByText('发货申请验收：权限不足', { exact: true }).waitFor();
  assert.equal(await dialog.count(), 0, 'Failure must not display a success dialog');
  assert.equal(page.url(), salesUrl, 'Failure must keep the sales URL');
  await page.unroute(getOrderRoute);
  await page.unroute(postShipmentRoute);

  await row.getByRole('button', { name: `订单 ${order.orderNo} 去发货`, exact: true }).click();
  await verifyDialog(salesUrl);
  await dialog.getByRole('button', { name: '进入出库管理', exact: true }).click();
  await page.getByRole('button', { name: '返回销售订单', exact: true }).waitFor();
  const outboundUrl = new URL(page.url());
  assert.equal(outboundUrl.searchParams.get('module'), 'inventory');
  assert.equal(outboundUrl.searchParams.get('inventory'), 'outbound');
  assert.equal(outboundUrl.searchParams.get('sourceOrder'), order.orderNo);
  assert.equal(await dialog.count(), 0);
  assert.deepEqual(pageErrors, []);
  console.log('First submission, failure and explicit navigation passed; no browser errors');
} finally {
  await browser.close();
}
