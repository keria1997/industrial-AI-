import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.NAVIGATION_UI_URL || 'http://127.0.0.1:5175';
const outputDirectory = new URL('../docs/tests/artifacts/module-navigation-20261013/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const sections = [
  { module: '销售管理', first: '销售监控舱', other: '销售订单', param: 'tab', value: 'orders', home: null },
  { module: '生产管理', first: '生产监控舱', other: '主计划(MPS)', param: 'production', value: 'mps', home: 'dashboard' },
  { module: '库存管理', first: '库存监控舱', other: '出库管理', param: 'inventory', value: 'outbound', home: 'dashboard' },
  { module: '采购管理', first: '采购监控舱', other: '采购申请(PR)', param: 'procurement', value: 'pr', home: 'dashboard' },
  { module: '财务管理', first: '财务监控舱', other: '应收账款(AR)' },
  { module: '人员管理', first: '人员监控舱', other: '员工档案表' },
  { module: '产业链管理', first: '首页大盘', other: '供应商信息' },
  { module: 'AI数据分析', first: '经营决策舱', other: 'AI 数据问答 (NL2SQL)' },
  { module: 'AI智能中枢', first: '工业 Copilot 助手', other: 'AI 数字员工专员' },
  { module: '消息管理', first: '统一收件箱', other: '消息路由与规则配置' },
];

const demand = {
  id: '583cf2e9-0000-0000-0000-000000000000',
  code: 'DM-NAVIGATION-REGRESSION',
  sourceType: 'SALES_ORDER_SHORTAGE',
  productId: 'FG001',
  productName: '工业控制器',
  qty: '10',
  uom: 'PCS',
  dueDate: '2026-10-18',
  priority: 100,
  status: 'PLANNED',
  version: 1,
  mrpTaskId: 'navigation-recovery-task',
  source: { salesOrderId: 'SO-NAVIGATION', inventoryFactVersion: 3 },
};
const task = {
  id: demand.mrpTaskId,
  status: 'SUCCEEDED',
  result: { mpsLines: [{ demandId: demand.id, plannedQty: demand.qty, dueDate: demand.dueDate }] },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];
  const businessWrites = [];
  let recoveredTasks = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'GET' && !new URL(request.url()).pathname.startsWith('/api/v1/session/')) {
      businessWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await page.route('**/api/v1/production/demands?*', route =>
    route.fulfill({ json: { items: [demand], total: 1 } }));
  await page.route(`**/api/v1/production/tasks/${demand.mrpTaskId}`, async route => {
    // Restoring this result changes the cross-module business context after initial render.
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ json: task });
    recoveredTasks += 1;
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const captcha = page.locator('img[src^="data:image"]').first();
  await captcha.waitFor();
  const image = await captcha.getAttribute('src');
  const captchaCode = decodeURIComponent(image.split(',').slice(1).join(','))
    .match(/letter-spacing="7">([^<]+)</)?.[1];
  assert.ok(captchaCode, 'A readable local development captcha is required');
  await page.locator('input').nth(0).fill(process.env.NAVIGATION_TEST_ACCOUNT || 'test01');
  await page.locator('input').nth(1).fill(process.env.NAVIGATION_TEST_PASSWORD || '123456');
  await page.locator('input').nth(2).fill(captchaCode);
  await page.getByRole('button', { name: '立即登录', exact: true }).click();
  const sidebar = page.locator('aside');
  await sidebar.getByRole('button', { name: '销售管理', exact: true }).waitFor();

  const assertSelected = async (name) => {
    const button = page.getByRole('button', { name, exact: true });
    await button.waitFor();
    await page.waitForFunction((label) => {
      const element = Array.from(document.querySelectorAll('button'))
        .find(item => item.textContent.trim() === label);
      return element?.classList.contains('bg-blue-600')
        || element?.classList.contains('bg-[#2563EB]');
    }, name);
  };
  const assertHome = async (section) => {
    await assertSelected(section.first);
    if (section.param) {
      assert.equal(new URL(page.url()).searchParams.get(section.param), section.home);
    }
    for (const key of ['focusOrder', 'focusMps', 'focusPr', 'sourceOrder', 'warehouseId', 'focusId', 'focusNo']) {
      assert.equal(new URL(page.url()).searchParams.has(key), false, `Menu entry must clear ${key}`);
    }
  };

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const section of sections) {
      await sidebar.getByRole('button', { name: section.module, exact: true }).click();
      await assertHome(section);
      await page.getByRole('button', { name: section.other, exact: true }).click();
      await assertSelected(section.other);
      await sidebar.getByRole('button', { name: section.module, exact: true }).click();
      await assertHome(section);
      await sidebar.getByRole('button', { name: '工作台', exact: true }).click();
      await sidebar.getByRole('button', { name: section.module, exact: true }).click();
      await assertHome(section);
    }
    await sidebar.getByRole('button', { name: '生产管理', exact: true }).click();
    await page.getByRole('button', { name: '缺料转采购申请', exact: true }).waitFor();
    await assertHome(sections[1]);
    await page.screenshot({ path: new URL(`production-${viewport.width}.png`, outputDirectory).pathname });
    await sidebar.getByRole('button', { name: '库存管理', exact: true }).click();
    await assertHome(sections[2]);
    await page.screenshot({ path: new URL(`inventory-${viewport.width}.png`, outputDirectory).pathname });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    console.log(`${viewport.width}x${viewport.height}: all module entries and repeated clicks passed`);
  }

  // Deep links and browser history restore intentional subpages.
  await page.goto(`${baseUrl}/?module=production&production=plan&focusMps=${demand.code}`);
  await assertSelected('主计划(MPS)');
  assert.equal(new URL(page.url()).searchParams.get('production'), 'mps');
  await sidebar.getByRole('button', { name: '生产管理', exact: true }).click();
  await assertHome(sections[1]);
  await page.goBack();
  await assertSelected('主计划(MPS)');

  await page.goto(`${baseUrl}/?module=inventory&inventory=outbound&sourceOrder=SO-NAVIGATION`);
  await assertSelected('出库管理');
  await page.reload();
  await assertSelected('出库管理');
  await sidebar.getByRole('button', { name: '库存管理', exact: true }).click();
  await assertHome(sections[2]);

  await page.setViewportSize({ width: 800, height: 900 });
  await page.getByLabel('切换业务模块').selectOption({ label: '财务管理' });
  await assertHome(sections[4]);
  await page.getByRole('button', { name: sections[4].other, exact: true }).click();
  await page.getByLabel('切换业务模块').selectOption({ label: '库存管理' });
  await assertHome(sections[2]);
  await page.getByLabel('切换业务模块').selectOption({ label: '财务管理' });
  await assertHome(sections[4]);

  assert.ok(recoveredTasks > 0, 'Asynchronous plan restoration must have executed');
  assert.deepEqual(businessWrites, [], 'Navigation verification must not write business data');
  assert.deepEqual(pageErrors, []);
  console.log('Background restoration, deep links, refresh, browser history and mobile navigation passed');
} finally {
  await browser.close();
}
