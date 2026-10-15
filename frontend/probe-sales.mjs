import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const apiCalls = [];
const consoleErrors = [];

page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('/api/')) {
    let body = '';
    try { body = await res.text(); } catch {}
    apiCalls.push({ url, status: res.status(), body: body.substring(0, 200) });
  }
});

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// Step 1: Get captcha and extract code from SVG
const captchaRes = await fetch('http://127.0.0.1:8081/api/v1/session/captcha', { method: 'POST' });
const captchaData = await captchaRes.json();
const svg = decodeURIComponent(captchaData.image);
const codeMatch = svg.match(/>([A-Z0-9]{4})<\/text>/);
const captchaCode = codeMatch ? codeMatch[1] : 'XXXX';
console.log('Captcha ID:', captchaData.captchaId, 'Code:', captchaCode);

// Step 2: Login via API to get token
const loginRes = await fetch('http://127.0.0.1:8081/api/v1/session/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'test01', password: '123456', captchaId: captchaData.captchaId, captchaCode })
});
const loginData = await loginRes.json();
console.log('Login status:', loginRes.status);
if (loginData.error) { console.log('Login error:', JSON.stringify(loginData.error)); await browser.close(); process.exit(1); }
const token = loginData.accessToken;
const tenantId = loginData.user?.tenantIds?.[0] || 'TENANT-SHWS';
console.log('Token obtained, tenant:', tenantId);

// Step 3: Inject session into page and navigate
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(([t, tid]) => {
  sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(t));
}, [{ accessToken: token, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: [tenantId], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' }]);
await page.goto('http://127.0.0.1:5173/?module=sales', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Step 4: Screenshot
await page.screenshot({ path: '/tmp/sales-dashboard.png', fullPage: false });

// Step 5: Report
console.log('\n=== API CALLS ===');
apiCalls.forEach(c => console.log(`[${c.status}] ${c.url}\n  → ${c.body}\n`));
console.log('=== CONSOLE ERRORS ===');
consoleErrors.forEach(e => console.log(e));
console.log('\n=== SCREENSHOT saved to /tmp/sales-dashboard.png ===');

await browser.close();
