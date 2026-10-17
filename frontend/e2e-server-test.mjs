import { chromium } from 'playwright';
const BASE = 'http://124.222.114.67';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

let captchaText = '';
page.on('response', async (res) => {
  if (res.url().includes('/session/captcha')) {
    try {
      const d = await res.json();
      const svg = decodeURIComponent(d.image);
      const m = svg.match(/>([A-Z0-9]{4})</);
      if (m) captchaText = m[1];
      console.log('   验证码:', captchaText);
    } catch(e) {}
  }
});

console.log('1. 打开登录页...');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/e2e-01-login.png' });

console.log('2. 填写表单, captcha:', captchaText);
await page.locator('input[placeholder="请输入账号"]').fill('liyi');
await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);

console.log('3. 点击登录...');
await page.locator('button:has-text("立即登录")').click();
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/e2e-02-after-login.png' });
console.log('4. URL:', page.url());

const salesNav = page.locator('text=销售管理').first();
if (await salesNav.isVisible({ timeout: 5000 }).catch(() => false)) {
  await salesNav.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/e2e-03-sales.png', fullPage: true });
  const body = await page.textContent('body');
  console.log('5. 数据待核实:', body.includes('数据待核实'));
  console.log('5. 生效报价数:', body.includes('生效报价数'));
  console.log('5. 订单销售额:', body.includes('订单销售额'));
  if (body.includes('数据待核实')) {
    const w = body.match(/销售统计数据待核实[^\n]*/);
    if (w) console.log('   警告:', w[0].substring(0, 120));
  }
} else {
  console.log('未找到销售管理。页面:', (await page.textContent('body')).substring(0, 200));
}
await page.screenshot({ path: '/tmp/e2e-05-final.png', fullPage: true });
await browser.close();
console.log('E2E_DONE');
