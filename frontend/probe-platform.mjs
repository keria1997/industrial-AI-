import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const capRes = await fetch('http://127.0.0.1:8081/api/v1/session/captcha', { method: 'POST' });
const cap = await capRes.json();
const code = decodeURIComponent(cap.image).match(/>([A-Z0-9]{4})<\/text>/)?.[1] || 'XXXX';
const loginRes = await fetch('http://127.0.0.1:8081/api/v1/session/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account:'test01',password:'123456',captchaId:cap.captchaId,captchaCode:code}) });
const login = await loginRes.json();
const session = { accessToken: login.accessToken, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(s => sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)), session);
await page.goto('http://127.0.0.1:5173/?module=platform', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/platform-page.png', fullPage: true });
// Dump all visible text
const text = await page.evaluate(() => document.body.innerText.substring(0, 3000));
console.log('=== PAGE TEXT ===');
console.log(text);
// Dump all visible buttons
const btns = await page.$$eval('button', els => els.filter(e => e.offsetParent !== null).map(e => ({ text: e.textContent?.trim().substring(0,50), tag: e.tagName })));
console.log('\n=== VISIBLE BUTTONS ===');
btns.forEach(b => console.log(`  [${b.tag}] ${b.text}`));
await browser.close();
