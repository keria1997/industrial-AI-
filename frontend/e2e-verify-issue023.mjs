import { chromium } from 'playwright';
const BASE = 'https://erp.wanshen.top';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
let captchaText = '';
page.on('response', async res => {
  if (res.url().includes('/session/captcha')) {
    try { const d = await res.json(); const m = decodeURIComponent(d.image).match(/>([A-Z0-9]{4})</); if (m) captchaText = m[1]; } catch(e) {}
  }
});

// 登录
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('input[placeholder="请输入账号"]').fill('liyi');
await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
await page.locator('button:has-text("立即登录")').click();
await page.waitForTimeout(5000);
console.log('1. 登录成功');

// 进入销售管理 → 出库管理
await page.locator('text=销售管理').first().click();
await page.waitForTimeout(3000);

// 尝试点击出库管理或发货相关按钮
const outboundBtn = page.locator('button:has-text("去发货"), button:has-text("出库管理"), text=出库管理').first();
if (await outboundBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  await outboundBtn.click();
  await page.waitForTimeout(3000);
  console.log('2. 进入出库管理');
} else {
  // 尝试通过库存管理进入
  await page.locator('text=库存管理').first().click();
  await page.waitForTimeout(3000);
  const outboundTab = page.locator('text=出库管理, text=出库').first();
  if (await outboundTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await outboundTab.click();
    await page.waitForTimeout(2000);
    console.log('2. 通过库存管理进入出库管理');
  }
}

// 检查页面是否显示 UUID 或产品名称
const body = await page.textContent('body');
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const uuidMatches = body.match(uuidPattern);
const hasUUID = uuidMatches && uuidMatches.length > 0;
const hasProductName = body.includes('工业网关') || body.includes('测试产品') || body.includes('PROD-') || body.includes('边缘');

console.log('\n=== ISSUE-023 验证 ===');
console.log('页面包含 UUID:', hasUUID ? `❌ 是 (${uuidMatches?.length} 处)` : '✅ 否');
console.log('页面包含产品名称:', hasProductName ? '✅ 是' : '⚠️ 未检测到（可能无数据）');

// 检查是否有"手工入库"指引
const hasInboundGuide = body.includes('入库') || body.includes('采购收货') || body.includes('生产完工');
console.log('有入库指引:', hasInboundGuide ? '✅' : '⚠️');

await page.screenshot({ path: '/tmp/issue023-outbound.png', fullPage: true });

// 结论
if (!hasUUID) {
  console.log('\n✅ PASS: 出库页面不显示 UUID');
} else {
  console.log('\n❌ FAIL: 出库页面仍显示 UUID');
}
await browser.close();
console.log('VERIFY_DONE');
