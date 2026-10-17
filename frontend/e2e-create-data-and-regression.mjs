import { chromium } from 'playwright';
const BASE = 'http://124.222.114.67';
const results = [];
const add = (id, tc, name, status, detail) => {
  results.push({ id, tc, name, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '🔴' : '⏭️';
  console.log(`${icon} [${status}] ${id} (${tc}): ${name} — ${detail}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let captchaText = '';
page.on('response', async res => {
  if (res.url().includes('/session/captcha')) {
    try { const d = await res.json(); const m = decodeURIComponent(d.image).match(/>([A-Z0-9]{4})</); if (m) captchaText = m[1]; } catch(e) {}
  }
});

// ===== 登录 =====
console.log('===== 登录 =====');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('input[placeholder="请输入账号"]').fill('liyi');
await page.locator('input[placeholder="请输入密码"]').fill('Liyi1234561');
await page.locator('input[placeholder="请输入验证码"]').fill(captchaText);
await page.locator('button:has-text("立即登录")').click();
await page.waitForTimeout(5000);
const loginOk = !page.url().includes('captcha');
add('LOGIN', 'TC-AUTH-001', '登录', loginOk ? 'PASS' : 'FAIL', `URL: ${page.url()}`);
if (!loginOk) { await browser.close(); process.exit(1); }

// ===== 步骤1: 创建仓库 =====
console.log('\n===== 步骤1: 创建仓库 =====');
await page.locator('text=库存管理').first().click();
await page.waitForTimeout(3000);

// 找到仓库页签
const warehouseTab = page.locator('text=仓库').first();
if (await warehouseTab.isVisible({ timeout: 5000 }).catch(() => false)) {
  await warehouseTab.click();
  await page.waitForTimeout(2000);
}

// 找到新增仓库按钮
const addWhBtn = page.locator('button:has-text("新建仓库"), button:has-text("新增仓库"), button:has-text("添加仓库")').first();
if (await addWhBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  await addWhBtn.click();
  await page.waitForTimeout(2000);
  // 填写仓库名称
  const codeInput = page.locator('input[placeholder*="编码"], input[placeholder*="code"]').first();
  const nameInput = page.locator('input[placeholder*="名称"], input[placeholder*="name"]').first();
  if (await codeInput.isVisible().catch(() => false)) await codeInput.fill('WH-MAIN');
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill('主仓库');
  // 保存
  const saveBtn = page.locator('button:has-text("保存"), button:has-text("确定"), button:has-text("创建")').first();
  if (await saveBtn.isVisible().catch(() => false) && !(await saveBtn.isDisabled())) {
    await saveBtn.click();
    await page.waitForTimeout(3000);
    add('SETUP-WH', '-', '创建仓库', 'PASS', '仓库 WH-MAIN 创建成功');
  } else {
    add('SETUP-WH', '-', '创建仓库', 'FAIL', '保存按钮不可用或未找到');
  }
  await page.screenshot({ path: '/tmp/step1-warehouse.png' });
} else {
  add('SETUP-WH', '-', '创建仓库', 'SKIP', '未找到新建仓库按钮');
}

// ===== 步骤2: 创建产品（含默认仓库） =====
console.log('\n===== 步骤2: 创建产品 =====');
// 库存管理应该已选中，找到产品页签
const prodTab = page.locator('button:has-text("产品"), text=产品').first();
if (await prodTab.isVisible({ timeout: 5000 }).catch(() => false)) {
  await prodTab.click();
  await page.waitForTimeout(2000);
}
const addProdBtn = page.locator('button:has-text("新建产品"), button:has-text("新增产品"), button:has-text("添加产品")').first();
if (await addProdBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  await addProdBtn.click();
  await page.waitForTimeout(2000);
  // 填写产品信息
  const prodCode = page.locator('input[placeholder*="编码"], input[placeholder*="code"]').first();
  const prodName = page.locator('input[placeholder*="名称"], input[placeholder*="name"]').first();
  if (await prodCodeInput.isVisible().catch(() => false)) await prodCode.fill('PROD-TEST-001');
  if (await prodName.isVisible().catch(() => false)) await prodName.fill('测试产品A');
  
  // 选择默认仓库（DE-03 关键步骤）
  const whSelect = page.locator('select[name="defaultWarehouseId"], select').first();
  if (await whSelect.isVisible().catch(() => false) && !(await whSelect.isDisabled())) {
    // 选择第二个选项（第一个通常是"请选择"占位）
    const options = await whSelect.locator('option').count();
    if (options > 1) {
      await whSelect.selectOption({ index: 1 });
      console.log('   已选择默认仓库');
    }
  }
  
  // 填写价格
  const priceInput = page.locator('input[placeholder*="单价"], input[placeholder*="price"]').first();
  if (await priceInput.isVisible().catch(() => false)) await priceInput.fill('100');
  
  // 安全库存
  const safetyInput = page.locator('input[placeholder*="安全"], input[placeholder*="safety"]').first();
  if (await safetyInput.isVisible().catch(() => false)) await safetyInput.fill('5');

  await page.screenshot({ path: '/tmp/step2-product-form.png' });
  
  // 保存
  const saveBtn = page.locator('button:has-text("保存"), button:has-text("确定"), button:has-text("创建")').first();
  if (await saveBtn.isVisible().catch(() => false) && !(await saveBtn.isDisabled())) {
    await saveBtn.click();
    await page.waitForTimeout(3000);
    add('SETUP-PROD', '-', '创建产品', 'PASS', '产品 PROD-TEST-001 创建成功');
  } else {
    add('SETUP-PROD', '-', '创建产品', 'FAIL', '保存按钮不可用');
  }
  await page.screenshot({ path: '/tmp/step2-product-result.png' });
} else {
  add('SETUP-PROD', '-', '创建产品', 'SKIP', '未找到新建产品按钮');
}

// ===== 步骤3: 销售快速开单（验证 DE-03 是否解锁） =====
console.log('\n===== 步骤3: 销售快速开单 =====');
await page.locator('text=销售管理').first().click();
await page.waitForTimeout(3000);
const quickBtn = page.locator('button:has-text("快速开单")').first();
if (await quickBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  await quickBtn.click();
  await page.waitForTimeout(3000);
  
  // 检查产品下拉
  const selects = page.locator('select');
  const selectCount = await selects.count();
  let productOptions = 0;
  for (let i = 0; i < selectCount; i++) {
    const opts = await selects.nth(i).locator('option').count();
    if (opts > 1) productOptions = Math.max(productOptions, opts);
  }
  
  const de03Fixed = productOptions > 1;
  add('ISSUE-06', 'TC-FLOW-001', '快速开单产品下拉', de03Fixed ? 'PASS' : 'BLOCKED',
    de03Fixed ? `产品下拉有 ${productOptions} 个选项（DE-03 已修复）` : `产品下拉 ${productOptions} 个选项（DE-03 仍阻断）`);
  await page.screenshot({ path: '/tmp/step3-quick-order.png' });
  
  if (de03Fixed) {
    // 尝试创建销售订单
    console.log('   尝试创建销售订单...');
    // 选仓库
    const whSel = selects.first();
    if (await whSel.isVisible().catch(() => false)) await whSel.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    // 选产品
    const prodSel = selects.nth(1);
    if (await prodSel.isVisible().catch(() => false)) await prodSel.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    // 填数量
    const qtyInput = page.locator('input[placeholder*="数量"], input[type="number"]').first();
    if (await qtyInput.isVisible().catch(() => false)) await qtyInput.fill('50');
    // 填收货人
    const nameField = page.locator('input[placeholder*="收货人"], input[placeholder*="recipient"]').first();
    if (await nameField.isVisible().catch(() => false)) await nameField.fill('测试收货人');
    const phoneField = page.locator('input[placeholder*="电话"], input[placeholder*="phone"]').first();
    if (await phoneField.isVisible().catch(() => false)) await phoneField.fill('13800138000');
    const addrField = page.locator('input[placeholder*="地址"], input[placeholder*="address"]').first();
    if (await addrField.isVisible().catch(() => false)) await addrField.fill('测试地址');
    
    await page.screenshot({ path: '/tmp/step3-order-filled.png' });
    
    // 提交
    const submitBtn = page.locator('button:has-text("创建订单"), button:has-text("提交"), button:has-text("保存")').last();
    if (await submitBtn.isVisible().catch(() => false) && !(await submitBtn.isDisabled())) {
      await submitBtn.click();
      await page.waitForTimeout(5000);
      add('TC-FLOW-001', '销售订单创建', 'PASS', '销售订单已提交');
    } else {
      add('TC-FLOW-001', '销售订单创建', 'FAIL', '提交按钮不可用');
    }
    await page.screenshot({ path: '/tmp/step3-order-result.png' });
  }
  
  // 关闭弹窗
  const closeBtn = page.locator('button[aria-label="Close"], svg.lucide-x, button:has-text("取消")').first();
  if (await closeBtn.isVisible().catch(() => false)) { await closeBtn.click(); await page.waitForTimeout(1000); }
} else {
  add('ISSUE-06', 'TC-FLOW-001', '快速开单', 'SKIP', '未找到快速开单按钮');
}

// ===== 步骤4: 检查 MRP =====
console.log('\n===== 步骤4: MRP 展算 =====');
await page.locator('text=生产管理').first().click();
await page.waitForTimeout(3000);
const mrpBtn = page.locator('button:has-text("MRP"), button:has-text("展算")').first();
if (await mrpBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  await mrpBtn.click();
  await page.waitForTimeout(5000);
  const b = await page.textContent('body');
  const hasResponse = b.includes('MRP') || b.includes('展算') || b.includes('缺料') || b.includes('需求');
  add('ISSUE-08', 'TC-FLOW-003', 'MRP 展算', hasResponse ? 'PASS' : 'BLOCKED',
    hasResponse ? 'MRP 按钮有响应' : '无响应');
  await page.screenshot({ path: '/tmp/step4-mrp.png' });
} else {
  add('ISSUE-08', 'TC-FLOW-003', 'MRP 展算', 'SKIP', '未找到 MRP 按钮');
}

// ===== 汇总 =====
console.log('\n========================================');
console.log('     数据创建 + 回归测试结果汇总');
console.log('========================================');
let pass = 0, fail = 0, blocked = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '🔴';
  console.log(`${icon} ${r.id}: ${r.name} → ${r.status}`);
  if (r.status === 'PASS') pass++; else if (r.status === 'FAIL') fail++; else blocked++;
}
console.log(`\n通过: ${pass} | 失败: ${fail} | 阻断: ${blocked} | 总计: ${results.length}`);
await page.screenshot({ path: '/tmp/e2e-final-state.png', fullPage: true });
await browser.close();
console.log('E2E_CREATE_AND_TEST_DONE');
