import { chromium } from 'playwright';
const BASE = 'https://erp.wanshen.top';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });

let logoRequests = [];
page.on('response', res => {
  if (res.url().includes('.png')) {
    logoRequests.push({ url: res.url(), status: res.status() });
  }
});

// 1. 登录页
console.log('=== 1. 登录页 Logo 检查 ===');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
const pngResults = logoRequests.filter(r => r.url.includes('.png'));
const allOk = pngResults.every(r => r.status === 200);
console.log('PNG 请求:', pngResults.map(r => `${r.url.split('/').pop()}:${r.status}`).join(', '));
console.log('全部 200:', allOk ? '✅' : '❌');

// 破损图片
const broken1 = await page.evaluate(() => Array.from(document.images).filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src));
console.log('破损图片:', broken1.length === 0 ? '无 ✅' : broken1);
await page.screenshot({ path: '/tmp/issue030-login.png' });

// 2. 登录后工作台
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

console.log('\n=== 2. 工作台图片检查 ===');
const broken2 = await page.evaluate(() => Array.from(document.images).filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src));
console.log('破损图片:', broken2.length === 0 ? '无 ✅' : broken2);
await page.screenshot({ path: '/tmp/issue030-workbench.png' });

// 汇总
console.log('\n===== ISSUE-030 验证结果 =====');
console.log('登录页 Logo PNG 200:', allOk ? '✅ PASS' : '❌ FAIL');
console.log('登录页破损图片:', broken1.length === 0 ? '✅ 无' : `❌ ${broken1.length} 张`);
console.log('工作台破损图片:', broken2.length === 0 ? '✅ 无' : `❌ ${broken2.length} 张`);
const overallPass = allOk && broken1.length === 0 && broken2.length === 0;
console.log('\nISSUE-030:', overallPass ? '✅ FIXED' : '❌ NOT FIXED');
await browser.close();
console.log('VERIFY_DONE');
