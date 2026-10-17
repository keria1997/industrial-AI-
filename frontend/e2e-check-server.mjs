import { chromium } from 'playwright';

const BASE = 'http://124.222.114.67';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// 1. 打开登录页
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: '/tmp/e2e-01-login.png', fullPage: true });
console.log('1. 登录页截图完成');

// 2. 填写账号密码
const accountInput = page.locator('input[placeholder*="账号"], input[name="account"], input[type="text"]').first();
await accountInput.fill('liyi');
const passwordInput = page.locator('input[type="password"]').first();
await passwordInput.fill('Liyi1234561');
console.log('2. 表单填写完成');

// 3. 填写验证码（如果有）
const captchaInput = page.locator('input[placeholder*="验证码"]');
if (await captchaInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  await captchaInput.fill('DEMO');
  console.log('3. 验证码已填写（DEMO）');
}

// 4. 点击登录
const loginBtn = page.locator('button:has-text("登录"), button:has-text("立即登录")').first();
await loginBtn.click();
console.log('4. 点击登录');

// 5. 等待跳转
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/e2e-02-after-login.png', fullPage: true });
console.log('5. 登录后截图完成, URL:', page.url());

// 6. 导航到销售管理
const salesNav = page.locator('text=销售管理').first();
if (await salesNav.isVisible({ timeout: 5000 }).catch(() => false)) {
  await salesNav.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/e2e-03-sales.png', fullPage: true });
  console.log('6. 销售管理页面截图完成');

  // 7. 检查关键内容
  const bodyText = await page.textContent('body');
  const hasWarning = bodyText.includes('数据待核实');
  const hasStats = bodyText.includes('生效报价数') || bodyText.includes('订单销售额');
  console.log('7a. 包含"数据待核实"警告:', hasWarning);
  console.log('7b. 包含统计卡片:', hasStats);
} else {
  console.log('6. 未找到销售管理导航，可能登录失败');
  const bodyText = await page.textContent('body');
  console.log('页面文字片段:', bodyText.substring(0, 300));
}

await browser.close();
console.log('E2E_CHECK_DONE');
