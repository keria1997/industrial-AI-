import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const apiCalls = [];
const findings = [];

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
const session = { accessToken: login.accessToken, account: 'test01', name: 'test01', role: '超级管理员', tenantIds: ['TENANT-SHWS'], tenantName: '演示', permissions: ['*'], permissionVersion: '1', expiresAt: new Date(Date.now()+8*3600000).toISOString(), loginAt: new Date().toISOString(), loginType: 'account', permissionSource: 'dev' };

// Navigate to personnel
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate((s) => { sessionStorage.setItem('industrial-ai-session:v2', JSON.stringify(s)); }, session);
await page.goto('http://127.0.0.1:5173/?module=personnel', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Find all tab buttons
const tabButtons = await page.$$eval('button', btns => 
  btns.filter(b => b.offsetParent !== null).map(b => ({ text: b.textContent?.trim(), visible: b.offsetParent !== null }))
);

// Check visible tabs
const personnelTabs = tabButtons.filter(t => 
  ['人员监控舱','员工档案表','考勤与排班','资质技能','部门/岗位'].some(k => t.text?.includes(k))
);
console.log('=== 可见页签 ===');
personnelTabs.forEach(t => console.log(`  ${t.text}`));

// Screenshot each tab
const tabIds = ['人员监控舱','员工档案表','考勤与排班','资质技能'];
for (const tabName of tabIds) {
  const btn = await page.$(`button:has-text("${tabName}")`);
  if (btn) {
    await btn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/personnel-${tabName}.png` });
    
    // Check visible content
    const content = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    
    // PRD checks
    if (tabName === '人员监控舱') {
      const has342 = content.includes('342');
      const hasReal3 = content.includes('3');
      findings.push({ tab: tabName, check: '统计卡片数据来源', prd: '应从 API 获取在职人数', actual: has342 ? '显示342人（硬编码）' : hasReal3 ? '可能显示真实数据' : '未确定', pass: !has342 });
      const hasAttendance = content.includes('出勤率');
      findings.push({ tab: tabName, check: '考勤相关内容', prd: 'PRD 7.8.1: 考勤排班不在本期需求', actual: hasAttendance ? '包含出勤率数据（应移除）' : '无', pass: !hasAttendance });
    }
    if (tabName === '员工档案表') {
      const hasZhang = content.includes('张工');
      const hasLi = content.includes('李敏');
      const hasWang = content.includes('王强');
      const hasAddBtn = content.includes('新增');
      const hasImportBtn = content.includes('导入');
      const hasExportBtn = content.includes('导出');
      const hasSearch = content.includes('搜索') || content.includes('关键词');
      findings.push({ tab: tabName, check: 'API数据显示', prd: '显示数据库3名员工', actual: `张工:${hasZhang} 李敏:${hasLi} 王强:${hasWang}`, pass: hasZhang && hasLi });
      findings.push({ tab: tabName, check: '操作按钮', prd: 'PRD 7.8.4: 新增/编辑/删除/导入/导出', actual: `新增:${hasAddBtn} 导入:${hasImportBtn} 导出:${hasExportBtn}`, pass: hasAddBtn });
      findings.push({ tab: tabName, check: '筛选搜索', prd: 'PRD 7.8.7: 关键词/状态筛选', actual: hasSearch ? '有搜索' : '无搜索', pass: hasSearch });
    }
    if (tabName === '考勤与排班') {
      findings.push({ tab: tabName, check: '考勤排班存在性', prd: 'PRD 7.8.1: 考勤排班不在本期需求，应移除', actual: '页签存在且显示考勤数据', pass: false });
    }
    if (tabName === '资质技能') {
      const hasCert = content.includes('装配工艺') || content.includes('证书');
      findings.push({ tab: tabName, check: '技能数据显示', prd: '显示技能证书', actual: hasCert ? '有证书数据' : '无数据', pass: hasCert });
    }
  }
}

console.log('\n=== PRD 一致性检查 ===');
findings.forEach(f => {
  const icon = f.pass ? '✅' : '❌';
  console.log(`${icon} [${f.tab}] ${f.check}`);
  console.log(`   PRD: ${f.pr}`);
  console.log(`   实际: ${f.actual}\n`);
});

console.log('=== API 调用 ===');
apiCalls.filter(c => c.url.includes('personnel')).forEach(c => console.log(`[${c.status}] ${c.url.replace(/http[^\/]+/,'')} → ${c.body.substring(0,120)}`));

await browser.close();
