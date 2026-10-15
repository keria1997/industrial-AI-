import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const apiCalls = [];
page.on('response', async (res) => {
  if (res.url().includes('/api/')) {
    let body = ''; try { body = await res.text(); } catch {}
    apiCalls.push({ url: res.url(), status: res.status(), body: body.substring(0, 300) });
  }
});
// Login
const capRes = await fetch('http://127.0.0.1:8081/api/v1/session/captcha', { method: 'POST' });
const cap = await capRes.json();
const svg = decodeURIComponent(cap.image);
const code = svg.match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch('http://127.0.0.1:8081/api/v1/session/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account:'test01',password:'123456',captchaId:cap.captchaId,captchaCode:code}) });
const login = await loginRes.json();
// Navigate to personnel
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate((session) => {
  sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(session));
}, { accessToken: login.accessToken, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' });
await page.goto('http://127.0.0.1:5173/?module=personnel', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/personnel.png' });
console.log('=== API ===');
apiCalls.filter(c => c.url.includes('personnel')).forEach(c => console.log(`[${c.status}] ${c.url}\n→ ${c.body}\n`));
await browser.close();
