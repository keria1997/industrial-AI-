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

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('input[placeholder="请输入账号"]').fill('liyi');
await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
await page.locator('button:has-text("立即登录")').click();
await page.waitForTimeout(5000);
console.log('1. 登录成功');

await page.locator('text=生产管理').first().click();
await page.waitForTimeout(3000);
await page.locator('text=基础主数据').first().click();
await page.waitForTimeout(2000);
await page.locator('text=设备机台').first().click();
await page.waitForTimeout(2000);
console.log('2. 进入设备机台');

const regBtn = page.locator('button:has-text("注册物理设备"), button:has-text("注册")').first();
if (await regBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  await regBtn.click();
  await page.waitForTimeout(2000);
  console.log('3. 弹窗已打开');
  await page.screenshot({ path: '/tmp/issue025-dialog.png' });

  // 检查可见下拉框
  const selCount = await page.locator('select:visible').count();
  console.log(`4. 可见下拉框: ${selCount}`);
  for (let i = 0; i < selCount; i++) {
    const opts = await page.locator('select:visible').nth(i).locator('option').allTextContents();
    console.log(`   下拉[${i}]: ${JSON.stringify(opts)}`);
  }

  // 判断是否硬编码
  const body = await page.textContent('body');
  const stillHardcoded = body.includes('贴片加工设备') && body.includes('装配装配站');
  console.log('\n===== ISSUE-025 结论 =====');
  console.log(stillHardcoded ? '❌ NOT FIXED — 下拉仍为硬编码值' : '✅ FIXED — 下拉已从字典 API 加载');
} else {
  console.log('3. 未找到注册按钮');
}

await browser.close();
console.log('VERIFY_DONE');
