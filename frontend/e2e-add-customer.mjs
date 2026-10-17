import { chromium } from 'playwright';
const BASE = 'http://124.222.114.67';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Collect console errors
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

// Intercept captcha
let captchaText = '';
page.on('response', async (res) => {
  if (res.url().includes('/session/captcha')) {
    try {
      const d = await res.json();
      const svg = decodeURIComponent(d.image);
      const m = svg.match(/>([A-Z0-9]{4})</);
      if (m) captchaText = m[1];
    } catch(e) {}
  }
});

// Login
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('input[placeholder="请输入账号"]').fill('liyi');
await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
await page.locator('button:has-text("立即登录")').click();
await page.waitForTimeout(5000);
console.log('1. 登录后 URL:', page.url());

// Navigate to Sales > Customers
await page.locator('text=销售管理').first().click();
await page.waitForTimeout(2000);
const custTab = page.locator('text=客户管理').first();
await custTab.click();
await page.waitForTimeout(2000);
console.log('2. 已进入客户管理');

// Check for "新增客户" button and click it
const addBtn = page.locator('button:has-text("新增客户"), button:has-text("新建客户"), button:has-text("新增")').first();
if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  console.log('3. 找到新增按钮，点击...');
  await addBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-add-customer-form.png' });

  // Fill the form if visible
  const nameInput = page.locator('input[placeholder*="客户名称"], input[placeholder*="名称"]').first();
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill('测试客户A');
    console.log('4. 填写客户名称');
    // Try to find and click save button
    const saveBtn = page.locator('button:has-text("保存"), button:has-text("创建"), button:has-text("确定")').first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      console.log('5. 点击保存');
    }
  } else {
    console.log('4. 未找到表单输入框');
  }
  await page.screenshot({ path: '/tmp/e2e-add-customer-result.png' });
} else {
  console.log('3. 未找到新增按钮');
  // List all visible buttons
  const btns = await page.locator('button:visible').allTextContents();
  console.log('   可见按钮:', btns.slice(0, 10).join(', '));
}

// Check for crypto error
const cryptoErrors = errors.filter(e => e.includes('crypto') || e.includes('randomUUID'));
console.log('=== crypto 错误 ===', cryptoErrors.length === 0 ? '无 ✅' : cryptoErrors);
console.log('=== 全部 console 错误 ===', errors.length === 0 ? '无 ✅' : errors.slice(0, 3));

await page.screenshot({ path: '/tmp/e2e-customer-final.png' });
await browser.close();
console.log('TEST_DONE');
