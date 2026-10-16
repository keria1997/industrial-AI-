import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, AppShellHeader, AppShellMain, AppShellSidebar } from './app/AppShell';
import { SidebarItem } from './app/SidebarItem';
import { tenantOptions, useAppRuntime } from './app/AppRuntimeProvider';
import { getModulesForRole, isRoleName } from './app/moduleRegistry';
import PlatformManagementV2 from './platform/PlatformManagement';
import {
  ProductionApiError,
  createSalesOrderIntake,
  listProductionDemands,
} from './api/production/salesProduction';
import { productionOperationsApi } from './api/production/operations';
import { formalProductionOrder, formalProductionJob, formalProductionInspection } from './features/production/model/formalProduction';
import { useFormalProduction } from './features/production/model/useFormalProduction';
import { ProductionReportModal } from './features/production/components/ProductionReportModal';
import { FormalBomPanel } from './features/production/components/FormalBomPanel';
import { procurementApi } from './api/procurement';
import { clearAuthenticatedSession, completeFirstLogin, loginWithPassword, loginWithSms, registerTenant, requestLoginCaptcha, requestPasswordReset, resetPasswordByEmail, saveAuthenticatedSession, sendSmsCode, type LoginCaptcha } from './api/session';
import * as financeApi from './api/finance';
import { messagesApi } from "./api/messages";
import { personnelApi } from "./api/personnel";
import { supplyChainApi } from "./api/supply-chain";
import { workbenchApi, type WorkbenchDashboardDto, type WorkbenchRole } from './api/workbench';
import { useSalesOrders, useInventoryAvailability, useProductionDemands, useWorkOrders } from './hooks/useApiData';
import { AIHubManagement as AIHubManagementV2, AIAssistantDrawer } from './features/ai-hub';
import {
  approveFulfillmentOrder,
  cancelFulfillmentOrder,
  checkAndReserveShipmentTask,
  confirmFulfillmentOrder,
  createFulfillmentOrder,
  createFulfillmentShipmentRequest,
  createProductionRequestForTask,
  getFulfillmentOutbound,
  getFulfillmentOrder,
  listFulfillmentOrders,
  listFulfillmentShipmentTasks,
  postFulfillmentOutbound,
  inventoryApi,
  type FulfillmentOrder,
  type FulfillmentShipmentTask,
} from './api/fulfillment';
import {
  createPendingSalesOrderFromQuote,
  createSalesTabUrl,
  getQuoteStatus as getSalesQuoteStatus,
  getSalesOrderActions,
  isSalesOrderEditable,
  isQuoteConvertible,
  resolveSalesTab,
  salesOrderStatuses,
  validateShipmentDeliveryDate,
} from './features/sales/model/salesRules';
import { SalesShipmentOrderEditModal } from './features/sales/components/SalesShipmentOrderEditModal';
import { RmaManagementPanel } from './features/sales/components/RmaManagementPanel';
import { CustomerReceiptPanel } from './features/sales/components/CustomerReceiptPanel';
import { CostAccumulationPanel } from './features/production/components/CostAccumulationPanel';
import { PaymentAllocationModal } from './features/finance/components/PaymentAllocationModal';
import { confirmSalesOrderContents, mergeFormalSalesOrders, mergePersistedSalesOrders, requestSalesShipment, upsertSalesOrder } from './features/sales/model/formalOrderWorkflow';
import { salesOrderPricingInput } from './features/sales/model/salesOrderPricing';
import { createQuickSalesOrder } from './features/sales/model/quickSalesOrder';
import {
  completeSalesOutbound,
  createInventoryTabUrl,
  createInventoryWarehouseUrl,
  createSalesOutboundNavigationQuery,
  formatSalesOutboundDateTime,
  loadSalesOutboundTasks,
  removeSalesOutboundBySource,
  cancelSalesOutbound,
  recordWarehouseProductionResult,
  resolveInventoryTab,
  resolveInventoryWarehouseId,
  resolveSalesOutboundOrderId,
} from './features/inventory/model/salesOutboundBridge';
import { InventoryMasterDataPanel } from './features/inventory/pages/InventoryMasterDataPanel';
import { InventoryStockQueryPanel } from './features/inventory/pages/InventoryStockQueryPanel';
import { useFormalInventory } from './features/inventory/model/useFormalInventory';
import { resolveWarehouse } from './features/inventory/model/formalInventory';
import { loadInventoryMasterData } from './features/inventory/model/inventoryMasterData';
import { mapInventoryMasterToQuoteOptions } from './features/sales/model/salesInventoryOptions';
import { classifyOutboundShipment } from './features/inventory/model/outboundShipmentAction';
import { mapFormalShipmentStatus } from './features/inventory/model/formalShipmentStatus';
import { postFormalOutbound, prepareFormalOutbound } from './features/inventory/model/formalOutboundWorkflow';
import { formalShipmentStock } from './features/inventory/model/formalShipmentStock';
import { canonicalInventoryUnit } from './shared/inventoryUnits';
import { restoreShippedSalesOutbounds, syncShippedSalesOutbounds } from './features/inventory/model/shippedSalesOutboundSync';
import { compareQuantity, subtractQuantity } from './shared/decimal';
import {
  mapProductionDemandStatus,
  normalizeProductionDemandTrace,
  planningMaterialShortages,
  recoverMpsFromPlannedDemand,
  planningResultCoversDemand,
  scheduleResultCoversDemand,
} from './features/production/model/productionPlanStatus';
import {
  completeProductionMaterialIssueTask,
  createInventoryProductionPlan,
  createInventoryPurchaseRequest,
  createProductionMaterialIssueTask,
  loadInventoryPurchaseRequests,
  loadProductionMaterialIssueTasks,
  markProductionMaterialIssueTaskShortage,
  suggestInventoryReplenishmentQty,
  updateInventoryPurchaseRequestStatus,
} from './features/inventory/model/inventoryActionBridge';
import {
  recordSalesOrderProductionRequested,
  recordSalesOrderShipped,
  salesWorkspaceStorageKey,
} from './features/sales/model/salesShipmentBridge';
import {
  PLATFORM_STATE_CHANGED_EVENT,
  loadPlatformProductionLines,
  loadPlatformState,
  platformStorageKey,
} from './platform/platformSeed';
import { 
  LayoutDashboard, Database, BrainCircuit, Server, Cpu, Settings, Bell, Search, User, Plus, UploadCloud, Play, FileText, Activity, AlertTriangle, CheckCircle2, Clock, ChevronRight, MoreVertical, Zap, TrendingUp, Factory, Package, ShoppingCart, Wallet, Users, Network, MessageSquare, Target, TrendingDown, ChevronDown, Filter, Download, Box, Edit2, Trash2, X, BookOpen, Eye, Copy, Check, File, Calendar, CalendarDays, Briefcase, Phone, Send, MessageCircle, Calculator, CalendarRange, ClipboardList, Hammer, ShieldCheck, Route, MonitorCog, Bot, PlayCircle, RefreshCcw, RotateCcw, AlertCircle, Layers, CalendarCheck, GitCommit, Truck, ArrowRight, ArrowLeft, FileOutput, List, GitMerge, ScanLine, ClipboardCheck, RefreshCw, ListChecks, Microscope, Microchip, Inbox, Import, Workflow, MapPin, Timer, Coffee, FileSpreadsheet, ArrowUpCircle, ListTodo, Info, ArrowDownToLine, ArrowUpFromLine, Warehouse, ArrowRightLeft, BadgeDollarSign, FilePlus, Store, Landmark, Receipt, CreditCard, Coins, PieChart, HardHat, Fingerprint, Award, UserCheck, ShieldAlert, Link, Share2, Sparkles, Mic, Power, Wrench, Building, Key, Gauge, XCircle, Loader2, Move
} from 'lucide-react';

// ==========================================
// 公共组件区 (工作台及全局 - 统一浅色科技风)
// ==========================================

const getCardTheme = (theme) => {
    const themes = {
        blue: { iconBg: 'bg-blue-50', iconText: 'text-blue-600', iconBorder: 'border-blue-100' },
        emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', iconBorder: 'border-emerald-100' },
        amber: { iconBg: 'bg-amber-50', iconText: 'text-amber-600', iconBorder: 'border-amber-100' },
        red: { iconBg: 'bg-rose-50', iconText: 'text-rose-600', iconBorder: 'border-rose-100' },
        purple: { iconBg: 'bg-purple-50', iconText: 'text-purple-600', iconBorder: 'border-purple-100' },
    };
    return themes[theme] || themes.blue;
}

const StatCard = ({ title, value, unit, icon: Icon, trend, trendValue, theme = "blue" }: any) => {
  const { iconBg, iconText, iconBorder } = getCardTheme(theme);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between relative shadow-sm group hover:border-blue-200 hover:shadow-md transition-all h-[140px]">
      <div className="flex justify-between items-start mb-2">
        <div className="text-slate-500 text-[13px] font-bold">{title}</div>
        <div className={`p-2.5 rounded-xl ${iconBg} ${iconText} border ${iconBorder}`}>
          <Icon size={18} />
        </div>
      </div>
      <div>
        <div className="flex items-baseline">
          <span className="text-3xl font-bold text-slate-800 tracking-tight leading-none">{value}</span>
          {unit && <span className="text-slate-500 ml-1 text-sm font-medium">{unit}</span>}
        </div>
        {trendValue && (
          <div className={`text-[12px] mt-3 flex items-center font-bold ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-slate-500'}`}>
            {trend === 'up' && <Activity size={14} className="mr-1" />}
            {trend === 'down' && <AlertTriangle size={14} className="mr-1" />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const monitorToneMap = {
  blue: { shell: 'bg-blue-50 text-blue-600 border-blue-100', button: 'bg-blue-600 hover:bg-blue-700 text-white', soft: '#eff6ff', stroke: '#3b82f6' },
  emerald: { shell: 'bg-emerald-50 text-emerald-600 border-emerald-100', button: 'bg-emerald-600 hover:bg-emerald-700 text-white', soft: '#ecfdf5', stroke: '#10b981' },
  amber: { shell: 'bg-amber-50 text-amber-600 border-amber-100', button: 'bg-amber-500 hover:bg-amber-600 text-white', soft: '#fffbeb', stroke: '#f59e0b' },
  rose: { shell: 'bg-rose-50 text-rose-600 border-rose-100', button: 'bg-rose-500 hover:bg-rose-600 text-white', soft: '#fff1f2', stroke: '#f43f5e' },
  purple: { shell: 'bg-purple-50 text-purple-600 border-purple-100', button: 'bg-purple-600 hover:bg-purple-700 text-white', soft: '#f5f3ff', stroke: '#8b5cf6' },
  slate: { shell: 'bg-slate-50 text-slate-600 border-slate-100', button: 'bg-slate-800 hover:bg-slate-900 text-white', soft: '#f8fafc', stroke: '#64748b' },
};

const LoginPage = ({ onLogin, onForgotPassword, onRegister }) => {
  const [mode, setMode] = useState('account');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [captcha, setCaptcha] = useState<LoginCaptcha | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsNotice, setSmsNotice] = useState('');
  const [smsCountdown, setSmsCountdown] = useState(0);

  const refreshCaptcha = async (reportError = true) => {
    setCaptchaCode('');
    setCaptchaLoading(true);
    try {
      setCaptcha(await requestLoginCaptcha());
    } catch (captchaError) {
      setCaptcha(null);
      if (reportError) setError(captchaError instanceof Error ? captchaError.message : '验证码加载失败，请刷新重试');
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    void refreshCaptcha();
  }, []);

  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = setTimeout(() => setSmsCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [smsCountdown]);

  const handleSendSmsCode = async () => {
    if (smsSending || smsCountdown > 0) return;
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setError('请输入有效手机号');
      return;
    }
    setError('');
    setSmsNotice('');
    setSmsSending(true);
    try {
      const result = await sendSmsCode(phone.trim());
      setSmsSent(true);
      setSmsCountdown(60);
      setSmsNotice(result.devCode ? `开发验证码：${result.devCode}` : result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败，请稍后重试');
    } finally {
      setSmsSending(false);
    }
  };

  const submitLogin = async () => {
    setError('');
    if (mode === 'account') {
      if (!account.trim() || !password.trim()) {
        setError('请输入账号和密码');
        return;
      }
      if (!captcha) {
        setError('验证码未加载，请刷新验证码');
        return;
      }
      if (!captchaCode.trim()) {
        setError('请输入图形验证码');
        return;
      }
    } else {
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        setError('请输入有效手机号');
        return;
      }
      if (!smsCode.trim()) {
        setError('请输入短信验证码');
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'account') {
        await onLogin({ account: account.trim(), password, captchaId: captcha.captchaId, captchaCode: captchaCode.trim() });
      } else {
        await onLogin({ phone: phone.trim(), smsCode: smsCode.trim() });
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败，请稍后重试');
      setPassword('');
      if (mode === 'account') await refreshCaptcha(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050913] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_42%,rgba(59,130,246,0.24),transparent_22%),radial-gradient(circle_at_34%_76%,rgba(245,158,11,0.22),transparent_18%),linear-gradient(180deg,#04070d_0%,#081424_52%,#02050b_100%)]"></div>
      <div className="absolute inset-x-[-10%] bottom-[-36%] h-[72%] rounded-[50%] bg-[radial-gradient(circle_at_50%_18%,rgba(96,165,250,0.24),rgba(15,23,42,0.94)_34%,rgba(2,6,23,1)_70%)] shadow-[0_-28px_70px_rgba(59,130,246,0.20)]"></div>
      <div className="absolute inset-0 opacity-55" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)', backgroundSize: '46px 46px' }}></div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.72)_0%,rgba(2,6,23,0.25)_48%,rgba(2,6,23,0.80)_100%)]"></div>

      <div className="relative z-10 min-h-screen max-w-[1320px] mx-auto px-8 lg:px-12 flex items-center justify-between gap-10">
        <section className="hidden md:flex flex-col max-w-[520px]">
          <div className="flex items-center gap-4 mb-14">
            <img src="/login-logo.png" alt="万申股份" className="w-12 h-11 object-contain drop-shadow-[0_0_14px_rgba(56,189,248,0.35)]" />
            <div className="text-[26px] font-bold tracking-wide">万申股份</div>
          </div>
          <h1 className="text-[54px] lg:text-[62px] font-bold tracking-[0.12em] italic leading-tight">工业AI平台</h1>
          <div className="mt-6 text-[20px] font-bold tracking-wide">数据赋能、申财有道</div>
          <div className="mt-3 w-44 h-1 bg-blue-500 rounded-full shadow-[0_0_18px_rgba(59,130,246,0.8)]"></div>
          <div className="mt-9 space-y-5 text-[15px] text-blue-50/85 font-medium">
            {['人性化交互体验设计', 'AI智能系统，全新的使用体验', '新一代技术架构', '当前版本：2.0.0'].map(item => (
              <div key={item} className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-sky-400 rotate-45"></span>{item}</div>
            ))}
          </div>
          <div className="mt-16 text-[12px] text-slate-400">Copyright © 2026 万申股份. All Rights Reserved.</div>
        </section>

        <section className="w-full max-w-[430px] ml-auto bg-[#1d2743]/88 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-md">
          <div className="grid grid-cols-2 bg-white/6 rounded-lg p-1 mb-6">
            <button onClick={() => { setMode('account'); setError(''); }} className={`h-9 rounded-md text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors ${mode === 'account' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}><User size={14} />账号登录</button>
            <button onClick={() => { setMode('phone'); setError(''); }} className={`h-9 rounded-md text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors ${mode === 'phone' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}><Phone size={14} />手机号登录</button>
          </div>

          {mode === 'account' ? (
            <div className="space-y-4">
              <label className="block">
                <span className="block text-[12px] text-slate-300 font-bold mb-2">账号 (Account)</span>
                <input value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="off" placeholder="请输入账号" className="w-full h-10 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[13px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
              </label>
              <label className="block">
                <span className="block text-[12px] text-slate-300 font-bold mb-2">密码 (Password)</span>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="请输入密码" className="w-full h-10 rounded-md bg-[#273353] border border-slate-500/40 px-3 pr-10 text-[13px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
                  <button type="button" onClick={() => setShowPassword(prev => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white"><Eye size={15} /></button>
                </div>
              </label>
              <label className="block">
                <span className="block text-[12px] text-slate-300 font-bold mb-2">验证码 (Captcha)</span>
                <div className="flex gap-2">
                  <input value={captchaCode} onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && submitLogin()} maxLength={4} autoComplete="off" placeholder="请输入验证码" className="flex-1 h-10 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[13px] uppercase outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
                  <button type="button" onClick={() => refreshCaptcha()} disabled={captchaLoading || loading} aria-label="刷新验证码" title="刷新验证码" className="h-10 w-[122px] rounded-md overflow-hidden border border-slate-500/40 bg-[#273353] flex items-center justify-center hover:border-blue-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                    {captchaLoading ? <Loader2 size={18} className="animate-spin text-blue-300" /> : captcha ? <img src={captcha.image} alt="" className="w-full h-full" draggable={false} /> : <RefreshCw size={16} className="text-blue-300" />}
                  </button>
                </div>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="block text-[12px] text-slate-300 font-bold mb-2">手机号 (Phone)</span>
                <div className="flex h-10 rounded-md bg-[#273353] border border-slate-500/40 focus-within:border-blue-400 overflow-hidden">
                  <span className="w-16 flex items-center justify-center border-r border-slate-500/30 text-[13px] text-slate-400">+86</span>
                  <input value={phone} disabled={smsSending} onChange={(e) => { setPhone(e.target.value); setSmsCode(''); setSmsNotice(''); }} placeholder="请输入手机号" className="flex-1 bg-transparent px-3 text-[13px] outline-none text-white placeholder:text-slate-500" />
                </div>
              </label>
              <label className="block">
                <span className="block text-[12px] text-slate-300 font-bold mb-2">短信验证码 (SMS Code)</span>
                <div className="flex gap-2">
                  <input value={smsCode} onChange={(e) => setSmsCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitLogin()} placeholder="请输入短信验证码" className="flex-1 h-10 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[13px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
                  <button type="button" disabled={smsSending || smsCountdown > 0 || loading} onClick={handleSendSmsCode} className="w-24 h-10 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[12px] font-bold transition-colors">
                    {smsSending ? '发送中...' : smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码'}
                  </button>
                </div>
              </label>
            </div>
          )}

          {error && <div className={`mt-4 rounded-lg border px-3 py-2 text-[12px] font-bold ${error.includes('已发送') ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200' : 'bg-rose-400/10 border-rose-400/30 text-rose-200'}`}>{error}</div>}
          {mode === 'phone' && smsNotice && !error && <div role="status" className="mt-4 rounded-lg border px-3 py-2 text-[12px] font-bold bg-emerald-400/10 border-emerald-400/30 text-emerald-200">{smsNotice}</div>}

          <button onClick={submitLogin} disabled={loading} className="mt-6 w-full h-11 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[13px] font-bold shadow-lg shadow-blue-950/40 transition-colors">
            {loading ? '登录中...' : '立即登录'}
          </button>
          <div className="mt-4 text-center text-[12px] text-blue-300/70">
            <button onClick={onForgotPassword} className="hover:text-white transition-colors">忘记密码？</button>
            <span className="mx-3 text-slate-500">|</span>
            <button onClick={onRegister} className="hover:text-white transition-colors">注册账号</button>
          </div>
        </section>
      </div>
    </div>
  );
};

const LoginShell = ({ children }) => (
  <div className="min-h-screen relative overflow-hidden bg-[#050913] text-white">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_42%,rgba(59,130,246,0.24),transparent_22%),radial-gradient(circle_at_34%_76%,rgba(245,158,11,0.22),transparent_18%),linear-gradient(180deg,#04070d_0%,#081424_52%,#02050b_100%)]"></div>
    <div className="absolute inset-x-[-10%] bottom-[-36%] h-[72%] rounded-[50%] bg-[radial-gradient(circle_at_50%_18%,rgba(96,165,250,0.24),rgba(15,23,42,0.94)_34%,rgba(2,6,23,1)_70%)] shadow-[0_-28px_70px_rgba(59,130,246,0.20)]"></div>
    <div className="absolute inset-0 opacity-55" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)', backgroundSize: '46px 46px' }}></div>
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.72)_0%,rgba(2,6,23,0.25)_48%,rgba(2,6,23,0.80)_100%)]"></div>
    <div className="relative z-10 min-h-screen flex items-center justify-center px-6">
      {children}
    </div>
  </div>
);

const ForgotPasswordPage = ({ onBack, onSuccess }) => {
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { count, start } = { count: 0, start: () => {} };
  const [cooldown, setCooldown] = useState(0);

  const sendCode = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('请输入有效邮箱地址'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      setSuccess(result.message || '验证码已发送');
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (!verifyCode || verifyCode.length !== 6) { setError('请输入6位验证码'); return; }
    if (newPassword.length < 8) { setError('密码至少8位'); return; }
    if (newPassword !== confirmPassword) { setError('两次密码不一致'); return; }
    setError('');
    setLoading(true);
    try {
      await resetPasswordByEmail(email, verifyCode, newPassword);
      setSuccess('密码重置成功，请使用新密码登录');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell>
      <div className="w-full max-w-[420px] bg-[#1d2743]/88 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-blue-300 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={15} />返回登录
        </button>
        <h2 className="text-[22px] font-bold text-center mb-2">忘记密码</h2>
        <p className="text-[13px] text-slate-400 text-center mb-8">请输入您注册时填写的邮箱地址</p>

        {success && <div className="mb-4 rounded-lg border px-3 py-2 text-[12px] font-bold bg-emerald-400/10 border-emerald-400/30 text-emerald-200">{success}</div>}
        {error && <div className="mb-4 rounded-lg border px-3 py-2 text-[12px] font-bold bg-rose-400/10 border-rose-400/30 text-rose-200">{error}</div>}

        {step === 'email' && (
          <div>
            <label className="block mb-5">
              <span className="block text-[12px] text-slate-300 font-bold mb-2">邮箱 (Email)</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入注册邮箱" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
            </label>
            <button onClick={sendCode} disabled={loading} className="w-full h-11 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[14px] font-bold transition-colors">
              {loading ? '发送中...' : '获取验证码'}
            </button>
          </div>
        )}

        {step === 'reset' && (
          <div className="space-y-4">
            <label className="block">
              <span className="block text-[12px] text-slate-300 font-bold mb-2">验证码</span>
              <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="请输入邮箱验证码" maxLength={6} className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
            </label>
            <label className="block">
              <span className="block text-[12px] text-slate-300 font-bold mb-2">新密码</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少8位，含大小写和数字" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
            </label>
            <label className="block">
              <span className="block text-[12px] text-slate-300 font-bold mb-2">确认新密码</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="请再次输入密码" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
            </label>
            <button onClick={submitReset} disabled={loading} className="w-full h-11 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[14px] font-bold transition-colors">
              {loading ? '重置中...' : '重置密码'}
            </button>
          </div>
        )}
      </div>
    </LoginShell>
  );
};


const FirstLoginPage = ({ account, tempPassword, onComplete, onLogout }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (newPassword.length < 8) { setError('密码至少 8 位，须包含字母和数字'); return; }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setError('密码必须同时包含字母和数字'); return; }
    if (newPassword !== confirmPassword) { setError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      await completeFirstLogin({ account, currentPassword: tempPassword, newPassword });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell>
      <div className="w-full max-w-[420px] bg-[#1d2743]/88 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-md">
        <h2 className="text-[22px] font-bold text-center mb-2">设置新密码</h2>
        <p className="text-[13px] text-slate-400 text-center mb-8">首次登录，请设置您的专属密码</p>
        <label className="block mb-5">
          <span className="block text-[12px] text-slate-300 font-bold mb-2">新密码</span>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 8 位，包含字母和数字" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
        </label>
        <label className="block mb-5">
          <span className="block text-[12px] text-slate-300 font-bold mb-2">确认新密码</span>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="请再次输入新密码" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
        </label>
        {error && <div className="mb-4 rounded-lg border px-3 py-2 text-[12px] font-bold bg-rose-400/10 border-rose-400/30 text-rose-200">{error}</div>}
        <button onClick={submit} disabled={loading} className="w-full h-11 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[14px] font-bold transition-colors">
          {loading ? '设置中...' : '确认设置'}
        </button>
        <button onClick={onLogout} className="mt-4 w-full text-center text-[13px] text-slate-400 hover:text-white transition-colors">返回登录</button>
      </div>
    </LoginShell>
  );
};

const ResetPasswordPage = ({ token, onBack, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (newPassword.length < 8) { setError('密码至少 8 位，须包含字母和数字'); return; }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setError('密码必须同时包含字母和数字'); return; }
    if (newPassword !== confirmPassword) { setError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const { resetPassword } = await import('./api/session');
      await resetPassword(token, newPassword);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell>
      <div className="w-full max-w-[420px] bg-[#1d2743]/88 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-blue-300 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={15} />返回登录
        </button>
        <h2 className="text-[22px] font-bold text-center mb-2">重置密码</h2>
        <p className="text-[13px] text-slate-400 text-center mb-8">请设置新密码</p>
        <label className="block mb-5">
          <span className="block text-[12px] text-slate-300 font-bold mb-2">新密码</span>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 8 位，包含字母和数字" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
        </label>
        <label className="block mb-5">
          <span className="block text-[12px] text-slate-300 font-bold mb-2">确认新密码</span>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="请再次输入新密码" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
        </label>
        {error && <div className="mb-4 rounded-lg border px-3 py-2 text-[12px] font-bold bg-rose-400/10 border-rose-400/30 text-rose-200">{error}</div>}
        <button onClick={submit} disabled={loading} className="w-full h-11 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[14px] font-bold transition-colors">
          {loading ? '重置中...' : '确认重置'}
        </button>
      </div>
    </LoginShell>
  );
};

const INDUSTRY_OPTIONS = ['制造业', '电子信息', '汽车工业', '装备制造', '生物医药', '新能源', '新材料', '化工', '食品加工', '纺织服装', '其他'];

const RegisterPage = ({ onBack, onRegistered }) => {
  const [form, setForm] = useState({ tenantName: '', industry: '', email: '', phone: '', account: '', password: '', confirmPassword: '', name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError('');
    if (!form.tenantName.trim()) { setError('请输入公司/租户名称'); return; }
    if (!form.industry) { setError('请选择所属行业'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('请输入有效邮箱地址'); return; }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) { setError('请输入有效手机号'); return; }
    if (!form.account.trim() || form.account.trim().length < 2) { setError('账号至少 2 个字符'); return; }
    if (!form.name.trim()) { setError('请输入管理员姓名'); return; }
    if (form.password.length < 8) { setError('密码至少 8 位，须包含字母和数字'); return; }
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) { setError('密码必须同时包含字母和数字'); return; }
    if (form.password !== form.confirmPassword) { setError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const session = await registerTenant({
        account: form.account.trim(),
        password: form.password,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        tenantName: form.tenantName.trim(),
        industry: form.industry,
      });
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell>
      <div className="w-full max-w-[480px] bg-[#1d2743]/88 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-blue-300 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={15} />返回登录
        </button>
        <h2 className="text-[22px] font-bold text-center mb-8">租户注册</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">租户名称 (Name) <span className="text-rose-400">*</span></span>
            <input value={form.tenantName} onChange={(e) => setField('tenantName', e.target.value)} placeholder="请输入公司/租户名称" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
          </label>
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">所属行业 (Industry) <span className="text-rose-400">*</span></span>
            <select value={form.industry} onChange={(e) => setField('industry', e.target.value)} className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white [&>option]:bg-[#1d2743]">
              <option value="">请选择所属行业</option>
              {INDUSTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">管理员姓名 <span className="text-rose-400">*</span></span>
            <input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入管理员姓名" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
          </label>
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">登录账号 <span className="text-rose-400">*</span></span>
            <input value={form.account} onChange={(e) => setField('account', e.target.value)} placeholder="请输入登录账号" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
          </label>
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">邮箱 (Email) <span className="text-rose-400">*</span></span>
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="请输入邮箱" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
          </label>
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">手机号 (Phone) <span className="text-rose-400">*</span></span>
            <div className="flex h-11 rounded-md bg-[#273353] border border-slate-500/40 focus-within:border-blue-400 overflow-hidden">
              <span className="w-16 flex items-center justify-center border-r border-slate-500/30 text-[13px] text-slate-400">+86</span>
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="请输入手机号" className="flex-1 bg-transparent px-3 text-[14px] outline-none text-white placeholder:text-slate-500" />
            </div>
          </label>
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">设置密码 <span className="text-rose-400">*</span></span>
            <input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="至少 8 位，包含字母和数字" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
          </label>
          <label className="block">
            <span className="block text-[12px] text-slate-300 font-bold mb-2">确认密码 <span className="text-rose-400">*</span></span>
            <input type="password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} placeholder="请再次输入密码" className="w-full h-11 rounded-md bg-[#273353] border border-slate-500/40 px-3 text-[14px] outline-none focus:border-blue-400 text-white placeholder:text-slate-500" />
          </label>
        </div>
        {error && <div className="mt-4 rounded-lg border px-3 py-2 text-[12px] font-bold bg-rose-400/10 border-rose-400/30 text-rose-200">{error}</div>}
        <button onClick={submit} disabled={loading} className="mt-6 w-full h-11 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[14px] font-bold transition-colors">
          {loading ? '注册中...' : '立即注册'}
        </button>
        <div className="mt-4 text-center text-[13px] text-slate-400">
          已有账户？<button onClick={onBack} className="text-blue-300 hover:text-white ml-1 transition-colors">立即登录</button>
        </div>
      </div>
    </LoginShell>
  );
};

const MonitorAIAnalysisCard = ({ card }: any) => {
  const tone = monitorToneMap[card.tone] || monitorToneMap.blue;
  const Icon = card.icon || Bot;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
      <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]">
        <div className={`p-1.5 rounded-lg mr-2.5 border ${tone.shell}`}>
          <Icon size={18} />
        </div>
        {card.title}
      </div>
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 min-h-[196px] flex flex-col">
        <div className="flex justify-between items-start gap-4 mb-4">
          <h3 className="font-bold text-slate-800 text-[14px] leading-snug">{card.subject}</h3>
          <span className={`px-2.5 py-1 border text-[11px] font-bold rounded-lg whitespace-nowrap ${tone.shell}`}>{card.badge}</span>
        </div>
        <div className="text-[13px] text-slate-600 leading-relaxed space-y-3 flex-1">
          {(card.lines || []).map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
        {card.actions && <div className="flex flex-col sm:flex-row gap-3 mt-5">{card.actions}</div>}
      </div>
    </div>
  );
};

const MonitorTrendChart = ({ trend }) => {
  const primary = trend.primary || monitorToneMap.blue.stroke;
  const secondary = trend.secondary || monitorToneMap.purple.stroke;
  const points = trend.points || [
    { x: 6, y: 76 },
    { x: 24, y: 62 },
    { x: 42, y: 40 },
    { x: 60, y: 48 },
    { x: 78, y: 24 },
    { x: 94, y: 38 },
  ];
  const path = trend.path || 'M 50 228 C 145 186, 195 186, 240 186 C 325 186, 350 120, 420 120 C 515 120, 555 145, 600 145 C 705 145, 740 72, 780 72 C 850 72, 890 114, 950 114';
  const area = trend.area || `${path} L 950 300 L 50 300 Z`;
  const labels = trend.labels || ['7月', '8月', '9月', '10月', '11月', '12月(预测)'];
  const yAxis = trend.yAxis || [100, 75, 50, 25, 0];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div className="flex items-center text-slate-800 font-bold text-[16px]">
          <div className="bg-purple-50 p-1.5 rounded-lg text-purple-600 mr-2.5 border border-purple-100">
            <Activity size={18} />
          </div>
          {trend.title}
        </div>
        <div className="flex flex-wrap items-center gap-5 text-[12px] text-slate-600 font-medium">
          {(trend.legend || []).map(item => (
            <div key={item.label} className="flex items-center">
              <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
              {item.label}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 lg:p-8 flex flex-col xl:flex-row gap-8">
        <div className="xl:w-[30%] flex flex-col justify-center border-b xl:border-b-0 xl:border-r border-slate-200 pb-6 xl:pb-0 xl:pr-8">
          <div className="flex items-center mb-5">
            <div className="w-[96px] h-[96px] rounded-full bg-white border-[8px] flex flex-col items-center justify-center shadow-sm mr-5 shrink-0" style={{ borderColor: trend.ringColor || '#e0e7ff' }}>
              <span className="text-[24px] font-bold" style={{ color: trend.metricColor || primary }}>{trend.metric}</span>
              <span className="text-[11px] text-slate-400 font-bold">{trend.metricLabel}</span>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-[14px] mb-2">{trend.insightTitle}</h4>
              <p className="text-[13px] text-slate-600 leading-relaxed">{trend.insight}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 text-[13px] text-slate-600 leading-relaxed">
            <span className="font-bold text-purple-600">AI 建议：</span> {trend.recommendation}
          </div>
        </div>
        <div className="xl:w-[70%] min-h-[320px] flex flex-col">
          <div className="flex items-center justify-between gap-4 mb-5">
            <span className="text-[13px] font-bold text-slate-700">{trend.chartTitle}</span>
            <span className="text-[11px] text-slate-400 font-bold">{trend.note || '含预测值'}</span>
          </div>
          <div className="relative flex-1 min-h-[260px]">
            <div className="absolute inset-0 right-[24px] left-[38px] z-0">
              {yAxis.map((val, index) => (
                <div key={`${val}-${index}`} className="absolute w-full flex items-center" style={{ top: `${index * (100 / (yAxis.length - 1))}%` }}>
                  <span className="text-[11px] text-slate-400 w-8 absolute -left-10 text-right">{val}</span>
                  <div className="w-full border-t border-slate-200 border-dashed"></div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 right-[24px] left-[38px] z-10">
              <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id={trend.gradientId || 'monitorTrendGradient'} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={primary} stopOpacity="0.16"/>
                    <stop offset="100%" stopColor={primary} stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d={area} fill={`url(#${trend.gradientId || 'monitorTrendGradient'})`} />
                <path d={path} fill="none" stroke={primary} strokeWidth="4" strokeLinecap="round" />
                {trend.forecastPath && <path d={trend.forecastPath} fill="none" stroke={secondary} strokeWidth="4" strokeDasharray="8 8" strokeLinecap="round" />}
              </svg>
            </div>
            <div className="absolute inset-0 right-[24px] left-[38px] z-20">
              {points.map((point, index) => (
                <div key={index} className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-sm" style={{ left: `${point.x}%`, top: `${point.y}%`, transform: 'translate(-50%, -50%)', border: `3px solid ${point.color || (index === points.length - 1 ? secondary : primary)}` }}></div>
              ))}
            </div>
            <div className="absolute top-[100%] right-[24px] left-[38px] h-8 mt-4">
              {labels.map((label, index) => (
                <span key={label} className={`absolute text-[12px] transform -translate-x-1/2 ${index === labels.length - 1 ? 'text-purple-600 font-bold' : 'text-slate-500 font-medium'}`} style={{ left: `${points[index]?.x || (index * 18 + 5)}%` }}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const UnifiedMonitorCabin = ({ metrics, aiCards, trend }) => {
  const hasAiCards = aiCards && aiCards.length > 0;
  const hasTrendData = trend && (trend.points?.length > 0 || trend.labels?.length > 0);
  return (
  <div className="space-y-6 animate-in fade-in duration-300 pb-10">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric) => (
        <StatCard
          key={metric.id || metric.title}
          title={metric.title}
          value={metric.value}
          unit={metric.unit || metric.suffix}
          icon={metric.icon || Activity}
          trend={metric.trend || (metric.theme === 'red' || metric.theme === 'rose' ? 'down' : 'up')}
          trendValue={metric.trendValue || metric.subtitle}
          theme={(metric.theme || metric.tagColor) === 'rose' ? 'red' : (metric.theme || metric.tagColor || 'blue')}
        />
      ))}
    </div>
    <div className={`grid grid-cols-1 gap-6 ${(aiCards?.length ?? 0) >= 3 ? 'xl:grid-cols-3' : (aiCards?.length ?? 0) >= 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
      {(aiCards ?? []).map((card) => (
        <MonitorAIAnalysisCard key={card.title} card={card} />
      ))}
    </div>
    <MonitorTrendChart trend={hasTrendData ? trend : {
      ...trend,
      points: [
        { x: 6, y: 90 }, { x: 24, y: 90 }, { x: 42, y: 90 },
        { x: 60, y: 90 }, { x: 78, y: 90 }, { x: 94, y: 90 },
      ],
      path: 'M 50 270 C 145 270, 195 270, 240 270 C 325 270, 350 270, 420 270 C 515 270, 555 270, 600 270 C 705 270, 740 270, 780 270 C 850 270, 890 270, 950 270',
      area: 'M 50 270 C 145 270, 195 270, 240 270 C 325 270, 350 270, 420 270 C 515 270, 555 270, 600 270 C 705 270, 740 270, 780 270 C 850 270, 890 270, 950 270 L 950 300 L 50 300 Z',
      labels: ['5月', '6月', '7月', '8月', '9月', '10月(预测)'],
      yAxis: [10, 8, 5, 3, 0],
    }} />
  </div>
  );
};

const QuickActionBtn = ({ icon: Icon, label, desc }) => (
  <button className="flex flex-col items-center justify-center p-5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all group active:scale-[0.98]">
    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:border-blue-300 transition-all shadow-sm">
      <Icon size={22} className="text-blue-500" />
    </div>
    <span className="text-slate-800 font-bold text-[13px]">{label}</span>
    <span className="text-slate-500 text-[11px] mt-1">{desc}</span>
  </button>
);

const ProgressBar = ({ progress, color = "bg-blue-500" }) => (
  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-200/50">
    <div className={`${color} h-full rounded-full transition-all duration-1000 relative`} style={{ width: `${progress}%` }}>
        <div className="absolute inset-0 bg-white/20 w-full h-full"></div>
    </div>
  </div>
);

const CenterToast = ({ toast, onClose }) => {
  const isVisible = toast?.show || toast?.title || toast?.msg;
  if (!isVisible) return null;
  const type = toast.type || 'success';
  const title = toast.title || toast.msg || '操作已完成';
  const desc = toast.desc;
  const tone = type === 'error' || type === 'danger'
    ? 'bg-rose-600 shadow-rose-200'
    : type === 'warning'
      ? 'bg-amber-500 shadow-amber-200'
      : 'bg-blue-600 shadow-blue-200';
  const Icon = type === 'error' || type === 'danger' ? AlertTriangle : type === 'warning' ? AlertCircle : CheckCircle2;

  return (
    <div className="fixed inset-0 z-[140] pointer-events-none flex items-center justify-center p-6">
      <div className={`${tone} pointer-events-auto text-white rounded-2xl shadow-2xl px-6 py-5 min-w-[360px] max-w-[520px] flex items-start gap-4 animate-in fade-in zoom-in-95 duration-200`}>
        <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
          <Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold leading-snug">{title}</div>
          {desc && <div className="text-[13px] text-white/85 leading-relaxed mt-1.5">{desc}</div>}
        </div>
        {onClose && <button onClick={onClose} className="text-white/70 hover:text-white transition-colors shrink-0"><X size={18} /></button>}
      </div>
    </div>
  );
};

const BusinessActionModal = ({ action, onClose, onConfirm }) => {
  if (!action) return null;
  const tone = monitorToneMap[action.tone || 'blue'] || monitorToneMap.blue;
  const Icon = action.icon || Workflow;
  const hasBodyContent = Boolean(
    action.details?.length ||
    action.attachments?.length ||
    action.fields?.length ||
    action.checks?.length ||
    action.matrix?.length ||
    action.steps?.length ||
    action.note
  );
  const matrixHeaders = action.matrixHeaders || ['权限对象', '开放动作', '数据范围'];
  if (action.layout === 'supplierArchive') {
    const getDetail = (label) => action.details?.find(item => item.label === label)?.value || '-';
    const getField = (label) => action.fields?.find(item => item.label === label) || {};
    const uploadField = getField('重新上传附件');
    const typeField = getField('附件类型');
    const reminderField = getField('更新提醒');
    const noteField = getField('附件说明');
    const status = getDetail('附件状态');
    const statusTone = status === '附件完整'
      ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
      : status === '附件待上传'
        ? 'bg-amber-50 text-amber-600 border-amber-100'
        : 'bg-orange-50 text-orange-600 border-orange-100';

    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[120] flex items-center justify-center p-6 animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl w-[860px] max-h-[90vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 bg-white flex items-start justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${tone.shell}`}>
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[18px] font-bold text-slate-900">{action.title}</h3>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusTone}`}>{status}</span>
                </div>
                {action.desc && <p className="text-[13px] text-slate-500 leading-relaxed mt-1.5 max-w-[560px]">{action.desc}</p>}
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg transition-colors shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 overflow-y-auto custom-scrollbar bg-slate-50/40 space-y-4">
            <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-slate-400 mb-1">供应商</div>
                  <div className="text-[16px] font-bold text-slate-900 leading-snug">{getDetail('企业名称')}</div>
                  <div className="text-[12px] text-slate-500 mt-2">编码 {getDetail('供应商编码')} · 责任人 {getDetail('责任人')}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:w-[360px]">
                  {[
                    ['统一社会信用代码', getDetail('统一社会信用代码')],
                    ['主营品类', getDetail('主营品类')],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
                      <div className="text-[11px] font-bold text-slate-400 mb-1">{label}</div>
                      <div className="text-[12px] font-bold text-slate-800 break-words">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-4">
              <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-[15px] font-bold text-slate-900">重新上传附件</div>
                  <div className="text-[12px] text-slate-500 mt-1">替换或补充供应商附件，保存后进入档案版本记录。</div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-[11px] font-bold">版本留痕</span>
              </div>
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-4 py-3.5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-slate-800">{uploadField.value || '营业执照、体系证书或行业许可附件'}</div>
                    <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">{uploadField.placeholder || '支持 PDF、PNG、JPG 等格式。'}</div>
                  </div>
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold shadow-sm cursor-pointer shrink-0">
                    <UploadCloud size={15} />
                    选择附件
                    <input type="file" accept={uploadField.accept} className="hidden" />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {[typeField, reminderField].map(field => (
                  <label key={field.label} className="block">
                    <span className="block text-[12px] font-bold text-slate-500 mb-2">{field.label}</span>
                    <div className="relative">
                      <select defaultValue={field.value || field.options?.[0]} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white appearance-none">
                        {(field.options || []).map(option => <option key={option}>{option}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                    </div>
                  </label>
                ))}
              </div>
              <label className="block mt-4">
                <span className="block text-[12px] font-bold text-slate-500 mb-2">{noteField.label}</span>
                <textarea defaultValue={noteField.value || ''} placeholder={noteField.placeholder || ''} className="w-full h-16 resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white" />
              </label>
              <div className="flex flex-wrap gap-2 mt-4">
                {action.checks?.map(check => (
                  <span key={check} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
                    <CheckCircle2 size={13} />
                    {check}
                  </span>
                ))}
              </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="text-[15px] font-bold text-slate-900">档案快照</div>
                  <div className="text-[11px] font-bold text-slate-400">当前记录</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {action.matrix?.map(row => (
                    <div key={row.name} className="grid grid-cols-[78px_1fr] gap-3 px-4 py-3 text-[13px]">
                      <div className="font-bold text-slate-700">{row.name}</div>
                      <div>
                        <div className="font-bold text-blue-600 leading-relaxed">{row.actions}</div>
                        <div className="text-[12px] text-slate-400 mt-1">{row.scope}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {action.note && (
              <div className="bg-amber-50 border border-amber-100 text-amber-700 rounded-2xl px-5 py-4 text-[13px] leading-relaxed font-medium">
                {action.note}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">取消</button>
            <button onClick={onConfirm} className={`px-5 py-2.5 text-[13px] font-bold rounded-xl transition-colors ${tone.button}`}>{action.confirmText || '确认执行'}</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[120] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-[680px] max-h-[90vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50/60 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${tone.shell}`}>
              <Icon size={22} />
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-slate-800">{action.title}</h3>
              {action.desc && <p className="text-[13px] text-slate-500 leading-relaxed mt-1.5">{action.desc}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {action.details?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {action.details.map(item => (
                <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  <div className="text-[11px] font-bold text-slate-400 mb-1">{item.label}</div>
                  <div className="text-[13px] font-bold text-slate-800 break-words">{item.value}</div>
                </div>
              ))}
            </div>
          )}
          {action.attachments?.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] font-bold text-slate-500">证书附件</div>
              <div className="space-y-2">
                {action.attachments.map(file => (
                  <div key={file.name} className="flex items-center justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-slate-800 truncate">{file.name}</div>
                        <div className="text-[12px] text-slate-500 mt-0.5">{file.meta}</div>
                      </div>
                    </div>
                    <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 text-[12px] font-bold shrink-0">
                      <Eye size={14} />
                      查看附件
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {action.fields?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {action.fields.map(field => (
                <label key={field.label} className={`block ${field.wide ? 'sm:col-span-2' : ''}`}>
                  <span className="block text-[12px] font-bold text-slate-500 mb-2">{field.label}</span>
                  {field.type === 'textarea' ? (
                    <textarea defaultValue={field.value || ''} placeholder={field.placeholder || ''} className="w-full h-24 resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white" />
                  ) : field.type === 'file' ? (
                    <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-slate-800">{field.value || '选择本地附件重新上传'}</div>
                          <div className="text-[12px] text-slate-500 mt-1">{field.placeholder || '支持 PDF、PNG、JPG 等格式；保存后进入供应商档案版本记录。'}</div>
                        </div>
                        <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 text-[12px] font-bold shadow-sm cursor-pointer shrink-0">
                          <UploadCloud size={14} />
                          选择附件
                          <input type="file" accept={field.accept} className="hidden" />
                        </label>
                      </div>
                    </div>
                  ) : field.options ? (
                    <div className="relative">
                      <select defaultValue={field.value || field.options[0]} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white appearance-none">
                        {field.options.map(option => <option key={option}>{option}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                    </div>
                  ) : (
                    <input type={field.type || 'text'} defaultValue={field.value || ''} placeholder={field.placeholder || ''} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white" />
                  )}
                </label>
              ))}
            </div>
          )}
          {action.checks?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {action.checks.map(check => (
                <label key={check} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-[13px] font-bold text-slate-700">
                  <input type="checkbox" defaultChecked className="w-4 h-4 accent-blue-600" />
                  {check}
                </label>
              ))}
            </div>
          )}
          {action.matrix?.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1.4fr_1fr] bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-100">
                <div className="px-4 py-3">{matrixHeaders[0]}</div>
                <div className="px-4 py-3">{matrixHeaders[1]}</div>
                <div className="px-4 py-3">{matrixHeaders[2]}</div>
              </div>
              {action.matrix.map(row => (
                <div key={row.name} className="grid grid-cols-[1.2fr_1.4fr_1fr] border-b last:border-b-0 border-slate-100 text-[13px]">
                  <div className="px-4 py-3 font-bold text-slate-800">{row.name}</div>
                  <div className="px-4 py-3 text-blue-600 font-bold">{row.actions}</div>
                  <div className="px-4 py-3 text-slate-600">{row.scope}</div>
                </div>
              ))}
            </div>
          )}
          {action.steps && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              {action.steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3 px-4 py-3 bg-white border-b last:border-b-0 border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[11px] font-bold">{index + 1}</div>
                  <span className="text-[13px] text-slate-600 font-medium">{step}</span>
                </div>
              ))}
            </div>
          )}
          {action.note && <div className="bg-amber-50 border border-amber-100 text-amber-700 rounded-xl px-4 py-3 text-[13px] leading-relaxed font-medium">{action.note}</div>}
          {!hasBodyContent && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-5 text-[13px] text-slate-500 leading-relaxed">
              当前操作已接入统一弹窗，后续可在这里扩展字段、权限矩阵或审批流程；不会再出现空白内容区。
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">取消</button>
          <button onClick={onConfirm} className={`px-5 py-2.5 text-[13px] font-bold rounded-xl transition-colors ${tone.button}`}>{action.confirmText || '确认执行'}</button>
        </div>
      </div>
    </div>
  );
};

const TableActionButton = ({ icon: Icon, label, tone = 'blue', onClick, disabled = false }) => {
  const toneClass = {
    blue: 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100',
    emerald: 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
    amber: 'text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100',
    rose: 'text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100',
    purple: 'text-purple-600 border-purple-200 bg-purple-50 hover:bg-purple-100',
    slate: 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50',
  }[tone] || 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100';

  return (
    <button
      type="button"
      title={label}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${toneClass}`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
};

const TableActionGroup = ({ children }) => (
  <div className="flex items-center justify-end gap-2 min-w-[190px]">
    {children}
  </div>
);

const linkedFlowSteps = [
  { key: 'opportunity', module: '销售管理', label: '创建商机/订单', icon: Target },
  { key: 'approval', module: '销售管理', label: '订单审批', icon: ClipboardCheck },
  { key: 'stockCheck', module: '库存管理', label: '库存自动校验', icon: ScanLine },
  { key: 'productionDemand', module: '生产管理', label: '生产需求接收', icon: Inbox },
  { key: 'mpsMrp', module: '生产管理', label: 'MPS/MRP 展算', icon: Calculator },
  { key: 'purchaseRequest', module: '采购管理', label: '采购申请/审批', icon: FilePlus },
  { key: 'purchaseOrder', module: '采购管理', label: '采购订单/送货', icon: ShoppingCart },
  { key: 'materialInbound', module: '库存管理', label: '物料采购入库', icon: ArrowDownToLine },
  { key: 'production', module: '生产管理', label: '生产加工/质检', icon: Factory },
  { key: 'finishedInbound', module: '库存管理', label: '成品入库', icon: Warehouse },
  { key: 'delivery', module: '库存管理', label: '销售出库/发货', icon: Truck },
  { key: 'financeDocs', module: '财务管理', label: '应收/应付生成', icon: Receipt },
  { key: 'settlement', module: '财务管理', label: '收付款/发票/凭证', icon: Landmark },
];

const linkedFlowIssueFixes = [
  '销售订单审批后，原系统没有把订单上下文带到库存校验。',
  '库存不足、MPS/MRP、采购申请、采购订单之间缺少同一业务单号。',
  '采购送货、物料入库、生产质检、成品入库没有形成连续状态。',
  '销售出库后没有自动形成应收，应付与供应商付款也没有被财务接收。',
];

const businessFlowActionMap = {
  opportunity: { label: '提交订单审批', action: 'approveOrder', tone: 'blue' },
  approval: { label: '审批通过并校验库存', action: 'checkStock', tone: 'blue' },
  stockCheck: { label: '查看已创建生产需求', action: 'openProductionDemand', tone: 'amber' },
  productionDemand: { label: '创建 MPS/MRP 任务', action: 'runMrp', tone: 'blue' },
  mpsMrp: { label: '缺料转采购申请', action: 'createPr', tone: 'purple' },
  purchaseRequest: { label: '采购审批通过', action: 'approvePr', tone: 'blue' },
  purchaseOrder: { label: '供应商送货并入库', action: 'receiveMaterial', tone: 'emerald' },
  materialInbound: { label: '物料齐套，下达生产', action: 'startProduction', tone: 'blue' },
  production: { label: '质检合格，成品入库', action: 'finishProduction', tone: 'emerald' },
  finishedInbound: { label: '销售出库并确认发货', action: 'shipSales', tone: 'blue' },
  delivery: { label: '生成应收/应付单据', action: 'generateFinanceDocs', tone: 'purple' },
  financeDocs: { label: '完成收付款与开票', action: 'settleFinance', tone: 'emerald' },
  settlement: { label: '关闭流程上下文', action: 'resetFlow', tone: 'slate' },
};

const getLinkedFlowStepIndex = (stepKey) => Math.max(0, linkedFlowSteps.findIndex(step => step.key === stepKey));
const isLinkedFlowAtLeast = (flow, stepKey) => !!flow && getLinkedFlowStepIndex(flow.currentStep) >= getLinkedFlowStepIndex(stepKey);

const BusinessFlowDock = ({ moduleName, flow, onAction }: any) => {
  if (!flow || !['销售管理', '生产管理', '库存管理', '采购管理', '财务管理'].includes(moduleName)) return null;
  const currentIndex = getLinkedFlowStepIndex(flow.currentStep);
  const currentStep = linkedFlowSteps[currentIndex] || linkedFlowSteps[0];
  if (currentStep.module !== moduleName) return null;
  const currentAction = currentStep.key === 'stockCheck' && flow.stockEnough
    ? { label: '库存充足，执行销售出库', action: 'shipSales', tone: 'emerald' }
    : businessFlowActionMap[currentStep.key] || businessFlowActionMap.opportunity;
  const tone = monitorToneMap[currentAction.tone] || monitorToneMap.blue;
  const StepIcon = currentStep.icon;
  const handoffCopy = {
    opportunity: {
      title: '销售待办：商机转销售订单',
      desc: '销售确认客户、产品、数量和交期后，将同一销售订单号传给库存做可用量校验。',
      output: '输出：销售订单待审批'
    },
    approval: {
      title: '销售待办：订单审批',
      desc: '审批通过后不在销售侧停留，订单会自动进入库存管理进行现存量与可用量校验。',
      output: '输出：库存校验任务'
    },
    stockCheck: {
      title: '库存待办：校验可用库存',
      desc: '服务端已按库存事实版本计算可用量；当前成品不足，缺口已经在同一事务中生成生产需求。',
      output: '输出：持久化生产需求'
    },
    productionDemand: {
      title: '生产待办：销售缺货需求已接收',
      desc: '生产需求已保存来源销售订单、库存事实版本、缺口、交期和关联 ID，可进入后续计划评审。',
      output: '输出：待评审生产需求'
    },
    mpsMrp: {
      title: '生产待办：MPS/MRP 展算',
      desc: '生产承接销售缺口，按 BOM 展算物料净需求，并把采购件缺料推送给采购。',
      output: '输出：采购申请'
    },
    purchaseRequest: {
      title: '采购待办：采购申请审批',
      desc: '采购审核 MRP 缺料申请，审批后生成采购订单并锁定供应商交期。',
      output: '输出：采购订单'
    },
    purchaseOrder: {
      title: '采购待办：供应商送货',
      desc: '供应商送货后，采购结果回写仓库入库流水，物料到货进入库存验收。',
      output: '输出：物料入库任务'
    },
    materialInbound: {
      title: '库存待办：物料采购入库',
      desc: '仓库完成物料验收入库，可用量同步增加，并通知生产物料齐套。',
      output: '输出：生产下达条件'
    },
    production: {
      title: '生产待办：加工与质检',
      desc: '生产完成加工和质检，合格数量推送仓库形成成品入库。',
      output: '输出：成品入库任务'
    },
    finishedInbound: {
      title: '库存待办：成品入库',
      desc: '仓库接收生产合格品，成品库存可用后继续执行销售出库。',
      output: '输出：销售出库任务'
    },
    delivery: {
      title: '库存待办：销售出库发货',
      desc: '仓库按销售订单完成拣货、扣减库存和发货确认，并把出库结果交给财务。',
      output: '输出：应收/应付单据'
    },
    financeDocs: {
      title: '财务待办：生成应收应付',
      desc: '财务承接销售出库和采购入库结果，生成应收、应付和对账记录。',
      output: '输出：收付款与开票任务'
    },
    settlement: {
      title: '财务待办：收付款与凭证',
      desc: '完成客户回款、供应商付款、发票、流水和凭证，销售订单形成业务闭环。',
      output: '输出：订单闭环完成'
    }
  };
  const copy = currentStep.key === 'stockCheck' && flow.stockEnough ? {
    title: '库存结果：可用量满足订单',
    desc: '服务端库存事实校验已通过，本订单跳过 MPS/MRP 与采购，直接进入销售出库。',
    output: '输出：销售出库任务'
  } : handoffCopy[currentStep.key] || handoffCopy.opportunity;

  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-sm p-4 mb-6">
      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${tone.shell}`}>
          <StepIcon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[14px] font-bold text-slate-800">{copy.title}</span>
            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 text-[11px] font-bold">{flow.orderId}</span>
          </div>
          <div className="text-[12px] text-slate-500 leading-relaxed">{copy.desc}</div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 min-w-[180px]">
            <div className="text-[10px] font-bold text-slate-400">本模块处理结果</div>
            <div className="text-[12px] font-bold text-slate-700 mt-1">{copy.output}</div>
          </div>
          <button onClick={() => onAction?.(currentAction.action)} className={`px-4 py-2.5 rounded-xl text-[13px] font-bold transition-colors whitespace-nowrap ${tone.button}`}>
            {currentAction.label}
          </button>
        </div>
      </div>
    </div>
  );
};

const createInitialBusinessFlow = () => ({
  id: '',
  opportunityId: '',
  orderId: '',
  customer: '',
  product: '',
  qty: 0,
  amount: '0',
  availableStock: 0,
  shortage: 0,
  currentStep: 'opportunity',
  completed: [],
  stockEnough: false,
  issuesFixed: linkedFlowIssueFixes,
  ledger: [],
});

const Pagination = ({ total, page, limit, onPageChange = null, onLimitChange = null }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const changePage = (nextPage) => onPageChange?.(Math.min(totalPages, Math.max(1, nextPage)));
  const buttonClass = 'px-3 py-1.5 border rounded-lg transition-colors disabled:bg-slate-50 disabled:text-slate-300 disabled:border-slate-100 disabled:cursor-not-allowed bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600';

  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-[12px] text-slate-500 py-4 px-6 border-t border-slate-100">
        <div>共 <span className="font-bold text-slate-700">{total}</span> 条记录，第 <span className="font-bold text-slate-700">{currentPage}/{totalPages}</span> 页</div>
        <div className="flex items-center space-x-2">
            <select value={limit} onChange={(event) => onLimitChange?.(Number(event.target.value))} className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none cursor-pointer">
                {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size} 条/页</option>)}
            </select>
            <div className="flex space-x-1">
                <button onClick={() => changePage(1)} disabled={currentPage === 1 || !onPageChange} className={buttonClass}>首页</button>
                <button onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1 || !onPageChange} className={buttonClass}>上一页</button>
                <button onClick={() => changePage(currentPage + 1)} disabled={currentPage === totalPages || !onPageChange} className={buttonClass}>下一页</button>
                <button onClick={() => changePage(totalPages)} disabled={currentPage === totalPages || !onPageChange} className={buttonClass}>末页</button>
            </div>
        </div>
    </div>
  );
};

// ==========================================
// 1. 销售管理模块 (SalesManagement) 
// ==========================================
const sales_dashboardMetrics = [
  { id: 1, title: '生效商机数', value: '5', suffix: '项商机', subtitle: '正在推进中的商机订单', tag: '跟进中', tagColor: 'emerald' },
  { id: 2, title: '商机 ➔ 订单', value: '12', suffix: '单', subtitle: '当月累计达成', tag: '同步成功', tagColor: 'blue' },
  { id: 3, title: '异常停滞商机', value: '3', suffix: '项', subtitle: '即将流失的商机订单', tag: '流失高危', tagColor: 'rose' },
  { id: 4, title: '订单 ➔ 财务', value: '94.5', suffix: '万 回款金额', subtitle: '存在高风险大单', tag: '闭环达成', tagColor: 'emerald' },
];

const sales_quotesData = [
  { id: 'QT-20260615-001', client: '商洛墨翠宝石开发有限公司', date: '2026-06-15', validUntil: '2026-08-15', status: '正常', product: 'FG001 工业控制器顶配版 / 标准型 × 1 件', productName: 'FG001 工业控制器顶配版', spec: '标准型', unit: '件', qty: 1, unitPrice: 500, discountRate: 100, discountAmount: 0, amount: '¥500.00', creator: '销售主管' },
  { id: 'QT-20260508-001', client: 'test01客户', date: '2026-05-08', validUntil: '2026-06-07', status: '已过期', product: 'FG001 工业控制器顶配版 / 标准型 × 17 件', productName: 'FG001 工业控制器顶配版', spec: '标准型', unit: '件', qty: 17, unitPrice: 500, discountRate: 95, discountAmount: 0, amount: '¥8,075.00', creator: '操作员 01' }
];

const sales_ordersData = [
  { id: 'SO-20260508-001', client: 'test01客户', salesman: '操作员 01', product: 'FG001 工业控制器顶配版 × 17 件', productName: 'FG001 工业控制器顶配版', qty: 17, availableStock: 2300, shortage: 0, amount: '¥8,075.00', receivable: '待生成', date: '2026-07-18', deliveryDate: '2026-07-25', outStatus: '未发货', status: '待发货', createdAt: '2026-07-18 09:10:00' },
  { id: 'SO-20260615-001', client: '商洛墨翠宝石开发有限公司', salesman: '销售主管', product: 'FG001 工业控制器顶配版 × 1 件', productName: 'FG001 工业控制器顶配版', qty: 1, availableStock: 2300, shortage: 0, amount: '¥500.00', receivable: '待生成', date: '2026-07-20', deliveryDate: '2026-07-27', outStatus: '未发货', status: '已确认', createdAt: '2026-07-20 14:26:00' }
];

const sales_customersListData = [
  { id: 'KH-20260612-005', name: '商洛墨翠宝石开发有限公司', code: '91611000MA70X6T62Q', contact: '张新国', phone: '18184987811', contacts: [{ name: '张新国', phone: '18184987811', role: '决策人' }], address: '陕西省商洛市商州区产业园', owner: '销售主管', level: 'D', status: '合作中', industry: '-', lastInteractionAt: '2026-05-18' },
  { id: 'KH-20260612-001', name: '上海万申产业股份有限公司', code: '91310115MA1K4X5Q8E', contact: '李经理', phone: '-', contacts: [{ name: '李经理', phone: '', role: '关键使用人' }], address: '上海市浦东新区金桥开发区', owner: '', level: 'D', status: '合作中', industry: '-', lastInteractionAt: '2026-05-02' },
  { id: 'KH-20260508-001', name: 'test01客户', code: '-', contact: '客户1', phone: '17768122341', contacts: [{ name: '客户1', phone: '17768122341', role: '决策人' }], address: '浙江省杭州市滨江区', owner: '操作员 01', level: 'B', status: '合作中', industry: '茶产业', lastInteractionAt: '2026-07-22' }
];

const sales_baseDataLevels = [
  { level: 'D', name: 'D级客户', min: '0 万元', desc: '年采购额<5万元', sort: 1, status: '启用' },
  { level: 'C', name: 'C级客户', min: '5 万元', desc: '年采购额≥5万元且<20万元', sort: 2, status: '启用' },
  { level: 'B', name: 'B级客户', min: '20 万元', desc: '年采购额≥20万元且<50万元', sort: 3, status: '启用' },
  { level: 'A', name: 'A级客户', min: '50 万元', desc: '年采购额≥50万元且<100万元', sort: 4, status: '启用' },
  { level: 'VIP', name: 'VIP客户', min: '100 万元', desc: '年采购额≥100万元', sort: 5, status: '启用' }
];

const sales_industriesData = [
  ...['电子信息', '机械装备', '食品加工', '石油化工', '茶产业', '纺织服装', '医药健康', '新能源', '其他'].map((name, index) => ({
    id: `IND-${String(index + 1).padStart(3, '0')}`,
    name,
    parentId: '',
    sort: index + 1,
    status: '启用',
    remark: index === 0 ? '电子设备及零部件制造相关行业' : name,
    createdAt: '2026-03-16 08:48:19',
  }))
];

const sales_defaultOutreachSettings = {
  thresholdDays: 3,
  recipients: { customer: true, salesman: true, manager: false },
  channels: { wechat: true, sms: false, inbox: true },
  enabled: true
};

const sales_formatMoney = (value) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sales_parseMoney = (value) => Number(String(value ?? 0).replace(/[^\d.-]/g, '')) || 0;

const sales_daysUntil = (date) => {
  if (!date || date === '-') return Number.POSITIVE_INFINITY;
  const target = new Date(`${date}T23:59:59`);
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
};

const sales_getQuoteStatus = (quote) => {
  const convertedOrderId = quote.convertedOrderId || (quote.status === '已转订单' ? 'legacy-conversion' : '');
  return getSalesQuoteStatus(quote.validUntil, new Date(), convertedOrderId);
};

const sales_makeDocumentId = (prefix) => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}-${date}-${String(Date.now()).slice(-4)}`;
};

const sales_loadWorkspace = (tenantId) => {
  try {
    const saved = localStorage.getItem(salesWorkspaceStorageKey(tenantId));
    if (saved) return JSON.parse(saved);
  } catch {
    // Use seed data when local persistence is unavailable.
  }
  return null;
};

const sales_getTagStyle = (color) => {
  const styles = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return styles[color] || styles.blue;
};

const sales_getLevelBadgeColor = (level) => {
  const map = {
      'D': 'bg-slate-100 text-slate-500',
      'C': 'bg-orange-50 text-orange-500',
      'B': 'bg-blue-50 text-blue-500',
      'A': 'bg-emerald-50 text-emerald-600',
      'VIP': 'bg-amber-100 text-amber-600'
  };
  return map[level] || 'bg-slate-100 text-slate-500';
};

const sales_entityLabels = {
  quote: '报价单',
  order: '销售订单',
  customer: '客户',
  level: '客户等级',
  industry: '行业'
};

const sales_recordFields = {
  quote: [
    { key: 'id', label: '报价单号' },
    { key: 'client', label: '客户' },
    { key: 'date', label: '报价日期', type: 'date' },
    { key: 'validUntil', label: '有效期至', type: 'date' },
    { key: 'status', label: '状态' },
    { key: 'amount', label: '总金额' }
  ],
  order: [
    { key: 'id', label: '订单编号' },
    { key: 'client', label: '客户' },
    { key: 'salesman', label: '销售人员' },
    { key: 'product', label: '产品明细' },
    { key: 'amount', label: '订单金额' },
    { key: 'receivable', label: '应收金额' },
    { key: 'date', label: '订单日期', type: 'date' },
    { key: 'deliveryDate', label: '交期' },
    { key: 'outStatus', label: '出库状态' },
    { key: 'status', label: '订单状态' }
  ],
  customer: [
    { key: 'id', label: '客户编码' },
    { key: 'name', label: '客户名称' },
    { key: 'code', label: '社会信用代码' },
    { key: 'contact', label: '联系人' },
    { key: 'phone', label: '联系电话' },
    { key: 'level', label: '客户等级' },
    { key: 'status', label: '状态' },
    { key: 'industry', label: '行业' }
  ],
  level: [
    { key: 'level', label: '等级代码 *', placeholder: '如：A, B, C, VIP' },
    { key: 'name', label: '等级名称 *', placeholder: '如：A级（重要客户）' },
    { key: 'min', label: '年采购额下限（万元）' },
    { key: 'desc', label: '描述', placeholder: '如：年采购额 ≥ 50 万' },
    { key: 'sort', label: '排序权重', type: 'number' },
    { key: 'status', label: '状态' },
    { key: 'color', label: '颜色标识', type: 'color' }
  ],
  industry: [
    { key: 'name', label: '行业名称 *', placeholder: '请输入行业名称' },
    { key: 'remark', label: '备注', placeholder: '请输入备注（可选）' }
  ]
};

const Sales_Toast = ({ toast, onClose }) => {
  return <CenterToast toast={toast} onClose={onClose} />;
};

const Sales_ConfirmModal = ({ title, desc, confirmText = '确认', tone = 'blue', pending = false, onCancel, onConfirm }) => (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
    <div className="bg-white rounded-2xl w-[420px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
      <div className="p-6">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
          <AlertTriangle size={22} />
        </div>
        <h3 className="text-[17px] font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-[13px] text-slate-500 leading-relaxed">{desc}</p>
      </div>
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
        <button disabled={pending} onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50">取消</button>
        <button disabled={pending} onClick={onConfirm} className={`px-4 py-2 text-[13px] font-bold text-white rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center gap-2 ${tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{pending && <RefreshCw size={14} className="animate-spin" />}{pending ? '正在校验库存' : confirmText}</button>
      </div>
    </div>
  </div>
);

const Sales_OrderEditModal = ({ mode = 'edit', record, customers = [], products = [], onClose, onSubmit }) => {
  const [client, setClient] = useState(record?.client || '');
  const [salesman, setSalesman] = useState(record?.salesman || '');
  const [orderDate, setOrderDate] = useState(record?.date || new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState(record?.deliveryDate && record.deliveryDate !== '待确认' ? record.deliveryDate : '');
  const [lines, setLines] = useState(() => {
    if (record?.lines && Array.isArray(record.lines) && record.lines.length > 0) return record.lines.map(l => ({ ...l, key: Date.now() + Math.random() }));
    if (record?.productName) return [{ key: Date.now(), productName: record.productName, productId: record.productId || '', spec: record.spec || '', unit: record.unit || '件', quantity: Number(record.qty || 1), unitPrice: Number(record.unitPrice || 0) }];
    return [];
  });
  const [discountRate, setDiscountRate] = useState(record?.discountRate ?? 100);
  const [discountAmount, setDiscountAmount] = useState(record?.discountAmount || 0);
  const [remark, setRemark] = useState(record?.remark || '');
  const [error, setError] = useState('');
  const outStatus = record?.outStatus || '未发货';
  const orderStatus = record?.status || '待发货';
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const total = Math.max(0, subtotal * Math.min(100, Math.max(0, Number(discountRate))) / 100 - Math.max(0, Number(discountAmount)));
  const updateLine = (key, field, value) => setLines(prev => prev.map(line => line.key === key ? { ...line, [field]: value } : line));
  const addLine = () => setLines(prev => [...prev, { key: Date.now() + Math.random(), productName: '', productId: '', spec: '', unit: '件', quantity: 1, unitPrice: 0 }]);
  const removeLine = (key) => setLines(prev => prev.filter(line => line.key !== key));

  const handleSave = () => {
    if (!client.trim() || !orderDate || !deliveryDate) { setError('请完整填写客户、订单日期和交期'); return; }
    if (lines.length === 0) { setError('请至少添加一个产品'); return; }
    const invalid = lines.find(l => !l.productName.trim() || Number(l.quantity) <= 0 || Number(l.unitPrice) <= 0);
    if (invalid) { setError('每个产品需填写名称、数量和单价'); return; }
    const productSummary = lines.length === 1
      ? `${lines[0].productName.trim()} / ${lines[0].spec.trim()} × ${lines[0].quantity} ${lines[0].unit}`
      : `${lines[0].productName.trim()} 等 ${lines.length} 项产品`;
    onSubmit({
      ...record,
      client: client.trim(),
      salesman: salesman || '系统管理员',
      date: orderDate,
      deliveryDate,
      productId: lines[0].productId,
      product: productSummary,
      productName: lines[0].productName.trim(),
      spec: lines[0].spec,
      unit: lines[0].unit,
      qty: lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0),
      unitPrice: lines[0].unitPrice,
      lines: lines.map(({ key, ...rest }) => rest),
      discountRate: Number(discountRate),
      discountAmount: Number(discountAmount),
      remark,
      amount: sales_formatMoney(total),
    });
  };

  const statusBadge = (label, value, color) => (
    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 flex items-center justify-between">
      <span className="text-[13px] text-slate-500 font-medium">{label}</span>
      <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${color}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl w-[1200px] max-w-full max-h-[95vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center text-[16px] font-bold text-slate-800">
            <ShoppingCart size={18} className="text-blue-600 mr-2" /> 编辑销售订单
            <span className="ml-3 text-[13px] font-normal text-slate-400">{record?.id}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-lg px-4 py-2.5 text-[13px] font-medium">{error}</div>}
          <section>
            <div className="flex items-center mb-4"><div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div><span className="text-[15px] font-bold text-slate-800">基本信息</span></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[13px] text-slate-600 mb-1.5 font-medium">客户 <span className="text-rose-500">*</span></label><input value={client} onChange={(e) => setClient(e.target.value)} list="order-customers" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500" /><datalist id="order-customers">{customers.map(c => <option key={c.id} value={c.name} />)}</datalist></div>
              <div><label className="block text-[13px] text-slate-600 mb-1.5 font-medium">销售人员</label><input value={salesman} onChange={(e) => setSalesman(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500" /></div>
              <div><label className="block text-[13px] text-slate-600 mb-1.5 font-medium">订单日期 <span className="text-rose-500">*</span></label><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500" /></div>
              <div><label className="block text-[13px] text-slate-600 mb-1.5 font-medium">交期 <span className="text-rose-500">*</span></label><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500" /></div>
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center"><div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div><span className="text-[15px] font-bold text-slate-800">产品明细</span></div>
              <button onClick={addLine} className="flex items-center text-[13px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3.5 py-1.5 rounded-lg transition-colors"><Plus size={14} className="mr-1.5" /> 添加产品</button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
                          <table className="w-full min-w-[1100px] text-left text-[13px]">
                <thead className="bg-[#fafafa] text-slate-600 border-b border-slate-200 font-bold"><tr><th className="px-5 py-3.5 font-medium">产品</th><th className="px-5 py-3.5 font-medium text-center">规格型号</th><th className="px-5 py-3.5 font-medium text-center">单位</th><th className="px-5 py-3.5 font-medium text-center">数量</th><th className="px-5 py-3.5 font-medium text-center">单价</th><th className="px-5 py-3.5 font-medium text-center">金额</th><th className="px-5 py-3.5 font-medium text-center">操作</th></tr></thead>
                <tbody>
                  {lines.length > 0 ? lines.map((line) => (
                    <tr key={line.key} className="border-b border-slate-50">
                      <td className="px-3 py-3"><input type="text" list="order-products" value={line.productName} onChange={(e) => { const value = e.target.value; updateLine(line.key, 'productName', value); const matched = products.find((p) => p.name === value || p.id === value); if (matched) { updateLine(line.key, 'productId', matched.id); updateLine(line.key, 'spec', matched.id); updateLine(line.key, 'unit', matched.unit === 'PCS' ? '件' : matched.unit === '台' ? '台' : '套'); updateLine(line.key, 'unitPrice', Number(matched.unitPrice || 0)); } }} placeholder="搜索选择产品" className="w-48 border border-slate-200 rounded-md px-2 py-1.5 text-[12px] font-bold outline-none focus:border-blue-500" /><datalist id="order-products">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist></td>
                      <td className="px-3 py-3 text-center"><input value={line.spec} onChange={(e) => updateLine(line.key, 'spec', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-center outline-none focus:border-blue-500" /></td>
                      <td className="px-3 py-3 text-center"><select value={line.unit} onChange={(e) => updateLine(line.key, 'unit', e.target.value)} className="border border-slate-200 rounded-md px-2 py-1.5 bg-white"><option>件</option><option>台</option><option>套</option></select></td>
                      <td className="px-3 py-3 text-center"><input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(line.key, 'quantity', Number(e.target.value))} className="w-20 border border-slate-200 rounded-md px-2 py-1.5 text-center outline-none focus:border-blue-500" /></td>
                      <td className="px-3 py-3 text-center"><input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.key, 'unitPrice', Number(e.target.value))} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-right font-mono font-bold outline-none focus:border-blue-500" /></td>
                      <td className="px-3 py-3 text-center font-mono font-bold text-slate-700">{sales_formatMoney(Number(line.quantity || 0) * Number(line.unitPrice || 0))}</td>
                      <td className="px-5 py-4 text-center"><button onClick={() => removeLine(line.key)} className="p-1 border border-rose-200 text-rose-500 rounded hover:bg-rose-50"><Trash2 size={14}/></button></td>
                    </tr>
                  )) : (<tr><td colSpan="7" className="px-5 py-12 text-center text-slate-400">请点击'添加产品'按钮添加产品明细</td></tr>)}
                </tbody>
                {lines.length > 0 && (<tfoot className="border-t border-slate-200 bg-slate-50"><tr><td colSpan="5" className="px-5 py-3 text-right text-[12px] font-bold text-slate-500">小计</td><td className="px-3 py-3 text-center font-mono font-bold text-slate-700">{sales_formatMoney(subtotal)}</td><td></td></tr></tfoot>)}
              </table>
            </div>
          </section>
          <section>
            <div className="flex items-center mb-4"><div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div><span className="text-[15px] font-bold text-slate-800">优惠设置</span></div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="block text-[13px] text-slate-600 mb-1.5 font-medium">折扣率 (%)</label><input type="number" min="0" max="100" value={discountRate} onChange={(e) => setDiscountRate(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500" /></div>
              <div><label className="block text-[13px] text-slate-600 mb-1.5 font-medium">减免金额</label><input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500" /></div>
              <div><label className="block text-[13px] text-slate-600 mb-1.5 font-medium">订单总额</label><div className="w-full border border-slate-100 rounded-lg px-3 py-2.5 text-[13px] font-mono font-bold text-blue-700 bg-blue-50/50">{sales_formatMoney(total)}</div></div>
            </div>
          </section>
          <section>
            <div className="flex items-center mb-4"><div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div><span className="text-[15px] font-bold text-slate-800">订单状态</span></div>
            <div className="grid grid-cols-2 gap-4">
              {statusBadge('出库状态', outStatus, outStatus === '未发货' ? 'bg-slate-100 text-slate-600' : outStatus === '部分发货' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}
              {statusBadge('订单状态', orderStatus, orderStatus === '待发货' ? 'bg-blue-100 text-blue-700' : orderStatus === '已发货' ? 'bg-emerald-100 text-emerald-700' : orderStatus === '部分发货' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}
            </div>
          </section>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50/50 rounded-b-xl">
          <button onClick={onClose} className="px-5 py-2 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">取消</button>
          <button onClick={handleSave} className="px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">保存</button>
        </div>
      </div>
    </div>
  );
};

const Sales_RecordModal = ({ type, mode, record, onClose, onSubmit }) => {
  const [draft, setDraft] = useState(record || {});
  const fields = sales_recordFields[type] || [];
  const readOnly = mode === 'view';
  const title = type === 'level'
    ? `${mode === 'create' ? '新增' : '编辑'}等级配置`
    : `${mode === 'create' ? '新增' : '编辑'}${sales_entityLabels[type] || '记录'}`;

  const handleChange = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const orderRequiredFieldsComplete = type !== 'order' || [
    draft.client,
    draft.salesman,
    draft.product,
    draft.amount,
    draft.date,
    draft.deliveryDate,
  ].every(value => String(value || '').trim());
  const recordRequiredFieldsComplete = type === 'order'
    ? orderRequiredFieldsComplete
    : String(draft.name || '').trim() && (type !== 'level' || String(draft.level || '').trim());

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl w-[680px] max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center text-[16px] font-bold text-slate-800">
            {type === 'order' ? <ShoppingCart size={18} className="text-blue-600 mr-2" /> : type === 'customer' ? <Users size={18} className="text-blue-600 mr-2" /> : <FileText size={18} className="text-blue-600 mr-2" />}
            {title}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto grid grid-cols-2 gap-5 custom-scrollbar">
          {fields.map(field => {
            const fieldReadOnly = readOnly || (mode === 'edit' && (
              ['id', 'level'].includes(field.key)
              || (type === 'order' && ['receivable', 'outStatus', 'status'].includes(field.key))
            ));
            return (
              <div key={field.key} className={field.key === 'desc' ? 'col-span-2' : ''}>
                <label className="block text-[13px] text-slate-600 mb-2 font-medium">{field.label}</label>
                <input
                  type={field.type || 'text'}
                  placeholder={field.placeholder || ''}
                  value={draft[field.key] || ''}
                  readOnly={fieldReadOnly}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors ${fieldReadOnly ? 'bg-slate-50 border-slate-100 text-slate-600' : 'bg-white border-slate-200 focus:border-blue-500 text-slate-800'}`}
                />
              </div>
            );
          })}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">{readOnly ? '关闭' : '取消'}</button>
          {!readOnly && (
            <button disabled={!recordRequiredFieldsComplete} onClick={() => onSubmit(draft)} className="px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
              保存
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// --- 子组件区 ---

const Sales_QuoteEditModal = ({ onClose, onConfirm }) => {
  return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
          <div className="bg-white rounded-xl w-[600px] max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
                  <div className="flex items-center text-[16px] font-bold text-slate-800">
                      <FileText size={18} className="text-blue-600 mr-2" /> 编辑产品报价单
                  </div>
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={20} />
                  </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 space-y-4 text-slate-600">
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                      <div className="flex items-center text-[13px] font-bold text-purple-700 mb-2">
                          <Sparkles size={15} className="mr-1.5" /> AI 已生成挽回报价建议
                      </div>
                      <p className="text-[13px] leading-relaxed text-slate-600">系统将基于过期报价单 QT-20260508-001 复制客户与产品明细，并增加 7 天价格保护期，用于重新激活 test01客户 的待确认订单。</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-[13px]">
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50"><span className="block text-slate-400 mb-1">客户</span><span className="font-bold text-slate-800">test01客户</span></div>
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50"><span className="block text-slate-400 mb-1">新有效期</span><span className="font-bold text-slate-800 font-mono">2026-06-29</span></div>
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50"><span className="block text-slate-400 mb-1">报价金额</span><span className="font-bold text-slate-800 font-mono">¥7,950.00</span></div>
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50"><span className="block text-slate-400 mb-1">策略</span><span className="font-bold text-emerald-600">价格保护</span></div>
                  </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex justify-end space-x-3 shrink-0 bg-slate-50/50 rounded-b-xl">
                  <button onClick={onClose} className="px-5 py-2 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                      取消
                  </button>
                  <button onClick={onConfirm || onClose} className="px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">
                      确认生成
                  </button>
              </div>
          </div>
      </div>
  );
};

const Sales_ReminderModal = ({ onClose, onConfirm }) => {
  const [activeChannel, setActiveChannel] = useState('wechat');
  const [isCopied, setIsCopied] = useState(false);

  const scripts = {
      wechat: "王总您好，打扰了。系统提示您这边的「test01产品」订单 (单号：SO-20260508-001) 还在待发货状态，且之前的报价刚好到期。最近产线排期比较满，如果近期有投产计划，您可以先确认订单，我这边帮您走个特批，把产线档期和物料价格先锁死，避免影响您的交期和成本。您看是否需要我发一份最新的合同给您？",
      phone: "【沟通切入点】\n1. 寒暄后，直接点明意图：系统显示报价已过期，但考虑到长期合作，主动帮忙申请价格保护。\n2. 强调稀缺性：近期元器件价格波动，产线排期紧张，尽早确认可以锁定价格和档期。\n3. 提供台阶：询问是否有需要补充的方案细节或内部审批流程卡点，表达协助意愿。"
  };
  const [currentText, setCurrentText] = useState(scripts.wechat);

  const handleChannelChange = (channel) => {
      setActiveChannel(channel);
      setCurrentText(scripts[channel]);
  };

  const handleAction = () => {
      try {
          document.execCommand('copy');
      } catch (e) {
          // fallback
      }
      setIsCopied(true);
      setTimeout(() => {
          onConfirm(); 
      }, 350);
  };

  return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-[600px] max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
                  <div className="flex items-center text-[16px] font-bold text-slate-800">
                      <BrainCircuit size={18} className="text-[#8B5CF6] mr-2" /> AI 智能触达助手
                  </div>
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={20} />
                  </button>
              </div>
              
              <div className="bg-[#F8FAFC] px-6 py-4 flex justify-between items-center text-[13px] border-b border-slate-100">
                  <div className="flex flex-col space-y-1">
                      <span className="text-slate-500">目标客户</span>
                      <span className="font-bold text-slate-800">test01客户 (客户1)</span>
                  </div>
                  <div className="flex flex-col space-y-1">
                      <span className="text-slate-500">关联单据</span>
                      <span className="font-medium text-blue-600">SO-20260508-001</span>
                  </div>
                  <div className="flex flex-col space-y-1 text-right">
                      <span className="text-slate-500">订单金额</span>
                      <span className="font-bold text-rose-500">¥8,075.00</span>
                  </div>
              </div>

              <div className="p-6">
                  <div className="mb-4">
                      <label className="block text-[13px] font-medium text-slate-700 mb-3">请选择触达与跟进渠道：</label>
                      <div className="flex space-x-3">
                          <button 
                              onClick={() => handleChannelChange('wechat')}
                              className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl border transition-all ${activeChannel === 'wechat' ? 'border-[#8B5CF6] bg-[#F5F3FF] text-[#8B5CF6]' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                          >
                              <MessageCircle size={20} className="mb-1.5" />
                              <span className="text-[12px] font-medium">微信/企微 复制</span>
                          </button>
                          <button 
                              onClick={() => handleChannelChange('phone')}
                              className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl border transition-all ${activeChannel === 'phone' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                          >
                              <Phone size={20} className="mb-1.5" />
                              <span className="text-[12px] font-medium">电话沟通话术</span>
                          </button>
                      </div>
                  </div>

                  <div>
                      <div className="flex justify-between items-end mb-2">
                          <label className="text-[13px] font-medium text-slate-700">
                              {activeChannel === 'phone' ? 'AI 沟通大纲提炼：' : 'AI 生成触达文案 (可修改)：'}
                          </label>
                          <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded flex items-center"><BrainCircuit size={10} className="mr-1"/> AI 已融合场景变量</span>
                      </div>
                      <textarea 
                          value={currentText}
                          onChange={(e) => setCurrentText(e.target.value)}
                          className="w-full h-32 p-4 text-[13px] leading-relaxed text-slate-700 border border-slate-200 rounded-xl outline-none focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] resize-none"
                      />
                  </div>
              </div>
              
              <div className="p-5 border-t border-slate-100 flex justify-end space-x-3 shrink-0 bg-slate-50/50 rounded-b-2xl">
                  <button onClick={onClose} className="px-5 py-2 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                      取消
                  </button>
                  <button 
                      onClick={handleAction} 
                      className={`px-5 py-2 text-[13px] font-bold text-white rounded-lg transition-colors shadow-sm flex items-center ${
                          isCopied ? 'bg-emerald-500' : 'bg-[#8B5CF6] hover:bg-[#7C3AED]'
                      }`}
                  >
                      {isCopied ? (
                          <><Check size={16} className="mr-1.5" /> 已复制内容</>
                      ) : (
                          <><Copy size={16} className="mr-1.5" /> 复制并标记已提醒</>
                      )}
                  </button>
              </div>
          </div>
      </div>
  );
};

const Sales_MetricCard = ({ metric }) => {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-slate-600 text-[14px] font-medium">{metric.title}</h3>
        <span className={`px-2 py-0.5 rounded text-[12px] font-medium ${sales_getTagStyle(metric.tagColor)}`}>
          {metric.tag}
        </span>
      </div>
      <div className="mb-2">
        <span className="text-3xl font-bold text-slate-800 mr-1">{metric.value}</span>
        <span className="text-sm font-medium text-slate-600">{metric.suffix}</span>
      </div>
      <div className="text-[13px] text-slate-400">
        {metric.subtitle}
      </div>
    </div>
  );
};

const Sales_AIWarningCards = ({ onOpenQuoteModal, onOpenReminderModal, isReminded }) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center mb-4 text-slate-800 font-bold text-[16px]">
          <Box className="text-[#8B5CF6] mr-2" size={18} />
          AI 订单转化延期预警 & 智能挽回
        </div>
        
        <div className="bg-[#F8FAFC] border border-slate-100 rounded-xl p-5 relative">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-slate-800 text-[15px]">客户：暂无停滞订单客户</h3>
            <span className="px-2.5 py-1 bg-rose-50 text-rose-600 text-[12px] font-bold rounded">极高流失风险</span>
          </div>
          
          <p className="text-[13px] text-slate-600 leading-relaxed mb-6">
            <span className="font-bold text-slate-800">AI 根因分析：</span> 关联【产品报价】数据，该客户对应的报价单 (QT-20260508-001) 已于 2026-06-07 过期。综合测算，本单流失或需重新报价概率达 82%。
          </p>
          
          <div className="flex gap-4">
            <button onClick={onOpenQuoteModal} className="flex-1 bg-[#8A51FF] hover:bg-[#7839F4] text-white py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all duration-200 shadow-sm hover:shadow active:scale-[0.98]">
              生成挽回产品报价单
            </button>
            <button 
                onClick={isReminded ? null : onOpenReminderModal} 
                disabled={isReminded}
                className={`flex-1 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all duration-200 shadow-sm ${
                    isReminded 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                    : 'bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 active:scale-[0.98]'
                }`}
            >
              {isReminded ? '已提醒 (24h)' : '发送订单确认提醒'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center mb-4 text-slate-800 font-bold text-[16px]">
          <AlertTriangle className="text-amber-500 mr-2" size={18} />
          AI 客户资产盘点与激活提示
        </div>
        
        <div className="bg-[#F8FAFC] border border-slate-100 rounded-xl p-5 relative h-[calc(100%-40px)]">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-slate-800 text-[15px]">客户：商洛墨翠宝石... / 上海万申...</h3>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-600 text-[12px] font-bold rounded">建议跟进</span>
          </div>
          
          <div className="text-[13px] text-slate-600 leading-relaxed space-y-2">
            <p><span className="font-bold text-slate-800">沉睡预警：</span> 发现 2 家客户当前处于 D 级，缺乏联系人关键资料记录，请及时补充，避免业务推进延迟。</p>
            <p><span className="font-bold text-slate-800">推介建议：</span> 根据数据匹配，建议优先完善联系人档案，并定向推送相关产品信息，以有效激活沉睡客户并促成合作。</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Sales_TrendChart = () => {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mt-6">
      <div className="flex items-center mb-6 text-slate-800 font-bold text-[16px]">
        <Activity className="text-[#8B5CF6] mr-2" size={18} />
        AI 报价-订单转化趋势与归因分析
      </div>

      <div className="bg-[#F8FAFC] border border-slate-100 rounded-xl p-8 flex flex-col lg:flex-row gap-10">
        <div className="lg:w-[35%] flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-200 pb-6 lg:pb-0 lg:pr-10">
          <div className="flex items-center mb-6">
            <div className="flex items-center justify-center w-[100px] h-[100px] rounded-full border-[8px] border-[#FFE4E6] bg-white relative shadow-sm mr-6 shrink-0">
              <span className="text-[26px] font-bold text-[#F43F5E]">2单</span>
              <span className="absolute -bottom-3 bg-white px-2 py-0.5 text-[11px] text-slate-400 border border-slate-100 rounded-full">确认滞留</span>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-[14px] mb-2">智能中枢深度关联分析：</h4>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                追踪当前【销售订单】全盘数据，AI 发现多笔高额订单长期停滞在「待发货」状态。发现：<span className="font-bold text-slate-800">业务推进缓慢的核心原因为开单后缺乏对客户的自动化催办与提醒机制。</span>
              </p>
            </div>
          </div>
          <div className="text-[13px] bg-[#F5F3FF] p-4 rounded-xl border border-[#EDE9FE] text-slate-600 shadow-sm">
            <span className="font-bold text-[#8B5CF6]">AI 建议：</span> 建议在系统中启用“订单超时自动触达”功能，立即向相关销售发送积压预警，并支持一键向客户推送确认链接。
          </div>
        </div>

        <div className="lg:w-[65%] flex flex-col relative min-h-[280px]">
          <div className="flex justify-between items-center mb-6">
             <span className="text-[13px] font-bold text-slate-700">近半年报价与订单转化趋势 (单位: 笔)</span>
             <div className="flex space-x-6 text-[12px] text-slate-600 font-medium">
               <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#3B82F6] mr-2"></span>发出报价数</div>
               <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#8B5CF6] mr-2"></span>AI 预测成单趋势</div>
             </div>
          </div>

          <div className="relative flex-1 w-full mt-4">
            <div className="absolute inset-0 right-[20px] left-[30px] z-0">
              {[20, 15, 10, 5, 0].map((val, i) => (
                <div key={i} className="absolute w-full flex items-center" style={{ top: `${i * 25}%` }}>
                  <span className="text-[11px] text-slate-400 w-8 absolute -left-10 text-right">{val}</span>
                  <div className="w-full border-t border-slate-200 border-dashed"></div>
                </div>
              ))}
            </div>

            <div className="absolute inset-0 right-[20px] left-[30px] z-10">
              <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15"/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d="M 50 247.5 C 110 247.5, 170 210, 230 210 C 290 210, 350 120, 410 120 C 470 120, 530 150, 590 150 C 650 150, 710 60, 770 60 L 770 300 L 50 300 Z" fill="url(#areaGradient)" />
                <path d="M 50 247.5 C 110 247.5, 170 210, 230 210 C 290 210, 350 120, 410 120 C 470 120, 530 150, 590 150 C 650 150, 710 60, 770 60" fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
                <path d="M 770 60 C 830 60, 890 150, 950 150" fill="none" stroke="#8B5CF6" strokeWidth="4" strokeDasharray="8 8" strokeLinecap="round" />
              </svg>
            </div>

            <div className="absolute inset-0 right-[20px] left-[30px] z-20">
              {[
                { x: 5, y: 82.5, color: '#3b82f6' },
                { x: 23, y: 70, color: '#3b82f6' },
                { x: 41, y: 40, color: '#3b82f6' },
                { x: 59, y: 50, color: '#3b82f6' },
                { x: 77, y: 20, color: '#3b82f6' },
                { x: 95, y: 50, color: '#8B5CF6' }
              ].map((pt, i) => (
                <div key={i} className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-sm" style={{ left: `${pt.x}%`, top: `${pt.y}%`, transform: 'translate(-50%, -50%)', border: `3px solid ${pt.color}` }}></div>
              ))}
            </div>

            <div className="absolute top-[100%] right-[20px] left-[30px] h-8 mt-4">
              {['7月', '8月', '9月', '10月', '11月', '12月(预测)'].map((label, i) => {
                  const leftPos = [5, 23, 41, 59, 77, 95][i];
                  const isPrediction = i === 5;
                  return (
                      <span key={i} className={`absolute text-[12px] transform -translate-x-1/2 ${isPrediction ? 'text-[#8B5CF6] font-bold' : 'text-slate-500 font-medium'}`} style={{ left: `${leftPos}%` }}>{label}</span>
                  )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const Sales_DashboardView = ({ quotes, orders, customers, outreachSettings, onCreateQuote, onOpenOrders, onToast, reminderAt, setReminderAt, onAudit }) => {
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [aiData, setAiData] = useState<any>(null);
  const isReminded = !!reminderAt && Date.now() - new Date(reminderAt).getTime() < 24 * 60 * 60 * 1000;
  useEffect(() => {
    import('./api/fulfillment').then(mod => {
      const apiContext = { tenantId: 'TENANT-SHWS', accessToken: sessionStorage.getItem('industrial-ai-session:v2') ? JSON.parse(sessionStorage.getItem('industrial-ai-session:v2')).accessToken : '' };
      mod.fetchAiInsights(apiContext).then(setAiData).catch(() => {});
    });
  }, []);
  const normalizedQuotes = quotes.map((quote) => ({ ...quote, status: sales_getQuoteStatus(quote) }));
  const riskyQuote = normalizedQuotes
    .filter((quote) => ['临期', '已过期'].includes(quote.status))
    .sort((a, b) => sales_daysUntil(a.validUntil) - sales_daysUntil(b.validUntil))[0];
  const dormantCustomers = customers.filter((customer) => {
    const missingProfile = !customer.phone || customer.phone === '-' || !customer.industry || customer.industry === '-';
    const inactiveDays = customer.lastInteractionAt ? Math.floor((Date.now() - new Date(`${customer.lastInteractionAt}T00:00:00`).getTime()) / 86400000) : 999;
    return customer.level === 'D' && missingProfile && inactiveDays > 30;
  });
  const stalledOrders = orders.filter((order) => {
    const created = order.createdAt || order.date;
    const ageDays = created ? Math.floor((Date.now() - new Date(created).getTime()) / 86400000) : 0;
    return order.status === '待发货' && ageDays > Number(outreachSettings.thresholdDays || 3);
  });
  const deliveryRiskOrders = orders.filter((order) => ['待发货', '已确认', '生产中', '生产补货中'].includes(order.status) && sales_daysUntil(order.deliveryDate) <= 3);
  const orderAmount = orders.reduce((sum, order) => sum + sales_parseMoney(order.amount), 0);
  const dashboardMetrics = [
    { id: 1, title: '生效报价数', value: normalizedQuotes.filter((quote) => ['正常', '临期'].includes(quote.status)).length, suffix: '份', subtitle: '有效窗口内可继续转化', tagColor: 'emerald' },
    { id: 2, title: '报价 ➔ 订单', value: orders.length, suffix: '单', subtitle: '当前销售订单总量', tagColor: 'blue' },
    { id: 3, title: '异常停滞订单', value: stalledOrders.length, suffix: '单', subtitle: `待发货超过 ${outreachSettings.thresholdDays || 3} 天`, tagColor: stalledOrders.length ? 'rose' : 'emerald' },
    { id: 4, title: '订单销售额', value: (orderAmount / 10000).toFixed(1), suffix: '万元', subtitle: `${deliveryRiskOrders.length} 单交付高危`, tagColor: deliveryRiskOrders.length ? 'amber' : 'emerald' },
  ];

  const handleReminderConfirm = () => {
      setReminderAt(new Date().toISOString());
      setShowReminderModal(false);
      onToast('订单提醒已生成', '已标记为 24 小时内不再重复提醒');
      onAudit('生成并复制 AI 订单确认提醒', riskyQuote?.id || 'SALES-RISK');
  };

  const handleQuoteGenerated = () => {
      onCreateQuote({
          id: sales_makeDocumentId('QT'),
          client: riskyQuote?.client || '待跟进客户',
          date: new Date().toISOString().slice(0, 10),
          validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          status: '正常',
          product: riskyQuote?.product,
          productName: riskyQuote?.productName,
          spec: riskyQuote?.spec,
          unit: riskyQuote?.unit,
          qty: riskyQuote?.qty,
          unitPrice: riskyQuote?.unitPrice,
          discountRate: riskyQuote?.discountRate,
          discountAmount: riskyQuote?.discountAmount,
          amount: riskyQuote?.amount || '¥0.00'
      });
      setShowQuoteModal(false);
      onToast('挽回报价单已生成', '已加入产品报价列表，可继续编辑或发送');
      onAudit('生成 AI 挽回报价单', riskyQuote?.id || 'SALES-RISK');
  };

  return (
    <>
      <UnifiedMonitorCabin
        metrics={dashboardMetrics.map(metric => ({
          id: metric.id,
          title: metric.title,
          value: metric.value,
          unit: metric.suffix,
          subtitle: metric.subtitle,
          theme: metric.tagColor,
          icon: metric.id === 1 ? Target : metric.id === 2 ? ShoppingCart : metric.id === 3 ? AlertTriangle : Wallet,
          trend: metric.tagColor === 'rose' ? 'down' : 'up',
        }))}
        aiCards={[
          {
            title: 'AI 订单转化延期预警 & 智能挽回',
            icon: Box,
            tone: 'purple',
            subject: `客户：${riskyQuote?.client || '暂无风险客户'}`,
            badge: riskyQuote ? (riskyQuote.status === '已过期' ? '极高流失风险' : '7 天内临期') : '风险正常',
            lines: [
              <><span className="font-bold text-slate-800">AI 根因分析：</span>{riskyQuote ? `报价单 ${riskyQuote.id} 的有效期为 ${riskyQuote.validUntil}，当前状态为“${riskyQuote.status}”。系统已结合剩余有效期与订单停滞情况生成挽回建议。` : '当前没有临期或过期报价单。'}</>,
            ],
            actions: riskyQuote ? (
              <>
                <button onClick={() => setShowQuoteModal(true)} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm">生成挽回产品报价单</button>
                <button onClick={isReminded ? null : () => setShowReminderModal(true)} disabled={isReminded} className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm ${isReminded ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'}`}>{isReminded ? '已提醒 (24h)' : '发送订单确认提醒'}</button>
              </>
            ) : null
          },
          {
            title: 'AI 客户资产盘点与激活提示',
            icon: AlertTriangle,
            tone: 'amber',
            subject: `客户：${dormantCustomers.length ? dormantCustomers.map((item) => item.name.slice(0, 8)).join(' / ') : '档案健康'}`,
            badge: dormantCustomers.length ? '建议跟进' : '资料完整',
            lines: dormantCustomers.length ? [
              <><span className="font-bold text-slate-800">沉睡预警：</span>发现 {dormantCustomers.length} 家 D 级客户超过 30 天未互动且联系人或行业资料不完整。</>,
              <><span className="font-bold text-slate-800">推介建议：</span>根据数据匹配，建议优先完善联系人档案，并定向推送相关产品信息，以激活沉睡客户。</>,
            ] : [
              <><span className="font-bold text-slate-800">暂未发现</span>超过 30 天未互动且联系人或行业资料不完整的客户。</>,
            ],
          },
          {
            title: '订单履约延期预警',
            icon: Truck,
            tone: 'rose',
            subject: `${deliveryRiskOrders.length} 单进入交付倒计时`,
            badge: deliveryRiskOrders.length ? '交付高危' : '交付正常',
            lines: deliveryRiskOrders.length ? [
              <><span className="font-bold text-slate-800">穿透分析：</span>高危订单为 {deliveryRiskOrders.map((item) => item.id).join('、')}，核心风险来自库存缺口或待出库环节。</>,
              <><span className="font-bold text-slate-800">建议：</span>立即发起跨部门交付协同。</>,
            ] : [
              <><span className="font-bold text-slate-800">穿透分析：</span>当前没有距离交期不足 3 天的未发货订单。</>,
            ],
          }
        ]}
        trend={{
          points: (() => {
            const now = new Date();
            const months = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: `${d.getMonth()+1}月` });
            }
            const monthlyTotals = months.map(m => {
              const monthOrders = orders.filter(o => {
                const d = o.createdAt || o.date || '';
                return d.startsWith(m.key) && o.status !== '已取消';
              });
              const total = monthOrders.reduce((s, o) => s + (Number(o.qty) || 0) * (Number(o.unitPrice) || 500), 0);
              return { ...m, total: Math.round(total / 10000 * 10) / 10 };
            });
            const maxVal = Math.max(...monthlyTotals.map(m => m.total), 1);
            return monthlyTotals.map((m, i) => ({
              x: i * 18 + 5,
              y: 90 - (m.total / maxVal) * 70,
              color: i === monthlyTotals.length - 1 ? '#8b5cf6' : undefined
            }));
          })(),
          labels: (() => {
            const now = new Date();
            const labels = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              labels.push(i === 0 ? `${d.getMonth()+1}月(预测)` : `${d.getMonth()+1}月`);
            }
            return labels;
          })(),
          yAxis: (() => {
            const totals = orders.filter(o => o.status !== '已取消').map(o => (Number(o.qty) || 0) * (Number(o.unitPrice) || 500) / 10000);
            const max = Math.max(...totals, 10);
            return [Math.ceil(max), Math.ceil(max*0.75), Math.ceil(max*0.5), Math.ceil(max*0.25), 0];
          })(),
          path: (() => {
            const now = new Date();
            const months = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
            }
            const totals = months.map(m => {
              const monthOrders = orders.filter(o => {
                const d = o.createdAt || o.date || '';
                return d.startsWith(m) && o.status !== '已取消';
              });
              return monthOrders.reduce((s, o) => s + (Number(o.qty) || 0) * (Number(o.unitPrice) || 500) / 10000, 0);
            });
            const max = Math.max(...totals, 1);
            const pts = totals.map((t, i) => `${i === 0 ? 'M' : 'C'} ${i * 180 + 50} ${300 - (t / max) * 250}`);
            return pts.join(', ').replace(/C /g, 'C ').replace(/, C/g, ', C');
          })(),
          title: 'AI 报价-订单转化趋势与归因分析',
          metric: `${stalledOrders.length}单`,
          metricLabel: '确认滞留',
          metricColor: '#f43f5e',
          ringColor: '#ffe4e6',
          insightTitle: '智能中枢深度关联分析',
          insight: stalledOrders.length ? `AI 发现 ${stalledOrders.length} 笔订单停留在“待确认”状态超过 ${outreachSettings.thresholdDays || 3} 天，核心原因是开单后缺乏自动化催办。` : '当前没有超过配置阈值的待确认订单，自动触达规则运行正常。',
          recommendation: '启用“订单超时自动触达”功能，向相关销售发送积压预警，并支持一键向客户推送确认链接。',
          chartTitle: '近半年报价金额与 AI 预测成单金额（万元）',
          legend: [
            { label: '发出报价金额', color: '#3b82f6' },
            { label: 'AI 预测成单金额', color: '#8b5cf6' },
          ],
          primary: '#3b82f6',
          secondary: '#8b5cf6',
          gradientId: 'salesTrendGradient',
        }}
      />
      {showQuoteModal && <Sales_QuoteEditModal onClose={() => setShowQuoteModal(false)} onConfirm={handleQuoteGenerated} />}
      {showReminderModal && <Sales_ReminderModal onClose={() => setShowReminderModal(false)} onConfirm={handleReminderConfirm} />}
    </>
  );
};

const Sales_QuoteCreateModal = ({ mode = 'create', record = null, customers = [], warehouses = [], products = [], onClose, onCreate, documentType = 'quote', apiContext = null }) => {
  const editing = mode === 'edit';
  const creatingOrder = documentType === 'order';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const documentIdRef = useRef(record?.id || sales_makeDocumentId(creatingOrder ? 'SO' : 'QT'));
  const [client, setClient] = useState(record?.client || '');
  const [quoteDate, setQuoteDate] = useState(record?.date || new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(record?.validUntil || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [lines, setLines] = useState(() => {
    const enrichLine = (line) => {
      const matched = products.find((p) => p.id === line.productId || p.name === line.productName);
      return {
        ...line,
        warehouseId: line.warehouseId || matched?.warehouseId || '',
        available: line.available != null ? line.available : (matched?.availQty != null ? Number(matched.availQty) : null),
      };
    };
    if (record?.lines && Array.isArray(record.lines) && record.lines.length > 0) return record.lines.map(enrichLine);
    if (record?.productName) return [enrichLine({ key: Date.now(), productName: record.productName, productId: record.productId || '', spec: record.spec || '', unit: record.unit || '件', quantity: Number(record.qty || 1), unitPrice: Number(record.unitPrice || 0) })];
    return [];
  });
  const [discountRate, setDiscountRate] = useState(record?.discountRate ?? 100);
  const [discountAmount, setDiscountAmount] = useState(record?.discountAmount || 0);
  const [orderAvailability, setOrderAvailability] = useState({});
  const availabilitySelection = JSON.stringify(lines.filter(line => line.warehouseId && line.productId)
    .map(line => [line.warehouseId, line.productId]).sort());
  useEffect(() => {
    if (!creatingOrder || !apiContext) return;
    let cancelled = false;
    setOrderAvailability({});
    const groups = new Map();
    for (const [warehouseId, productId] of JSON.parse(availabilitySelection)) {
      groups.set(warehouseId, [...new Set([...(groups.get(warehouseId) || []), productId])]);
    }
    for (const [warehouseId, productIds] of groups) {
      void inventoryApi.getAvailability(apiContext, warehouseId, productIds).then(facts => {
        if (cancelled) return;
        setOrderAvailability(previous => ({ ...previous, ...Object.fromEntries(productIds.map(productId => {
          const fact = facts.find(item => item.productId === productId);
          return [`${warehouseId}:${productId}`, fact ? Number(fact.fulfillableQty) : null];
        })) }));
      }).catch(() => {
        if (!cancelled) setOrderAvailability(previous => ({ ...previous,
          ...Object.fromEntries(productIds.map(productId => [`${warehouseId}:${productId}`, null])) }));
      });
    }
    return () => { cancelled = true; };
  }, [creatingOrder, apiContext?.tenantId, apiContext?.accessToken, availabilitySelection]);
  const [remark, setRemark] = useState(record?.remark || '');
  const [error, setError] = useState('');
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  useEffect(() => setError(''), [client, quoteDate, validUntil, lines, discountRate, discountAmount, remark]);
  const total = Math.max(0, subtotal * Math.min(100, Math.max(0, Number(discountRate))) / 100 - Math.max(0, Number(discountAmount)));
  const updateLine = (key, field, value) => setLines(prev => prev.map(line => line.key === key ? { ...line, [field]: value } : line));
  const addLine = () => setLines(prev => [...prev, { key: Date.now() + Math.random(), warehouseId: '', productName: '', productId: '', spec: '', unit: '件', available: null, quantity: 1, unitPrice: 0 }]);
  const removeLine = (key) => setLines(prev => prev.filter(line => line.key !== key));
  const warehouseOptions = warehouses;

  const handleCreate = async () => {
      if (submittingRef.current) return;
      if (!client.trim() || !quoteDate || !validUntil) {
          setError('请完整填写客户和有效期');
          return;
      }
      if (validUntil < quoteDate) {
          setError('有效期不能早于报价日期');
          return;
      }
      if (lines.length === 0) {
          setError('请至少添加一个产品');
          return;
      }
      const invalidLine = lines.find(line => !line.warehouseId || !line.productName.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) <= 0);
      if (invalidLine) {
          setError('每个产品需选择仓库并填写名称、数量和单价');
          return;
      }
      const productSummary = lines.length === 1
          ? `${lines[0].productName.trim()} / ${lines[0].spec.trim()} × ${lines[0].quantity} ${lines[0].unit}`
          : `${lines[0].productName.trim()} 等 ${lines.length} 项产品`;
      const savedAt = new Date().toISOString();
      const draft = {
          ...record,
          id: documentIdRef.current,
          version: editing ? Number(record?.version || 1) + 1 : 1,
          client: client.trim(),
          date: quoteDate,
          validUntil,
          status: '正常',
          productId: lines[0].productId,
          product: productSummary,
          productName: lines[0].productName.trim(),
          spec: lines[0].spec,
          unit: lines[0].unit,
          qty: lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0),
          unitPrice: lines[0].unitPrice,
          lines: lines.map(({ key, ...rest }) => rest),
          discountRate: Number(discountRate),
          discountAmount: Number(discountAmount),
          remark,
          amount: sales_formatMoney(total),
          createdAt: record?.createdAt || savedAt,
          updatedAt: savedAt,
      };
      submittingRef.current = true;
      setIsSubmitting(true);
      setError('');
      try {
          await onCreate(draft);
      } catch (failure) {
          setError(failure instanceof Error ? failure.message : '创建失败，请稍后重试');
      } finally {
          submittingRef.current = false;
          setIsSubmitting(false);
      }
  };

  return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="sales-document-create-title" className="bg-white rounded-xl w-[1200px] max-w-full max-h-[95vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
                  <div id="sales-document-create-title" className="flex items-center text-[16px] font-bold text-slate-800">
                      <FileText size={18} className="text-blue-600 mr-2" /> {creatingOrder ? '快速创建订单' : editing ? '编辑报价单' : '新增报价单'}
                  </div>
                  <button aria-label="关闭开单弹窗" disabled={isSubmitting} onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50">
                      <X size={20} />
                  </button>
              </div>
              
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
              <fieldset disabled={isSubmitting} className="min-w-0 p-8 space-y-8">
                  <div>
                      <div className="flex items-center mb-5">
                          <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                          <span className="text-[15px] font-bold text-slate-800">基本信息</span>
                      </div>
                      <div className="border border-slate-200 rounded-xl p-5 bg-white">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                              <div>
                                  <label className="block text-[13px] text-slate-600 mb-2">客户 <span className="text-rose-500">*</span></label>
                                  <div className="relative">
                                      <input aria-label="客户" type="text" list="sales-quote-customers" value={client} onChange={(e) => setClient(e.target.value)} placeholder="搜索选择客户" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 transition-colors" />
                                      <datalist id="sales-quote-customers">{customers.map((customer) => <option key={customer.id} value={customer.name} />)}</datalist>
                                      <Search size={14} className="absolute right-3 top-3 text-slate-400" />
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-[13px] text-slate-600 mb-2">报价日期 <span className="text-rose-500">*</span></label>
                                  <div className="relative">
                                      <input aria-label="报价日期" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 transition-colors text-slate-700" />
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-[13px] text-slate-600 mb-2">有效至 <span className="text-rose-500">*</span></label>
                                  <div className="relative">
                                      <input aria-label="有效至" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 transition-colors text-slate-700" />
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  <div>
                      <div className="flex items-center justify-between mb-5">
                          <div className="flex items-center">
                              <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                              <span className="text-[15px] font-bold text-slate-800">产品明细</span>
                          </div>
                          <button onClick={addLine} className="flex items-center text-[13px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3.5 py-1.5 rounded-lg transition-colors">
                              <Plus size={14} className="mr-1.5" /> 添加产品
                          </button>
                      </div>
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                          <table className="w-full text-left text-[13px]">
                              <thead className="bg-[#fafafa] text-slate-600 border-b border-slate-200 font-bold">
                                  <tr>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap">仓库</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap">产品</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap text-center">规格型号</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap text-center">单位</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap text-center">可用量</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap text-center">数量</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap text-center">单价</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap text-center">金额</th>
                                      <th className="px-5 py-3.5 font-medium whitespace-nowrap text-center">操作</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {lines.length > 0 ? lines.map((line) => {
                                      const warehouseProducts = line.warehouseId ? products.filter((p) => p.warehouseId === line.warehouseId) : [];
                                      const qtyNum = Number(line.quantity || 0);
                                      const available = creatingOrder ? orderAvailability[`${line.warehouseId}:${line.productId}`] : line.available;
                                      const availNum = Number(available ?? -1);
                                      const isShort = availNum >= 0 && qtyNum > availNum;
                                      return (
                                      <tr key={line.key} className="border-b border-slate-50">
                                          <td className="px-3 py-3">
                                              <select value={line.warehouseId} onChange={(e) => { const wid = e.target.value; setLines(prev => prev.map(l => l.key === line.key ? { ...l, warehouseId: wid, productId: '', productName: '', spec: '', unit: '件', available: null, quantity: 1, unitPrice: 0 } : l)); }} className="w-32 border border-slate-200 rounded-md px-2 py-1.5 bg-white text-[12px] outline-none focus:border-blue-500">
                                                  <option value="">选择仓库</option>
                                                  {warehouseOptions.map((w) => <option key={w.warehouseId} value={w.warehouseId}>{w.warehouse}</option>)}
                                              </select>
                                          </td>
                                          <td className="px-3 py-3">
                                              <select value={line.productId} disabled={!line.warehouseId} onChange={(e) => { const pid = e.target.value; const matched = products.find((p) => p.id === pid); if (matched) { setLines(prev => prev.map(l => l.key === line.key ? { ...l, productId: matched.id, productName: matched.name, spec: matched.spec || '', unit: matched.unit === 'PCS' ? '件' : matched.unit, available: Number(matched.availQty ?? 0), quantity: 1, unitPrice: Number(matched.unitPrice || 0) } : l)); } }} className="w-44 border border-slate-200 rounded-md px-2 py-1.5 bg-white text-[12px] font-bold outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400">
                                                  <option value="">{line.warehouseId ? '选择产品' : '先选仓库'}</option>
                                                  {warehouseProducts.map((p) => <option key={p.id} value={p.id}>{p.id} {p.name}</option>)}
                                              </select>
                                          </td>
                                          <td className="px-3 py-3 text-center"><input value={line.spec} onChange={(e) => updateLine(line.key, 'spec', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-center outline-none focus:border-blue-500" /></td>
                                          <td className="px-3 py-3 text-center"><select value={line.unit} onChange={(e) => updateLine(line.key, 'unit', e.target.value)} className="border border-slate-200 rounded-md px-2 py-1.5 bg-white"><option>件</option><option>台</option><option>套</option></select></td>
                                          <td className={`px-3 py-3 text-center font-mono font-bold ${isShort ? 'text-rose-600' : 'text-emerald-600'}`}>{available != null ? available : creatingOrder && line.productId ? available === null ? '查询失败' : '读取中' : '-'}</td>
                                          <td className="px-3 py-3 text-center"><input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(line.key, 'quantity', Number(e.target.value))} className="w-20 border border-slate-200 rounded-md px-2 py-1.5 text-center outline-none focus:border-blue-500" /></td>
                                          <td className="px-3 py-3 text-center"><input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.key, 'unitPrice', Number(e.target.value))} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-right font-mono font-bold outline-none focus:border-blue-500" /></td>
                                          <td className="px-3 py-3 text-center font-mono font-bold text-slate-700">{sales_formatMoney(Number(line.quantity || 0) * Number(line.unitPrice || 0))}</td>
                                          <td className="px-5 py-4 text-center"><button onClick={() => removeLine(line.key)} className="p-1 border border-rose-200 text-rose-500 rounded hover:bg-rose-50"><Trash2 size={14}/></button></td>
                                      </tr>
                                      );
                                  }) : (
                                      <tr>
                                          <td colSpan="9" className="px-5 py-12 text-center text-slate-400">请点击'添加产品'按钮添加产品明细</td>
                                      </tr>
                                  )}
                              </tbody>
                              {lines.length > 0 && (
                                  <tfoot className="border-t border-slate-200 bg-slate-50">
                                      <tr>
                                          <td colSpan="7" className="px-5 py-3 text-right text-[12px] font-bold text-slate-500">小计</td>
                                          <td className="px-3 py-3 text-center font-mono font-bold text-slate-700">{sales_formatMoney(subtotal)}</td>
                                          <td></td>
                                      </tr>
                                  </tfoot>
                              )}
                          </table>
                      </div>
                  </div>

                  <div>
                      <div className="flex items-center mb-5">
                          <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                          <span className="text-[15px] font-bold text-slate-800 mr-3">优惠设置</span>
                          <span className="text-[13px] text-slate-400">(折扣与优惠金额可同时使用)</span>
                      </div>
                      <div className="bg-[#fafafa] border border-slate-200 rounded-lg p-5 flex flex-wrap items-center gap-x-10 gap-y-4 text-[13px] text-slate-600">
                          <div className="flex items-center space-x-3">
                              <span>折扣率：</span>
                              <input type="number" min="0" max="100" value={discountRate} onChange={(e) => setDiscountRate(Number(e.target.value))} className="w-24 border border-slate-200 bg-white rounded-md p-2 text-center outline-none focus:border-blue-500 transition-colors" />
                              <span>%</span>
                          </div>
                          <div className="flex items-center space-x-3">
                              <span>优惠金额：</span>
                              <span>¥</span>
                              <input type="number" min="0" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} className="w-28 border border-slate-200 bg-white rounded-md p-2 text-center outline-none focus:border-blue-500 transition-colors" />
                              <span>元</span>
                          </div>
                          <div className="ml-auto text-right"><span className="text-slate-400 mr-2">报价总额</span><span className="font-mono font-bold text-blue-700 text-[16px]">{sales_formatMoney(total)}</span></div>
                      </div>
                  </div>

                  <div>
                      <div className="flex items-center mb-3">
                          <span className="text-[14px] font-medium text-slate-700">备注</span>
                      </div>
                      <textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="请输入备注信息（可选）" className="w-full border border-slate-200 rounded-lg p-4 text-[13px] outline-none focus:border-blue-500 transition-colors h-24 resize-none"></textarea>
                  </div>
              </fieldset>
              </div>

              <div className="p-5 border-t border-slate-100 flex flex-wrap justify-end gap-4 shrink-0 bg-white rounded-b-xl">
                  {error && <div role="alert" className="mr-auto flex items-center text-[12px] text-rose-600"><AlertCircle size={14} className="mr-1.5 shrink-0" />{error}</div>}
                  <button disabled={isSubmitting} onClick={onClose} className="px-6 py-2.5 text-[14px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50">取消</button>
                  <button disabled={isSubmitting} onClick={handleCreate} className="px-6 py-2.5 text-[14px] font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50">{isSubmitting ? '保存中...' : creatingOrder ? '创建订单' : editing ? '保存修改' : '创建报价单'}</button>
              </div>
          </div>
      </div>
  );
};

const Sales_QuoteDetailModal = ({ quote, onClose }) => {
  const originalAmount = Number(quote.qty || 0) * Number(quote.unitPrice || 0);
  const discountedAmount = originalAmount * Number(quote.discountRate ?? 100) / 100;
  const finalAmount = Math.max(0, discountedAmount - Number(quote.discountAmount || 0));
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[92vh] w-[1100px] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2 text-[16px] font-bold text-slate-800"><FileText size={18} className="text-blue-600" />报价单详情</div>
          <button title="关闭" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="space-y-6 overflow-y-auto p-6 custom-scrollbar">
              <section>
            <h4 className="mb-3 text-[13px] font-bold text-slate-800">基本信息</h4>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-4">
              {[
                ['报价单号', quote.id], ['状态', sales_getQuoteStatus(quote)], ['客户', quote.client], ['报价金额', sales_formatMoney(finalAmount)],
                ['报价日期', quote.date], ['有效期至', quote.validUntil], ['创建人', quote.creator || '当前用户'], ['备注', quote.remark || '-'],
              ].map(([label, value]) => <div key={label} className="min-h-[64px] bg-white px-4 py-3"><div className="mb-1 text-[11px] text-slate-400">{label}</div><div className="break-words text-[12px] font-bold text-slate-700">{value}</div></div>)}
            </div>
          </section>
          <section>
            <h4 className="mb-3 text-[13px] font-bold text-slate-800">优惠汇总</h4>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-[12px] md:grid-cols-4">
              <div><div className="text-slate-400">原价</div><div className="mt-1 font-mono font-bold text-slate-700">{sales_formatMoney(originalAmount)}</div></div>
              <div><div className="text-slate-400">折扣率</div><div className="mt-1 font-mono font-bold text-slate-700">{quote.discountRate ?? 100}%</div></div>
              <div><div className="text-slate-400">优惠金额</div><div className="mt-1 font-mono font-bold text-slate-700">{sales_formatMoney(quote.discountAmount || 0)}</div></div>
              <div><div className="text-slate-400">优惠后</div><div className="mt-1 font-mono font-bold text-blue-700">{sales_formatMoney(finalAmount)}</div></div>
            </div>
          </section>
          <section>
            <h4 className="mb-3 text-[13px] font-bold text-slate-800">产品明细</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full whitespace-nowrap text-left text-[12px]"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">产品名称</th><th className="px-4 py-3">规格型号</th><th className="px-4 py-3">单位</th><th className="px-4 py-3">数量</th><th className="px-4 py-3">单价</th><th className="px-4 py-3 text-right">金额</th></tr></thead><tbody>{(quote.lines && quote.lines.length > 0 ? quote.lines : [{ productName: quote.productName, spec: quote.spec, unit: quote.unit, qty: quote.qty, unitPrice: quote.unitPrice }]).map((line, idx) => { const lineAmount = Number(line.qty || 0) * Number(line.unitPrice || 0); return (<tr key={idx}><td className="px-4 py-4 font-bold text-slate-800">{line.productName}</td><td className="px-4 py-4 text-slate-600">{line.spec || '-'}</td><td className="px-4 py-4 text-slate-600">{line.unit || '件'}</td><td className="px-4 py-4 font-mono text-slate-700">{line.qty}</td><td className="px-4 py-4 font-mono text-slate-700">{sales_formatMoney(line.unitPrice)}</td><td className="px-4 py-4 text-right font-mono font-bold text-slate-800">{sales_formatMoney(lineAmount)}</td></tr>); })}</tbody><tfoot className="border-t border-slate-100 bg-slate-50"><tr><td colSpan="5" className="px-4 py-3 text-right font-bold text-slate-500">合计</td><td className="px-4 py-3 text-right font-mono font-bold text-blue-700">{sales_formatMoney(finalAmount)}</td></tr></tfoot></table>
            </div>
          </section>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-4"><button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-100">关闭</button></div>
      </div>
    </div>
  );
};

const Sales_QuotesView = ({ quotes, setQuotes, customers, quoteWarehouses, quoteProducts, onToast, onAudit, onApproveAndConvert, onOpenOrder }) => {
  const [isCreateQuoteModalOpen, setIsCreateQuoteModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('全部');
  const [searchTerm, setSearchTerm] = useState(() => new URLSearchParams(window.location.search).get('focusOrder') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [recordModal, setRecordModal] = useState(null);
  const [conversionQuote, setConversionQuote] = useState(null);
  const filters = ['全部', '正常', '已过期', '已转订单'];
  const normalizedQuotes = quotes.map((quote) => ({ ...quote, status: sales_getQuoteStatus(quote) }));
  const visibleQuotes = normalizedQuotes.filter(row => {
      const matchFilter = activeFilter === '全部' || row.status === activeFilter;
      const keyword = searchTerm.trim().toLowerCase();
      const matchSearch = !keyword || `${row.id} ${row.client}`.toLowerCase().includes(keyword);
      return matchFilter && matchSearch;
  });
  const totalPages = Math.max(1, Math.ceil(visibleQuotes.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedQuotes = visibleQuotes.slice((currentPage - 1) * limit, currentPage * limit);

  useEffect(() => setPage(1), [activeFilter, searchTerm, limit]);

  const handleCreateQuote = (quote) => {
      setQuotes(prev => [quote, ...prev]);
      setIsCreateQuoteModalOpen(false);
      onToast('报价单创建成功', `${quote.id} 已加入报价列表`);
      onAudit('新增产品报价单', quote.id);
  };

  const handleSaveQuote = (quote) => {
      setQuotes(prev => prev.map(item => item.id === quote.id ? quote : item));
      setRecordModal(null);
      onToast('报价单已更新', quote.id);
      onAudit('编辑产品报价单', quote.id);
  };

  return (
      <div className="space-y-4 max-w-full mx-auto animate-in fade-in duration-300">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                  ['报价单总数', normalizedQuotes.length, FileText, 'text-blue-600 bg-blue-50'],
                  ['已过期', normalizedQuotes.filter((item) => item.status === '已过期').length, AlertTriangle, 'text-rose-600 bg-rose-50'],
                  ['总报价金额', sales_formatMoney(normalizedQuotes.reduce((sum, item) => sum + sales_parseMoney(item.amount), 0)), BadgeDollarSign, 'text-emerald-600 bg-emerald-50'],
              ].map(([label, value, Icon, tone]) => <div key={label as string} className="flex min-h-[88px] items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm"><div><div className="text-[12px] font-bold text-slate-500">{label}</div><div className="mt-2 font-mono text-[22px] font-bold text-slate-800">{value}</div></div><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon size={18} /></div></div>)}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                  <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
                      {filters.map(filter => (
                          <button key={filter} onClick={() => setActiveFilter(filter)} className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${activeFilter === filter ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>{filter}</button>
                      ))}
                  </div>
                  <div className="flex space-x-3">
                      <div className="relative border border-slate-200 rounded-lg flex items-center bg-white px-3 w-64 hover:border-slate-300 transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                          <Search size={14} className="text-slate-400 mr-2" />
                          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索报价单号、客户" className="text-[13px] outline-none w-full py-1.5 bg-transparent" />
                      </div>
                      <button onClick={() => setIsCreateQuoteModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-[13px] font-medium flex items-center shadow-sm">
                          <Plus size={14} className="mr-1.5" /> 新增报价单
                      </button>
                  </div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] whitespace-nowrap">
                      <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100">
                          <tr><th className="px-6 py-3.5 font-medium">报价单号</th><th className="px-6 py-3.5 font-medium">客户</th><th className="px-6 py-3.5 font-medium">报价日期</th><th className="px-6 py-3.5 font-medium">有效期至</th><th className="px-6 py-3.5 font-medium">状态</th><th className="px-6 py-3.5 font-medium">总金额</th><th className="px-6 py-3.5 font-medium text-right">操作</th></tr>
                      </thead>
                      <tbody>
                          {pagedQuotes.map((row) => (
                              <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="px-6 py-4 text-blue-500 cursor-pointer font-mono font-bold">{row.id}</td>
                                  <td className="px-6 py-4 text-slate-800 font-bold">{row.client}</td>
                                  <td className="px-6 py-4 text-slate-700 font-mono">{row.date}</td>
                                  <td className="px-6 py-4 text-slate-700 font-mono">{row.validUntil}</td>
                                  <td className="px-6 py-4">
                                      {['正常', '临期'].includes(row.status) ? (
                                          <span className="inline-flex items-center bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded text-[12px] border border-emerald-100 font-medium"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5"></span>{row.status}</span>
                                      ) : (
                                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[12px] border font-medium ${row.status === '已转订单' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}><span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5"></span>{row.status}</span>
                                      )}
                                  </td>
                                  <td className="px-6 py-4 text-slate-700 font-mono font-bold">{row.amount}</td>
                                  <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end space-x-2">
                                          <button title="查看" aria-label={`查看报价单 ${row.id}`} onClick={() => setRecordModal({ mode: 'view', record: row })} className="p-1 border border-blue-200 text-blue-500 rounded hover:bg-blue-50 transition-colors"><Eye size={14}/></button>
                                          {row.status !== '已转订单' && <button title="编辑" aria-label={`编辑报价单 ${row.id}`} onClick={() => setRecordModal({ mode: 'edit', record: row })} className="p-1 border border-blue-200 text-blue-500 rounded hover:bg-blue-50 transition-colors"><Edit2 size={14}/></button>}
                                          {isQuoteConvertible(row) && <button title="审批确认并转销售订单" aria-label={`审批确认报价单 ${row.id} 并转销售订单`} onClick={() => setConversionQuote(row)} className="p-1 border border-emerald-200 text-emerald-600 rounded hover:bg-emerald-50 transition-colors"><CheckCircle2 size={14}/></button>}
                                          {row.status === '已转订单' && row.convertedOrderId && <button title="查看销售订单" aria-label={`查看报价单 ${row.id} 生成的销售订单`} onClick={() => onOpenOrder(row.convertedOrderId)} className="p-1 border border-blue-200 text-blue-600 rounded hover:bg-blue-50 transition-colors"><ArrowRight size={14}/></button>}
                                      </div>
                                  </td>
                              </tr>
                          ))}
                          {pagedQuotes.length === 0 && <tr><td colSpan="7" className="px-6 py-14 text-center text-slate-400"><Inbox size={26} className="mx-auto mb-2 text-slate-300"/>暂无报价记录，可点击“新增报价单”开始创建</td></tr>}
                      </tbody>
                  </table>
              </div>
              <Pagination total={visibleQuotes.length} page={currentPage} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
          </div>
          {isCreateQuoteModalOpen && <Sales_QuoteCreateModal customers={customers} warehouses={quoteWarehouses} products={quoteProducts} onClose={() => setIsCreateQuoteModalOpen(false)} onCreate={handleCreateQuote} />}
          {recordModal?.mode === 'view' && <Sales_QuoteDetailModal quote={recordModal.record} onClose={() => setRecordModal(null)} />}
          {recordModal?.mode === 'edit' && <Sales_QuoteCreateModal mode="edit" record={recordModal.record} customers={customers} warehouses={quoteWarehouses} products={quoteProducts} onClose={() => setRecordModal(null)} onCreate={handleSaveQuote} />}
          {conversionQuote && (
              <Sales_ConfirmModal
                  title="审批确认产品报价"
                  desc={`确认客户与销售经理已线下确认 ${conversionQuote.id} 的价格和商务条款吗？审批后将生成一张待确认、未发货的销售订单，不会在此步骤发起库存或出库作业。`}
                  confirmText="审批确认并转订单"
                  onCancel={() => setConversionQuote(null)}
                  onConfirm={() => {
                      const order = onApproveAndConvert(conversionQuote);
                      if (order) setConversionQuote(null);
                  }}
              />
          )}
      </div>
  );
};

const Sales_OrderDetailModal = ({ order, businessFlow, audits, onClose, onCancel, onOutbound }) => {
  const isLinked = businessFlow?.orderId === order.id;
  const flowSteps = [
    { key: 'approval', label: '订单审批' },
    { key: 'stockCheck', label: '库存校验' },
    { key: 'mpsMrp', label: '生产需求' },
    { key: 'delivery', label: '出库发货' },
    { key: 'financeDocs', label: '财务应收' },
    { key: 'settlement', label: '业务闭环' }
  ];
  const linkedDocuments = [
    { label: '销售订单', value: order.id, ready: true },
    { label: '库存校验任务', value: `STK-${order.id.replace('SO-', '')}`, ready: isLinked && isLinkedFlowAtLeast(businessFlow, 'stockCheck') },
    { label: '生产需求', value: `PD-${order.id.replace('SO-', '')}`, ready: isLinked && Number(order.shortage || businessFlow?.shortage || 0) > 0 && isLinkedFlowAtLeast(businessFlow, 'stockCheck') },
    { label: 'MPS/MRP', value: `MPS-${order.id.replace('SO-', '')}`, ready: isLinked && isLinkedFlowAtLeast(businessFlow, 'mpsMrp') },
    { label: '财务应收单', value: `AR-${order.id.replace('SO-', '')}`, ready: isLinked && isLinkedFlowAtLeast(businessFlow, 'financeDocs') }
  ];
  const orderAudits = audits.filter(item => item.entityId === order.id);
  const detailLines = Array.isArray(order.lines) && order.lines.length > 0
    ? order.lines
    : [{ productName: order.productName, spec: order.spec, unit: order.unit, quantity: Number(order.qty || 0), unitPrice: Number(order.unitPrice || sales_parseMoney(order.amount) / Math.max(1, Number(order.qty || 1))) }];
  const orderOriginalAmount = order.originalAmount ?? detailLines.reduce(
    (total, line) => total + Number(line.quantity ?? line.qty ?? 0) * Number(line.unitPrice || 0),
    0,
  );
  const orderShippedQty = Number(order.shippedQty ?? (order.outStatus === '全部发货' ? order.qty : 0));
  const orderRemainingQty = Number(order.remainingQty ?? Number(order.qty || 0) - orderShippedQty);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-xl w-[1200px] max-w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex justify-between items-start p-5 border-b border-slate-100">
          <div><div className="flex items-center gap-2"><ShoppingCart size={18} className="text-blue-600"/><h3 className="text-[16px] font-bold text-slate-800">订单详情</h3><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[11px] font-mono font-bold">{order.id}</span></div><p className="mt-1.5 text-[12px] text-slate-400">销售订单与出库、生产需求保持同一来源单号</p></div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={20}/></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          <section>
            <h4 className="text-[13px] font-bold text-slate-800 mb-3">基本信息</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
              {[
                ['客户', order.client], ['当前状态', order.status === '生产补货中' ? '生产中' : order.status], ['订单金额', order.amount], ['出库单号', order.outboundNo || (order.outStatus === '未发货' ? '-' : `OUT-${order.id.replace('SO-', '')}`)],
                ['订单日期', order.date], ['交货日期', order.deliveryDate], ['销售人员', order.salesman], ['创建人', order.creator || order.salesman || '当前用户'],
                ['备注', order.remark || '-'], ['出库状态', order.outStatus], ['可用库存', resolveOrderAvailQty(order)], ['应收金额', order.receivable]
              ].map(([label, value]) => <div key={label} className="bg-white px-4 py-3 min-h-[66px]"><div className="text-[11px] text-slate-400 mb-1">{label}</div><div className={`text-[12px] font-bold break-words ${label === '缺货数量' && Number(value) > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{value}</div></div>)}
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-[13px] font-bold text-slate-800">优惠汇总</h4>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-[12px] md:grid-cols-4">
              {[
                ['原价', sales_formatMoney(orderOriginalAmount)],
                ['折扣率', `${order.discountRate ?? 100}%`],
                ['优惠金额', sales_formatMoney(order.discountAmount || 0)],
                ['优惠后', order.amount],
              ].map(([label, value]) => <div key={label}><div className="text-slate-400">{label}</div><div className={`mt-1 font-mono font-bold ${label === '优惠后' ? 'text-blue-700' : 'text-slate-700'}`}>{value}</div></div>)}
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-[13px] font-bold text-slate-800">产品明细</h4>
	            <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full whitespace-nowrap text-left text-[12px]"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">产品名称</th><th className="px-4 py-3">规格型号</th><th className="px-4 py-3">单位</th><th className="px-4 py-3">销售数量</th><th className="px-4 py-3">已出库数量</th><th className="px-4 py-3">剩余数量</th><th className="px-4 py-3">单价</th><th className="px-4 py-3 text-right">金额</th></tr></thead><tbody>{detailLines.map((line, idx) => { const lineQty = Number(line.quantity ?? line.qty ?? 0); const linePrice = Number(line.unitPrice || 0); const shipped = detailLines.length === 1 ? orderShippedQty : Number(line.shippedQty ?? 0); const remaining = detailLines.length === 1 ? orderRemainingQty : Number(line.remainingQty ?? (lineQty - shipped)); return <tr key={idx}><td className="px-4 py-4 font-bold text-slate-800">{line.productName || order.productName}</td><td className="px-4 py-4 text-slate-600">{line.spec || '-'}</td><td className="px-4 py-4 text-slate-600">{line.unit || order.unit || '件'}</td><td className="px-4 py-4 font-mono">{lineQty}</td><td className="px-4 py-4 font-mono">{shipped}</td><td className="px-4 py-4 font-mono">{remaining}</td><td className="px-4 py-4 font-mono">{sales_formatMoney(linePrice)}</td><td className="px-4 py-4 text-right font-mono font-bold">{sales_formatMoney(lineQty * linePrice)}</td></tr>; })}</tbody></table></div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3"><h4 className="text-[13px] font-bold text-slate-800">跨模块流转</h4><span className={`text-[11px] font-bold px-2 py-1 rounded ${isLinked ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{isLinked ? '链路已关联' : '尚未提交跨模块流转'}</span></div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {flowSteps.map((step, index) => {
                const done = isLinked && isLinkedFlowAtLeast(businessFlow, step.key);
                return <div key={step.key} className={`relative rounded-lg border px-3 py-3 text-center ${done ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}><div className={`mx-auto mb-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}>{done ? <Check size={13}/> : index + 1}</div><div className="text-[11px] font-bold">{step.label}</div></div>;
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div><h4 className="text-[13px] font-bold text-slate-800 mb-3">关联单据</h4><div className="border border-slate-200 rounded-lg divide-y divide-slate-100">{linkedDocuments.map(doc => <div key={doc.label} className="px-4 py-3 flex justify-between text-[12px]"><span className="text-slate-500">{doc.label}</span><span className={doc.ready ? 'font-mono font-bold text-blue-600' : 'text-slate-300'}>{doc.ready ? doc.value : '待生成'}</span></div>)}</div></div>
            <div><h4 className="text-[13px] font-bold text-slate-800 mb-3">操作与流转记录</h4><div className="border border-slate-200 rounded-lg p-4 min-h-[190px] space-y-3">{[...(isLinked ? businessFlow.ledger.map(item => ({ action: item.text, time: '业务流当前记录', operator: item.module })) : []), ...orderAudits].slice(0, 6).map((item, index) => <div key={`${item.action}-${index}`} className="flex gap-3"><span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0"></span><div><div className="text-[12px] font-bold text-slate-700">{item.action}</div><div className="text-[11px] text-slate-400 mt-1">{item.operator || '当前用户'} · {item.time}</div></div></div>)}{!isLinked && orderAudits.length === 0 && <div className="h-36 flex items-center justify-center text-[12px] text-slate-400">暂无流转记录</div>}</div></div>
          </section>
          {order.remark && <section><h4 className="text-[13px] font-bold text-slate-800 mb-2">订单备注</h4><div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 text-[12px] leading-relaxed text-slate-600">{order.remark}</div></section>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-3">
          {(['已确认', '部分发货'].includes(order.status) || order.outStatus === '已移交仓库') && <button onClick={onOutbound} className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-[13px] font-bold text-white hover:bg-blue-700"><Truck size={14}/>{order.status === '部分发货' ? '发起剩余发货' : '去发货'}</button>}
          {(order.status === '待发货' && order.outStatus === '未发货' || (order.status === '已确认' && (order.outStatus === '库存不足' || order.outStatus === '未发货'))) && <button onClick={onCancel} className="px-5 py-2 rounded-lg border border-rose-200 bg-white text-[13px] font-bold text-rose-600 hover:bg-rose-50">取消订单</button>}
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-white border border-slate-200 text-[13px] font-bold text-slate-600 hover:bg-slate-100">关闭</button>
        </div>
      </div>
    </div>
  );
};

const Sales_OrdersView = ({ orders, setOrders, onToast, businessFlow, onBusinessFlowAction, audits, onAudit, onRequestOutbound, onReviewFormalOrder, onConfirmFormalOrder, onCancelFormalOrder, onCancelOrderOutbound, onNavigateProduction, customers = [], products = [], orderCreationRevision = 0, apiContext = null }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [customerFilter, setCustomerFilter] = useState('全部客户');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [recordModal, setRecordModal] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [menuOrderId, setMenuOrderId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const orderMenuRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const savedLinkedOrder = businessFlow ? orders.find(row => row.id === businessFlow.orderId || row.localOrderId === businessFlow.orderId) : null;
  const linkedOrder = businessFlow?.orderId?.trim() && !savedLinkedOrder?.aggregateId ? {
      ...savedLinkedOrder,
      id: businessFlow.orderId,
      client: savedLinkedOrder?.client ?? businessFlow.customer,
      salesman: savedLinkedOrder?.salesman ?? '系统联动',
      product: savedLinkedOrder?.product ?? businessFlow.product,
      productName: savedLinkedOrder?.productName ?? businessFlow.product,
      qty: savedLinkedOrder?.qty ?? businessFlow.qty,
      availableStock: resolveOrderAvailQty(savedLinkedOrder || { productName: businessFlow?.product, productId: businessFlow?.productId }),
      shortage: savedLinkedOrder?.shortage ?? businessFlow.shortage,
      amount: savedLinkedOrder?.amount ?? businessFlow.amount,
      receivable: isLinkedFlowAtLeast(businessFlow, 'financeDocs') ? businessFlow.amount : '待生成',
      date: savedLinkedOrder?.date ?? new Date().toISOString().slice(0, 10),
      deliveryDate: isLinkedFlowAtLeast(businessFlow, 'delivery') ? '已发货' : savedLinkedOrder?.deliveryDate ?? '待排程',
      outStatus: isLinkedFlowAtLeast(businessFlow, 'delivery') ? '全部发货' : isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '未发货' : savedLinkedOrder?.outStatus || '未发货',
      status: isLinkedFlowAtLeast(businessFlow, 'settlement') ? '已完成' : isLinkedFlowAtLeast(businessFlow, 'delivery') ? '已发货' : isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '已确认' : isLinkedFlowAtLeast(businessFlow, 'stockCheck') ? (Number(businessFlow.shortage || 0) > 0 ? '生产中' : '已确认') : savedLinkedOrder?.status || '待发货',
      remark: savedLinkedOrder?.remark
  } : null;
  const orderRows = linkedOrder ? [linkedOrder, ...orders.filter(row => row.id !== linkedOrder.id)] : orders;
  const visibleOrders = orderRows.filter(row => {
      const keyword = searchTerm.trim().toLowerCase();
      const matchSearch = !keyword || `${row.id} ${row.aggregateId || ''} ${row.localOrderId || ''} ${row.client} ${row.product}`.toLowerCase().includes(keyword);
      const normalizedStatus = row.status === '生产补货中' ? '生产中' : row.status;
      const matchStatus = statusFilter === '全部' || normalizedStatus === statusFilter;
      const matchCustomer = customerFilter === '全部客户' || row.client === customerFilter;
      return matchSearch && matchStatus && matchCustomer;
  });
  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedOrders = visibleOrders.slice((currentPage - 1) * limit, currentPage * limit);
  const actionsForOrder = (order) => {
      return getSalesOrderActions(order.status === '生产补货中' ? '生产中' : order.status, order.outStatus, order.reviewStatus, Boolean(order.aggregateId));
  };
  const activeMenuOrder = menuOrderId ? orderRows.find((order) => order.id === menuOrderId) : null;
  const activeMenuActions = activeMenuOrder
      ? actionsForOrder(activeMenuOrder)
      : [];

  useEffect(() => setPage(1), [searchTerm, statusFilter, customerFilter, limit]);

  useEffect(() => {
      if (!orderCreationRevision) return;
      setStatusFilter('待发货');
      setSearchTerm('');
      setCustomerFilter('全部客户');
      setPage(1);
  }, [orderCreationRevision]);

  useEffect(() => {
      const focusedOrder = new URLSearchParams(window.location.search).get('focusOrder');
      if (focusedOrder) setSearchTerm(focusedOrder);
  }, []);

  useEffect(() => {
      if (!menuOrderId) return undefined;
      const closeMenuOnOutsidePointer = (event) => {
          if (orderMenuRef.current?.contains(event.target)) return;
          setMenuOrderId(null);
          setMenuAnchor(null);
      };
      const closeMenuOnEscape = (event) => {
          if (event.key !== 'Escape') return;
          setMenuOrderId(null);
          setMenuAnchor(null);
      };
      document.addEventListener('pointerdown', closeMenuOnOutsidePointer);
      document.addEventListener('keydown', closeMenuOnEscape);
      return () => {
          document.removeEventListener('pointerdown', closeMenuOnOutsidePointer);
          document.removeEventListener('keydown', closeMenuOnEscape);
      };
  }, [menuOrderId]);

  const updateOrder = (order) => {
      const currentOrder = orders.find(item => item.id === order.id);
      if (!currentOrder || !isSalesOrderEditable(currentOrder.status, currentOrder.outStatus)) {
          setRecordModal(null);
          onToast('订单不可编辑', `${order.id} 已进入后续履约流程，请刷新后查看最新状态`, 'warning');
          return;
      }
      const editableFields = ['client', 'salesman', 'product', 'productName', 'productId', 'spec', 'unit', 'qty', 'unitPrice', 'lines', 'discountRate', 'discountAmount', 'amount', 'date', 'deliveryDate', 'remark'];
      const editableChanges = Object.fromEntries(editableFields.map(field => [field, order[field]]));
      setOrders(prev => prev.map(item => item.id === order.id ? {
          ...item,
          ...editableChanges,
          shortage: Math.max(0, Number(editableChanges.qty ?? item.qty ?? 0) - resolveOrderAvailQty(item)),
          status: item.status,
          outStatus: item.outStatus,
          receivable: item.receivable,
          updatedAt: new Date().toISOString(),
      } : item));
      setRecordModal(null);
      onToast('订单已更新', order.id);
      onAudit('编辑销售订单', order.id);
  };

  const submitShipmentOrderEdit = async (order) => {
      setIsSubmitting(true);
      try {
          const updatedOrder = await onConfirmFormalOrder(order);
          if (!updatedOrder) throw new Error('未取得订单确认结果，请刷新后重试');
          setOrders(prev => upsertSalesOrder(prev, updatedOrder, order.id));
          setStatusFilter('已确认');
          if (searchTerm.trim() === order.id) setSearchTerm(updatedOrder.id);
          const searchParams = new URLSearchParams(window.location.search);
          if (searchParams.get('focusOrder') === order.id && updatedOrder.id !== order.id) {
              searchParams.set('focusOrder', updatedOrder.id);
              window.history.replaceState({}, '', `${window.location.pathname}?${searchParams.toString()}${window.location.hash}`);
          }
          onToast('订单已确认', `${updatedOrder.id} 已进入已确认，可继续去发货`);
          onAudit('确认销售发货内容', updatedOrder.id);
          setRecordModal(null);
      } catch (error) {
          onToast('确认订单失败', error instanceof Error ? error.message : '请稍后重试', 'danger');
      } finally {
          setIsSubmitting(false);
      }
  };

  const duplicateOrder = (row) => {
      const newOrder = { ...row, id: sales_makeDocumentId('SO'), sourceQuoteId: '', status: '待发货', outStatus: '未发货', receivable: '待生成', createdAt: new Date().toISOString() };
      setOrders(prev => [newOrder, ...prev]);
      onToast('订单已复制', `${row.id} 已生成副本`);
      onAudit('复制销售订单', newOrder.id);
  };

  const runOrderAction = async () => {
      const { action, row } = confirmAction;
      if (action === 'review') {
          setIsSubmitting(true);
          try {
              const updatedOrder = await onReviewFormalOrder(row);
              if (updatedOrder) setOrders(prev => prev.map(item => item.aggregateId === row.aggregateId ? updatedOrder : item));
              onToast('订单复核已通过', `${row.id} 总体仍为待发货，可由销售发起发货`);
              onAudit('完成订单复核', row.id);
          } catch (error) {
              onToast('订单复核失败', error instanceof Error ? error.message : '请由独立复核人登录后重试', 'danger');
          } finally {
              setIsSubmitting(false);
              setConfirmAction(null);
          }
          return;
      }
      if (action === 'dispatch') {
          if (row.aggregateId) {
              onToast('请按正式流程操作', `${row.id} 需先完成复核，再发起发货`, 'warning');
              setConfirmAction(null);
              return;
          }
          const updatedOrder = {
              ...row,
              status: '已确认',
              outStatus: '未发货',
              confirmedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
          };
          setOrders(prev => prev.map(item => item.id === row.id ? updatedOrder : item));
          onToast('订单已确认', `${row.id} 已交由仓库执行出库`);
          onAudit('确认销售订单并移交仓库', row.id);
          onBusinessFlowAction?.('confirmSalesOrder', updatedOrder);
          setConfirmAction(null);
          return;
      } else if (action === 'recheck') {
          setOrders(prev => prev.map(item => item.id === row.id ? { ...item, availableStock: resolveOrderAvailQty(item), shortage: 0, status: '已确认', outStatus: '未发货', updatedAt: new Date().toISOString() } : item));
          onToast('库存再校验通过', `${row.id} 已回到待出库队列`);
          onAudit('生产入库后库存自动再校验', row.id);
      } else if (action === 'partialShip') {
          setOrders(prev => prev.map(item => item.id === row.id ? { ...item, status: '部分发货', outStatus: '部分发货', receivable: sales_formatMoney(sales_parseMoney(item.amount) / 2), updatedAt: new Date().toISOString() } : item));
          onToast('部分发货已回写', `${row.id} 已生成部分应收`);
          onAudit('销售订单部分发货', row.id);
      } else if (action === 'ship') {
          setOrders(prev => prev.map(item => item.id === row.id ? { ...item, status: '已发货', outStatus: '全部发货', receivable: item.amount, updatedAt: new Date().toISOString() } : item));
          onToast('销售出库完成', `${row.id} 已生成财务应收`);
          onAudit('销售订单全部发货并生成应收', row.id);
      } else if (action === 'complete') {
          setOrders(prev => prev.map(item => item.id === row.id ? { ...item, status: '已完成', updatedAt: new Date().toISOString() } : item));
          onToast('销售订单已完成', row.id);
          onAudit('完成销售订单', row.id);
          if (businessFlow?.orderId === row.id) {
              onBusinessFlowAction?.('confirmReceipt');
          }
      } else if (action === 'rollback') {
          onCancelOrderOutbound?.(row);
          setOrders(prev => prev.map(item => item.id === row.id ? { ...item, status: '待发货', outStatus: '未发货', updatedAt: new Date().toISOString() } : item));
          onToast('订单已退回待发货', `${row.id} 已退回待发货，可编辑订单内容`, 'warning');
          onAudit('已确认订单退回待发货编辑', row.id);
          setConfirmAction(null);
          return;
      } else {
          if (row.aggregateId) {
              setIsSubmitting(true);
              try {
                  const updatedOrder = await onCancelFormalOrder(row);
                  if (updatedOrder) setOrders(prev => prev.map(item => item.aggregateId === row.aggregateId ? updatedOrder : item));
                  onToast('销售订单已取消', row.id, 'warning');
                  onAudit('取消销售订单', row.id);
              } catch (error) {
                  onToast('订单取消失败', error instanceof Error ? error.message : '请稍后重试', 'danger');
              } finally {
                  setIsSubmitting(false);
                  setConfirmAction(null);
              }
              return;
          }
          onCancelOrderOutbound?.(row);
          setOrders(prev => prev.map(item => item.id === row.id ? { ...item, status: '已取消', outStatus: '已取消', updatedAt: new Date().toISOString() } : item));
          onToast('销售订单已取消', row.id, 'warning');
          onAudit('取消销售订单', row.id);
      }
      setConfirmAction(null);
  };

  const navigateToOutbound = (row) => {
      onRequestOutbound(row);
  };

  const closeOrderMenu = () => {
      setMenuOrderId(null);
      setMenuAnchor(null);
  };

  return (
  <div className="max-w-full mx-auto animate-in fade-in duration-300">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
              <div className="flex flex-wrap gap-1 rounded-lg bg-slate-50 p-1 w-max max-w-full overflow-x-auto">
                  {['全部', ...salesOrderStatuses].map((status) => <button key={status} onClick={() => setStatusFilter(status)} className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors ${statusFilter === status ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{status}</button>)}
              </div>
              <div className="flex flex-wrap gap-3">
                  <div className="relative border border-slate-200 rounded-lg flex items-center bg-white px-3 w-64 hover:border-slate-300 transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                      <Search size={14} className="text-slate-400 mr-2" />
                      <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索订单号、客户" className="text-[13px] outline-none w-full py-1.5 bg-transparent" />
                  </div>
                  <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="h-[34px] min-w-40 border border-slate-200 rounded-lg bg-white px-3 text-[13px] text-slate-600 outline-none focus:border-blue-500">
                      <option>全部客户</option>{Array.from(new Set(orderRows.map((item) => item.client))).map((client) => <option key={client}>{client}</option>)}
                  </select>
              </div>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full min-w-[1460px] text-left text-[13px] whitespace-nowrap">
                  <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100">
                      <tr><th className="px-6 py-3.5 font-medium">订单编号</th><th className="px-6 py-3.5 font-medium">客户</th><th className="px-6 py-3.5 font-medium">销售人员</th><th className="px-6 py-3.5 font-medium">产品明细</th><th className="px-6 py-3.5 font-medium">订单金额</th><th className="px-6 py-3.5 font-medium">应收金额</th><th className="px-6 py-3.5 font-medium">订单日期</th><th className="px-6 py-3.5 font-medium">交期</th><th className="px-6 py-3.5 font-medium">出库状态</th><th className="px-6 py-3.5 font-medium">状态</th><th className="sticky right-0 z-20 w-[96px] min-w-[96px] border-l border-slate-200 bg-[#fafafa] px-4 py-3.5 font-medium text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">操作</th></tr>
                  </thead>
                  <tbody>
                      {pagedOrders.map((row) => {
                          const normalizedStatus = row.status === '生产补货中' ? '生产中' : row.status;
                          const actions = actionsForOrder(row);
                          return (
                          <tr key={row.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td onClick={() => setRecordModal({ mode: 'detail', record: row })} className="px-6 py-4 text-blue-500 cursor-pointer font-mono font-bold hover:underline">{row.id}</td>
                              <td className="px-6 py-4 text-slate-800 font-bold">{row.client}</td>
                              <td className="px-6 py-4 text-slate-700">{row.salesman}</td>
                              <td className="px-6 py-4 text-slate-700">{row.product}</td>
                              <td className="px-6 py-4 text-slate-700 font-mono font-bold">{row.amount}</td>
                              <td className="px-6 py-4 text-amber-500 font-mono font-bold">{row.receivable}</td>
                              <td className="px-6 py-4 text-slate-700 font-mono">{row.date}</td>
                              <td className="px-6 py-4 text-slate-700 font-mono">{row.deliveryDate}</td>
                              <td className="px-6 py-4 text-slate-700">{row.outStatus}{row.aggregateId && <div className="mt-1 text-[10px] font-mono text-slate-400">已发 {row.shippedQty || 0} · 剩余 {row.remainingQty || 0} · {row.confirmationStatus}</div>}</td>
                              <td className="px-6 py-4">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[12px] border font-medium ${
                                      ['已发货', '已完成'].includes(row.status) ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                      ['已确认', '部分发货'].includes(row.status) ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                      normalizedStatus === '生产中' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                      row.status === '已取消' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                      'bg-orange-50 text-orange-600 border-orange-100'
                                  }`}><span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5"></span>{normalizedStatus}</span>
                              </td>
                              <td className="sticky right-0 z-10 w-[96px] min-w-[96px] border-l border-slate-100 bg-white px-4 py-4 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] transition-colors group-hover:bg-slate-50">
                                  <div className="flex items-center justify-end space-x-1.5">
                                      <button title="查看" onClick={() => setRecordModal({ mode: 'detail', record: row })} className="p-1 border border-blue-200 text-blue-500 rounded hover:bg-blue-50 transition-colors"><Eye size={14}/></button>
                                      {actions.includes('confirm') && <button title="确认订单" aria-label={`订单 ${row.id} 确认订单`} onClick={() => setRecordModal({ mode: 'shipment', record: row })} className="p-1 border border-blue-200 text-blue-600 rounded hover:bg-blue-50 transition-colors"><ShieldCheck size={14}/></button>}
                                      {actions.includes('outbound') && <button title={row.status === '部分发货' ? '发起剩余发货' : '去发货'} aria-label={`订单 ${row.id} ${row.status === '部分发货' ? '发起剩余发货' : '去发货'}`} onClick={() => navigateToOutbound(row)} className="p-1 border border-emerald-200 text-emerald-600 rounded hover:bg-emerald-50 transition-colors"><Truck size={14}/></button>}
                                      {actions.length > 0 && <button title="更多操作" aria-label={`订单 ${row.id} 更多操作`} onClick={(event) => {
                                          if (menuOrderId === row.id) {
                                              closeOrderMenu();
                                              return;
                                          }
                                          const rect = event.currentTarget.getBoundingClientRect();
                                          const menuHeight = 148;
                                          const top = rect.bottom + 6 + menuHeight <= window.innerHeight
                                              ? rect.bottom + 6
                                              : Math.max(8, rect.top - menuHeight - 6);
                                          setMenuAnchor({ top, right: Math.max(8, window.innerWidth - rect.right) });
                                          setMenuOrderId(row.id);
                                      }} className="p-1 border border-slate-200 text-slate-500 rounded hover:bg-slate-50 transition-colors"><MoreVertical size={14}/></button>}
                                  </div>
                              </td>
                          </tr>
                      )})}
                      {pagedOrders.length === 0 && <tr><td colSpan="11" className="px-6 py-14 text-center text-slate-400"><Inbox size={26} className="mx-auto mb-2 text-slate-300"/>没有符合条件的销售订单</td></tr>}
                  </tbody>
              </table>
          </div>
          <Pagination total={visibleOrders.length} page={currentPage} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      </div>
      {activeMenuOrder && menuAnchor && (
          <div ref={orderMenuRef} role="menu" aria-label={`订单 ${activeMenuOrder.id} 操作菜单`} style={{ top: menuAnchor.top, right: menuAnchor.right }} className="fixed z-[70] min-w-[148px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl">
              {activeMenuActions.includes('edit') && <button role="menuitem" onClick={() => { setRecordModal({ mode: 'edit', record: activeMenuOrder }); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><Edit2 size={14} className="text-blue-600" />编辑订单</button>}
              {activeMenuActions.includes('review') && <button role="menuitem" onClick={() => { setConfirmAction({ action: 'review', row: activeMenuOrder }); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><ShieldCheck size={14} className="text-blue-600" />审批 / 复核</button>}
              {activeMenuActions.includes('confirm') && <button role="menuitem" onClick={() => { setRecordModal({ mode: 'shipment', record: activeMenuOrder }); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><ShieldCheck size={14} className="text-blue-600" />确认订单</button>}
              {activeMenuActions.includes('outbound') && <button role="menuitem" onClick={() => { navigateToOutbound(activeMenuOrder); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><Truck size={14} className="text-emerald-600" />{activeMenuOrder.status === '部分发货' ? '发起剩余发货' : '去发货'}</button>}
              {activeMenuActions.includes('rollback') && <button role="menuitem" onClick={() => { setConfirmAction({ action: 'rollback', row: activeMenuOrder }); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-amber-700 hover:bg-amber-50"><RotateCcw size={14} className="text-amber-600" />退回待发货</button>}
              {activeMenuActions.includes('expedite') && <button role="menuitem" onClick={() => { onNavigateProduction(); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><Factory size={14} className="text-amber-600" />查看生产补货</button>}
              {activeMenuActions.includes('complete') && <button role="menuitem" onClick={() => { setConfirmAction({ action: 'complete', row: activeMenuOrder }); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><CheckCircle2 size={14} className="text-emerald-600" />确认收货</button>}
              {activeMenuActions.includes('duplicate') && <button role="menuitem" onClick={() => { duplicateOrder(activeMenuOrder); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><Copy size={14} className="text-blue-600" />复制订单</button>}
              {activeMenuActions.includes('cancel') && <button role="menuitem" onClick={() => { setConfirmAction({ action: 'cancel', row: activeMenuOrder }); closeOrderMenu(); }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-bold text-rose-600 hover:bg-rose-50"><X size={14} />取消订单</button>}
          </div>
      )}
      {recordModal?.mode === 'edit' && <Sales_OrderEditModal mode="edit" record={recordModal.record} customers={customers} products={inv_stockData.filter((p) => p.kind === '产品')} onClose={() => setRecordModal(null)} onSubmit={updateOrder} />}
      {recordModal?.mode === 'shipment' && <SalesShipmentOrderEditModal mode="confirm" order={recordModal.record} pending={isSubmitting} apiContext={apiContext} products={inv_stockData.filter((p) => p.kind === "产品")} onClose={() => setRecordModal(null)} onSubmit={submitShipmentOrderEdit} />}
      {recordModal?.mode === 'detail' && <Sales_OrderDetailModal order={recordModal.record} businessFlow={businessFlow} audits={audits} onClose={() => setRecordModal(null)} onCancel={() => { setConfirmAction({ action: 'cancel', row: recordModal.record }); setRecordModal(null); }} onOutbound={() => { setRecordModal(null); navigateToOutbound(recordModal.record); }} />}
      {confirmAction && (
          <Sales_ConfirmModal
              title={({ review: '审批 / 复核订单', requestShipment: '发起发货', dispatch: '确认订单', recheck: '库存再校验', complete: '确认收货', cancel: '取消订单', rollback: '退回待发货' })[confirmAction.action]}
              desc={confirmAction.action === 'review' ? `复核只更新 ${confirmAction.row.id} 的独立确认状态，总体仍保持待确认；创建人与复核人必须分离。` : confirmAction.action === 'requestShipment' ? `${confirmAction.row.id} 将移交仓库进行权威库存校验；此时不会提前进入已确认。` : confirmAction.action === 'dispatch' ? `确认后，${confirmAction.row.id} 将交由仓库执行出库；仓库发现库存不足时负责发起生产申请。` : confirmAction.action === 'rollback' ? `${confirmAction.row.id} 将退回待发货状态，已创建的出库任务将被取消，订单明细恢复可编辑。` : `确定对 ${confirmAction.row.id} 执行该操作吗？`}
              confirmText={({ review: '确认复核通过', requestShipment: '提交发货申请', dispatch: '确认订单', recheck: '重新校验', complete: '确认收货', cancel: '取消订单', rollback: '确认退回' })[confirmAction.action]}
              tone={confirmAction.action === 'cancel' ? 'danger' : confirmAction.action === 'rollback' ? 'warning' : 'blue'}
              pending={isSubmitting}
              onCancel={() => setConfirmAction(null)}
              onConfirm={runOrderAction}
          />
      )}
  </div>
  );
};

const Sales_CustomerModal = ({ mode, record, customers, industries, onClose, onSubmit }) => {
  const readOnly = mode === 'view';
  const [draft, setDraft] = useState(record || {
    id: sales_makeDocumentId('KH'), name: '', code: '', address: '', owner: '', level: 'D', status: '合作中', industry: '', remark: '', lastInteractionAt: new Date().toISOString().slice(0, 10)
  });
  const [contacts, setContacts] = useState(record?.contacts?.length ? record.contacts : [{ name: record?.contact || '', phone: record?.phone === '-' ? '' : record?.phone || '', role: '决策人' }]);
  const [error, setError] = useState('');
  const activeIndustries = industries.filter((item) => item.status === '启用');

  const setField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const updateContact = (index, key, value) => setContacts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));

  const submit = () => {
    const primary = contacts[0] || {};
    if (!draft.name?.trim() || !primary.name?.trim()) {
      setError('请填写客户名称和联系人');
      return;
    }
    const duplicate = customers.find((item) => item.id !== draft.id && (item.name.trim() === draft.name.trim() || (draft.code?.trim() && draft.code !== '-' && item.code === draft.code.trim())));
    if (duplicate) {
      setError(`客户档案与 ${duplicate.id} 重复，请核对客户名称或统一社会信用代码`);
      return;
    }
    onSubmit({ ...draft, name: draft.name.trim(), code: draft.code?.trim() || '-', contact: primary.name.trim(), phone: primary.phone.trim(), contacts });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[92vh] w-[900px] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2 text-[16px] font-bold text-slate-800"><Users size={18} className="text-blue-600" />{readOnly ? '客户详情' : mode === 'create' ? '新增客户' : '编辑客户'}</div>
          <button title="关闭" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="space-y-7 overflow-y-auto px-6 py-5 custom-scrollbar">
          <section>
            <h4 className="mb-4 text-[13px] font-bold text-slate-800">客户基本信息</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block"><span className="mb-2 block text-[12px] font-bold text-slate-500">客户编码</span><input value={draft.id} readOnly className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-500" /></label>
              <label className="block sm:col-span-2"><span className="mb-2 block text-[12px] font-bold text-slate-500">客户名称 <b className="text-rose-500">*</b></span><input value={draft.name || ''} readOnly={readOnly} onChange={(event) => setField('name', event.target.value)} placeholder="输入企业全称，保存时自动查重" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label>
              <label className="block"><span className="mb-2 block text-[12px] font-bold text-slate-500">统一社会信用代码</span><input value={draft.code === '-' ? '' : draft.code || ''} readOnly={readOnly} onChange={(event) => setField('code', event.target.value.toUpperCase())} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label>
              <label className="block"><span className="mb-2 block text-[12px] font-bold text-slate-500">行业</span><select value={draft.industry === '-' ? '' : draft.industry || ''} disabled={readOnly} onChange={(event) => setField('industry', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-500 disabled:bg-slate-50"><option value="">请选择行业</option>{activeIndustries.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
              <label className="block"><span className="mb-2 block text-[12px] font-bold text-slate-500">最近互动日期</span><input type="date" value={draft.lastInteractionAt || ''} readOnly={readOnly} onChange={(event) => setField('lastInteractionAt', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label>
              <label className="block sm:col-span-2 lg:col-span-3"><span className="mb-2 block text-[12px] font-bold text-slate-500">客户地址 / 定位</span><input value={draft.address || ''} readOnly={readOnly} onChange={(event) => setField('address', event.target.value)} placeholder="省 / 市 / 区 / 详细地址" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label>
              <label className="block sm:col-span-2 lg:col-span-3"><span className="mb-2 block text-[12px] font-bold text-slate-500">备注</span><textarea value={draft.remark || ''} readOnly={readOnly} onChange={(event) => setField('remark', event.target.value)} placeholder="请输入备注信息" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label>
            </div>
          </section>
          <section className="border-y border-slate-100 py-6">
            <div className="mb-4 flex items-center justify-between"><h4 className="text-[13px] font-bold text-slate-800">联系人矩阵</h4>{!readOnly && <button type="button" onClick={() => setContacts((prev) => [...prev, { name: '', phone: '', role: '关键使用人' }])} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-600 hover:bg-blue-100"><Plus size={14} />添加联系人</button>}</div>
            <div className="space-y-3">{contacts.map((contact, index) => <div key={index} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><label><span className="mb-1.5 block text-[11px] font-bold text-slate-400">{index === 0 ? '主联系人 *' : '联系人'}</span><input value={contact.name} readOnly={readOnly} onChange={(event) => updateContact(index, 'name', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label><label><span className="mb-1.5 block text-[11px] font-bold text-slate-400">联系电话 {index === 0 ? '*' : ''}</span><input value={contact.phone} readOnly={readOnly} onChange={(event) => updateContact(index, 'phone', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label><label><span className="mb-1.5 block text-[11px] font-bold text-slate-400">决策角色（KP）</span><select value={contact.role} disabled={readOnly} onChange={(event) => updateContact(index, 'role', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none disabled:bg-slate-50"><option>决策人</option><option>关键使用人</option><option>技术影响人</option><option>采购联系人</option><option>财务联系人</option></select></label>{!readOnly && <button title="删除联系人" disabled={index === 0} onClick={() => setContacts((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={15} /></button>}</div>)}</div>
          </section>
          <section>
            <h4 className="mb-4 text-[13px] font-bold text-slate-800">业务与财务属性</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><label><span className="mb-2 block text-[12px] font-bold text-slate-500">归属销售</span><input value={draft.owner || ''} readOnly={readOnly} onChange={(event) => setField('owner', event.target.value)} placeholder="留空即进入公海池" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-500 read-only:bg-slate-50" /></label><label><span className="mb-2 block text-[12px] font-bold text-slate-500">客户等级</span><select value={draft.level || 'D'} disabled={readOnly} onChange={(event) => setField('level', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] disabled:bg-slate-50">{['D','C','B','A','VIP'].map((item) => <option key={item} value={item}>{item}级客户</option>)}</select></label><label><span className="mb-2 block text-[12px] font-bold text-slate-500">状态</span><select value={draft.status || '合作中'} disabled={readOnly} onChange={(event) => setField('status', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] disabled:bg-slate-50">{['合作中','潜在客户','跟进中','已流失'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
          </section>
          {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] font-bold text-rose-700"><AlertCircle size={15} />{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-[13px] font-bold text-slate-600">{readOnly ? '关闭' : '取消'}</button>{!readOnly && <button disabled={!draft.name?.trim() || !contacts[0]?.name?.trim()} onClick={submit} className="rounded-lg bg-blue-600 px-5 py-2 text-[13px] font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">保存</button>}</div>
      </div>
    </div>
  );
};

const Sales_CustomersView = ({ customers, setCustomers, industries, onToast, onAudit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('全部等级');
  const [industryFilter, setIndustryFilter] = useState('全部行业');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [recordModal, setRecordModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const visibleCustomers = customers.filter(row => {
      const keyword = searchTerm.trim().toLowerCase();
      const matchSearch = !keyword || `${row.id} ${row.name} ${row.contact}`.toLowerCase().includes(keyword);
      const matchLevel = levelFilter === '全部等级' || row.level === levelFilter;
      const matchIndustry = industryFilter === '全部行业' || row.industry === industryFilter;
      return matchSearch && matchLevel && matchIndustry;
  });
  const totalPages = Math.max(1, Math.ceil(visibleCustomers.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedCustomers = visibleCustomers.slice((currentPage - 1) * limit, currentPage * limit);

  useEffect(() => setPage(1), [searchTerm, levelFilter, industryFilter, limit]);

  const handleSaveCustomer = (customer) => {
      const creating = recordModal?.mode === 'create';
      setCustomers(prev => creating ? [customer, ...prev] : prev.map(item => item.id === customer.id ? customer : item));
      setRecordModal(null);
      onToast(creating ? '客户档案已创建' : '客户资料已更新', customer.name);
      onAudit(creating ? '创建客户档案' : '更新客户资料', customer.id);
  };

  const handleDeleteCustomer = () => {
      setCustomers((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      onToast('客户已删除', deleteTarget.name, 'warning');
      onAudit('删除客户', deleteTarget.id);
      setDeleteTarget(null);
  };

  return (
  <div className="max-w-full mx-auto animate-in fade-in duration-300">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap justify-between gap-3 items-center bg-white">
              <div className="flex space-x-3">
                  <div className="relative border border-slate-200 rounded-lg flex items-center bg-white px-3 w-64 hover:border-slate-300 transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                      <Search size={14} className="text-slate-400 mr-2" />
                      <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索客户名称、编码" className="text-[13px] outline-none w-full py-1.5 bg-transparent" />
                  </div>
                  <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="border border-slate-200 rounded-lg flex items-center bg-white px-3 w-40 text-[13px] text-slate-600 cursor-pointer hover:border-slate-300 transition-colors outline-none">
                      <option>全部等级</option><option>D</option><option>C</option><option>B</option><option>A</option><option>VIP</option>
                  </select>
                  <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} className="border border-slate-200 rounded-lg bg-white px-3 w-40 text-[13px] text-slate-600 cursor-pointer outline-none focus:border-blue-500">
                      <option>全部行业</option>{industries.filter((item) => item.status === '启用').map((item) => <option key={item.id}>{item.name}</option>)}
                  </select>
              </div>
              <button onClick={() => setRecordModal({ mode: 'create', record: null })} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-blue-700"><Plus size={14} />新增客户</button>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                  <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100">
                      <tr><th className="px-6 py-3.5 font-medium">客户编码</th><th className="px-6 py-3.5 font-medium">客户名称</th><th className="px-6 py-3.5 font-medium">社会信用代码</th><th className="px-6 py-3.5 font-medium">联系人</th><th className="px-6 py-3.5 font-medium">联系电话</th><th className="px-6 py-3.5 font-medium">客户等级</th><th className="px-6 py-3.5 font-medium">状态</th><th className="px-6 py-3.5 font-medium">行业</th><th className="px-6 py-3.5 font-medium text-right">操作</th></tr>
                  </thead>
                  <tbody>
                      {pagedCustomers.map(row => (
                          <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-blue-500 cursor-pointer font-mono font-bold">{row.id}</td>
                              <td className="px-6 py-4 text-slate-800 font-bold">{row.name}</td>
                              <td className="px-6 py-4 text-slate-700">{row.code}</td>
                              <td className="px-6 py-4 text-slate-700">{row.contact}</td>
                              <td className="px-6 py-4 text-slate-700 font-mono">{row.phone}</td>
                              <td className="px-6 py-4">
                                  <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded text-[12px] font-bold ${sales_getLevelBadgeColor(row.level)}`}>{row.level}</span>
                              </td>
                              <td className="px-6 py-4">
                                  <span className="inline-flex items-center bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded text-[12px] border border-emerald-100 font-medium"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5"></span>{row.status}</span>
                              </td>
                              <td className="px-6 py-4 text-slate-700">{row.industry}</td>
                              <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end space-x-2">
                                      <button title="编辑" onClick={() => setRecordModal({ mode: 'edit', record: row })} className="p-1 border border-blue-200 text-blue-500 rounded hover:bg-blue-50 transition-colors"><Edit2 size={14}/></button>
                                      <button title="删除" onClick={() => setDeleteTarget(row)} className="p-1 border border-rose-200 text-rose-500 rounded hover:bg-rose-50 transition-colors"><Trash2 size={14}/></button>
                                  </div>
                              </td>
                          </tr>
                      ))}
                      {pagedCustomers.length === 0 && <tr><td colSpan="9" className="px-6 py-14 text-center text-slate-400"><Inbox size={26} className="mx-auto mb-2 text-slate-300"/>没有符合条件的客户</td></tr>}
                  </tbody>
              </table>
          </div>
          <Pagination total={visibleCustomers.length} page={currentPage} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      </div>
      {recordModal && <Sales_CustomerModal mode={recordModal.mode} record={recordModal.record} customers={customers} industries={industries} onClose={() => setRecordModal(null)} onSubmit={handleSaveCustomer} />}
      {deleteTarget && <Sales_ConfirmModal title="确认删除" desc={`确定要删除客户 “${deleteTarget.name}” 吗？`} confirmText="删除" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={handleDeleteCustomer} />}
  </div>
  );
};

const Sales_BaseDataView = ({ levels, setLevels, industries, setIndustries, customers, outreachSettings, setOutreachSettings, onToast, onAudit }) => {
  const [activeSubTab, setActiveSubTab] = useState('customerLevel');
  const [recordModal, setRecordModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const createLevel = () => {
      setRecordModal({ type: 'level', mode: 'create', record: { level: '', name: '', min: '0 万元', desc: '', sort: levels.length + 1, status: '启用', color: '#10b981' } });
  };

  const createIndustry = () => {
      setRecordModal({ type: 'industry', mode: 'create', record: { id: `IND-${String(industries.length + 1).padStart(3, '0')}`, name: '', parentId: '', sort: industries.length + 1, status: '启用', remark: '', createdAt: new Date().toLocaleString('zh-CN', { hour12: false }) } });
  };

  const handleSaveRecord = (record) => {
      if (recordModal.type === 'level') {
          setLevels(prev => recordModal.mode === 'create' ? [...prev, record] : prev.map(item => item.level === record.level ? record : item));
          onToast(recordModal.mode === 'create' ? '客户等级已新增' : '客户等级已更新', record.name);
          onAudit(recordModal.mode === 'create' ? '新增客户等级' : '编辑客户等级', record.level);
      } else {
          setIndustries(prev => recordModal.mode === 'create' ? [...prev, record] : prev.map(item => item.id === record.id ? record : item));
          onToast(recordModal.mode === 'create' ? '行业已新增' : '行业已更新', record.name);
          onAudit(recordModal.mode === 'create' ? '新增行业字典' : '编辑行业字典', record.id);
      }
      setRecordModal(null);
  };

  const toggleLevelStatus = (row) => {
      const status = row.status === '启用' ? '停用' : '启用';
      setLevels(prev => prev.map(item => item.level === row.level ? { ...item, status } : item));
      onToast(`客户等级已${status}`, row.name, status === '停用' ? 'warning' : 'success');
      onAudit(`${status}客户等级`, row.level);
  };

  const toggleIndustryStatus = (row) => {
      const status = row.status === '启用' ? '停用' : '启用';
      setIndustries(prev => prev.map(item => item.id === row.id ? { ...item, status } : item));
      onToast(`行业已${status}`, row.name, status === '停用' ? 'warning' : 'success');
      onAudit(`${status}行业字典`, row.id);
  };

  const handleDeleteRecord = () => {
      if (confirmDelete.type === 'level') {
          if (customers.some((customer) => customer.level === confirmDelete.record.level)) {
              onToast('客户等级正在被引用', '请停用该等级，不能直接删除', 'warning');
              setConfirmDelete(null);
              return;
          }
          setLevels(prev => prev.filter(item => item.level !== confirmDelete.record.level));
      } else {
          setIndustries(prev => prev.filter(item => item.id !== confirmDelete.record.id));
      }
      onToast('记录已删除', confirmDelete.record.name, 'danger');
      onAudit(confirmDelete.type === 'level' ? '删除客户等级' : '删除行业字典', confirmDelete.type === 'level' ? confirmDelete.record.level : confirmDelete.record.id);
      setConfirmDelete(null);
  };

  return (
      <div className="max-w-full mx-auto animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-5">
              <div className="flex items-center">
                  <div className="w-1 h-4 bg-blue-600 mr-2.5 rounded-sm"></div>
                  <span className="text-[13px] text-slate-600 font-medium tracking-wide">
                      {activeSubTab === 'customerLevel' ? '配置客户等级及其年采购额阈值，支持手动调整等级' : 
                       activeSubTab === 'industryDict' ? '维护客户所在行业字典数据' :
                       '配置销售订单超时后的系统自动提醒与推送行为'}
                  </span>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setActiveSubTab('customerLevel')} className={`${activeSubTab === 'customerLevel' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'} px-5 py-1.5 rounded-md text-[13px] font-medium flex items-center transition-colors`}>
                      <Users size={14} className="mr-1.5" /> 客户等级
                  </button>
                  <button onClick={() => setActiveSubTab('industryDict')} className={`${activeSubTab === 'industryDict' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'} px-5 py-1.5 rounded-md text-[13px] font-medium flex items-center transition-colors`}>
                      <Box size={14} className="mr-1.5" /> 行业字典
                  </button>
                  <button onClick={() => setActiveSubTab('orderSettings')} className={`${activeSubTab === 'orderSettings' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'} px-5 py-1.5 rounded-md text-[13px] font-medium flex items-center transition-colors`}>
                      <Settings size={14} className="mr-1.5" /> 订单设置
                  </button>
              </div>
          </div>
          
          {activeSubTab === 'customerLevel' && (
              <>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                      <div className="p-4 border-b border-slate-100 flex justify-end bg-white">
                          <button onClick={createLevel} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-[13px] font-medium flex items-center shadow-sm">
                              <Plus size={14} className="mr-1.5" /> 新增等级
                          </button>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-[13px] whitespace-nowrap">
                              <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100">
                                  <tr><th className="px-6 py-3.5 font-medium w-24">等级</th><th className="px-6 py-3.5 font-medium">名称</th><th className="px-6 py-3.5 font-medium">年采购额下限</th><th className="px-6 py-3.5 font-medium">描述</th><th className="px-6 py-3.5 font-medium">排序</th><th className="px-6 py-3.5 font-medium">状态</th><th className="px-6 py-3.5 font-medium text-right">操作</th></tr>
                              </thead>
                              <tbody>
                                  {levels.map(row => (
                                      <tr key={row.level} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                          <td className="px-6 py-4"><span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded text-[12px] font-bold ${sales_getLevelBadgeColor(row.level)}`}>{row.level}</span></td>
                                          <td className="px-6 py-4 text-slate-700 font-bold">{row.name}</td>
                                          <td className="px-6 py-4 text-slate-700 font-mono">{row.min}</td>
                                          <td className="px-6 py-4 text-slate-500">{row.desc}</td>
                                          <td className="px-6 py-4 text-slate-700">{row.sort}</td>
                                          <td className="px-6 py-4">
                                              <span className={`inline-flex items-center text-[12px] font-medium ${row.status === '启用' ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                  <span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5"></span>{row.status}
                                              </span>
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                              <div className="flex items-center justify-end space-x-2">
                                                  <button title="编辑" onClick={() => setRecordModal({ type: 'level', mode: 'edit', record: row })} className="p-1 border border-blue-200 text-blue-500 rounded hover:bg-blue-50 transition-colors"><Edit2 size={14}/></button>
                                                  <button title={row.status === '启用' ? '停用' : '启用'} onClick={() => toggleLevelStatus(row)} className="p-1 border border-amber-200 text-amber-500 rounded hover:bg-amber-50 transition-colors"><Power size={14}/></button>
                                                  <button title="删除" onClick={() => setConfirmDelete({ type: 'level', record: row })} className="p-1 border border-rose-200 text-rose-500 rounded hover:bg-rose-50 transition-colors"><Trash2 size={14}/></button>
                                              </div>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                      <Pagination total={levels.length} page={1} limit={10} />
                  </div>
                  <div className="mt-6 flex items-center text-[12px] text-slate-500">
                      <AlertTriangle size={14} className="mr-1.5" />提示：修改年采购额下限后，仅影响后续「建议等级」的计算，不会自动修改存量客户等级
                  </div>
              </>
          )}

          {activeSubTab === 'industryDict' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full animate-in fade-in duration-300">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="text-[13px] text-slate-500 font-medium">维护客户所在行业字典数据</div>
                      <button onClick={createIndustry} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-[13px] font-medium flex items-center shadow-sm">
                          <Plus size={14} className="mr-1.5" /> 新增行业
                      </button>
                  </div>
                  <table className="w-full text-left text-[13px] whitespace-nowrap">
                      <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100">
                          <tr><th className="px-6 py-3.5 font-medium">行业名称</th><th className="px-6 py-3.5 font-medium">排序</th><th className="px-6 py-3.5 font-medium">状态</th><th className="px-6 py-3.5 font-medium">备注</th><th className="px-6 py-3.5 font-medium">创建时间</th><th className="px-6 py-3.5 font-medium text-right">操作</th></tr>
                      </thead>
                      <tbody>
                          {industries.map(row => (
                              <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="px-6 py-4 text-slate-800 font-bold">{row.name}</td>
                                  <td className="px-6 py-4 text-slate-600">{row.sort}</td>
                                  <td className="px-6 py-4"><span className={`inline-flex items-center text-[12px] font-medium ${row.status === '启用' ? 'text-emerald-500' : 'text-slate-400'}`}><span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5"></span>{row.status}</span></td>
                                  <td className="px-6 py-4 text-slate-500">{row.remark || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{row.createdAt || '-'}</td>
                                  <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end space-x-2">
                                          <button title="编辑" onClick={() => setRecordModal({ type: 'industry', mode: 'edit', record: row })} className="p-1 border border-blue-200 text-blue-500 rounded hover:bg-blue-50 transition-colors"><Edit2 size={14}/></button>
                                          <button title="删除" onClick={() => setConfirmDelete({ type: 'industry', record: row })} className="p-1 border border-rose-200 text-rose-500 rounded hover:bg-rose-50 transition-colors"><Trash2 size={14}/></button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  <Pagination total={industries.length} page={1} limit={10} />
                  <div className="border-t border-slate-100 px-6 py-4 text-[12px] text-slate-500">提示：删除行业不会影响已使用该行业的客户数据</div>
              </div>
          )}

          {activeSubTab === 'orderSettings' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-4xl animate-in fade-in duration-300">
                  <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="text-[15px] font-bold text-slate-800">自动化触达规则</h3>
                      <p className="text-[13px] text-slate-500 mt-1">配置销售订单超时后的系统自动提醒与推送行为</p>
                  </div>
                  <div className="p-6 space-y-8">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="sm:w-32 shrink-0"><label className="text-[13px] font-bold text-slate-700">触发阈值 <span className="text-rose-500">*</span></label></div>
                          <div className="flex items-center space-x-3 text-[13px] text-slate-600">
                              <span>订单处于「待确认」状态持续超过</span>
                              <input type="number" min="1" value={outreachSettings.thresholdDays} onChange={(event) => setOutreachSettings(prev => ({ ...prev, thresholdDays: Math.max(1, Number(event.target.value)) }))} className="w-16 px-2 py-1.5 text-center border border-slate-200 rounded text-[13px] font-bold text-slate-800 focus:outline-none focus:border-blue-500 transition-colors" />
                              <span>天</span>
                          </div>
                      </div>
                      <hr className="border-slate-100" />
                      <div className="flex flex-col sm:flex-row gap-4">
                          <div className="sm:w-32 shrink-0 pt-1"><label className="text-[13px] font-bold text-slate-700">通知对象</label></div>
                          <div className="flex flex-wrap gap-5">
                              <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={outreachSettings.recipients.customer} onChange={(event) => setOutreachSettings(prev => ({ ...prev, recipients: { ...prev.recipients, customer: event.target.checked } }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" /><span className="text-[13px] text-slate-700 font-medium">客户关键联系人</span></label>
                              <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={outreachSettings.recipients.salesman} onChange={(event) => setOutreachSettings(prev => ({ ...prev, recipients: { ...prev.recipients, salesman: event.target.checked } }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" /><span className="text-[13px] text-slate-700 font-medium">归属销售人员</span></label>
                              <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={outreachSettings.recipients.manager} onChange={(event) => setOutreachSettings(prev => ({ ...prev, recipients: { ...prev.recipients, manager: event.target.checked } }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" /><span className="text-[13px] text-slate-700 font-medium">销售主管抄送</span></label>
                          </div>
                      </div>
                      <hr className="border-slate-100" />
                      <div className="flex flex-col sm:flex-row gap-4">
                          <div className="sm:w-32 shrink-0 pt-1"><label className="text-[13px] font-bold text-slate-700">触达渠道</label></div>
                          <div className="flex flex-col space-y-3">
                              <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={outreachSettings.channels.wechat} onChange={(event) => setOutreachSettings(prev => ({ ...prev, channels: { ...prev.channels, wechat: event.target.checked } }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" /><span className="text-[13px] text-slate-700 font-medium">微信 / 企微消息推送 (带确认链接)</span></label>
                              <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={outreachSettings.channels.sms} onChange={(event) => setOutreachSettings(prev => ({ ...prev, channels: { ...prev.channels, sms: event.target.checked } }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" /><span className="text-[13px] text-slate-700 font-medium">手机短信提醒 (SMS)</span></label>
                              <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={outreachSettings.channels.inbox} onChange={(event) => setOutreachSettings(prev => ({ ...prev, channels: { ...prev.channels, inbox: event.target.checked } }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" /><span className="text-[13px] text-slate-700 font-medium">系统内部站内信预警</span></label>
                          </div>
                      </div>
                  </div>
                  <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                      <button onClick={() => { onToast('自动化触达规则已保存', '订单超时提醒配置已更新'); onAudit('更新订单超时触达规则', 'OUTREACH-RULE'); }} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded shadow-sm transition-colors">保存配置</button>
                  </div>
              </div>
          )}
          {recordModal && <Sales_RecordModal type={recordModal.type} mode={recordModal.mode} record={recordModal.record} onClose={() => setRecordModal(null)} onSubmit={handleSaveRecord} />}
          {confirmDelete && (
              <Sales_ConfirmModal
                  title="删除基础数据"
                  desc={`确定删除 ${confirmDelete.record.name} 吗？该操作只影响当前前端演示数据。`}
                  confirmText="删除"
                  tone="danger"
                  onCancel={() => setConfirmDelete(null)}
                  onConfirm={handleDeleteRecord}
              />
          )}
      </div>
  );
};

const Sales_OutboundRequestModal = ({ request, onClose, onNavigateOutbound, canNavigateOutbound = false }) => {
  if (!request) return null;
  const { order, task, status } = request;
  const productLines = order?.lines && Array.isArray(order.lines) && order.lines.length > 0
    ? order.lines
    : order?.productName ? [{ productName: order.productName, spec: order.spec, unit: order.unit, qty: order.qty, unitPrice: order.unitPrice }] : [];
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="sales-outbound-request-title" className="bg-white rounded-2xl shadow-2xl w-[620px] max-w-full max-h-[92vh] overflow-hidden flex flex-col border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50 shrink-0">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl border bg-emerald-50 border-emerald-100 flex items-center justify-center text-emerald-600">
              <Truck size={18} />
            </div>
            <div>
              <h3 id="sales-outbound-request-title" className="font-bold text-slate-800 text-[15px]">已通知仓库准备发货</h3>
              <p className="text-[12px] text-slate-500 mt-1">仓库人员将处理此订单的出库事宜</p>
            </div>
          </div>
          <button aria-label="关闭发货申请弹窗" onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
              <div className="text-[11px] font-bold text-slate-400 mb-1">销售订单</div>
              <div className="text-[13px] font-bold text-slate-800">{order?.id}</div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
              <div className="text-[11px] font-bold text-slate-400 mb-1">客户</div>
              <div className="text-[13px] font-bold text-slate-800">{order?.client}</div>
            </div>
          </div>
          {productLines.length > 0 && (
            <div>
              <div className="text-[12px] font-bold text-slate-500 mb-2">产品明细</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">产品</th>
                      <th className="px-3 py-2.5 font-medium text-center">规格</th>
                      <th className="px-3 py-2.5 font-medium text-center">数量</th>
                      <th className="px-3 py-2.5 font-medium text-center">单价</th>
                      <th className="px-3 py-2.5 font-medium text-right">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productLines.map((line, idx) => {
                      const lineQty = line.qty || line.quantity || 0;
                      const linePrice = line.unitPrice || 0;
                      return (
                        <tr key={idx} className="border-b border-slate-50 last:border-b-0">
                          <td className="px-3 py-2.5 font-bold text-slate-800">{line.productName}</td>
                          <td className="px-3 py-2.5 text-center text-slate-600">{line.spec || '-'}</td>
                          <td className="px-3 py-2.5 text-center font-mono text-slate-700">{lineQty} {line.unit || '件'}</td>
                          <td className="px-3 py-2.5 text-center font-mono text-slate-700">{sales_formatMoney(linePrice)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{sales_formatMoney(Number(lineQty) * Number(linePrice))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50">
                    <tr>
                      <td colSpan="4" className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-500">合计</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-700">{order?.amount || sales_formatMoney(productLines.reduce((sum, l) => sum + Number(l.qty || l.quantity || 0) * Number(l.unitPrice || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          {task && <div className="bg-blue-50 border border-blue-100 text-blue-700 rounded-xl px-4 py-3 text-[12px]">
            <span className="font-bold">出库任务号：</span>{task.id}
          </div>}
          <div className="bg-amber-50 border border-amber-100 text-amber-700 rounded-xl px-4 py-3 text-[12px] leading-relaxed">
            <p className="font-bold mb-1">后续流程说明：</p>
            <ul className="list-disc list-inside space-y-1 text-amber-600">
              <li>库存充足：顺利出库后，订单将变为「已发货」</li>
              <li>库存不足（部分）：仓库部分发货，订单将变为「部分发货」</li>
              <li>库存不足（全部）：订单保持「已确认」，等待补货</li>
              <li>去生产：订单将进入「生产中」状态</li>
            </ul>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex flex-wrap justify-end gap-3 bg-slate-50/50 shrink-0">
          <button onClick={onClose} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">我知道了</button>
          {canNavigateOutbound && <button onClick={onNavigateOutbound} className="inline-flex items-center gap-2 px-5 py-2 text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"><ArrowUpFromLine size={14}/>进入出库管理</button>}
        </div>
      </div>
    </div>
  );
};

const SalesManagement = ({ resetSignal = 0, businessFlow, onBusinessFlowAction, onNavigateModule, currentTenant, currentUser, canAccessInventory = false }) => {
  const canNavigateOutbound = canAccessInventory && Boolean(currentUser?.permissions?.some(
    (permission) => permission === '*' || permission === 'inventory.shipment-task.read',
  ));
  const persistedWorkspace = useMemo(() => sales_loadWorkspace(currentTenant?.id), [currentTenant?.id, resetSignal]);
  const [activeTab, setActiveTab] = useState(() => resolveSalesTab(window.location.search));
  const [isQuickOrderModalOpen, setIsQuickOrderModalOpen] = useState(false);
  const [orderCreationRevision, setOrderCreationRevision] = useState(0);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [levels, setLevels] = useState(() => persistedWorkspace?.levels || sales_baseDataLevels);
  const [industries, setIndustries] = useState(() => persistedWorkspace?.industries || sales_industriesData);
  const [outreachSettings, setOutreachSettings] = useState(() => persistedWorkspace?.outreachSettings || sales_defaultOutreachSettings);
  const [audits, setAudits] = useState(() => persistedWorkspace?.audits || []);
  const [reminderAt, setReminderAt] = useState(() => persistedWorkspace?.reminderAt || null);
  const [toast, setToast] = useState(null);
  const [outboundRequestModal, setOutboundRequestModal] = useState(null);
  const [salesWarehouseList, setSalesWarehouseList] = useState([]);
  const [inventoryMasterData, setInventoryMasterData] = useState(() => ({ warehouses: [], products: [], materials: [] }));

  const formalContext = useMemo(() => currentUser?.accessToken ? ({ tenantId: currentTenant.id, accessToken: currentUser.accessToken }) : null, [currentTenant?.id, currentUser?.accessToken]);

  useEffect(() => {
    if (!formalContext) return;
    inventoryApi.listWarehouses(formalContext)
      .then((response) => setSalesWarehouseList((response.items || []).filter((warehouse) => warehouse.status === 'active')))
      .catch(() => setSalesWarehouseList([]));
  }, [formalContext?.tenantId, formalContext?.accessToken]);

  // 从后端 API 加载客户数据（替代 localStorage 硬编码数据）
  useEffect(() => {
    if (!formalContext) return;
    import('./api/supply-chain').then(({ supplyChainApi }) => {
      supplyChainApi.listCustomers(formalContext, { page: 1, pageSize: 100 })
        .then(res => {
          if (res.items && res.items.length > 0) {
            setCustomers(res.items.map((c: any) => ({
              id: c.customerNo || c.id,
              name: c.name,
              code: c.code || '-',
              contact: c.contactPerson || '-',
              phone: c.phone || '-',
              level: c.level || 'D',
              status: c.status || '合作中',
              address: c.address || '-',
              owner: c.owner || '-',
              industry: c.industry || '-',
              lastInteractionAt: c.lastInteractionAt || '-',
            })));
          }
        })
        .catch(() => {/* API 失败时保留空数据 */});
    });
  }, [formalContext?.tenantId, formalContext?.accessToken]);

  // 从后端 API 加载库存主数据（替代 localStorage 硬编码数据）
  useEffect(() => {
    if (!formalContext) return;
    Promise.allSettled([
      inventoryApi.listWarehouses(formalContext),
      inventoryApi.listProducts(formalContext),
      inventoryApi.listMaterials(formalContext),
    ]).then(([whRes, prodRes, matRes]) => {
      const warehouses = (whRes.status === 'fulfilled' ? whRes.value?.items : []) || [];
      const products = (prodRes.status === 'fulfilled' ? prodRes.value?.items : []) || [];
      const materials = (matRes.status === 'fulfilled' ? matRes.value?.items : []) || [];
      setInventoryMasterData({
        warehouses: warehouses.map((w: any) => ({
          id: w.code || w.id, name: w.name, type: w.type || '仓库',
          organization: w.organization || '', manager: w.manager || '-',
          address: w.address || '-', capacity: Number(w.capacity) || 0,
          usedCapacity: Number(w.usedCapacity) || 0,
          status: w.status === 'active' ? '启用' : w.status,
          remark: w.remark || '-', updatedAt: w.updatedAt || new Date().toISOString(),
        })),
        products: products.map((p: any) => ({
          id: p.code || p.id, name: p.name,
          specification: p.specification || '-', category: p.category || '成品',
          unit: p.uom || '台', unitPrice: Number(p.unitPrice) || 0,
          defaultWarehouseId: p.warehouseId || 'WH-FG-01',
          safetyStock: Number(p.safetyStockQty) || 0,
          traceMode: '序列号', status: p.status === 'active' ? '启用' : p.status,
          updatedAt: p.updatedAt || new Date().toISOString(),
        })),
        materials: materials.map((m: any) => ({
          id: m.code || m.id, name: m.name,
          specification: m.specification || '-', materialType: m.materialType === 'raw' ? '原材料' : m.materialType === 'semi' ? '半成品' : m.materialType || '原材料',
          unit: m.uom || 'PCS', defaultWarehouseId: m.warehouseId || 'WH-RM-01',
          procurementType: m.materialType === 'purchased' ? '外购' : '自制',
          safetyStock: Number(m.safetyStockQty) || 0,
          unitPrice: Number(m.unitPrice) || 0,
          status: m.status === 'active' ? '启用' : m.status,
          updatedAt: m.updatedAt || new Date().toISOString(),
        })),
      });
    });
  }, [formalContext?.tenantId, formalContext?.accessToken]);

  // 从后端 API 加载销售订单（替代 localStorage 硬编码数据）
  useEffect(() => {
    if (!formalContext) return;
    // 后端会话建立后清除 localStorage 原型数据，确保 API 数据不被覆盖
    localStorage.removeItem(salesWorkspaceStorageKey(currentTenant?.id));
    import('./api/fulfillment').then(({ listFulfillmentOrders }) => {
      listFulfillmentOrders(formalContext)
        .then(res => {
          if (res.items && res.items.length > 0) {
            const statusMap = { OPEN: '待发货', CONFIRMED: '已确认', REPLENISHING: '生产补货中', PARTIALLY_SHIPPED: '部分发货', SHIPPED: '已发货', COMPLETED: '已完成', CANCELED: '已取消' };
            setOrders(res.items.map((o: any) => {
              const firstLine = o.lines?.[0] || {};
              const totalQty = (o.lines || []).reduce((s, l) => s + Number(l.orderedQty || 0), 0);
              const totalAmount = (o.lines || []).reduce((s, l) => s + Number(l.unitPrice || 0) * Number(l.orderedQty || 0), 0);
              return {
                id: o.orderNo || o.id,
                client: o.customerName || o.recipient?.name || '-',
                product: firstLine.productId ? `${firstLine.productId} × ${firstLine.orderedQty} 件` : '-',
                productName: firstLine.productId || '-',
                qty: totalQty,
                amount: `¥${totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
                receivable: o.status === 'COMPLETED' ? '已结算' : '待生成',
                date: (o.createdAt || '').split('T')[0],
                deliveryDate: firstLine.promisedDate || o.requestedDeliveryDate || '-',
                outStatus: o.status === 'SHIPPED' || o.status === 'COMPLETED' ? '已发货' : '未发货',
                status: statusMap[o.status] || o.status || '待发货',
                createdAt: (o.createdAt || '').replace('T', ' ').substring(0, 19),
              };
            }));
          }
        })
        .catch(() => {/* API 失败时保留 localStorage 数据 */});
    });
  }, [formalContext?.tenantId, formalContext?.accessToken]);

  // 从后端 API 加载客户数据（替代硬编码 sales_customersListData）
  useEffect(() => {
    if (!formalContext) return;
    import('./api/supply-chain').then(({ supplyChainApi }) => {
      supplyChainApi.listCustomers(formalContext)
        .then(res => {
          const items = res?.items ?? res;
          if (Array.isArray(items) && items.length > 0) {
            setCustomers(prev => prev.length <= 3 ? items.map((c: any) => ({
              id: c.id, name: c.name, code: c.customerNo || c.id,
              level: 'A', contact: '', phone: '', status: '正常', industry: '',
              creditCode: c.creditCode || '', createdAt: c.createdAt || '',
            })) : prev);
          }
        })
        .catch(() => {/* API 失败时保留本地数据 */});
    });
  }, [formalContext?.tenantId, formalContext?.accessToken]);

  useEffect(() => {
    setInventoryMasterData(loadInventoryMasterData(window.localStorage, currentTenant?.id));
  }, [currentTenant?.id, resetSignal]);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId?: string }>).detail;
      if (!detail?.tenantId || detail.tenantId === currentTenant?.id) {
        setInventoryMasterData(loadInventoryMasterData(window.localStorage, currentTenant?.id));
      }
    };
    window.addEventListener('inventory-master-data-changed', handleChange);
    return () => window.removeEventListener('inventory-master-data-changed', handleChange);
  }, [currentTenant?.id]);

  const quoteOptions = useMemo(
    () => mapInventoryMasterToQuoteOptions(inventoryMasterData, inv_stockData),
    [inventoryMasterData],
  );

  const mapFormalOrder = (order) => {
      const quickOrderSnapshot = orders.find(item => item.aggregateId === order.id)?.quickOrderSnapshot;
      const orderLines = (order.lines || []).filter(line => line.lineStatus !== 'CANCELED');
      return {
      id: order.orderNo,
      aggregateId: order.id,
      formalOrder: order,
      client: order.customerName || order.customerId,
      salesman: order.ownerEmployeeId,
      product: orderLines.map((line) => `${line.productId} × ${line.orderedQty} ${line.uom}`).join('；'),
      productName: orderLines[0]?.productName || orderLines[0]?.productId || '-',
      productId: orderLines[0]?.productId,
      unit: orderLines[0]?.uom || 'PCS',
      qty: orderLines.reduce((sum, line) => sum + Number(line.orderedQty || 0), 0),
      unitPrice: Number(orderLines[0]?.unitPrice || 0),
      discountRate: order.discountRate ?? '100',
      discountAmount: order.discountAmount ?? '0',
      originalAmount: order.originalAmount,
      lines: orderLines.map((line, index) => ({
          productId: line.productId, productName: line.productName || line.productId,
          spec: line.specification || '',
          warehouseId: order.fulfillmentWarehouseId, unit: line.uom,
          quantity: Number(line.orderedQty), unitPrice: Number(line.unitPrice),
          shippedQty: Number(line.shippedQty), remainingQty: Number(line.remainingQty),
          ...(quickOrderSnapshot?.lines?.[index]?.productId === line.productId ? {
              productName: line.productName ?? quickOrderSnapshot.lines[index].productName,
              spec: line.specification ?? quickOrderSnapshot.lines[index].spec,
          } : {}),
      })),
      amount: sales_formatMoney(Number(order.totalAmount || 0)),
      receivable: order.shipmentStatus === 'SHIPPED' ? sales_formatMoney(Number(order.totalAmount || 0)) : '待生成',
      date: order.orderDate ?? order.createdAt?.slice(0, 10),
      validUntil: order.validUntil,
      remark: order.remark,
      deliveryDate: order.requestedDeliveryDate,
      warehouse: order.fulfillmentWarehouseId,
      outStatus: order.shipmentStatus === 'SHIPPED' ? '全部发货' : order.shipmentStatus === 'PARTIALLY_SHIPPED' ? '部分发货' : order.shipmentStatus === 'REQUESTED' ? '已移交仓库' : '未发货',
      status: order.overallStatus === 'SHIPPED' ? '已发货' : order.overallStatus === 'PARTIALLY_SHIPPED' ? '部分发货' : order.overallStatus === 'REPLENISHING' ? '生产中' : order.overallStatus === 'CONFIRMED' ? '已确认' : order.overallStatus === 'CANCELED' ? '已取消' : '待发货',
      reviewStatus: order.reviewStatus,
      confirmationStatus: order.reviewStatus === 'APPROVED' ? '已审批' : order.reviewStatus === 'NOT_REQUIRED' ? '无需审批' : order.reviewStatus === 'PENDING' ? '待复核' : order.reviewStatus,
      shippedQty: orderLines.reduce((total, line) => total + Number(line.shippedQty), 0),
      remainingQty: orderLines.reduce((total, line) => total + Number(line.remainingQty), 0),
      canRequestRemainingShipment: order.overallStatus === 'PARTIALLY_SHIPPED' && orderLines.some((line) => Number(line.remainingQty) > Number(line.activeRequestedQty)),
      version: order.version,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      ...(quickOrderSnapshot ? {
          quickOrderSnapshot, date: order.orderDate ?? quickOrderSnapshot.date,
          validUntil: order.validUntil ?? quickOrderSnapshot.validUntil,
          remark: order.remark ?? quickOrderSnapshot.remark,
      } : {}),
      };
  };

  const refreshFormalOrders = async () => {
      if (!formalContext) return;
      const response = await listFulfillmentOrders(formalContext);
      const formal = response.items.map(mapFormalOrder);
      setOrders((previous) => mergeFormalSalesOrders(previous, formal));
  };

  useEffect(() => {
      refreshFormalOrders().catch((error) => showToast('正式订单加载失败', error instanceof Error ? error.message : '请稍后重试', 'danger'));
  }, [formalContext?.tenantId, formalContext?.accessToken, resetSignal]);

  useEffect(() => {
      const refresh = () => refreshFormalOrders().catch(() => {});
      window.addEventListener('focus', refresh);
      window.addEventListener('sales-fulfillment-changed', refresh);
      return () => {
          window.removeEventListener('focus', refresh);
          window.removeEventListener('sales-fulfillment-changed', refresh);
      };
  }, [formalContext?.tenantId, formalContext?.accessToken]);

  useEffect(() => {
      const tasks = loadSalesOutboundTasks(window.localStorage, currentTenant?.id);
      if (tasks.length === 0) return;
      setOrders(prev => prev.map(order => {
          if (order.aggregateId) return order;
          const task = tasks.find(t => t.source === order.id && t.status !== '已出库');
          return task ? { ...order, outStatus: task.status } : order;
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant?.id]);

  useEffect(() => {
      const tab = resolveSalesTab(window.location.search);
      setActiveTab(tab);
  }, [resetSignal]);

  // 当从其他模块切回销售管理时，从 localStorage 重新加载订单数据（同步库存模块的部分发货回写）
  useEffect(() => {
      if (!persistedWorkspace?.orders) return;
      setOrders(prev => mergePersistedSalesOrders(prev, persistedWorkspace.orders));
  }, [persistedWorkspace]);

  useEffect(() => {
      const handlePopState = () => setActiveTab(resolveSalesTab(window.location.search));
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateSalesTab = (tab, replace = false, clearOrderFocus = false) => {
      setActiveTab(tab);
      const url = new URL(createSalesTabUrl(window.location, tab), window.location.origin);
      if (clearOrderFocus) url.searchParams.delete('focusOrder');
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl !== currentUrl) window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
  };

  const openSalesOrder = (orderId) => {
      const nextUrl = new URL(createSalesTabUrl(window.location, 'orders'), window.location.origin);
      nextUrl.searchParams.set('focusOrder', orderId);
      window.history.pushState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      setActiveTab('orders');
  };

  useEffect(() => {
      try {
          localStorage.setItem(salesWorkspaceStorageKey(currentTenant?.id), JSON.stringify({ schemaVersion: 8, levels, industries, outreachSettings, audits, reminderAt }));
          syncShippedSalesOutbounds(window.localStorage, currentTenant?.id, orders);
      } catch {
          // The page remains usable when browser storage is unavailable.
      }
  }, [currentTenant?.id, quotes, orders, customers, levels, industries, outreachSettings, audits, reminderAt]);

  const showToast = (title, desc, type = 'success') => {
      setToast({ title, desc, type });
      window.clearTimeout((window as any).__salesToastTimer);
      (window as any).__salesToastTimer = window.setTimeout(() => setToast(null), 2600);
  };

  const addAudit = (action, entityId) => {
      setAudits(prev => [{ action, entityId, operator: currentUser?.name || currentUser?.account || '当前用户', time: new Date().toLocaleString('zh-CN', { hour12: false }) }, ...prev].slice(0, 200));
  };

  const approveQuoteAndConvert = (quote) => {
      const latestQuote = quotes.find((item) => item.id === quote.id);
      if (!latestQuote) {
          showToast('报价审批确认失败', '报价单不存在或已被移除，请刷新后重试', 'danger');
          return null;
      }
      const existingOrder = orders.find((order) => order.sourceQuoteId === latestQuote.id || order.id === latestQuote.convertedOrderId);
      if (existingOrder) {
          showToast('报价单已转订单', `${latestQuote.id} 已关联 ${existingOrder.id}`);
          openSalesOrder(existingOrder.id);
          return existingOrder;
      }
      try {
          const approvedAt = new Date().toISOString();
          const operator = currentUser?.name || currentUser?.account || '客户经理';
          const order = createPendingSalesOrderFromQuote(latestQuote, {
              orderId: sales_makeDocumentId('SO'),
              salesman: operator,
              approvedAt,
          });
          setQuotes(prev => prev.map(item => item.id === latestQuote.id ? {
              ...item,
              status: '已转订单',
              convertedOrderId: order.id,
              convertedAt: approvedAt,
              convertedBy: operator,
              version: Number(item.version || 1),
          } : item));
          setOrders(prev => [order, ...prev]);
          addAudit('审批确认产品报价并转销售订单', latestQuote.id);
          addAudit('由报价生成待发货销售订单', order.id);
          showToast('销售订单已生成', `${order.id} 已进入待发货，尚未发货`);
          openSalesOrder(order.id);
          return order;
      } catch (error) {
          showToast('报价审批确认失败', error instanceof Error ? error.message : '请核对报价状态后重试', 'danger');
          return null;
      }
  };

  const ensureFormalSalesOrder = async (order) => {
          if (!formalContext) throw new Error('请先登录正式会话后再操作');
          if (order.aggregateId) return getFulfillmentOrder(formalContext, order.aggregateId);
          const promotedOrder = orders.find(item => item.localOrderId === order.id && item.aggregateId);
          if (promotedOrder) return getFulfillmentOrder(formalContext, promotedOrder.aggregateId);
              const orderLines = Array.isArray(order.lines) && order.lines.length > 0
                  ? order.lines.map((line) => ({
                      productId: line.productId || String(line.productName || '').match(/[A-Z]{2,}\d+/)?.[0] || '',
                      productName: line.productName || '',
                      spec: line.spec || '',
                      qty: Number(line.quantity || line.qty || 0),
                      unit: line.unit || '件',
                      unitPrice: Number(line.unitPrice || 0),
                    }))
                  : [{
                      productId: order.productId || String(order.productName || '').match(/[A-Z]{2,}\d+/)?.[0] || 'FG001',
                      productName: order.productName || order.product || '',
                      spec: order.spec || '',
                      qty: Number(order.qty || 0),
                      unit: order.unit || '件',
                      unitPrice: Number(order.unitPrice || 0),
                    }];
              const warehouseId = order.warehouseId || order.warehouse || order.lines?.[0]?.warehouseId || '';
              const fulfillmentWarehouse = salesWarehouseList.find((warehouse) => warehouse.id === warehouseId || warehouse.code === warehouseId || warehouse.name === warehouseId)
                  || salesWarehouseList[0];
              if (!fulfillmentWarehouse) throw new Error('请先在库存管理创建并启用发货仓库');
              const customer = customers.find((item) => item.name === order.client) || customers[0];
              const created = await createFulfillmentOrder(formalContext, {
                  ...salesOrderPricingInput(order),
                  customerId: customer?.id || order.client,
                  customerName: order.client,
                  ownerEmployeeId: currentUser?.account || 'sales-owner',
                  fulfillmentWarehouseId: fulfillmentWarehouse.id,
                  factoryResourceId: currentTenant.id === 'TENANT-HDJG' ? 'FAC-SZ-01' : 'FAC-SH-01',
                  requestedDeliveryDate: order.deliveryDate,
                  allowPartialShipment: true,
                  currency: 'CNY',
                  recipient: {
                      name: customer?.contact || '待补充收货人',
                      phone: customer?.phone && customer.phone !== '-' ? customer.phone : '13800000000',
                      country: '中国', province: '上海', city: '上海', address: customer?.address || '待补充收货地址',
                  },
                  lines: orderLines.map((line, index) => ({
                      lineNo: index + 1,
                      productId: line.productId,
                      orderedQty: String(line.qty),
                      uom: canonicalInventoryUnit(line.unit),
                      unitPrice: String(line.unitPrice || 0),
                      taxRate: '0',
                      promisedDate: order.deliveryDate,
                      allowPartialShipment: true,
                  })),
              }, `sales-order:${order.id}`);
              const createdOrder = { ...mapFormalOrder(created), localOrderId: order.id };
              setOrders(prev => upsertSalesOrder(prev, createdOrder, order.id));
              setQuotes(prev => prev.map(quote => quote.convertedOrderId === order.id
                  ? { ...quote, convertedOrderId: createdOrder.id } : quote));
              removeSalesOutboundBySource(window.localStorage, currentTenant?.id, order.id);
              return getFulfillmentOrder(formalContext, created.id);
  };

  const requestOutbound = async (order) => {
      try {
          let formalOrder = await ensureFormalSalesOrder(order);
          const localOrderId = order.localOrderId || (!order.aggregateId ? order.id : undefined);
          const updateOrder = (updated: FulfillmentOrder) => {
              const mapped = { ...mapFormalOrder(updated), localOrderId };
              setOrders(prev => upsertSalesOrder(prev, mapped, order.id));
              return mapped;
          };
          if (formalOrder.overallStatus === 'PENDING_CONFIRMATION') {
              formalOrder = await confirmSalesOrderContents(formalContext, formalOrder.id, order.deliveryDate, true, updateOrder);
          }
          let workingOrder = updateOrder(formalOrder);
          if (workingOrder.formalOrder && ['NOT_REQUESTED', 'PARTIALLY_SHIPPED'].includes(workingOrder.formalOrder.shipmentStatus)) {
              workingOrder = updateOrder(await requestSalesShipment(formalContext, workingOrder.aggregateId));
              addAudit('已通知仓库准备发货', workingOrder.id);
          }
          setOutboundRequestModal({ order: workingOrder, status: 'submitted' });
      } catch (error) {
          if (order.aggregateId) {
              try {
                  const current = mapFormalOrder(await getFulfillmentOrder(formalContext, order.aggregateId));
                  setOrders(prev => [
                      current,
                      ...prev.filter(item => item.id !== order.id && item.aggregateId !== current.aggregateId),
                  ]);
              } catch {
                  // Keep the original toast visible if the recovery fetch also fails.
              }
          }
          showToast('发货申请失败', error instanceof Error ? error.message : '请稍后重试', 'danger');
      }
  };

  const navigateToRequestedOutbound = () => {
      if (!outboundRequestModal || !canNavigateOutbound) return;
      const orderId = outboundRequestModal.order.aggregateId || outboundRequestModal.order.id;
      addAudit('从销售订单进入库存出库', orderId);
      setOutboundRequestModal(null);
      onNavigateModule?.('库存管理', { query: createSalesOutboundNavigationQuery(orderId) });
  };

  const handleQuickOrderCreate = async (order) => {
      if (!formalContext) {
          throw new Error('请先登录正式会话后重试');
      }
      try {
          const created = await createQuickSalesOrder(formalContext, order, {
              warehouses: salesWarehouseList,
              customers,
              ownerEmployeeId: currentUser?.account || 'sales-owner',
              factoryResourceId: currentTenant.id === 'TENANT-HDJG' ? 'FAC-SZ-01' : 'FAC-SH-01',
              idempotencyKey: `quick-sales-order:${currentTenant.id}:${order.id}`,
          });
          const mapped = {
              ...mapFormalOrder(created),
              date: order.date,
              validUntil: order.validUntil,
              remark: order.remark,
              quickOrderSnapshot: order,
              lines: created.lines.map((line, index) => ({
                  ...order.lines[index],
                  quantity: Number(line.orderedQty),
                  shippedQty: Number(line.shippedQty),
                  remainingQty: Number(line.remainingQty),
              })),
          };
          setOrders(prev => [mapped, ...prev.filter((item) => item.id !== mapped.id)]);
          setIsQuickOrderModalOpen(false);
          setOrderCreationRevision(revision => revision + 1);
          addAudit('创建销售订单', mapped.id);
          showToast('订单创建成功', `${mapped.id} 已进入待发货`);
          navigateSalesTab('orders', false, true);
      } catch (error) {
          showToast('订单创建失败', error instanceof Error ? error.message : '请稍后重试', 'danger');
          throw error;
      }
  };

  const reviewFormalOrder = async (row) => {
      if (!formalContext || !row.formalOrder) return null;
      if (row.formalOrder.reviewStatus !== 'PENDING') throw new Error('订单当前不在待复核状态');
      return { ...row, ...mapFormalOrder(await approveFulfillmentOrder(formalContext, row.formalOrder)) };
  };

  const confirmFormalOrder = async (row) => {
      const formalOrder = await ensureFormalSalesOrder(row);
      const localOrderId = row.localOrderId || (!row.aggregateId ? row.id : undefined);
      const updateOrder = (updated: FulfillmentOrder) => {
          const mapped = { ...mapFormalOrder(updated), localOrderId };
          setOrders(prev => upsertSalesOrder(prev, mapped, row.id));
          return mapped;
      };
      const confirmed = await confirmSalesOrderContents(formalContext, formalOrder.id, row.deliveryDate, !row.aggregateId, updateOrder);
      return updateOrder(confirmed);
  };

  const requestFormalShipment = async (row) => {
      if (!formalContext || !row.formalOrder) return null;
      return mapFormalOrder(await requestSalesShipment(formalContext, row.aggregateId));
  };

  const cancelFormal = async (row) => {
      if (!formalContext || !row.formalOrder) return null;
      return mapFormalOrder(await cancelFulfillmentOrder(formalContext, row.formalOrder, '销售确认取消'));
  };

  const cancelOrderOutbound = (order) => {
      cancelSalesOutbound(window.localStorage, currentTenant?.id, order.id);
  };

  const tabs = [
      { id: 'dashboard', icon: <LayoutDashboard size={14} className="mr-1.5" />, label: '销售监控舱' },
      { id: 'quotes', icon: <MessageSquare size={14} className="mr-1.5" />, label: '产品报价' },
      { id: 'orders', icon: <FileText size={14} className="mr-1.5" />, label: '销售订单' },
      { id: 'rma', icon: <RotateCcw size={14} className="mr-1.5" />, label: '退货管理' },
      { id: 'receipts', icon: <CheckCircle2 size={14} className="mr-1.5" />, label: '客户签收' },
      { id: 'customers', icon: <Users size={14} className="mr-1.5" />, label: '客户管理' },
      { id: 'basic-data', icon: <BookOpen size={14} className="mr-1.5" />, label: '基础数据' },
  ];
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const activeTabDescriptions = {
      dashboard: '实时监控 · 数据驱动 · 预警提示',
      quotes: '报价有效期、审批确认与订单转化',
      orders: '订单复核、发货申请与履约状态跟踪',
      rma: '退货申请、审批、检验与红字AR闭环管理',
      receipts: '客户签收登记与差额处置跟踪',
      customers: '客户档案、联系人与合作状态维护',
      'basic-data': '销售等级、行业字典与触达规则维护',
  };

  return (
      <div className="w-full h-full font-sans flex flex-col relative overflow-y-auto custom-scrollbar bg-[#F5F7FA] selection:bg-blue-100">
          <div className="flex-1 px-4 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-8 max-w-[1600px] mx-auto w-full">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                  <div className="flex items-center">
                      <div className="w-[52px] h-[52px] bg-[#5B8FF9] text-white flex items-center justify-center rounded-2xl mr-4 font-normal text-2xl shadow-sm">
                          $
                      </div>
                      <div className="flex flex-col justify-center">
                          <h1 className="text-[22px] font-bold text-slate-800 leading-tight mb-1.5 tracking-wide">{activeTabMeta.label}</h1>
                          <div className="text-[13px] text-slate-400 font-medium">{activeTabDescriptions[activeTab]}</div>
                      </div>
                  </div>
                  <button onClick={() => setIsQuickOrderModalOpen(true)} className="bg-[#2563EB] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center text-[13px] font-medium transition-colors shadow-sm">
                      <ShoppingCart size={16} className="mr-2"/> 快速开单
                  </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl flex w-full overflow-x-auto p-1.5 shadow-sm mb-6 custom-scrollbar">
                  {tabs.map(tab => (
                      <button
                          key={tab.id}
                          onClick={() => navigateSalesTab(tab.id)}
                          className={`flex shrink-0 items-center px-3 sm:px-5 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-200 ${
                              activeTab === tab.id
                              ? 'bg-[#2563EB] text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`}
                      >
                          {tab.icon}
                          {tab.label}
                      </button>
                  ))}
              </div>

              {activeTab === 'dashboard' && <BusinessFlowDock moduleName="销售管理" flow={businessFlow} onAction={onBusinessFlowAction} onNavigate={onNavigateModule} />}

              <div className="w-full">
                  {activeTab === 'dashboard' && <Sales_DashboardView quotes={quotes} orders={orders} customers={customers} outreachSettings={outreachSettings} onCreateQuote={(quote) => setQuotes(prev => [quote, ...prev])} onOpenOrders={() => navigateSalesTab('orders')} onToast={showToast} reminderAt={reminderAt} setReminderAt={setReminderAt} onAudit={addAudit} />}
                  {activeTab === 'quotes' && <Sales_QuotesView quotes={quotes} setQuotes={setQuotes} customers={customers} quoteWarehouses={quoteOptions.warehouses} quoteProducts={quoteOptions.products} onToast={showToast} onAudit={addAudit} onApproveAndConvert={approveQuoteAndConvert} onOpenOrder={openSalesOrder} />}
                  {activeTab === 'orders' && <Sales_OrdersView orders={orders} setOrders={setOrders} onToast={showToast} businessFlow={businessFlow} onBusinessFlowAction={onBusinessFlowAction} audits={audits} onAudit={addAudit} onRequestOutbound={requestOutbound} onReviewFormalOrder={reviewFormalOrder} onConfirmFormalOrder={confirmFormalOrder} onCancelFormalOrder={cancelFormal} onCancelOrderOutbound={cancelOrderOutbound} onNavigateProduction={() => onNavigateModule?.('生产管理')} customers={customers} products={inv_stockData.filter((p) => p.kind === '产品')} orderCreationRevision={orderCreationRevision} apiContext={formalContext} />}
                  {activeTab === 'customers' && <Sales_CustomersView customers={customers} setCustomers={setCustomers} industries={industries} onToast={showToast} onAudit={addAudit} />}
                  {activeTab === 'rma' && <RmaManagementPanel />}
                  {activeTab === 'receipts' && <CustomerReceiptPanel />}
                  {activeTab === 'basic-data' && <Sales_BaseDataView levels={levels} setLevels={setLevels} industries={industries} setIndustries={setIndustries} customers={customers} outreachSettings={outreachSettings} setOutreachSettings={setOutreachSettings} onToast={showToast} onAudit={addAudit} />}
              </div>
              
              {isQuickOrderModalOpen && <Sales_QuoteCreateModal documentType="order" apiContext={formalContext} customers={customers} warehouses={quoteOptions.warehouses} products={quoteOptions.products} onClose={() => setIsQuickOrderModalOpen(false)} onCreate={handleQuickOrderCreate} />}
              <Sales_Toast toast={toast} onClose={() => setToast(null)} />
              {outboundRequestModal && <Sales_OutboundRequestModal request={outboundRequestModal} onClose={() => setOutboundRequestModal(null)} onNavigateOutbound={navigateToRequestedOutbound} canNavigateOutbound={canNavigateOutbound} />}
          </div>
      </div>
  );
};

// ==========================================
// 2. 生产管理模块 (ProductionManagement) 
// ==========================================
const prod_dashboardMetrics = [
  { id: 1, title: '销售 ➔ 生产', value: '12', suffix: '笔新单', subtitle: '订单同步成功待排产', tag: '运转顺畅', tagColor: 'blue' },
  { id: 2, title: '生产 ➔ 采购', value: '3', suffix: '项缺料', subtitle: '已推送PR采购申请', tag: '预警处理中', tagColor: 'amber' },
  { id: 3, title: '设备异常预警', value: '85%', suffix: '产能', subtitle: '2号机台主轴震动偏高', tag: '需巡检', tagColor: 'rose' },
  { id: 4, title: '财务核算闭环', value: '5', suffix: '单完工', subtitle: '实际成本核算无偏差', tag: '成本达标', tagColor: 'emerald' }
];

const initial_mpsData = [{ id: 'MPS-26001', demandSource: '销售缺货', source: '销售订单 (SO-2026-902)', product: 'FG001 - 工业控制器顶配版', quantity: 500, date: '2026-06-25', status: '待展算', priority: '普通' }, { id: 'MPS-26002', demandSource: '订单加急', source: 'VIP客户紧急补货', product: 'FG001 - 工业控制器顶配版', quantity: 80, date: '2026-06-10', status: '待展算', priority: '特急VIP' }];

const initial_productionDemandData = [
  { id: 'PD-260620-01', type: '销售缺货', source: '销售订单 SO-2026-918', customer: '上海万申工业', product: 'FG001 - 工业控制器顶配版', shortage: 320, requiredDate: '2026-06-28', priority: '紧急', status: '待生成MPS', owner: '销售主管', reason: '订单已审批，成品可用量不足' },
  { id: 'PD-260620-02', type: '客户加急', source: '客户加急补货单', customer: '华东能源设备', product: 'FG002 - 边缘网关', shortage: 120, requiredDate: '2026-06-24', priority: '特急VIP', status: '待生成MPS', owner: '生产计划员', reason: '战略客户插单，需优先评估产能' },
  { id: 'PD-260620-03', type: '预测补货', source: 'AI 安全库存预测', customer: '库存策略', product: 'FG001 - 工业控制器顶配版', shortage: 260, requiredDate: '2026-07-05', priority: '普通', status: '待生成MPS', owner: '计划主管', reason: '未来两周预测库存低于安全水位' },
  { id: 'PD-260620-04', type: '销售缺货', source: '销售订单 SO-2026-902', customer: 'test01客户', product: 'FG001 - 工业控制器顶配版', shortage: 500, requiredDate: '2026-06-25', priority: '普通', status: '已生成MPS', owner: '操作员 01', reason: '已转入 MPS-26001' },
];

const initial_mrpResults = [
  { id: 'MRP-1', source: 'MPS-26002', itemCode: 'FG001', itemName: '工业控制器', type: '自制件', grossReq: 80, stock: 150, onWay: 0, netReq: 0, plannedQty: 0, lotRule: '按需(L4L)', status: '已下达', pegging: [
      { step: '毛需求推算', desc: '承接特急插单 MPS-26002', value: '+80', color: 'text-slate-800', bg: 'bg-slate-100', icon: Target },
      { step: '强预留抢占', desc: '强制占用原分配给普通订单的成品现货', value: '-80', color: 'text-rose-600', bg: 'bg-rose-50', icon: Zap },
      { step: '净需求缺口', desc: '库存满足，无需新开生产订单', value: '= 0', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 }
  ]},
  { id: 'MRP-2', source: 'MPS-26001', itemCode: 'FG001', itemName: '工业控制器', type: '自制件', grossReq: 500, stock: 70, onWay: 30, netReq: 400, plannedQty: 400, lotRule: '按需(L4L)', status: '待下达', pegging: [
      { step: '毛需求推算', desc: '承接主计划 MPS-26001', value: '+500', color: 'text-slate-800', bg: 'bg-slate-100', icon: Target },
      { step: '可用库存锁定', desc: '总库存150，被特急单抢占80，剩余可用70', value: '-70', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Package },
      { step: '在制富余分配', desc: '占用其他工单富余产出', value: '-30', color: 'text-purple-600', bg: 'bg-purple-50', icon: RefreshCcw },
      { step: '净需求缺口', desc: '基础缺口', value: '= 400', color: 'text-blue-600', bg: 'bg-blue-50', icon: AlertCircle },
      { step: '批量策略调整', desc: '按需批量 (L4L)', value: '➔ 400', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: Layers }
  ]},
  { id: 'MRP-3', source: 'BOM展算(层级1)', itemCode: 'RM201', itemName: 'AI算力芯片', type: '采购件', grossReq: 800, stock: 50, onWay: 0, netReq: 750, plannedQty: 1000, lotRule: '固定批量(FOQ/MOQ: 1000)', status: '待下达', pegging: [
      { step: '毛需求推算', desc: 'BOM展算: FG001 -> RM201', value: '+800', color: 'text-slate-800', bg: 'bg-slate-100', icon: Target },
      { step: '可用库存锁定', desc: '扣减: 原材料仓现货', value: '-50', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Package },
      { step: '净需求缺口', desc: '基础缺口', value: '= 750', color: 'text-blue-600', bg: 'bg-blue-50', icon: AlertCircle },
      { step: '批量策略调整', desc: '供应商最小起定量为 1000，向上取整', value: '➔ 1000', color: 'text-amber-600', bg: 'bg-amber-50', icon: Layers }
  ]}
];

const initial_orderData = [{ id: 'WO-260101', source: 'APS排产', product: 'FG001 - 工业控制器', quantity: 150, startDate: '2026-06-05', endDate: '2026-06-08', status: '执行中', kitting: '100%' }, { id: 'WO-260102', source: 'MRP下达', product: 'FG002 - 边缘网关', quantity: 350, startDate: '2026-06-09', endDate: '2026-06-12', status: '待检查', kitting: '0%' }];
const initial_operationJobs = [{ id: 'JOB-260101-10', orderId: 'WO-260101', opId: '10', opName: 'SMT 贴片加工', targetQty: 150, okQty: 120, ngQty: 2, status: '进行中', machineId: '贴片机-M01', operator: '张工', isRework: false, ngHandled: false, opType: '内部' }, { id: 'JOB-260101-15', orderId: 'WO-260101', opId: '15', opName: '表面防腐电镀', targetQty: 150, okQty: 0, ngQty: 0, status: '待发外', machineId: '顺络电子表面处理', operator: '委外调度', isRework: false, ngHandled: false, opType: '委外' }, { id: 'JOB-260101-20', orderId: 'WO-260101', opId: '20', opName: '总装组装工序', targetQty: 150, okQty: 0, ngQty: 0, status: '待领料', machineId: '组装台-W02', operator: '待定', isRework: false, ngHandled: false, opType: '内部' }];
const initial_equipmentData = [
  { id: 'SMT-M01', name: '贴片机-M01', status: '运行正常', oee: '88%', type: 'SMT', lineCode: 'LINE-SMT-01' },
  { id: 'SMT-M02', name: '贴片机-M02', status: '运行正常', oee: '84%', type: 'SMT', lineCode: 'LINE-SMT-02' },
  { id: 'ASSY-W02', name: '组装台-W02', status: '闲置待产', oee: '92%', type: 'Assembly', lineCode: 'LINE-ASSY-01' }
];
const initial_qualityQueue = [{ id: 'QC-260801', orderId: 'WO-260101', product: 'FG001 - 工业控制器', type: 'FQC(完工检)', sampleQty: 150, status: '待检验', okQty: 0, ngQty: 0, result: null }, { id: 'QC-260802', orderId: 'WO-260101', product: 'SA101 - 核心主板组件', type: 'IPQC(巡检)', sampleQty: 30, status: '待检验', okQty: 0, ngQty: 0, result: null }, { id: 'QC-260803', orderId: 'WO-260099', product: 'FG002 - 边缘网关', type: 'FQC(完工检)', sampleQty: 200, status: '已结案', okQty: 198, ngQty: 2, result: '返修2件' }];
const prod_routingListData = [{ id: 'RT-001', name: '控制器标准装配工艺', targetItem: 'FG001', operations: [ { id: '10', name: 'SMT 贴片加工', center: '贴片机-M01', setupTime: '0.2', runTime: '0.5', timeUnit: '小时', type: '内部' }, { id: '15', name: '表面防腐电镀', center: '顺络电子表面处理', setupTime: '0', runTime: '24', timeUnit: '小时', type: '委外' }, { id: '20', name: '总装组装', center: '组装台-W02', setupTime: '0.1', runTime: '1.2', timeUnit: '小时', type: '内部' } ] }];
const prod_bomListData = [{ id: 'FG001', name: 'FG001 - 工业控制器顶配版', type: '成品', quantity: 1, unit: 'PCS', status: '已生效', version: 'V1.2', scrapRate: 0, lotRule: 'L4L', moq: 1, children: [ { id: 'SA101', name: 'SA101 - 核心主板组件', type: '半成品', quantity: 1, unit: 'PCS', scrapRate: 0, lotRule: 'L4L', moq: 1, children: [ { id: 'RM201', name: 'RM201 - AI算力芯片', type: '原材料', quantity: 2, unit: 'PCS', scrapRate: 5, lotRule: 'FOQ', moq: 1000 }, { id: 'RM202', name: 'RM202 - 12层空PCB板', type: '外购件', quantity: 1, unit: 'PCS', scrapRate: 2, lotRule: 'FOQ', moq: 500 } ] }, { id: 'RM305', name: 'RM305 - 铝合金防护外壳', type: '外购件', quantity: 1, unit: 'PCS', scrapRate: 0, lotRule: 'L4L', moq: 1, children: [] } ] }];

const prodRecordFields = {
    mps: [
        { key: 'id', label: 'MPS 计划编号' },
        { key: 'source', label: '需求来源' },
        { key: 'priority', label: '优先级' },
        { key: 'product', label: '目标物料' },
        { key: 'quantity', label: '计划数量', type: 'number' },
        { key: 'date', label: '交期', type: 'date' },
        { key: 'status', label: '状态' }
    ],
    order: [
        { key: 'id', label: '工单编号' },
        { key: 'source', label: '来源' },
        { key: 'product', label: '目标产品' },
        { key: 'quantity', label: '数量', type: 'number' },
        { key: 'startDate', label: '计划开始', type: 'date' },
        { key: 'endDate', label: '计划结束', type: 'date' },
        { key: 'status', label: '状态' },
        { key: 'kitting', label: '齐套率' }
    ]
};

const Prod_RecordModal = ({ type, mode, record, onClose, onSubmit }) => {
    const [draft, setDraft] = useState(record || {});
    const fields = prodRecordFields[type] || [];
    const readOnly = mode === 'view';
    const titlePrefix = readOnly ? '查看' : '编辑';
    const title = `${titlePrefix}${type === 'mps' ? '主生产计划' : '生产工单'}`;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[680px] overflow-hidden flex flex-col transform border border-slate-100">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2">
                        {type === 'mps' ? <Target size={16} className="text-blue-600" /> : <ClipboardList size={16} className="text-blue-600" />}
                        {title}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-5">
                    {fields.map(field => (
                        <div key={field.key}>
                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">{field.label}</label>
                            <input
                                type={field.type || 'text'}
                                value={draft[field.key] || ''}
                                readOnly={readOnly || field.key === 'id'}
                                onChange={(e) => setDraft(prev => ({ ...prev, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
                                className={`w-full border rounded-lg px-3 py-2 text-[13px] outline-none transition-colors ${readOnly || field.key === 'id' ? 'bg-slate-50 border-slate-100 text-slate-600' : 'bg-white border-slate-200 focus:border-blue-500 text-slate-800'}`}
                            />
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl">{readOnly ? '关闭' : '取消'}</button>
                    {!readOnly && <button onClick={() => onSubmit(draft)} className="px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5"><Check size={16}/> 保存</button>}
                </div>
            </div>
        </div>
    );
};

// Helper Components
const BomNode = ({ node, isRoot = true, isEditable = false, onAdd, onEdit, onDelete }: any) => {
  let badgeColor = node.type === '成品' ? 'text-blue-600 bg-blue-50 border-blue-100' : node.type === '半成品' ? 'text-purple-600 bg-purple-50 border-purple-100' : 'text-amber-600 bg-amber-50 border-amber-100';
  let cardBg = isRoot ? 'border-blue-200 shadow-sm bg-blue-50/10' : 'border-slate-200 bg-white';
  let iconBg = isRoot ? 'bg-blue-100 text-blue-700' : (node.type === '半成品' ? 'bg-purple-50 text-purple-600' : 'bg-slate-50 text-slate-400');
  return (
      <div className="flex flex-col gap-1 relative shadow-sm w-full max-w-3xl">
          {!isRoot && <span className="absolute -left-[34px] top-6 w-8 border-t-2 border-slate-200"></span>}
          <div className={`flex flex-col border ${cardBg} p-4 rounded-xl relative z-10 group transition-all hover:shadow-md hover:border-blue-300`}>
              <div className="flex items-center gap-4">
                  <div className={`${iconBg} p-2.5 rounded-xl shrink-0 border border-slate-100`}>
                      {isRoot ? <Box className="w-4 h-4" /> : (node.type === '半成品' ? <Cpu className="w-4 h-4" /> : <Microchip className="w-4 h-4" />)}
                  </div>
                  <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-[14px] truncate">{node.name}</span>
                              {isRoot && node.version && <span className="text-[10px] font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded shadow-sm">{node.version}</span>}
                          </div>
                          <span className={`text-[11px] font-bold ${badgeColor} px-2.5 py-0.5 rounded shrink-0 border`}>{node.type}</span>
                      </div>
                      <div className="flex gap-3 mt-2 items-center flex-wrap">
                          <span className="text-[12px] text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100">ID: {node.id}</span>
                          <span className="text-[12px] text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100">标准用量: <strong className="text-slate-800">{node.quantity}</strong> {node.unit}</span>
                          {!isRoot && node.scrapRate > 0 && <span className="text-[11px] text-rose-500 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">损耗 {node.scrapRate}%</span>}
                          <span className="text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1"><Layers className="w-3 h-3" /> {node.lotRule === 'FOQ' ? `固定批量: ${node.moq}` : '按需匹配 (L4L)'}</span>
                      </div>
                  </div>
              </div>
              {isEditable && (
                  <div className="hidden group-hover:flex items-center gap-1 absolute right-4 top-4 bg-white/95 backdrop-blur pl-2 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                      <button onClick={(e) => { e.stopPropagation(); onAdd(node.id); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="添加子级物料"><Plus size={14}/></button>
                      <button onClick={(e) => { e.stopPropagation(); onEdit(node.id); }} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" title="编辑高级属性"><Edit2 size={14}/></button>
                      {!isRoot && <button onClick={(e) => { e.stopPropagation(); onDelete(node.id); }} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="级联删除"><Trash2 size={14}/></button>}
                  </div>
              )}
          </div>
          {node.children && node.children.length > 0 && (
              <div className="pl-8 border-l-2 border-slate-200 ml-6 flex flex-col gap-4 mt-3 py-1">
                  {node.children.map(child => <BomNode key={child.id} node={child} isRoot={false} isEditable={isEditable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />)}
              </div>
          )}
      </div>
  );
};

const RoutingTimeline = ({ operations, isEditable, onEdit, onDelete }) => {
  let sortedRoutes = [...operations].sort((a, b) => parseInt(a.id) - parseInt(b.id));
  return sortedRoutes.map((route, index) => {
      let badgeStyle = index % 3 === 0 ? 'bg-blue-100 text-blue-600 border-white' : index % 3 === 1 ? 'bg-purple-100 text-purple-600 border-white' : 'bg-emerald-100 text-emerald-600 border-white';
      let isSubcontract = route.type === '委外';
      return (
          <div key={route.id} className="relative flex items-center justify-between group mb-8">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 ${badgeStyle} shadow-md shrink-0 z-10 font-bold text-[12px] font-mono absolute left-1/2 -translate-x-1/2`}>{route.id}</div>
              <div className={`w-[calc(50%-2.5rem)] ${index % 2 === 0 ? 'pr-4 text-right' : 'ml-auto pl-4'}`}>
                  <div className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative hover:border-blue-300 hover:shadow-md transition-all group-hover:scale-[1.02] ${isSubcontract ? 'border-amber-200 bg-amber-50/20' : ''}`}>
                      <div className={`flex items-center ${index % 2 === 0 ? 'justify-end' : 'justify-start'} mb-2.5 gap-2`}>
                          <span className="font-bold text-[15px] text-slate-800">{route.name}</span>
                          {isSubcontract ? <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 rounded border border-amber-200 font-bold">委外节点</span> : <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded border border-blue-100 font-bold">内部加工</span>}
                      </div>
                      <div className={`text-[12px] text-slate-500 flex flex-col gap-1.5 ${index % 2 === 0 ? 'items-end' : 'items-start'}`}>
                          <span className="flex items-center gap-1.5 font-medium">{isSubcontract ? <Truck className="w-3.5 h-3.5 text-amber-500"/> : <MapPin className="w-3.5 h-3.5 text-blue-500"/>} {isSubcontract ? '外协供应商' : '内部工作中心'}: <span className="font-bold text-slate-700">{route.center}</span></span>
                          <span className="flex items-center gap-1.5 font-medium"><Timer className="w-3.5 h-3.5 text-slate-400" /> 定额: <span className="font-mono text-slate-700 bg-slate-50 px-1 border border-slate-100 rounded">准:{route.setupTime} + 加:{route.runTime}</span> {route.timeUnit}/件</span>
                      </div>
                      {isEditable && (
                          <div className={`hidden group-hover:flex items-center gap-1 absolute top-2 ${index % 2 === 0 ? 'left-2' : 'right-2'} bg-slate-50/90 backdrop-blur px-2 py-1 rounded shadow-sm border border-slate-200`}>
                              <button onClick={(e) => { e.stopPropagation(); onEdit(route.id); }} className="p-1 text-slate-500 hover:text-blue-600 transition-colors"><Edit2 size={14}/></button>
                              <button onClick={(e) => { e.stopPropagation(); onDelete(route.id); }} className="p-1 text-rose-400 hover:text-rose-600 transition-colors"><Trash2 size={14}/></button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  });
};

// --- Modals ---
const Prod_MpsModal = ({ defaultPriority, defaultDemandSource = '普通生产', bomData, onClose, onSave }) => {
    const [id] = useState(() => `MPS-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`);
    const [demandSource, setDemandSource] = useState(defaultDemandSource);
    const [source, setSource] = useState(defaultDemandSource === '订单加急' ? '紧急生产计划' : '常规生产计划');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [product, setProduct] = useState(bomData.find(b => b.type === '成品')?.name || '');
    const [priority, setPriority] = useState(defaultPriority);
    const [qty, setQty] = useState(200);
    const [date, setDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[480px] overflow-hidden flex flex-col transform">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2">
                        {priority === '特急VIP' ? <><Zap className="w-4 h-4 text-rose-500"/><span className="text-rose-600">建立紧急插单</span></> : <><Target className="w-4 h-4 text-blue-600"/><span>制定主生产计划</span></>}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">MPS 计划编号 *</label><input type="text" value={id} disabled className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-mono bg-slate-50 text-slate-400" /></div>
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">需求来源类型 *</label><select value={demandSource} onChange={e=>{setDemandSource(e.target.value); setSource(e.target.value === '订单加急' ? '紧急生产计划' : '常规生产计划'); setPriority(e.target.value === '订单加急' ? '特急VIP' : '普通');}} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white font-bold"><option value="普通生产">普通生产</option><option value="订单加急">订单加急</option></select></div>
                    </div>
                    <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">来源描述</label><input type="text" value={source} onChange={e=>setSource(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500" /></div>
                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 mb-1.5">生产目标物料 *</label>
                        <select value={product} onChange={e=>setProduct(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
                            {bomData.filter(b=>b.type==='成品').map(b=><option key={b.id} value={b.name}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">排产优先级</label>
                            <select value={priority} onChange={e=>setPriority(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white font-bold">
                                <option value="普通">普通</option><option value="紧急" className="text-orange-600">紧急</option><option value="特急VIP" className="text-rose-600">特急VIP</option>
                            </select>
                        </div>
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">计划数量 *</label><input type="number" min="0.000001" step="any" value={qty} onChange={e=>setQty(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono" /></div>
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">交期日期 *</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono cursor-pointer" /></div>
                    </div>
                    {error && <p role="alert" className="text-[12px] text-rose-700">{error}</p>}
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl">取消</button>
                    <button disabled={saving} onClick={async () => {
                        if (!product || !date || !/^\d+(\.\d{1,6})?$/.test(String(qty)) || Number(qty) <= 0) { setError('请选择产品、交期并填写大于零的数量（最多六位小数）'); return; }
                        setSaving(true); setError('');
                        try {
                            const saved = await onSave({id, demandSource, source, product, priority, quantity: String(qty), date, status: '待展算'});
                            if (saved) onClose();
                            else setError('保存未完成，请核对业务提示后重试');
                        } finally { setSaving(false); }
                    }} className="px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"><Check size={16}/> {saving ? '保存中' : '确认保存'}</button>
                </div>
            </div>
        </div>
    );
};

const Prod_PeggingModal = ({ item, onClose }) => (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl w-[550px] overflow-hidden flex flex-col transform">
            <div className="p-5 flex justify-between items-center border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-900 text-[15px] flex items-center gap-2">
                    <GitMerge className="w-4.5 h-4.5 text-purple-600" /> 供需溯源明细 (Pegging)
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16} /></button>
            </div>
            <div className="p-6">
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-6 flex justify-between items-center">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">目标物料</p>
                        <p className="text-[14px] font-bold text-slate-900">{item.itemCode} - {item.itemName}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">需求单据源</p>
                        <p className="text-[13px] font-mono font-bold text-blue-600">{item.source}</p>
                    </div>
                </div>
                <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-4 px-1">MRP 算账过程 (Waterfall)</h4>
                <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent px-2">
                    {item.pegging.map((peg, index) => {
                        const isLast = index === item.pegging.length - 1;
                        const Icon = peg.icon;
                        return (
                            <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white ${peg.bg} ${peg.color} shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10`}>
                                    <Icon size={16} />
                                </div>
                                <div className={`w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-xl border border-slate-100 bg-white shadow-sm transition-all hover:border-slate-200 ${isLast ? 'border-blue-200 bg-blue-50/30' : ''}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <h5 className="text-[13px] font-bold text-slate-900">{peg.step}</h5>
                                        <span className={`font-mono text-[14px] font-bold ${peg.color}`}>{peg.value}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-relaxed">{peg.desc}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                <button onClick={onClose} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">关闭明细</button>
            </div>
        </div>
    </div>
);

const Prod_QcModal = ({ qc, onClose, onSave }) => {
    const [okQty, setOkQty] = useState(qc.sampleQty);
    const [ngQty, setNgQty] = useState(0);
    const [scrapQty, setScrapQty] = useState(0);
    const [reworkQty, setReworkQty] = useState(0);

    const total = qc.sampleQty;
    const isMatched = (okQty + ngQty) === total;
    const showMrb = ngQty > 0;

    const handleNgChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setNgQty(val); setReworkQty(val); setScrapQty(0);
        setOkQty(Math.max(0, total - val));
    };

    const handleOkChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setOkQty(val);
        const ng = Math.max(0, total - val);
        setNgQty(ng); setReworkQty(ng); setScrapQty(0);
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[550px] overflow-hidden flex flex-col transform border border-slate-100">
                <div className="p-5 flex justify-between items-center border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 text-[15px] flex items-center gap-2"><Microscope className="w-4.5 h-4.5 text-blue-600"/> 品质检验实绩录入</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
                </div>
                <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh] custom-scrollbar">
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex justify-between items-center">
                        <div><p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">检验物料</p><p className="text-[13px] font-bold text-slate-900">{qc.product}</p></div>
                        <div className="text-right"><p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">送检总数</p><p className="text-[15px] font-mono font-bold text-blue-600">{total} PCS</p></div>
                    </div>
                    <div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="block text-[11px] font-bold text-emerald-600 mb-1.5">合格良品数 *</label><input type="number" min="0" value={okQty} onChange={handleOkChange} className="w-full border border-emerald-200 bg-emerald-50/30 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-emerald-500 font-mono font-bold text-emerald-700" /></div>
                            <div className="flex-1"><label className="block text-[11px] font-bold text-rose-600 mb-1.5">不良品数(NG) *</label><input type="number" min="0" value={ngQty} onChange={handleNgChange} className="w-full border border-rose-200 bg-rose-50/30 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-rose-500 font-mono font-bold text-rose-700" /></div>
                        </div>
                        {isMatched ? <p className="text-[11px] mt-2 font-bold text-emerald-600">✓ 数量核对一致</p> : <p className="text-[11px] mt-2 font-bold text-rose-500">数量不匹配！差额: {total - (okQty + ngQty)}</p>}
                    </div>
                    {showMrb && (
                        <div className="border-t border-dashed border-slate-200 pt-5 mt-5">
                            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                                <h4 className="text-[13px] font-bold text-rose-800 mb-2 flex items-center gap-1.5"><AlertTriangle size={16}/> MRB 不合格品评审分配</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-[11px] font-bold text-slate-600 mb-1.5">直接报废扣账 (Scrap)</label><input type="number" min="0" value={scrapQty} onChange={e=>setScrapQty(parseInt(e.target.value)||0)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-slate-400 font-mono" /></div>
                                    <div><label className="block text-[11px] font-bold text-orange-600 mb-1.5">退回车间返修 (Rework)</label><input type="number" min="0" value={reworkQty} onChange={e=>setReworkQty(parseInt(e.target.value)||0)} className="w-full border border-orange-200 bg-orange-50/30 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-orange-500 font-mono text-orange-700 font-bold" /></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl">取消</button>
                    <button onClick={() => isMatched && (!showMrb || (scrapQty + reworkQty === ngQty)) && onSave(qc.id, okQty, ngQty, scrapQty, reworkQty)} disabled={!isMatched || (showMrb && (scrapQty + reworkQty !== ngQty))} className="px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"><CheckCircle2 size={16}/> 提交检验结果</button>
                </div>
            </div>
        </div>
    );
};

const Prod_EqModal = ({ editItem, onClose, onSave, productionLines }) => {
    const [id, setId] = useState(editItem ? editItem.id : '');
    const [name, setName] = useState(editItem ? editItem.name : '');
    const [type, setType] = useState(editItem ? editItem.type : 'SMT');
    const [status, setStatus] = useState(editItem ? editItem.status : '运行正常');
    const [lineCode, setLineCode] = useState(editItem ? (editItem.lineCode || productionLines[0]?.code || '') : (productionLines[0]?.code || ''));

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[450px] overflow-hidden flex flex-col transform">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-[15px]">{editItem ? '编辑物理生产机台' : '注册物理生产机台'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">设备资产ID *</label><input value={id} onChange={e=>setId(e.target.value)} disabled={!!editItem} type="text" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono disabled:bg-slate-50" /></div>
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">设备名称 *</label><input value={name} onChange={e=>setName(e.target.value)} type="text" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500" /></div>
                    </div>
	                    <div className="grid grid-cols-2 gap-4">
	                        <div>
	                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">硬件种类</label>
	                            <select value={type} onChange={e=>setType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
	                                <option value="SMT">贴片加工设备</option><option value="Assembly">装配装配站</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">健康状态</label>
                            <select value={status} onChange={e=>setStatus(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
                                <option>运行正常</option><option>闲置待产</option><option>故障停机</option>
	                            </select>
	                        </div>
	                    </div>
	                    <div>
	                        <label className="block text-[12px] font-bold text-slate-500 mb-1.5">归属产线（来自平台管理）</label>
	                        <select value={lineCode} onChange={e=>setLineCode(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
		                            {productionLines.map(line => <option key={line.code} value={line.code}>{line.name} / {line.code}</option>)}
	                        </select>
	                    </div>
	                </div>
	                <div className="p-4 border-t flex justify-end gap-3 bg-slate-50/50">
	                    <button onClick={onClose} className="px-5 py-2 text-[13px] border rounded-xl bg-white hover:bg-slate-50">取消</button>
	                    <button onClick={() => { if(id&&name) onSave({id, name, type, status, lineCode, oee: editItem?.oee || '88%'})}} className="px-5 py-2 text-[13px] bg-blue-600 text-white rounded-xl hover:bg-blue-700">保存资产</button>
	                </div>
            </div>
        </div>
    );
};

// --- 子视图组件 (重构以接入完整逻辑) ---
const Prod_DashboardView = ({ onAutoReschedule, onTransferLine, workOrders = [], demands = [] }) => (
    <UnifiedMonitorCabin
        metrics={[
            { title: '销售 → 生产', value: String(demands.filter(d => !['COMPLETED','CLOSED'].includes(d.status)).length), unit: '笔新单', subtitle: '订单同步成功待排产', theme: 'blue', icon: ClipboardList, trend: 'up' },
            { title: '生产 → 采购', value: String(demands.filter(d => d.blockReasons?.length > 0).length), unit: '项缺料', subtitle: '已推送PR采购申请', theme: 'amber', icon: FilePlus, trend: 'up' },
            { title: '设备异常预警', value: '85%', unit: '%产能', subtitle: '2号机台主轴震动偏高', theme: 'rose', icon: MonitorCog, trend: 'down' },
            { title: '财务核算闭环', value: String(workOrders.filter(w => w.status === 'COMPLETED').length), unit: '单完工', subtitle: '实际成本核算无偏差', theme: 'emerald', icon: ShieldCheck, trend: 'up' },
        ]}
        aiCards={[
            {
                title: 'AI 生产延期预警 & 智能排产',
                icon: Bot,
                tone: 'purple',
                subject: workOrders.length ? `工单：${workOrders[0]?.code || workOrders[0]?.id || 'N/A'}` : '暂无活跃工单',
                badge: '极高延期风险',
                lines: [
                    <><span className="font-bold text-slate-800">AI 根因分析：</span>关联【设备管理】数据，前置 CNC 工序机台 OEE 降至 60%，且【库存管理】反馈核心芯片 RM201 采购批次退货率达 15%。综合测算，本单逾期概率达 82%。</>,
                ],
                actions: (
                    <>
                        <button onClick={onAutoReschedule} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-bold py-2.5 rounded-xl shadow-sm transition-colors">AI 自动重新排产</button>
                        <button onClick={onTransferLine} className="flex-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[13px] font-bold py-2.5 rounded-xl shadow-sm transition-colors">转移至备用产线</button>
                    </>
                )
            },
            {
                title: 'AI 缺料违约双重预警',
                icon: AlertTriangle,
                tone: 'rose',
                subject: workOrders.length > 1 ? `工单：${workOrders[1]?.code || workOrders[1]?.id || 'N/A'} 交期预警` : '暂无风险工单',
                badge: '极高风险',
                lines: [
                    <><span className="font-bold text-slate-800">执行层：</span>前置组装实际报工耗时超出标准 22%。</>,
                    <><span className="font-bold text-slate-800">供应链：</span>联动 MRP 发现核心组件供应商履约画像得分降至 75 分，存在晚交货停线风险。综合测算逾期概率达 85%。</>,
                ],
            },
        ]}
        trend={{
            title: '生产计划达成率与延期风险趋势',
            metric: workOrders.length > 0 ? Math.round(workOrders.reduce((s,w) => s + Number(w.reportedGoodQty || 0), 0) / Math.max(workOrders.reduce((s,w) => s + Number(w.plannedQty || 0), 0), 1) * 100) + '%' : '-',
            metricLabel: '按期达成',
            metricColor: '#8b5cf6',
            ringColor: '#ede9fe',
            insightTitle: '瓶颈工序识别',
            insight: '近 6 期生产达成率在设备稼动波动时明显下滑，AI 判断 SMT 与外协回场是主要瓶颈。',
            recommendation: '将高优先级工单提前做齐套检查，并把瓶颈工序预排至备用产线，减少临近交期的被动改排。',
            chartTitle: '近半年生产达成与风险预测 (单位: %)',
            legend: [
                { label: '计划达成率', color: '#2563eb' },
                { label: 'AI 风险预测', color: '#8b5cf6' },
            ],
            primary: '#2563eb',
            secondary: '#8b5cf6',
            yAxis: [100, 90, 80, 70, 60],
            gradientId: 'prodTrendGradient',
            forecastPath: 'M 780 92 C 830 110, 890 130, 950 122',
        }}
    />
);

const Prod_DemandPool = ({ demands, onCreateMps, onMergePlan, onHoldDemand, onViewSource, onValidateDemand, onApproveDemand, canCreateMps = true }) => {
    const pendingDemands = demands.filter(item => item.apiStatus === 'APPROVED');
    const urgentDemands = pendingDemands.filter(item => ['紧急', '特急VIP'].includes(item.priority));
    const demandTypeMeta = {
        '销售缺货': { icon: ShoppingCart, className: 'bg-blue-50 text-blue-600 border-blue-100' },
        '客户加急': { icon: Zap, className: 'bg-rose-50 text-rose-600 border-rose-100' },
        '预测补货': { icon: TrendingUp, className: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    };
    const statusClass = {
        '待生成MPS': 'bg-amber-50 text-amber-600 border-amber-100',
        '已生成MPS': 'bg-blue-50 text-blue-600 border-blue-100',
        '已合并': 'bg-purple-50 text-purple-600 border-purple-100',
        '已暂缓': 'bg-slate-100 text-slate-500 border-slate-200',
        '待校验': 'bg-amber-50 text-amber-700 border-amber-200',
        '待审批': 'bg-purple-50 text-purple-700 border-purple-200',
        '待核验': 'bg-slate-100 text-slate-600 border-slate-200',
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full min-h-[560px] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
                <div>
                    <h4 className="font-bold text-[15px] text-slate-900 flex items-center gap-2">
                        <Inbox size={17} className="text-blue-600" /> 生产需求池
                    </h4>
                    <p className="text-[12px] text-slate-500 mt-1">承接销售缺货、客户加急与预测补货需求，确认后再生成或合并到主生产计划。</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-100 text-[12px] font-bold">待计划 {pendingDemands.length}</span>
                    <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100 text-[12px] font-bold">高优先 {urgentDemands.length}</span>
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 p-4 border-b border-slate-100 bg-white">
                {['销售缺货', '客户加急', '预测补货'].map(type => {
                    const rows = demands.filter(item => item.type === type);
                    const meta = demandTypeMeta[type];
                    const Icon = meta.icon;
                    const qty = rows.reduce((sum, item) => sum + item.shortage, 0);
                    return (
                        <div key={type} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 flex items-center justify-between">
                            <div>
                                <div className="text-[12px] font-bold text-slate-500">{type}</div>
                                <div className="mt-1 text-[20px] font-black text-slate-900">{rows.length}<span className="ml-1 text-[12px] font-bold text-slate-400">条 / {qty} PCS</span></div>
                            </div>
                            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${meta.className}`}><Icon size={16} /></div>
                        </div>
                    );
                })}
            </div>
            <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
                <table className="w-full text-left text-[13px] whitespace-nowrap">
                    <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100">
                        <tr>
                            <th className="px-5 py-3.5 font-medium">需求编号</th>
                            <th className="px-5 py-3.5 font-medium">来源类型</th>
                            <th className="px-5 py-3.5 font-medium">来源/客户</th>
                            <th className="px-5 py-3.5 font-medium">目标物料</th>
                            <th className="px-5 py-3.5 font-medium text-right">缺口数量</th>
                            <th className="px-5 py-3.5 font-medium">交期</th>
                            <th className="px-5 py-3.5 font-medium">优先级</th>
                            <th className="px-5 py-3.5 font-medium">状态</th>
                            <th className="px-5 py-3.5 font-medium text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {demands.map(row => {
                            const meta = demandTypeMeta[row.type] || demandTypeMeta['销售缺货'];
                            const TypeIcon = meta.icon;
                            const displayStatus = row.apiId ? row.status : '待核验';
                            const canPlan = row.apiStatus === 'APPROVED';
                            return (
                                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-4 font-mono font-bold text-blue-600">{row.id}</td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${meta.className}`}>
                                            <TypeIcon size={12} /> {row.type}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="font-bold text-slate-800">{row.source}</div>
                                        {row.sourceSalesOrder && <div className="text-[11px] text-blue-500 font-mono mt-0.5">SO: {row.sourceSalesOrder.slice(0, 8)}…{row.sourceOrderLine ? ` · 行 ${row.sourceOrderLine}` : ''}</div>}
                                        {row.sourceFactVersion != null && <div className="text-[11px] text-slate-400 font-mono">事实 v{row.sourceFactVersion}{row.sourceShipment ? ` · 出库 ${row.sourceShipment.slice(0, 8)}…` : ''}</div>}
                                        <div className="text-[11px] text-slate-400 mt-0.5">{row.customer} / {row.owner}</div>
                                    </td>
                                    <td className="px-5 py-4 font-bold text-slate-800">{row.product}</td>
                                    <td className="px-5 py-4 text-right font-mono font-black text-slate-900">{row.shortage} PCS</td>
                                    <td className="px-5 py-4 text-slate-500 font-mono">{row.requiredDate}</td>
                                    <td className="px-5 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${row.priority === '特急VIP' ? 'bg-rose-500 text-white border-rose-500' : row.priority === '紧急' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{row.priority}</span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusClass[displayStatus] || statusClass['待核验']}`}>{displayStatus}</span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <TableActionGroup>
                                            <TableActionButton icon={Eye} label="来源" tone="slate" onClick={() => onViewSource(row)} />
                                            {row.apiStatus === 'RECEIVED' || row.apiStatus === 'BLOCKED'
                                              ? <TableActionButton icon={CheckCircle2} label="校验" onClick={() => onValidateDemand(row.id)} />
                                              : null}
                                            {row.apiStatus === 'PENDING_REVIEW'
                                              ? <TableActionButton icon={ShieldCheck} label="审批" tone="purple" onClick={() => onApproveDemand(row.id)} />
                                              : null}
	                                            <TableActionButton icon={GitMerge} label="合并" tone="purple" onClick={() => onMergePlan(row.id)} disabled />
	                                            <TableActionButton icon={Plus} label="生成MPS" onClick={() => onCreateMps(row.id)} disabled={!canPlan || !canCreateMps} />
                                            <TableActionButton icon={Clock} label="暂缓" tone="amber" onClick={() => onHoldDemand(row.id)} disabled={!row.apiId || ['PLANNED', 'CANCELED'].includes(row.apiStatus)} />
                                        </TableActionGroup>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const mpsDemandSourceMeta = {
    '销售缺货': { icon: ShoppingCart, className: 'bg-blue-50 text-blue-600 border-blue-100' },
    '订单加急': { icon: Zap, className: 'bg-rose-50 text-rose-600 border-rose-100' },
    '普通生产': { icon: TrendingUp, className: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
};
const mpsStatusClassMap = {
    '校验阻断': 'bg-rose-50 text-rose-700 border-rose-200',
    '待审批': 'bg-purple-50 text-purple-700 border-purple-200',
    '草稿': 'bg-slate-100 text-slate-600 border-slate-200',
    '待确认': 'bg-amber-50 text-amber-700 border-amber-200',
    '待接收': 'bg-orange-50 text-orange-700 border-orange-200',
    '已审批': 'bg-blue-50 text-blue-600 border-blue-100',
    '待展算': 'bg-amber-50 text-amber-600 border-amber-100',
    '已推展算': 'bg-blue-50 text-blue-700 border-blue-200',
    '已展算': 'bg-emerald-50 text-emerald-600 border-emerald-100',
    '已推排程': 'bg-purple-50 text-purple-700 border-purple-200',
    '已排程': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    '已建工单': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '展算失败': 'bg-rose-50 text-rose-700 border-rose-200',
    '排程失败': 'bg-rose-50 text-rose-700 border-rose-200',
    '已下发': 'bg-blue-50 text-blue-600 border-blue-100',
};

const Prod_MpsView = ({ mps, focusMps, bomData, productionDemands = [], onAddMps, onUpdateMps, onDeleteMps, onCalcMrp, onValidateDemand, onApproveDemand, onClaimDemand, onCreateMpsFromDemand, onRunAps, onCreateFormalOrder, onHoldDemand, onMergeDemand, onViewDemandSource, showToast, canCalcMrp = true, canValidateDemand = true, canApproveDemandAction = true, canClaimDemand = true, canCreateMps = true, canRunAps = true, canCreateWorkOrder = true, onConfirmMps, onConfirmDemandToMps }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [defaultPriority, setDefaultPriority] = useState('普通');
    const [defaultDemandSource, setDefaultDemandSource] = useState('普通生产');
    const [recordModal, setRecordModal] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const existingDemandIds = new Set(mps.filter(m => m.demandId).map(m => m.demandId));
    const draftRows = productionDemands
        .filter(d => !existingDemandIds.has(d.apiId) && d.apiStatus !== 'CANCELED' && d.apiStatus !== 'PLANNED')
        .map(d => ({
            id: d.id,
            demandSource: d.type === '销售缺货' ? '销售缺货' : d.type === '客户加急' ? '订单加急' : '普通生产',
            source: d.source,
            product: d.product,
            quantity: d.shortage,
            date: d.requiredDate,
            status: mapProductionDemandStatus(d.formalDemand || { status: d.apiStatus }),
            priority: d.priority,
            sourceSalesOrder: d.sourceSalesOrder,
            sourceFactVersion: d.sourceFactVersion,
            sourceCustomer: d.customer,
            demandId: d.apiId,
            isDraft: true,
            apiStatus: d.apiStatus,
            rawDemand: d,
        }));
    const allRows = [...draftRows, ...mps];
    const pendingCount = draftRows.filter(r => ['草稿', '待接收'].includes(r.status)).length;
    const urgentCount = allRows.filter(r => ['紧急', '特急VIP'].includes(r.priority)).length;

    return (
        <div className="flex flex-col gap-5 h-full animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 shrink-0 flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10 w-2/3">
                    <h3 className="font-bold text-slate-800 text-[16px] flex items-center gap-2">
                        <div className="bg-blue-50 p-1.5 rounded-lg text-blue-600"><Target size={20} /></div> MPS 管理：主生产计划
                    </h3>
                    <p className="text-[13px] text-slate-500 mt-2 ml-10">统一承接销售缺货、普通生产与订单加急需求，完成需求校验、审批、合并拆分、优先级调整后下推 MRP。</p>
                </div>
                <div className="flex gap-3 relative z-10 shrink-0">
                    <button onClick={() => { setDefaultPriority('普通'); setDefaultDemandSource('普通生产'); setIsModalOpen(true); }} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-colors flex items-center gap-1.5">
                        <Plus size={16} /> 常规计划
                    </button>
                    <button onClick={() => { setDefaultPriority('特急VIP'); setDefaultDemandSource('订单加急'); setIsModalOpen(true); }} className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-colors flex items-center gap-1.5">
                        <Zap size={16} /> 紧急插单
                    </button>
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col relative min-h-[560px]">
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
                    <div>
                        <h4 className="font-bold text-[14px] text-slate-800 flex items-center gap-2"><ListTodo size={16} className="text-blue-600"/> 主生产计划列表 (MPS)</h4>
                <p className="text-[12px] text-slate-500 mt-1">草稿、待审批、待接收和待展算条目来自销售缺货/订单加急；接收后才能推送 MRP。</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-100 text-[12px] font-bold">待处理 {pendingCount}</span>
                        <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100 text-[12px] font-bold">高优先 {urgentCount}</span>
                        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[12px] font-bold">{allRows.length} 条</span>
                    </div>
                </div>
                <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
                    <table className="w-full text-left text-[13px] whitespace-nowrap">
                        <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100 sticky top-0">
                            <tr><th className="px-5 py-3.5 font-medium">MPS单号/需求编号</th><th className="px-5 py-3.5 font-medium">需求来源</th><th className="px-5 py-3.5 font-medium">优先级</th><th className="px-5 py-3.5 font-medium">目标物料</th><th className="px-5 py-3.5 font-medium text-right">计划数量</th><th className="px-5 py-3.5 font-medium">交期</th><th className="px-5 py-3.5 font-medium">来源追溯</th><th className="px-5 py-3.5 font-medium">状态</th><th className="px-5 py-3.5 font-medium text-right">操作</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">{allRows.map(r => {
                                const ds = r.demandSource || '普通生产';
                                const meta = mpsDemandSourceMeta[ds] || mpsDemandSourceMeta['普通生产'];
                                const SourceIcon = meta.icon;
                                const isDraft = r.isDraft;
                                const canRunMrp = isDraft && r.apiStatus === 'APPROVED' && !!r.rawDemand?.formalDemand?.acceptedAt;
                                const canValidate = isDraft && (r.apiStatus === 'RECEIVED' || r.apiStatus === 'BLOCKED');
                                const canReview = isDraft && r.apiStatus === 'PENDING_REVIEW';
                                const canClaim = isDraft && r.apiStatus === 'APPROVED' && !r.rawDemand?.formalDemand?.acceptedAt;
                                return (
                                    <tr key={r.id} aria-current={r.id === focusMps ? 'true' : undefined} className={`transition-colors group ${r.id === focusMps ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50/50'}`}>
                                        <td className="px-5 py-4 font-mono font-bold text-blue-600">{r.id}</td>
                                        <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${meta.className}`}><SourceIcon size={12} /> {ds}</span></td>
                                        <td className="px-5 py-4">{r.priority === '特急VIP' ? <span className="bg-rose-500 text-white px-2 py-0.5 rounded shadow-sm font-bold text-[10px] flex items-center gap-1 w-max"><Zap size={12}/> 特急VIP</span> : r.priority === '紧急' ? <span className="bg-orange-500 text-white px-2 py-0.5 rounded shadow-sm font-bold text-[10px] flex items-center gap-1 w-max">紧急</span> : r.priority === '销售联动' ? <span className="bg-purple-500 text-white px-2 py-0.5 rounded shadow-sm font-bold text-[10px] flex items-center gap-1 w-max">销售联动</span> : <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1 w-max">普通</span>}</td>
                                        <td className="px-5 py-4 font-bold text-slate-800">{r.product}</td>
                                        <td className="px-5 py-4 text-right font-mono font-bold text-slate-800">{r.quantity} {r.unit || 'PCS'}</td>
                                        <td className="px-5 py-4 text-slate-500 font-mono">{r.date}</td>
                                        <td className="px-5 py-4">{r.sourceSalesOrder ? <div className="text-[11px] text-blue-500 font-mono">SO: {String(r.sourceSalesOrder).slice(0, 12)}{r.sourceFactVersion != null ? ` \u00b7 v${r.sourceFactVersion}` : ''}</div> : <div className="text-[11px] text-slate-400">{r.source || '-'}</div>}{r.sourceCustomer && <div className="text-[11px] text-slate-400 mt-0.5">{r.sourceCustomer}</div>}{r.rawDemand?.formalDemand?.handlerRole && <div className="text-[11px] text-slate-500 mt-0.5">{r.rawDemand.formalDemand.handlerRole === 'PRODUCTION_PLANNER' ? '接收池：生产计划员' : `处理角色：${r.rawDemand.formalDemand.handlerRole}`}{r.rawDemand.formalDemand.handlerId ? ` \u00b7 ${r.rawDemand.formalDemand.handlerId}` : ''}</div>}</td>
                                        <td className="px-5 py-4"><span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${mpsStatusClassMap[r.status] || mpsStatusClassMap['草稿']}`}>{r.status === '已下发' ? '已推MRP' : r.status}</span>{r.apiStatus === 'BLOCKED' && <div className="mt-2 max-w-[220px] text-[11px] text-rose-600">{r.rawDemand?.formalDemand?.blockReasons?.join('；') || '请补齐生产主数据后重新校验'}</div>}</td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end space-x-1.5">
                                                {isDraft ? <>
                                                    <button onClick={() => onViewDemandSource?.(r.rawDemand)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="查看来源"><Eye size={16}/></button>
                                                    {r.status === '草稿' && <button onClick={() => onConfirmDemandToMps?.(r.id)} className="text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 p-1.5 rounded-lg transition-colors shadow-sm" title="确认需求，进入待展算"><CheckCircle2 size={16}/></button>}
                                                    {canValidate && <button onClick={() => onValidateDemand?.(r.id)} disabled={!canValidateDemand} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={canValidateDemand ? '需求校验' : '无需求校验权限'}><CheckCircle2 size={16}/></button>}
                                                    {canReview && <button onClick={() => onApproveDemand?.(r.id)} disabled={!canApproveDemandAction} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={canApproveDemandAction ? '审批需求' : '无需求审批权限'}><ShieldCheck size={16}/></button>}
                                                    {canClaim && <button onClick={() => onClaimDemand?.(r.id)} disabled={!canClaimDemand} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={canClaimDemand ? '计划员接收需求' : '无需求接收权限'}><Inbox size={16}/></button>}
                                                    {canRunMrp && <button onClick={() => onCreateMpsFromDemand?.(r.id)} disabled={!canCalcMrp} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={canCalcMrp ? '接收后推送 MRP 展算' : '无 MRP 展算权限'}><PlayCircle size={16}/></button>}
                                                    <button onClick={() => onHoldDemand?.(r.id)} disabled={!r.demandId} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="暂缓"><Clock size={16}/></button>
                                                </> : <>
                                                    <button onClick={() => setRecordModal({ mode: 'view', record: r })} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="查看计划"><Eye size={16}/></button>
                                                    <button onClick={() => setRecordModal({ mode: 'edit', record: r })} disabled={r.status === '已下发'} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="编辑计划"><Edit2 size={16}/></button>
{r.status === '待展算' ? <button onClick={() => onCalcMrp(r.id)} disabled={!canCalcMrp} className="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 p-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed" title={canCalcMrp ? '下推 MRP 展算' : '无 MRP 展算权限'}><PlayCircle size={16}/></button> : <button disabled className="p-1.5 text-slate-300 cursor-not-allowed"><Check size={16}/></button>}
                                                    {r.status === '已展算' && <button onClick={() => onRunAps?.(r.id)} disabled={!canRunAps} className="text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 p-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed" title={canRunAps ? '运行 APS 排程' : '无 APS 排程权限'}><PlayCircle size={16}/></button>}
                                                    {r.status === '已排程' && <button onClick={() => onCreateFormalOrder?.(r.id)} disabled={!canCreateWorkOrder} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 p-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed" title={canCreateWorkOrder ? '基于成功排程创建工单' : '无创建工单权限'}><Factory size={16}/></button>}
                                                    <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="删除计划"><Trash2 size={16}/></button>
                                                </>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            {isModalOpen && <Prod_MpsModal defaultPriority={defaultPriority} defaultDemandSource={defaultDemandSource} bomData={bomData} onClose={() => setIsModalOpen(false)} onSave={onAddMps} />}
            {recordModal && <Prod_RecordModal type="mps" mode={recordModal.mode} record={recordModal.record} onClose={() => setRecordModal(null)} onSubmit={(draft) => { onUpdateMps(draft); setRecordModal(null); }} />}
            {deleteTarget && <Sales_ConfirmModal title="删除主生产计划" desc={`确定删除 ${deleteTarget.id} 吗？删除后该演示数据将从当前列表移除。`} confirmText="删除" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={() => { onDeleteMps(deleteTarget.id); setDeleteTarget(null); }} />}
        </div>
    );
};

const Prod_MrpView = ({ mrp, onIssueMrp, onRunGlobalMrp, onCreatePurchase, showToast }) => {
    const [peggingItem, setPeggingItem] = useState(null);
    return (
        <div className="flex flex-col gap-5 relative animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 shrink-0 flex justify-between items-center">
                <div><h3 className="font-bold text-slate-800 text-[16px] flex items-center gap-2"><div className="bg-blue-50 p-1.5 rounded-lg text-blue-600"><Calculator size={20}/></div> MRP 智能运算控制台</h3><p className="text-[13px] text-slate-500 mt-2 ml-10">根据 MPS 计划和 BOM，自动计算物料需求与产能负荷，自动生成采购与生产建议。</p></div>
                <button onClick={onRunGlobalMrp} className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[14px] font-bold px-6 py-3 rounded-xl shadow-sm transition-colors flex items-center gap-2"><Cpu size={20}/> 执行全局 MRP 展算</button>
            </div>
            <div className="grid grid-cols-3 gap-5 shrink-0">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-hidden flex flex-col justify-center"><div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/50 rounded-bl-full -z-0"></div><h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5 relative z-10"><Database size={16}/> 依赖数据 (输入)</h4><div className="grid grid-cols-2 gap-3 relative z-10"><div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg flex items-center gap-2"><CalendarCheck size={16} className="text-blue-500"/><span className="text-[12px] font-medium text-slate-700">MPS 计划</span></div><div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg flex items-center gap-2"><GitCommit size={16} className="text-purple-500"/><span className="text-[12px] font-medium text-slate-700">BOM 清单</span></div><div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg flex items-center gap-2"><Package size={16} className="text-emerald-500"/><span className="text-[12px] font-medium text-slate-700">现有库存</span></div><div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg flex items-center gap-2"><Truck size={16} className="text-amber-500"/><span className="text-[12px] font-medium text-slate-700">在途物料</span></div></div></div>
                <div className="bg-gradient-to-br from-[#faf5ff] to-white rounded-2xl border border-purple-100 shadow-sm p-5 flex flex-col justify-center items-center relative h-[150px]"><div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 bg-white rounded-full p-1 shadow-sm"><ArrowRight size={20} className="text-slate-300"/></div><div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-white rounded-full p-1 shadow-sm"><ArrowRight size={20} className="text-slate-300"/></div><div className="w-12 h-12 bg-[#8b5cf6] rounded-xl flex items-center justify-center text-white mb-3 shadow-lg shadow-purple-200"><Settings size={24} className="animate-[spin_3s_linear_infinite]"/></div><h4 className="font-bold text-[14px] text-slate-900">智能计算引擎</h4><p className="text-[11px] text-[#8b5cf6] mt-1.5 bg-purple-50 border border-purple-100 px-3 py-1 rounded-full font-bold shadow-sm">公式: 毛需求 - (库存 + 在途) = 净需求</p></div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-hidden flex flex-col justify-center"><div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50/50 rounded-bl-full -z-0"></div><h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5 relative z-10"><FileOutput size={16}/> 输出结果 (执行单据)</h4><div className="space-y-2 relative z-10"><div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-100 p-2.5 rounded-lg shadow-sm"><span className="flex items-center gap-2 text-[12px] font-bold text-emerald-700"><List size={16}/> 物料需求计划 (缺料表)</span></div><div className="flex items-center justify-between bg-blue-50/80 border border-blue-100 p-2.5 rounded-lg shadow-sm"><span className="flex items-center gap-2 text-[12px] font-bold text-blue-700"><Hammer size={16}/> 生产订单建议</span></div><div className="flex items-center justify-between bg-amber-50/80 border border-amber-100 p-2.5 rounded-lg shadow-sm"><span className="flex items-center gap-2 text-[12px] font-bold text-amber-700"><ShoppingCart size={16}/> 采购申请单</span></div></div></div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shrink-0 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0"><h4 className="font-bold text-[14px] text-slate-800 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> 最新运算明细记录</h4></div>
                <div className="overflow-x-auto"><table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100 sticky top-0 z-10"><tr><th className="px-6 py-3.5 font-medium">需求来源 / 目标物料</th><th className="px-6 py-3.5 font-medium">净需求推演公式</th><th className="px-6 py-3.5 font-medium text-right">执行操作</th></tr></thead><tbody className="divide-y divide-slate-100">
                    {mrp.map((r,i)=>(
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4 flex flex-col gap-1.5 items-start">
                                <span className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold border ${r.source.includes('MPS') ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-purple-600 bg-purple-50 border-purple-100'}`}>{r.source}</span>
                                <span className="font-bold text-slate-800 mt-1">{r.itemCode} - {r.itemName}</span>
                                <span className="text-[11px] text-slate-500">原始毛需求: {r.grossReq} 件</span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="text-[12px] text-slate-600 bg-[#f8fafc] p-2.5 rounded-lg border border-slate-200 font-mono">
                                    {r.grossReq}(需求) - [{r.stock}(存) + {r.onWay}(途)] = <span className={`${r.netReq > 0 ? 'text-rose-500' : 'text-slate-500'} font-bold`}>净缺口 {r.netReq}</span><br/>
                                    <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 flex items-center gap-1.5 text-slate-700">
                                        <Layers size={14} className="text-slate-400"/> {r.lotRule} ➔ 建议单据量: 
                                        <span className={`font-bold ml-1 ${r.plannedQty > r.netReq ? 'text-amber-600 flex items-center gap-1' : 'text-indigo-600'}`}>{r.plannedQty > r.netReq && <ArrowUpCircle size={14}/>} {r.plannedQty}</span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setPeggingItem(r)} className="flex items-center gap-1.5 bg-white text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-slate-200 shadow-sm transition-colors" title="查看供需溯源明细"><GitMerge size={14} className="text-purple-600"/> 溯源</button>
                                    {r.plannedQty === 0 ? <button disabled className="flex items-center gap-1.5 bg-slate-100 text-slate-400 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-slate-200"><Check size={14}/> 满足</button> : 
                                    r.type === '自制件' ? <button onClick={() => onIssueMrp(r.source, r.plannedQty)} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-blue-200 shadow-sm transition-colors"><Hammer size={14}/> 下达工单</button> : 
                                    <button onClick={() => onCreatePurchase(r)} disabled={!r.mrpTaskId || r.purchaseRequestId} className="flex items-center gap-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-amber-200 shadow-sm transition-colors disabled:opacity-40"><ShoppingCart size={14}/> {r.purchaseRequestId ? '已转采购' : '采购申请'}</button>}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody></table></div>
            </div>
            {peggingItem && <Prod_PeggingModal item={peggingItem} onClose={() => setPeggingItem(null)} />}
        </div>
    );
};

const Prod_ApsView = ({ orders, equipments, onUpdateOrder, showToast }) => {
    const [draggingId, setDraggingId] = useState(null);
    const [highlightedIds, setHighlightedIds] = useState([]);
    const [optimizing, setOptimizing] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState(null);
    const [dragOverMachine, setDragOverMachine] = useState(null);

    const WEEK_DAYS = ['周一 (Mon)', '周二 (Tue)', '周三 (Wed)', '周四 (Thu)', '周五 (Fri)'];

    const getDaySlot = (dateStr) => {
        if (!dateStr) return 0;
        const d = new Date(dateStr);
        const day = d.getDay();
        return Math.max(0, Math.min(4, day - 1));
    };

    const getDuration = (startStr, endStr) => {
        if (!startStr || !endStr) return 1;
        const start = new Date(startStr);
        const end = new Date(endStr);
        const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(1, Math.min(5, diff));
    };

    const getOrderMachine = (order, index) => {
        if (order.assignedMachine) return order.assignedMachine;
        if (!equipments || equipments.length === 0) return 'SMT-M01';
        return equipments[index % equipments.length]?.id || equipments[0]?.id;
    };

    const machineOrders = useMemo(() => {
        const groups = {};
        (equipments || []).forEach(eq => { groups[eq.id] = []; });
        orders.forEach((order, idx) => {
            const mid = getOrderMachine(order, idx);
            if (!groups[mid]) groups[mid] = [];
            groups[mid].push(order);
        });
        return groups;
    }, [orders, equipments]);

    const handleDragStart = (e, orderId) => {
        setDraggingId(orderId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', orderId);
    };

    const handleDragOver = (e, machineId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverMachine !== machineId) setDragOverMachine(machineId);
    };

    const handleDrop = (e, machineId) => {
        e.preventDefault();
        if (!draggingId) { setDragOverMachine(null); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.offsetWidth;
        const slotWidth = width / 5;
        const newSlot = Math.max(0, Math.min(4, Math.floor(x / slotWidth)));
        
        const order = orders.find(o => o.id === draggingId);
        if (!order) { setDraggingId(null); setDragOverMachine(null); return; }
        
        const duration = getDuration(order.startDate, order.endDate);
        const today = new Date();
        const dayOfWeek = today.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const baseDate = new Date(today);
        baseDate.setDate(today.getDate() + mondayOffset);
        
        const newStart = new Date(baseDate);
        newStart.setDate(baseDate.getDate() + newSlot);
        const newEnd = new Date(newStart);
        newEnd.setDate(newStart.getDate() + duration - 1);
        
        onUpdateOrder({
            ...order,
            startDate: newStart.toISOString().slice(0, 10),
            endDate: newEnd.toISOString().slice(0, 10),
            assignedMachine: machineId,
        });
        
        showToast(`工单 ${draggingId} 已拖拽调整到 ${machineId} · 第${newSlot + 1}天`, 'success');
        setDraggingId(null);
        setDragOverMachine(null);
    };

    const handleOptimize = () => {
        if (optimizing) return;
        setOptimizing(true);
        setOptimizationResult(null);
        
        setTimeout(() => {
            const machines = (equipments && equipments.length > 0) ? equipments : [{ id: 'SMT-M01', name: 'SMT-M01', oee: '88%', type: 'SMT' }];
            const machineLoads = {};
            machines.forEach(m => { machineLoads[m.id] = 0; });
            
            const statusPriority = { '执行中': 0, '齐套待下发': 1, '待检查': 2, '已完工': 3 };
            const sortedOrders = [...orders].sort((a, b) => {
                const pa = statusPriority[a.status] ?? 9;
                const pb = statusPriority[b.status] ?? 9;
                if (pa !== pb) return pa - pb;
                return (b.quantity || 0) - (a.quantity || 0);
            });
            
            const today = new Date();
            const dayOfWeek = today.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const baseDate = new Date(today);
            baseDate.setDate(today.getDate() + mondayOffset);
            
            const movedIds = [];
            const optimizedOrders = sortedOrders.map((order) => {
                const duration = getDuration(order.startDate, order.endDate);
                let leastMachine = machines[0];
                let minLoad = Infinity;
                machines.forEach(m => {
                    if (machineLoads[m.id] < minLoad) {
                        minLoad = machineLoads[m.id];
                        leastMachine = m;
                    }
                });
                
                const slot = Math.min(4, machineLoads[leastMachine.id]);
                machineLoads[leastMachine.id] += duration;
                
                const newStart = new Date(baseDate);
                newStart.setDate(baseDate.getDate() + slot);
                const newEnd = new Date(newStart);
                newEnd.setDate(newStart.getDate() + duration - 1);
                
                const newStartDate = newStart.toISOString().slice(0, 10);
                const newEndDate = newEnd.toISOString().slice(0, 10);
                const oldMachine = order.assignedMachine || '';
                const oldStart = order.startDate || '';
                
                if (oldStart !== newStartDate || oldMachine !== leastMachine.id) {
                    movedIds.push(order.id);
                }
                
                return {
                    ...order,
                    startDate: newStartDate,
                    endDate: newEndDate,
                    assignedMachine: leastMachine.id,
                };
            });
            
            optimizedOrders.forEach(o => onUpdateOrder(o));
            
            setHighlightedIds(movedIds);
            setOptimizationResult({
                totalOrders: optimizedOrders.length,
                movedCount: movedIds.length,
                machineLoads,
                machines: machines.map(m => ({ id: m.id, name: m.name || m.id, load: machineLoads[m.id] })),
            });
            
            setOptimizing(false);
            showToast(`AI优化平衡完成：${movedIds.length}/${optimizedOrders.length} 个工单已重新排期，设备负载已均衡`, 'success');
            
            setTimeout(() => setHighlightedIds([]), 3000);
        }, 1500);
    };

    const machineRows = useMemo(() => {
        if (equipments && equipments.length > 0) return equipments;
        return [
            { id: 'SMT-M01', name: 'SMT-M01', type: 'SMT', status: '运行正常', oee: '88%' },
            { id: 'ASSY-W02', name: 'ASSY-W02', type: 'Assembly', status: '闲置待产', oee: '92%' },
            { id: 'TEST-T01', name: '测试线-T01', type: 'Test', status: '运行正常', oee: '85%' },
        ];
    }, [equipments]);

    const getStatusColor = (status) => {
        if (status === '执行中') return 'bg-blue-500 hover:bg-blue-600';
        if (status === '齐套待下发') return 'bg-emerald-500 hover:bg-emerald-600';
        if (status === '待检查') return 'bg-amber-500 hover:bg-amber-600';
        if (status === '已完工') return 'bg-slate-400 hover:bg-slate-500';
        return 'bg-purple-500 hover:bg-purple-600';
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col animate-in fade-in duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div><h3 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><CalendarRange className="w-4.5 h-4.5 text-blue-600"/> 智能排产甘特图 (APS)</h3><p className="text-[12px] text-slate-500 mt-1">拖拽工单色块调整时段，点击AI优化平衡自动排程</p></div>
                <button 
                    onClick={handleOptimize} 
                    disabled={optimizing}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] px-4 py-2 rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {optimizing ? <><Loader2 size={14} className="animate-spin"/> AI优化中...</> : <><Sparkles size={14}/> 执行AI优化平衡</>}
                </button>
            </div>
            
            {optimizationResult && (
                <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-4 text-[12px] flex-wrap">
                    <span className="text-blue-700 font-bold flex items-center gap-1"><CheckCircle2 size={14}/> 优化完成</span>
                    <span className="text-slate-600">工单总数: <strong className="text-slate-800">{optimizationResult.totalOrders}</strong></span>
                    <span className="text-slate-600">调整工单: <strong className="text-amber-600">{optimizationResult.movedCount}</strong></span>
                    <div className="flex items-center gap-2 ml-auto">
                        {optimizationResult.machines.map(m => (
                            <span key={m.id} className="text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                                {m.name}: <strong className="text-blue-600">{m.load}天</strong>
                            </span>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="p-6 flex-1 bg-slate-50/50 overflow-auto custom-scrollbar">
                <div className="flex border-b border-slate-200 pb-3 text-[12px] font-bold text-slate-400 uppercase">
                    <div className="w-32 shrink-0">设备资产中心</div>
                    <div className="flex-1 min-w-[500px] grid grid-cols-5 text-center">
                        {WEEK_DAYS.map(day => <div key={day}>{day}</div>)}
                    </div>
                </div>
                
                <div className="mt-4 space-y-5">
                    {machineRows.map((machine) => {
                        const machineId = machine.id;
                        const machineName = machine.name || machine.id;
                        const rowOrders = machineOrders[machineId] || [];
                        
                        return (
                            <div key={machineId} className="flex items-center group">
                                <div className="w-32 shrink-0">
                                    <div className="font-bold text-[13px] text-slate-700">{machineName}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{machine.type || ''} · OEE {machine.oee || '-'}</div>
                                </div>
                                <div 
                                    className={`flex-1 min-w-[500px] grid grid-cols-5 gap-1 relative h-12 bg-white rounded-lg border-2 transition-colors ${dragOverMachine === machineId ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200 shadow-sm'}`}
                                    onDragOver={(e) => handleDragOver(e, machineId)}
                                    onDragLeave={() => setDragOverMachine(null)}
                                    onDrop={(e) => handleDrop(e, machineId)}
                                >
                                    {[0, 1, 2, 3, 4].map(i => (
                                        <div key={i} className="border-r border-slate-100 last:border-r-0"></div>
                                    ))}
                                    
                                    {rowOrders.map((order) => {
                                        const slot = getDaySlot(order.startDate);
                                        const duration = getDuration(order.startDate, order.endDate);
                                        const leftPct = (slot / 5) * 100;
                                        const widthPct = (duration / 5) * 100;
                                        const isHighlighted = highlightedIds.includes(order.id);
                                        const isDragging = draggingId === order.id;
                                        
                                        return (
                                            <div
                                                key={order.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, order.id)}
                                                onDragEnd={() => { setDraggingId(null); setDragOverMachine(null); }}
                                                className={`absolute top-1.5 bottom-1.5 ${getStatusColor(order.status)} rounded-md text-white text-[11px] font-bold flex items-center px-2 cursor-move shadow-sm transition-all ${isDragging ? 'opacity-40 scale-95' : ''} ${isHighlighted ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}
                                                style={{ left: `${leftPct}%`, width: `calc(${widthPct}% - 4px)` }}
                                                title={`${order.id} | ${order.product} | ${order.startDate} ~ ${order.endDate} | ${order.status}`}
                                            >
                                                <span className="truncate">{order.id} · {order.product?.split(' - ')[0] || order.product}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                <div className="mt-6 flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1"><Move size={12}/> 拖拽色块调整时段</span>
                    <span className="flex items-center gap-1"><Sparkles size={12}/> AI优化自动平衡设备负载</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded"></div>执行中</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded"></div>齐套待下发</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded"></div>待检查</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-400 rounded"></div>已完工</span>
                </div>
            </div>
        </div>
    );
};

const Prod_OrdersView = ({ orders, onCheckKit, onDispatch, onUpdateOrder, onDeleteOrder, showToast }) => {
    const [recordModal, setRecordModal] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    return (
    <div className="flex flex-col gap-5 h-full animate-in fade-in duration-300">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex justify-between items-center shadow-sm shrink-0">
            <div className="flex items-center gap-3">
                <div className="bg-blue-50 p-2 text-blue-600 rounded-lg"><ClipboardList size={20}/></div>
                <div><h3 className="font-bold text-[16px] text-slate-800">生产订单与防呆齐套</h3><p className="text-[12px] text-slate-500">在正式投产前必须进行【齐套性检查】，物料100%满足方可下达车间。</p></div>
            </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-[13px] whitespace-nowrap">
                    <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100">
                        <tr><th className="px-6 py-3.5 font-medium">工单编号</th><th className="px-6 py-3.5 font-medium">来源</th><th className="px-6 py-3.5 font-medium">目标产品</th><th className="px-6 py-3.5 font-medium">数量</th><th className="px-6 py-3.5 font-medium">齐套状态</th><th className="px-6 py-3.5 font-medium text-right">协同与操作</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {orders.map(o => (
                            <tr key={o.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-6 py-4 font-bold text-blue-600 font-mono">{o.id}</td>
                                <td className="px-6 py-4 text-slate-600">{o.source}</td>
                                <td className="px-6 py-4 font-bold text-slate-800">{o.product}</td>
                                <td className="px-6 py-4 font-mono font-bold text-slate-700">{o.quantity}</td>
                                <td className="px-6 py-4">{o.status==='执行中'?<span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 w-max"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>执行中</span>: o.status==='齐套待下发'? <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max">100%齐套 待下发</span> : o.status==='已完工' ? <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1"><CheckCircle2 size={12}/>已入库完工</span> : <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full text-[11px] font-bold">待齐套检查</span>}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 items-center">
                                        <button onClick={() => setRecordModal({ mode: 'view', record: o })} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="查看工单"><Eye size={15}/></button>
                                        <button onClick={() => setRecordModal({ mode: 'edit', record: o })} disabled={o.status === '执行中'} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="编辑工单"><Edit2 size={15}/></button>
                                        {o.status==='待检查' && <button onClick={() => onCheckKit(o.id)} className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1.5 shadow-sm"><ScanLine size={14}/> 齐套检查</button>}
                                        {o.status==='齐套待下发' && <button onClick={() => onDispatch(o.id)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1.5 shadow-sm"><Send size={14}/> 下发车间</button>}
                                        {o.status==='执行中' && <span className="text-slate-400 text-[11px] font-bold px-2 mr-2">已下发执行</span>}
                                        {o.status==='已完工' && <span className="text-emerald-600 text-[11px] font-bold px-2 mr-2">库存流水 {o.stockTx}</span>}
                                        <button onClick={() => setDeleteTarget(o)} disabled={['执行中', '已完工'].includes(o.status)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30" title={['执行中', '已完工'].includes(o.status) ? '执行中或已完工工单不可删除' : '删除工单'}><Trash2 size={15}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination total={orders.length} page={1} limit={10} />
        </div>
        {recordModal && <Prod_RecordModal type="order" mode={recordModal.mode} record={recordModal.record} onClose={() => setRecordModal(null)} onSubmit={(draft) => { onUpdateOrder(draft); setRecordModal(null); }} />}
        {deleteTarget && <Sales_ConfirmModal title="删除生产工单" desc={`确定删除 ${deleteTarget.id} 吗？关联现场任务不会自动回滚。`} confirmText="删除" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={() => { onDeleteOrder(deleteTarget.id); setDeleteTarget(null); }} />}
    </div>
    );
};

const Prod_ExecutionView = ({ jobs, onStartJob, onReportJob, onSendFqc, onSendOutsource, onReceiveOutsource, onMaterialReq, onReturnMaterial, onReworkOrder, showToast }) => (
    <div className="flex flex-col gap-5 h-full animate-in fade-in duration-300">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex justify-between items-center shadow-sm shrink-0">
            <div className="flex items-center gap-3">
                <div className="bg-blue-50 text-blue-600 p-2 rounded-lg"><Hammer size={20}/></div>
                <div><h3 className="font-bold text-[16px] text-slate-800">车间执行与物流闭环</h3><p className="text-[12px] text-slate-500">涵盖厂内领料/退料的闭环物流，以及委外加工工序的发往和到货检验接收。</p></div>
            </div>
            <button onClick={() => showToast('唤起扫码枪/终端摄像头模块...')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-[13px] font-bold flex items-center shadow-sm transition-colors"><ScanLine size={14} className="mr-1.5"/> 一键扫码报工</button>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex-1 overflow-hidden flex flex-col shadow-sm">
            <h4 className="font-bold text-[14px] text-slate-800 mb-4 flex items-center gap-2"><LayoutDashboard size={16} className="text-blue-600"/> 现场工序作业卡看板</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto custom-scrollbar p-1 content-start">
                {jobs.map(j=>{
                    let isOutsourced = j.opType === '委外';
                    let badge = j.status==='锁定'?<span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded border border-rose-100 text-[11px] font-bold">异常锁定</span>:
                                j.status==='进行中'?<span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded border border-emerald-100 text-[11px] font-bold animate-pulse">加工中</span>:
                                j.status==='委外中'?<span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded border border-purple-100 text-[11px] font-bold animate-pulse">外发加工中</span>:
                                j.status==='待发外'?<span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-100 text-[11px] font-bold">等待外发物流</span>:
                                j.status==='领料处理中'?<span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 text-[11px] font-bold">领料处理中</span>:
                                j.status==='已完工'?<span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 text-[11px] font-bold">已完结</span>:
                                j.status==='未开工'?<span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 text-[11px] font-bold">物料就位待产</span>:
                                <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-100 text-[11px] font-bold">待领料 (缺料)</span>;
                    return (
                        <div key={j.id} className={`bg-white border rounded-2xl p-5 shadow-sm flex flex-col gap-3 relative hover:border-blue-400 transition-all hover:shadow-md ${j.isRework ? 'border-rose-200 bg-rose-50/10' : 'border-slate-200'}`}>
                            {j.isRework && <span className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-xl">返工加急单</span>}
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-mono inline-block mb-1">{j.id}</span>
                                    {isOutsourced && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 ml-2">委外节点</span>}
                                    <h5 className="text-[14px] font-bold mt-1 text-slate-800">{j.opName}</h5>
                                </div>
                                {badge}
                            </div>
                            <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg flex justify-between border border-slate-100 mt-1">
                                <span className="font-bold text-slate-700 flex items-center gap-1.5">{isOutsourced?<Truck size={12} className="text-amber-500"/>:<MonitorCog size={12} className="text-blue-500"/>} {j.machineId}</span>
                                <span className="font-mono">工单: {j.orderId}</span>
                            </div>
                            <div className="mt-1">
                                <div className="flex justify-between text-[11px] mb-1.5 font-bold text-slate-500"><span>良品 {j.okQty} / 目标 {j.targetQty}</span><span className={j.ngQty > 0 ? 'text-rose-500' : ''}>NG: {j.ngQty}件</span></div>
                                <ProgressBar progress={Math.round((j.okQty/j.targetQty)*100)} color="bg-blue-600"/>
                            </div>
                            <div className="mt-3 flex gap-2 w-full">
                                {isOutsourced ? (
                                    j.status === '待发外' ? <button onClick={() => onSendOutsource(j.id)} className="w-full bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[12px] font-bold py-2 rounded-xl transition-colors shadow-sm flex justify-center items-center gap-1.5"><Truck size={14}/> 生成委外单发货</button> :
                                    j.status === '委外中' ? <button onClick={() => onReceiveOutsource(j.id)} className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[12px] font-bold py-2 rounded-xl transition-colors shadow-sm flex justify-center items-center gap-1.5"><ClipboardCheck size={14}/> 委外到货接收</button> :
                                    <button disabled className="w-full bg-slate-50 text-slate-400 border border-slate-200 text-[12px] font-bold py-2 rounded-xl">委外已完结</button>
                                ) : (
                                    j.status==='待领料' ? <button onClick={() => onMaterialReq(j.id)} className="w-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[12px] font-bold py-2 rounded-xl transition-colors shadow-sm flex justify-center items-center gap-1.5"><FileText size={14}/> 开具领料单</button> :
                                    j.status==='领料处理中' ? <button disabled className="w-full bg-blue-50 text-blue-700 border border-blue-200 text-[12px] font-bold py-2 rounded-xl"><Clock size={14} className="mr-1.5 inline"/>等待仓库出库</button> :
                                    <div className="flex gap-2 w-full">
                                        <button onClick={() => onStartJob(j.id)} disabled={j.status==='进行中'||j.status==='已完工'} className="flex-1 bg-blue-600 text-white hover:bg-blue-700 text-[12px] py-2 rounded-xl font-bold disabled:opacity-40 transition-colors shadow-sm">开工作业</button>
                                        <button onClick={() => onReportJob(j.id)} disabled={j.status!=='进行中'} className="flex-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[12px] py-2 rounded-xl font-bold disabled:opacity-40 transition-colors shadow-sm">登记报工</button>
                                        {j.formalOrder ? <button onClick={() => onSendFqc(j.id)} disabled={j.okQty + j.ngQty <= 0} className="flex-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[12px] py-2 rounded-xl font-bold disabled:opacity-40">送完工检</button> : <button onClick={() => onReturnMaterial(j.id)} disabled={j.status==='已完工'} className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[12px] py-2 rounded-xl font-bold disabled:opacity-40 transition-colors shadow-sm">退回废料</button>}
                                    </div>
                                )}
                            </div>
                            {j.ngQty > 0 && !j.ngHandled && (
                                <div className="mt-1 pt-3 border-t border-rose-100">
                                    <button onClick={() => onReworkOrder(j.id, j.ngQty)} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-bold py-1.5 rounded-lg transition-colors flex justify-center items-center gap-1.5"><RefreshCw size={14}/> {j.ngQty}件不良品 ➔ 派发返工单</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
);

const Prod_QcView = ({ qc, orders = [], onQcComplete, onConfirmInbound, onCloseOrder, onDisposition, showToast }) => {
    const [activeQc, setActiveQc] = useState(null);
    return (
        <div className="flex flex-col gap-5 h-full relative animate-in fade-in duration-300">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm shrink-0">
                <div className="flex items-center gap-3"><div className="bg-blue-50 text-blue-600 p-2 rounded-lg"><ShieldCheck size={20}/></div><div><h3 className="font-bold text-[16px] text-slate-800">质量管理与结案中枢 (QMS)</h3><p className="text-[12px] text-slate-500">支持巡检与完工检防呆录入；强制执行不良品(NG)的 MRB 评审流程。</p></div></div>
            </div>
            {orders.some(order => ['COMPLETED', 'CLOSING', 'CLOSED'].includes(order.formalOrder?.status)) && <div className="bg-white border border-slate-200 rounded-lg p-4">
                {orders.filter(order => ['COMPLETED', 'CLOSING', 'CLOSED'].includes(order.formalOrder?.status)).map(order => <div key={order.id} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                    <span>{order.id} · {order.status}</span>
                    {order.formalOrder.status !== 'CLOSED' && <button onClick={() => onCloseOrder(order.id)} className="text-blue-600 px-3 py-1">
                        {order.formalOrder.status === 'CLOSING' ? '复核结案' : '提交结案'}</button>}
                </div>)}
            </div>}
            <div className="bg-white border border-slate-200 rounded-2xl flex-1 overflow-auto shadow-sm flex flex-col relative">
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50"><h4 className="font-bold text-[14px] text-slate-800 flex items-center gap-2"><ListChecks size={16} className="text-blue-600"/> 质量检验任务台</h4></div>
                <div className="overflow-y-auto p-0 flex-1 custom-scrollbar"><table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-[#fafafa] text-slate-500 border-b border-slate-100 sticky top-0 z-10"><tr><th className="px-6 py-3.5 font-medium">检验批次号</th><th className="px-6 py-3.5 font-medium">来源单据</th><th className="px-6 py-3.5 font-medium">检验类型/物料</th><th className="px-6 py-3.5 font-medium">送检数量</th><th className="px-6 py-3.5 font-medium">当前状态</th><th className="px-6 py-3.5 font-medium text-right">结果处理</th></tr></thead><tbody className="divide-y divide-slate-100">
                    {qc.map(q => (
                        <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4 font-mono font-bold text-blue-600">{q.id}</td><td className="px-6 py-4 text-slate-500 font-mono">{q.orderId}</td>
                            <td className="px-6 py-4 flex items-center gap-2"><span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${q.type.includes('FQC')?'bg-blue-100 text-blue-700 border-blue-200':'bg-purple-100 text-purple-700 border-purple-200'}`}>{q.type}</span><span className="font-bold text-slate-800">{q.product}</span></td>
                            <td className="px-6 py-4 font-mono text-slate-700 font-bold">{q.sampleQty} PCS</td>
                            <td className="px-6 py-4">{
                                q.status === '待检验'
                                    ? <span className="bg-amber-50 text-amber-600 border border-amber-100 px-2.5 py-1 rounded-full text-[11px] font-bold">待检验录入</span>
                                    : q.status === '待入库'
                                        ? <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full text-[11px] font-bold">质检通过 · 待入库</span>
                                        : q.status === '待返修复检'
                                            ? <span className="bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-1 rounded-full text-[11px] font-bold">NG 待返修复检</span>
                                            : <span className={`border px-2.5 py-1 rounded-full text-[11px] font-bold ${q.status === '已入库' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{q.status}</span>
                            }</td>
                            <td className="px-6 py-4 text-right flex justify-end">
                                {q.status === '待检验'
                                    ? <button onClick={() => setActiveQc(q)} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-blue-200 shadow-sm transition-colors"><Edit2 size={14}/> 录入检验</button>
                                    : q.status === '待入库'
                                        ? <button onClick={() => onConfirmInbound(q.id)} className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-emerald-200 shadow-sm transition-colors"><Warehouse size={14}/> 确认成品入库</button>
                                        : q.status === '待质量处置'
                                            ? <div className="flex gap-2"><button onClick={() => onDisposition(q.id, 'rework')} className="text-blue-600">生成返工单</button><button onClick={() => onDisposition(q.id, 'scrap')} className="text-rose-600">审批报废</button></div>
                                        : q.status === '返工处理中'
                                            ? <button onClick={() => onDisposition(q.id, 'complete')} className="text-blue-600">返工完成送复检</button>
                                        : q.status === '入库失败'
                                            ? <button onClick={() => onDisposition(q.id, 'retry')} className="text-blue-600">重试入库</button>
                                        : <span className="text-[11px] text-slate-500 font-bold px-2 flex flex-col items-end gap-1"><span className={q.status === '已结案' ? 'text-emerald-600' : 'text-amber-600'}>良品: {q.okQty}</span>{q.ngQty > 0 && <span className="text-rose-500">NG: {q.ngQty} ({q.result||'无'})</span>}{q.stockTx && <span className="font-mono text-blue-600">{q.stockTx}</span>}</span>}
                            </td>
                        </tr>
                    ))}
                </tbody></table></div>
            </div>
            {activeQc && <Prod_QcModal qc={activeQc} onClose={() => setActiveQc(null)} onSave={(...args) => { onQcComplete(...args); setActiveQc(null); }} />}
        </div>
    );
};

const Prod_EquipmentView = ({ equipments, onAddEq, onEditEq, onDeleteEq, onFixEquipment, onSimulateFailure, productionLines }) => {
    const [modalState, setModalState] = useState({ open: false, mode: 'add', item: null });
    const [deleteTarget, setDeleteTarget] = useState(null);

    return (
        <div className="flex flex-col gap-5 h-full relative animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 shrink-0 flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10 w-2/3">
                    <h3 className="font-bold text-slate-800 text-[16px] flex items-center gap-2">
                        <div className="bg-blue-50 p-1.5 rounded-lg text-blue-600"><MonitorCog size={20} /></div> 设备管理：现场机台资源库
                    </h3>
                    <p className="text-[13px] text-slate-500 mt-2 ml-10">维护生产现场的贴片机、测试仪、工作台等基础硬件资产。发生故障将自动引发AI排产预警微调。</p>
                </div>
                <button onClick={() => setModalState({ open: true, mode: 'add', item: null })} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-colors flex items-center gap-1.5 relative z-10 shrink-0">
                    <Plus size={16} /> 注册物理设备
                </button>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col relative p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto custom-scrollbar content-start h-full">
	                    {equipments.map(eq => {
	                        let isNormal = eq.status === '运行正常';
	                        let isIdle = eq.status === '闲置待产';
	                        let isError = eq.status === '故障停机';
		                        let line = productionLines.find(item => item.code === eq.lineCode);
	                        let borderStyle = isNormal ? 'border-emerald-200 hover:border-emerald-300 ring-1 ring-emerald-50' : isError ? 'border-rose-200 hover:border-rose-300 ring-2 ring-rose-100 bg-rose-50/10' : 'border-slate-200 hover:border-slate-300';
	                        return (
                            <div key={eq.id} className={`bg-white border ${borderStyle} rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col gap-4 relative group`}>
                                <div className="hidden group-hover:flex items-center gap-1 absolute right-3 top-3 bg-white/95 backdrop-blur pl-2 py-1 rounded shadow-sm border border-slate-100">
                                    <button onClick={() => setModalState({ open: true, mode: 'edit', item: eq })} className="p-1 text-slate-500 hover:text-blue-600"><Edit2 size={16}/></button>
                                    <button onClick={() => setDeleteTarget(eq)} className="p-1 text-rose-400 hover:text-rose-600"><Trash2 size={16}/></button>
                                </div>
	                                <div className="flex items-center gap-3">
	                                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 shrink-0"><Cpu size={24}/></div>
	                                    <div><h5 className="font-bold text-slate-900 text-[14px]">{eq.name}</h5><div className="text-[11px] text-slate-400 font-mono mt-0.5">编码: {eq.id}</div></div>
	                                </div>
	                                <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-3 py-2">
	                                    <div className="text-[10px] font-bold text-blue-500 mb-0.5">平台产线</div>
	                                    <div className="text-[12px] font-bold text-slate-800 truncate">{line ? `${line.name} / ${line.workshopCode}` : '未绑定产线'}</div>
	                                </div>
	                                <div className="flex justify-between items-center border-t border-slate-50 pt-3">
                                    {isNormal ? <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 w-max"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> {eq.status}</span> : isError ? <span className="bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 w-max animate-pulse"><AlertTriangle size={12}/> {eq.status}</span> : <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 w-max"><Coffee size={12}/> {eq.status}</span>}
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">OEE: <span className={`font-mono font-bold text-[14px] ${isError ? 'text-rose-500' : 'text-slate-800'}`}>{eq.oee}</span></div>
                                </div>
                                <div className="flex gap-2 mt-auto">
                                    {isNormal || isIdle ? <button onClick={() => onSimulateFailure(eq.id)} className="flex-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-[12px] font-bold py-1.5 rounded-lg transition-colors">模拟突发异常</button> : <button onClick={() => onFixEquipment(eq.id)} className="flex-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[12px] font-bold py-1.5 rounded-lg transition-colors">指令修复恢复</button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {modalState.open && <Prod_EqModal productionLines={productionLines} editItem={modalState.item} onClose={() => setModalState({ open: false, mode: 'add', item: null })} onSave={(data) => { modalState.mode === 'add' ? onAddEq(data) : onEditEq(data); setModalState({ open: false, mode: 'add', item: null }); }} />}
            {deleteTarget && <Sales_ConfirmModal title="删除设备资产" desc={`确定删除 ${deleteTarget.name} 吗？该操作会从当前设备资源库移除。`} confirmText="删除" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={() => { onDeleteEq(deleteTarget.id); setDeleteTarget(null); }} />}
        </div>
    );
};

const Prod_BomModal = ({ action, activeNode, onSave, onClose }) => {
    const isRootNode = action === 'edit' && activeNode && activeNode.children; // Simple check
    const [id, setId] = useState(activeNode?.id || '');
    const [name, setName] = useState(activeNode ? (activeNode.name.includes(' - ') ? activeNode.name.split(' - ')[1] : activeNode.name) : '');
    const [type, setType] = useState(activeNode?.type || (isRootNode ? '成品' : '原材料'));
    const [qty, setQty] = useState(activeNode?.quantity || 1);
    const [unit, setUnit] = useState(activeNode?.unit || 'PCS');
    const [version, setVersion] = useState(activeNode?.version || 'V1.0');
    const [scrapRate, setScrapRate] = useState(activeNode?.scrapRate || 0);
    const [lotRule, setLotRule] = useState(activeNode?.lotRule || 'L4L');
    const [moq, setMoq] = useState(activeNode?.moq || 1);

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[600px] overflow-hidden flex flex-col transform">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-[15px]">{isRootNode ? '产品高级属性设定' : (action === 'add' ? '添加子零部件' : '编辑零部件属性')}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
                </div>
                <div className="p-6 space-y-5 overflow-y-auto max-h-[65vh] custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">{isRootNode ? '产品 ID *' : '物料 ID *'}</label><input value={id} onChange={e=>setId(e.target.value)} disabled={action==='edit' && !isRootNode} type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono disabled:bg-slate-50" /></div>
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">{isRootNode ? '产品名称 *' : '物料名称 *'}</label><input value={name} onChange={e=>setName(e.target.value)} type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">属性</label>
                            <select value={type} onChange={e=>setType(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
                                {isRootNode ? <><option>成品</option><option>半成品</option></> : <><option>原材料</option><option>外购件</option><option>辅料</option></>}
                            </select>
                        </div>
                        {isRootNode && <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">产品版本号 (Revision)</label><input value={version} onChange={e=>setVersion(e.target.value)} type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono" /></div>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">标准用量 *</label>
                            <div className="flex gap-2">
                                <input value={qty} onChange={e=>setQty(e.target.value)} type="number" step="any" className="w-2/3 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono" />
                                <select value={unit} onChange={e=>setUnit(e.target.value)} className="w-1/3 border border-slate-200 rounded-lg px-2 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white"><option>PCS</option><option>KG</option><option>M</option><option>L</option><option>SET</option></select>
                            </div>
                        </div>
                        {!isRootNode && <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">生产损耗率 (%)</label><input value={scrapRate} onChange={e=>setScrapRate(e.target.value)} type="number" min="0" max="100" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono" /></div>}
                    </div>
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-4">
                        <h5 className="text-[12px] font-bold text-indigo-800 flex items-center gap-1.5"><Layers size={14}/> 计划与批量策略 (Lot Sizing)</h5>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 mb-1.5">批量规则</label>
                                <select value={lotRule} onChange={e=>setLotRule(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
                                    <option value="L4L">按需生产/采购 (L4L)</option><option value="FOQ">固定批量/起定量 (FOQ/MOQ)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 mb-1.5">批量基数 / MOQ</label>
                                <input value={moq} onChange={e=>setMoq(e.target.value)} type="number" min="1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2 text-[13px] border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition-colors">取消</button>
                    {isRootNode ? (
                        <>
                            <button onClick={() => onSave({ id, name: name.includes(' - ') ? name : `${id} - ${name}`, type, quantity: Number(qty), unit, version, scrapRate: Number(scrapRate), lotRule, moq: Number(moq) }, '草稿')} className="px-5 py-2 text-[13px] bg-white border border-blue-600 text-blue-600 rounded-xl hover:bg-blue-50 transition-colors">保存草稿</button>
                            <button onClick={() => onSave({ id, name: name.includes(' - ') ? name : `${id} - ${name}`, type, quantity: Number(qty), unit, version, scrapRate: Number(scrapRate), lotRule, moq: Number(moq) }, '待审批')} className="px-5 py-2 text-[13px] bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1.5"><Send size={14}/> 提交审批</button>
                        </>
                    ) : (
                        <button onClick={() => onSave({ id, name: name.includes(' - ') ? name : `${id} - ${name}`, type, quantity: Number(qty), unit, version, scrapRate: Number(scrapRate), lotRule, moq: Number(moq) })} className="px-5 py-2 text-[13px] bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">确认保存结构</button>
                    )}
                </div>
            </div>
        </div>
    );
};

const Prod_ImportBomModal = ({ onClose, onImport }) => (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-white rounded-2xl shadow-2xl w-[450px] overflow-hidden flex flex-col transform border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2"><FileSpreadsheet size={16} className="text-emerald-600"/> 批量导入产品 BOM</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
            </div>
            <div className="p-6">
                <div onClick={onImport} className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer group">
                    <div className="bg-white p-3 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform"><UploadCloud size={24} className="text-blue-600"/></div>
                    <p className="text-[13px] font-bold text-slate-700">点击或将文件拖拽到这里</p>
                    <p className="text-[11px] text-slate-400 mt-1">支持 .xlsx, .xls, .csv 标准模板文件</p>
                </div>
                <div className="mt-4 bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                    <Info size={16} className="text-blue-500 mt-0.5 shrink-0"/>
                    <p className="text-[11px] text-blue-700 leading-relaxed">系统将自动解析父子层级关系并生成“草稿”状态的BOM。若物料编码已存在基础资料库中，将自动建立关联。</p>
                </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                <button onClick={onClose} className="px-5 py-2 text-[13px] border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">取消</button>
                <button onClick={onImport} className="px-5 py-2 text-[13px] bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5"><Check size={16}/> 开始解析导入</button>
            </div>
        </div>
    </div>
);

const Prod_BomView = ({ bomData, setBomData, showToast, formalCtx = null }) => {
    const [activeBomId, setActiveBomId] = useState(bomData[0]?.id);
    const [searchKw, setSearchKw] = useState('');
    const [bomModal, setBomModal] = useState({ open: false, action: 'add', nodeId: null, parentId: null });
    const [importOpen, setImportOpen] = useState(false);

    const activeBom = bomData.find(b => b.id === activeBomId);
    const isEditable = activeBom && activeBom.status === '草稿';

    const handleCreateDraft = () => {
        const newId = `BOM-${Date.now().toString().slice(-4)}`;
        const newBom = { id: newId, name: `${newId} - 未命名产品`, type: '成品', quantity: 1, unit: 'PCS', status: '草稿', version: 'V1.0', children: [] };
        setBomData(prev => [newBom, ...prev]);
        setActiveBomId(newId);
        setBomModal({ open: true, action: 'edit', nodeId: newId, parentId: null });
    };

    const handleImport = () => {
        showToast('正在解析文件树层级...', 'warning');
        setTimeout(() => {
            const newId = 'FG-IMP-' + Date.now().toString().slice(-4);
            const randSuffix = Math.floor(Math.random() * 1000);
            const importedBom = {
                id: newId, name: '自动导入 - 高级工业传感模块', type: '成品', quantity: 1, unit: 'PCS', status: '草稿', version: 'V1.0',
                children: [
                    { id: `RM-${randSuffix}-1`, name: `RM-${randSuffix}-1 - 进口高敏传感器探头`, type: '原材料', quantity: 2, unit: 'PCS', children: [] },
                    { id: `RM-${randSuffix}-2`, name: `RM-${randSuffix}-2 - 标准防水密封垫圈`, type: '外购件', quantity: 4, unit: 'PCS', children: [] },
                    { id: `SA-${randSuffix}`, name: `SA-${randSuffix} - 定制传感转换板`, type: '半成品', quantity: 1, unit: 'PCS', children: [
                        { id: `RM-${randSuffix}-3`, name: `RM-${randSuffix}-3 - 微型贴片电容`, type: '外购件', quantity: 12, unit: 'PCS', children: [] }
                    ]}
                ]
            };
            setBomData(prev => [importedBom, ...prev]);
            setActiveBomId(newId);
            showToast('BOM 结构数据导入成功，已生成草稿！', 'success');
            setImportOpen(false);
        }, 1200);
    };

    const findBomNode = (node, id) => {
        if (node.id === id) return node;
        if (node.children) {
            for (let child of node.children) {
                let found = findBomNode(child, id);
                if (found) return found;
            }
        }
        return null;
    };

    const handleSaveBomNode = (data, targetStatus) => {
        setBomData(prev => {
            let newData = [...prev];
            if (bomModal.action === 'add') {
                const addRecursive = (nodes) => {
                    for (let n of nodes) {
                        if (n.id === bomModal.parentId) {
                            n.children.push({ ...data, children: [] });
                            return true;
                        }
                        if (n.children && addRecursive(n.children)) return true;
                    }
                    return false;
                };
                addRecursive(newData);
            } else {
                const editRecursive = (nodes) => {
                    for (let i=0; i<nodes.length; i++) {
                        if (nodes[i].id === bomModal.nodeId) {
                            nodes[i] = { ...nodes[i], ...data };
                            if (targetStatus) nodes[i].status = targetStatus;
                            return true;
                        }
                        if (nodes[i].children && editRecursive(nodes[i].children)) return true;
                    }
                    return false;
                };
                editRecursive(newData);
            }
            return newData;
        });
        setBomModal({ open: false, action: 'add', nodeId: null, parentId: null });
        showToast(targetStatus === '待审批' ? '产品BOM已成功提交审批！' : 'BOM 模型节点属性已保存成功！', 'success');
    };

    const handleDeleteNode = (id) => {
        setBomData(prev => {
            let newData = [...prev];
            const isRoot = newData.findIndex(b => b.id === id);
            if (isRoot > -1) {
                newData.splice(isRoot, 1);
                if (activeBomId === id) setActiveBomId(newData[0]?.id);
            } else {
                const deleteRecursive = (nodes) => {
                    const idx = nodes.findIndex(n => n.id === id);
                    if (idx > -1) { nodes.splice(idx, 1); return true; }
                    for (let n of nodes) { if (n.children && deleteRecursive(n.children)) return true; }
                    return false;
                };
                deleteRecursive(newData);
            }
            return newData;
        });
        showToast('节点已被移除', 'success');
    };

    const changeStatus = (id, status) => {
        if (formalCtx && status === '已生效') {
            showToast('请在上方生效版本中确认物料及工艺后发布', 'warning');
            return;
        }
        setBomData(prev => prev.map(b => b.id === id ? { ...b, status } : b));
        showToast(`状态已更新为: ${status}`, 'success');
    };

    return (
        <div className="flex flex-col gap-5 h-full relative animate-in fade-in duration-300">
            {formalCtx && <FormalBomPanel context={formalCtx} />}
            <div className="flex flex-1 gap-5 overflow-hidden min-h-[500px]">
                <div className="w-80 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col shrink-0 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h4 className="font-bold text-[14px] text-slate-800 flex items-center gap-2"><List size={16} className="text-blue-600" /> 生产物料清单</h4>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setImportOpen(true)} className="bg-white border border-slate-200 text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors shadow-sm" title="从Excel/CSV导入"><Import size={16}/></button>
                            <button onClick={handleCreateDraft} className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm" title="新建产品BOM"><Plus size={16}/></button>
                        </div>
                    </div>
                    <div className="px-4 py-3 border-b border-slate-50 bg-white shrink-0">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={searchKw} onChange={e=>setSearchKw(e.target.value)} type="text" placeholder="搜索产品编码或名称..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                        </div>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto custom-scrollbar space-y-1 bg-[#fafcff]/30">
                        {bomData.filter(b => (`${b.id} ${b.name}`).toLowerCase().includes(searchKw.toLowerCase())).map(b => {
                            const colors = { '草稿': 'bg-slate-100 text-slate-600 border-slate-200', '待审批': 'bg-amber-50 text-amber-600 border-amber-200', '已生效': 'bg-emerald-50 text-emerald-600 border-emerald-200', '已作废': 'bg-rose-50 text-rose-600 border-rose-200', '已归档': 'bg-slate-100 text-slate-500 border-slate-200' };
                            const bg = b.id === activeBomId ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-transparent hover:bg-slate-50';
                            return (
                                <div key={b.id} onClick={() => setActiveBomId(b.id)} className={`p-3 rounded-xl cursor-pointer border transition-colors flex flex-col gap-1.5 ${bg}`}>
                                    <div className="font-bold text-[13px] text-slate-800 truncate" title={b.name}>{b.name}</div>
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-[11px] text-slate-500 font-mono">ID: {b.id}</span>
                                        <div className="flex gap-1.5">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.type==='成品'?'bg-blue-100 text-blue-700':b.type==='半成品'?'bg-purple-100 text-purple-700':'bg-amber-100 text-amber-700'}`}>{b.type}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[b.status]}`}>{b.status}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col relative">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <h4 className="font-bold text-[14px] text-slate-800 flex items-center gap-2"><GitCommit size={16} className="text-blue-600" /> {activeBom ? activeBom.id + ' 结构层级' : 'BOM 结构树'}</h4>
                            {activeBom && <span className={`px-2 py-0.5 text-[11px] rounded font-bold border ${activeBom.status==='草稿'?'bg-slate-100 text-slate-600':activeBom.status==='待审批'?'bg-amber-50 text-amber-600':activeBom.status==='已生效'?'bg-emerald-50 text-emerald-600':'bg-rose-50 text-rose-600'}`}>{activeBom.status}</span>}
                        </div>
                        <div className="flex gap-2">
                            {activeBom?.status === '草稿' && <>
                                <button onClick={() => changeStatus(activeBom.id, '待审批')} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-blue-100 border border-blue-100 transition-colors">提交审批</button>
                                <button onClick={() => handleDeleteNode(activeBom.id)} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-rose-100 border border-rose-100 transition-colors">删除BOM</button>
                            </>}
                            {activeBom?.status === '待审批' && <button onClick={() => changeStatus(activeBom.id, '已生效')} className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-emerald-100 border border-emerald-100 transition-colors">审核通过(生效)</button>}
                            {activeBom?.status === '已生效' && <>
                                <button onClick={() => changeStatus(activeBom.id, '已作废')} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-rose-100 border border-rose-100 transition-colors">作废</button>
                                <button onClick={() => changeStatus(activeBom.id, '已归档')} className="bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-slate-100 border border-slate-200 transition-colors">归档</button>
                            </>}
                        </div>
                    </div>
                    <div className="p-8 overflow-y-auto flex-1 custom-scrollbar bg-[#fafcff]/50 flex justify-center items-start">
                        {activeBom ? <BomNode node={activeBom} isRoot={true} isEditable={isEditable} onAdd={(parentId) => setBomModal({open: true, action: 'add', nodeId: null, parentId})} onEdit={(nodeId) => setBomModal({open: true, action: 'edit', nodeId, parentId: null})} onDelete={handleDeleteNode} /> : <div className="text-slate-400 text-[13px] mt-10 flex flex-col items-center gap-2"><Inbox size={32} className="text-slate-300" /> 请从左侧选择或新建一个产品 BOM</div>}
                    </div>
                </div>
            </div>
            {importOpen && <Prod_ImportBomModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
            {bomModal.open && <Prod_BomModal action={bomModal.action} activeNode={bomModal.action==='edit'?(() => { for(let b of bomData) { let n=findBomNode(b, bomModal.nodeId); if(n) return n; } return null; })() : null} onClose={() => setBomModal({open: false, action: 'add', nodeId: null, parentId: null})} onSave={handleSaveBomNode} />}
        </div>
    );
};

const Prod_RouteHeaderModal = ({ action, activeRoute, onClose, onSave }) => {
    const [id, setId] = useState(activeRoute?.id || '');
    const [name, setName] = useState(activeRoute?.name || '');
    const [targetItem, setTargetItem] = useState(activeRoute?.targetItem || '');

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[450px] overflow-hidden flex flex-col transform">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-[15px]">{action === 'add' ? '新增工艺路线' : '编辑工艺路线'}</h3>
                    <button onClick={onClose}><X size={16} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">工艺路线 ID *</label><input value={id} onChange={e=>setId(e.target.value)} disabled={action==='edit'} type="text" placeholder="例: RT-003" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono disabled:bg-slate-50" /></div>
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">适用目标物料 *</label><input value={targetItem} onChange={e=>setTargetItem(e.target.value)} type="text" placeholder="例: FG001" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 font-mono" /></div>
                    </div>
                    <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">工艺路线名称 *</label><input value={name} onChange={e=>setName(e.target.value)} type="text" placeholder="输入路线名称..." className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500" /></div>
                </div>
                <div className="p-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2 text-[13px] border border-slate-200 rounded-xl bg-white hover:bg-slate-50">取消</button>
                    <button onClick={() => onSave({id, name, targetItem})} className="px-5 py-2 text-[13px] bg-blue-600 text-white rounded-xl hover:bg-blue-700">确认保存</button>
                </div>
            </div>
        </div>
    );
};

const Prod_RouteOpModal = ({ action, activeOp, equipments, onClose, onSave }) => {
    const [id, setId] = useState(activeOp?.id || '');
    const [name, setName] = useState(activeOp?.name || '');
    const [type, setType] = useState(activeOp?.type || '内部');
    const [center, setCenter] = useState(activeOp?.center || (equipments[0]?.name || ''));
    const [setupTime, setSetupTime] = useState(activeOp?.setupTime || '0.2');
    const [runTime, setRunTime] = useState(activeOp?.runTime || '1.0');
    const [timeUnit, setTimeUnit] = useState(activeOp?.timeUnit || '小时');

    const suppliersList = ['东莞协创五金代工厂', '顺络电子表面处理', '立讯精密(组装外协)'];

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm transition-opacity animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-[450px] overflow-hidden flex flex-col transform">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-[15px]">{action === 'add' ? '新增加工工序' : '编辑加工工序'}</h3>
                    <button onClick={onClose}><X size={16} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">工序编码 OP *</label><input value={id} onChange={e=>setId(e.target.value)} disabled={action==='edit'} type="number" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 disabled:bg-slate-50" /></div>
                        <div><label className="block text-[12px] font-bold text-slate-500 mb-1.5">工序名称 *</label><input value={name} onChange={e=>setName(e.target.value)} type="text" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">执行类型</label>
                            <select value={type} onChange={e=>{setType(e.target.value); setCenter(e.target.value==='内部'?(equipments[0]?.name||''):suppliersList[0]);}} className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
                                <option value="内部">内部机台加工 (Internal)</option><option value="委外">外协供应商 (Subcontracting)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">{type==='内部'?'车间工作中心':'外发供应商'}</label>
                            <select value={center} onChange={e=>setCenter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 bg-white">
                                {type==='内部' ? equipments.map(eq=><option key={eq.id} value={eq.name}>{eq.name}</option>) : suppliersList.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="flex justify-between items-center text-[12px] font-bold text-slate-500 mb-1.5">
                            <span>标准定额工时 *</span>
                            <select value={timeUnit} onChange={e=>setTimeUnit(e.target.value)} className="border-b border-slate-300 text-blue-600 font-bold text-[11px] focus:outline-none bg-transparent">
                                <option>小时</option><option>分钟</option><option>秒</option>
                            </select>
                        </label>
                        <div className="flex gap-4">
                            <div className="flex-1 relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">准备(Setup)</span>
                                <input value={setupTime} onChange={e=>setSetupTime(e.target.value)} type="number" step="0.1" className="w-full border rounded-lg pl-16 pr-3 py-2 text-[13px] focus:border-blue-500 font-mono bg-slate-50" />
                            </div>
                            <div className="flex-1 relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">加工(Run)</span>
                                <input value={runTime} onChange={e=>setRunTime(e.target.value)} type="number" step="0.1" className="w-full border rounded-lg pl-14 pr-3 py-2 text-[13px] focus:border-blue-500 font-mono bg-slate-50" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2 text-[13px] border border-slate-200 rounded-xl bg-white hover:bg-slate-50">取消</button>
                    <button onClick={() => onSave({id, name, type, center, setupTime, runTime, timeUnit})} className="px-5 py-2 text-[13px] bg-blue-600 text-white rounded-xl hover:bg-blue-700">确认保存</button>
                </div>
            </div>
        </div>
    );
};

const Prod_RoutingView = ({ routingData, setRoutingData, equipments, showToast }) => {
    const [activeRouteId, setActiveRouteId] = useState(routingData[0]?.id);
    const [searchKw, setSearchKw] = useState('');
    const [headerModal, setHeaderModal] = useState({ open: false, action: 'add', id: null });
    const [opModal, setOpModal] = useState({ open: false, action: 'add', id: null });

    const activeRoute = routingData.find(r => r.id === activeRouteId);

    const handleSaveHeader = (data) => {
        if (!data.id || !data.name || !data.targetItem) return;
        setRoutingData(prev => {
            if (headerModal.action === 'add') {
                setActiveRouteId(data.id);
                return [{ ...data, operations: [] }, ...prev];
            } else {
                return prev.map(r => r.id === headerModal.id ? { ...r, ...data } : r);
            }
        });
        setHeaderModal({ open: false, action: 'add', id: null });
        showToast('工艺路线基础信息保存成功！', 'success');
    };

    const handleDeleteHeader = (id) => {
        setRoutingData(prev => {
            const newData = prev.filter(r => r.id !== id);
            if (activeRouteId === id) setActiveRouteId(newData[0]?.id);
            return newData;
        });
        showToast('工艺路线已删除', 'success');
    };

    const handleSaveOp = (data) => {
        if (!data.id || !data.name) return;
        setRoutingData(prev => prev.map(r => {
            if (r.id === activeRouteId) {
                if (opModal.action === 'add') return { ...r, operations: [...r.operations, data] };
                else return { ...r, operations: r.operations.map(op => op.id === opModal.id ? { ...op, ...data } : op) };
            }
            return r;
        }));
        setOpModal({ open: false, action: 'add', id: null });
        showToast('工序步骤保存成功！', 'success');
    };

    const handleDeleteOp = (id) => {
        setRoutingData(prev => prev.map(r => r.id === activeRouteId ? { ...r, operations: r.operations.filter(op => op.id !== id) } : r));
        showToast('工艺节点已从路线中移除', 'success');
    };

    return (
        <div className="flex flex-col gap-5 h-full relative animate-in fade-in duration-300">
            <div className="flex flex-1 gap-5 overflow-hidden min-h-[500px]">
                <div className="w-80 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col shrink-0 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h4 className="font-bold text-[14px] text-slate-800 flex items-center gap-2"><List size={16} className="text-blue-600" /> 工艺路线库</h4>
                        <button onClick={() => setHeaderModal({ open: true, action: 'add', id: null })} className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm" title="新建工艺路线"><Plus size={16}/></button>
                    </div>
                    <div className="px-4 py-3 border-b border-slate-50 bg-white shrink-0">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={searchKw} onChange={e=>setSearchKw(e.target.value)} type="text" placeholder="搜索工艺编码或名称..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                        </div>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto custom-scrollbar space-y-1 bg-[#fafcff]/30">
                        {routingData.filter(r => (`${r.id} ${r.name}`).toLowerCase().includes(searchKw.toLowerCase())).map(r => (
                            <div key={r.id} onClick={() => setActiveRouteId(r.id)} className={`p-3 rounded-xl cursor-pointer border transition-colors flex flex-col gap-1.5 group ${r.id === activeRouteId ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="font-bold text-[13px] text-slate-800 truncate pr-2" title={r.name}>{r.name}</div>
                                    <div className="hidden group-hover:flex items-center gap-1 bg-white/90 rounded shadow-sm border border-slate-100 shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); setHeaderModal({ open: true, action: 'edit', id: r.id }); }} className="p-1 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={12}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteHeader(r.id); }} className="p-1 text-slate-400 hover:text-rose-500 transition-colors"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-[11px] text-slate-500 font-mono">ID: {r.id}</span>
                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 truncate max-w-[100px]" title={`适用物料: ${r.targetItem}`}>{r.targetItem}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col relative">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
                        <h4 className="font-bold text-[14px] text-slate-800 flex items-center gap-2"><Workflow size={16} className="text-blue-600" /> {activeRoute ? activeRoute.id + ' 流转时间轴' : '工位流转时间轴'}</h4>
                        {activeRoute && <button onClick={() => setOpModal({ open: true, action: 'add', id: null })} className="text-white bg-blue-600 text-[13px] font-bold flex items-center gap-1.5 hover:bg-blue-700 px-4 py-2 rounded-xl transition-all shadow-sm"><Plus size={16}/> 新增加工工序</button>}
                    </div>
                    <div className="p-8 flex-1 overflow-y-auto custom-scrollbar relative">
                        <div className={activeRoute?.operations.length > 0 ? 'space-y-0 relative before:absolute before:inset-0 before:mx-auto before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent max-w-4xl mx-auto' : 'flex justify-center h-full'}>
                            {activeRoute?.operations.length > 0 ? <RoutingTimeline operations={activeRoute.operations} isEditable={true} onEdit={(id) => setOpModal({ open: true, action: 'edit', id })} onDelete={handleDeleteOp} /> : <div className="text-slate-400 text-[13px] mt-10 flex flex-col items-center gap-2"><Inbox size={32} className="text-slate-300" /> {activeRoute ? '当前工艺路线暂无工序节点，请添加' : '请从左侧选择或新建一个工艺路线'}</div>}
                        </div>
                    </div>
                </div>
            </div>
            {headerModal.open && <Prod_RouteHeaderModal action={headerModal.action} activeRoute={routingData.find(r => r.id === headerModal.id)} onClose={() => setHeaderModal({ open: false, action: 'add', id: null })} onSave={handleSaveHeader} />}
            {opModal.open && <Prod_RouteOpModal action={opModal.action} activeOp={activeRoute?.operations.find(o => o.id === opModal.id)} equipments={equipments} onClose={() => setOpModal({ open: false, action: 'add', id: null })} onSave={handleSaveOp} />}
        </div>
    );
};

const LegacyProductionManagement = ({ businessFlow, onBusinessFlowAction, onNavigateModule, currentUser, currentTenant }) => {
  const productionLines = loadPlatformProductionLines(currentTenant?.id);
  const legacyTabs = ['dashboard', 'mps', 'mrp', 'aps', 'orders', 'execution', 'qc_cost', 'bom', 'routing', 'equipment'];
  const focusedMpsId = new URLSearchParams(window.location.search).get('focusMps');
  const legacyStorageKey = `industrial-ai-production-legacy:${currentTenant?.id || 'TENANT-SHWS'}`;
  const savedProduction = useMemo(() => {
      try {
          const raw = window.sessionStorage.getItem(legacyStorageKey);
          return raw ? JSON.parse(raw) : null;
      } catch {
          return null;
      }
  }, [legacyStorageKey]);
  const [activeTab, setActiveTab] = useState(() => {
      const requested = new URLSearchParams(window.location.search).get('production');
      if (requested === 'plan') return 'mps';
      return legacyTabs.includes(requested) ? requested : 'dashboard';
  });
  
  // 状态管理中心
  const [mps, setMps] = useState(currentUser?.accessToken ? (savedProduction?.mps || []).filter(item => item.formalMps) : savedProduction?.mps || initial_mpsData);
  const [productionDemands, setProductionDemands] = useState(currentUser?.accessToken ? [] : savedProduction?.productionDemands?.length ? savedProduction.productionDemands : initial_productionDemandData);
  const [mrp, setMrp] = useState(() => (currentUser?.accessToken ? (savedProduction?.mrp || []).filter(row => row.mrpTaskId) : savedProduction?.mrp || initial_mrpResults).map(row => ({ ...row, pegging: (row.pegging || []).map((item, index) => ({ ...item, icon: item.icon || [Target, Warehouse, Truck, Calculator, AlertTriangle][index % 5] })) })));
  const [orders, setOrders] = useState(currentUser?.accessToken ? [] : savedProduction?.orders || initial_orderData);
  const [jobs, setJobs] = useState(currentUser?.accessToken ? [] : savedProduction?.jobs || initial_operationJobs);
  const [qc, setQc] = useState(currentUser?.accessToken ? [] : savedProduction?.qc || initial_qualityQueue);
  const [equipments, setEquipments] = useState(savedProduction?.equipments || initial_equipmentData);
  const [bomData, setBomData] = useState(savedProduction?.bomData || prod_bomListData);
  const [routingData, setRoutingData] = useState(savedProduction?.routingData || prod_routingListData);

  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  const [actionModal, setActionModal] = useState(null);

  useEffect(() => {
      const materialIssues = loadProductionMaterialIssueTasks(window.sessionStorage, currentTenant?.id);
      if (!materialIssues.length) return;
      setJobs((previous) => previous.map((job) => {
          const task = materialIssues.find((item) => item.jobId === job.id);
          if (!task) return job;
          return { ...job, materialIssueTaskId: task.id, status: task.status === '已出库' ? '未开工' : '领料处理中' };
      }));
  }, [currentTenant?.id]);
  
  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 3000);
  };

  const formalCtx = useMemo(() => currentUser?.accessToken ? ({ tenantId: currentTenant?.id || 'TENANT-SHWS', accessToken: currentUser.accessToken }) : null, [currentTenant?.id, currentUser?.accessToken]);
  const { snapshot: formalSnapshot, refresh: refreshFormalProduction, error: formalError } = useFormalProduction(formalCtx);
  const [reportOrder, setReportOrder] = useState(null);

  const mapFormalWorkOrder = (wo) => {
    return formalProductionOrder(wo);
  };

  const mapFormalInspection = (insp) => {
    return formalProductionInspection(insp, formalSnapshot?.orders, formalSnapshot?.completions);
  };

  const mapFormalDemandRow = (demand) => {
      const trace = normalizeProductionDemandTrace(demand);
      const sourceSalesOrder = trace?.salesOrderId || '';
      const sourceOrderLine = trace?.salesOrderLineId || '';
      const sourceShipment = trace?.shipmentRequestId || '';
      const sourceFactVersion = trace?.inventoryFactVersion;
      const sourceTraceId = trace?.traceId || '';
      const sourceLabel = demand.sourceType === 'SALES_ORDER_SHORTAGE'
        ? (sourceSalesOrder ? `销售订单 ${sourceSalesOrder.slice(0, 8)}` : '销售订单 / 生产服务')
        : (demand.sourceDescription || '常规生产计划');
      return {
      id: demand.code,
      apiId: demand.id,
      apiStatus: demand.status,
      formalDemand: demand,
      type: demand.sourceType === 'SALES_ORDER_SHORTAGE' ? '销售缺货' : '预测补货',
      source: sourceLabel,
      sourceTrace: trace || null,
      sourceSalesOrder,
      sourceOrderLine,
      sourceShipment,
      sourceFactVersion,
      sourceTraceId,
      customer: '业务来源',
      product: `${demand.productId} - ${demand.productName || demand.productId}`,
      shortage: Number(demand.qty),
      requiredDate: demand.dueDate,
      priority: '紧急',
      status: mapProductionDemandStatus(demand),
      owner: demand.acceptedAt ? `${demand.handlerRole || '生产计划员'} · ${demand.handlerId || demand.createdBy}` : demand.createdBy || '生产服务',
      reason: `需求版本 v${demand.version} · ${demand.correlationId}`,
      };
  };

  useEffect(() => {
      let cancelled = false;
      listProductionDemands({
          tenantId: currentTenant?.id || 'TENANT-SHWS',
          accessToken: currentUser?.accessToken || '',
      }).then(async (result) => {
          if (cancelled) return;
          setProductionDemands(result.items.map(mapFormalDemandRow));
          const planned = result.items.filter((item) => item.status === 'PLANNED' && item.mrpTaskId);
          const tasks = await Promise.allSettled(planned.map((item) => productionOperationsApi.getTask({
              tenantId: currentTenant?.id || 'TENANT-SHWS',
              accessToken: currentUser?.accessToken || '',
          }, item.mrpTaskId)));
          const recovered = planned.flatMap((demand, index) => {
              if (tasks[index].status !== 'fulfilled') return [];
              const row = recoverMpsFromPlannedDemand(demand, tasks[index].value);
              return row ? [{ row, demand, task: tasks[index].value }] : [];
          });
          const recoveredRows = recovered.map(item => item.row);
          if (recoveredRows.length) {
              setMps(prev => [
                  ...recoveredRows,
                  ...prev.filter(item => !recoveredRows.some(row => row.demandId === item.demandId)),
              ]);
              const shortageRows = recovered.flatMap(({ row, task, demand }) => (planningMaterialShortages(task.result).filter(shortage => shortage.demandId === demand.id).map((shortage) => ({
                  id: `MRP-${task.id.slice(0, 8)}-${demand.id}-${shortage.materialId}`,
                  mrpTaskId: task.id,
                  demandId: shortage.demandId,
                  source: row.id,
                  itemCode: shortage.materialId,
                  itemName: shortage.materialName || shortage.materialId,
                  type: '采购件',
                  grossReq: Number(shortage.grossRequiredQty),
                  stock: Number(shortage.availableQty),
                  onWay: 0,
                  netReq: Number(shortage.shortageQty),
                  plannedQty: Number(shortage.shortageQty),
                  lotRule: '按需(L4L)',
                  status: '待转采购',
                  pegging: [],
              }))));
              if (shortageRows.length) {
                  setMrp(prev => [...shortageRows, ...prev.filter(item => !shortageRows.some(row => row.mrpTaskId === item.mrpTaskId && row.itemCode === item.itemCode))]);
              }
              onBusinessFlowAction?.('formalMrpCompleted', {
                  mrpTaskId: recovered[0].task.id,
                  demandId: recovered[0].demand.id,
                  productionDemandCode: recovered[0].demand.code,
                  materialShortages: planningMaterialShortages(recovered[0].task.result),
              });
          }
      }).catch((error) => {
          if (!cancelled) showToast(error instanceof Error ? `生产需求同步失败：${error.message}` : '生产需求同步失败', 'error');
      });
      return () => { cancelled = true; };
  }, [currentTenant?.id, currentUser?.account, currentUser?.accessToken]);

  useEffect(() => {
      if (!formalSnapshot) return;
      setOrders(formalSnapshot.orders.map(formalProductionOrder));
      setJobs(formalSnapshot.orders.filter(order => ['RELEASED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CLOSING', 'CLOSED'].includes(order.status)).map(formalProductionJob));
      setQc(formalSnapshot.inspections.map(inspection => formalProductionInspection(inspection, formalSnapshot.orders, formalSnapshot.completions)));
  }, [formalSnapshot]);

  useEffect(() => {
      if (formalError) showToast(`生产同步失败：${formalError}`, 'error');
  }, [formalError]);

  useEffect(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('production', activeTab);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [activeTab]);

  useEffect(() => {
      const snapshot = { mps, productionDemands, mrp, orders, jobs, qc, equipments, bomData, routingData };
      window.sessionStorage.setItem(legacyStorageKey, JSON.stringify(snapshot));
  }, [legacyStorageKey, mps, productionDemands, mrp, orders, jobs, qc, equipments, bomData, routingData]);

  useEffect(() => {
      if (!businessFlow || currentUser?.accessToken) return;
      if (isLinkedFlowAtLeast(businessFlow, 'productionDemand')) {
          const linkedDemand = {
              id: businessFlow.productionDemandCode || businessFlow.productionDemandId || 'PD-LINK-001',
              apiId: businessFlow.productionDemandId,
              type: '销售缺货',
              source: `销售订单 ${businessFlow.orderId}`,
              customer: businessFlow.customer || '销售客户',
              product: businessFlow.product,
              shortage: businessFlow.shortage || businessFlow.qty,
              requiredDate: '2026-06-28',
              priority: '紧急',
              status: isLinkedFlowAtLeast(businessFlow, 'mpsMrp') ? '已生成MPS' : '待生成MPS',
              owner: '生产服务',
              reason: `销售订单库存不足，库存事实 v${businessFlow.inventoryFactVersion || '-'}，生产需求已持久化`
          };
          setProductionDemands(prev => prev.some(item => item.id === linkedDemand.id || item.apiId === linkedDemand.apiId) ? prev.map(item => item.id === linkedDemand.id || item.apiId === linkedDemand.apiId ? { ...item, ...linkedDemand } : item) : [linkedDemand, ...prev]);
      }
      if (isLinkedFlowAtLeast(businessFlow, 'mpsMrp')) {
          const linkedMps = {
              id: 'MPS-LINK-001',
              demandSource: '销售缺货',
              source: `销售订单 (${businessFlow.orderId})`,
              product: businessFlow.product,
              quantity: businessFlow.shortage || businessFlow.qty,
              date: '2026-06-28',
              status: isLinkedFlowAtLeast(businessFlow, 'purchaseRequest') ? '已展算' : '待展算',
              priority: '销售联动',
              sourceSalesOrder: businessFlow.orderId,
              sourceFactVersion: businessFlow.inventoryFactVersion,
              sourceCustomer: businessFlow.customer,
          };
          setMps(prev => prev.some(item => item.id === linkedMps.id) ? prev.map(item => item.id === linkedMps.id ? linkedMps : item) : [linkedMps, ...prev]);
          setMrp(prev => prev.some(item => item.id === 'MRP-LINK-001') ? prev.map(item => item.id === 'MRP-LINK-001' ? { ...item, status: isLinkedFlowAtLeast(businessFlow, 'purchaseRequest') ? '已转采购' : '待下达' } : item) : [{
              id: 'MRP-LINK-001',
              source: linkedMps.id,
              itemCode: 'RM201',
              itemName: 'AI算力芯片',
              type: '采购件',
              grossReq: businessFlow.qty * 2,
              stock: 50,
              onWay: 0,
              netReq: businessFlow.qty * 2 - 50,
              plannedQty: 200,
              lotRule: '按需(L4L)',
              status: isLinkedFlowAtLeast(businessFlow, 'purchaseRequest') ? '已转采购' : '待下达',
              pegging: []
          }, ...prev]);
      }
      if (isLinkedFlowAtLeast(businessFlow, 'production')) {
          const linkedOrder = {
              id: 'WO-LINK-001',
              source: `MRP-LINK-001 / ${businessFlow.orderId}`,
              product: businessFlow.product,
              quantity: businessFlow.qty,
              startDate: '2026-06-24',
              endDate: '2026-06-28',
              status: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '已完工' : '执行中',
              kitting: '100%'
          };
          setOrders(prev => prev.some(item => item.id === linkedOrder.id) ? prev.map(item => item.id === linkedOrder.id ? linkedOrder : item) : [linkedOrder, ...prev]);
          setQc(prev => prev.some(item => item.id === 'QC-LINK-001') ? prev.map(item => item.id === 'QC-LINK-001' ? { ...item, status: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '已结案' : '待检验', okQty: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? businessFlow.qty : 0, result: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '全良品' : null } : item) : [{
              id: 'QC-LINK-001',
              orderId: linkedOrder.id,
              product: businessFlow.product,
              type: 'FQC(完工检)',
              sampleQty: businessFlow.qty,
              status: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '已结案' : '待检验',
              okQty: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? businessFlow.qty : 0,
              ngQty: 0,
              result: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '全良品' : null
          }, ...prev]);
      }
  }, [businessFlow?.currentStep]);

  // --- 生产需求池交互 ---
  const handleValidateDemand = async (demandId) => {
      const targetDemand = productionDemands.find(item => item.id === demandId);
      if (!targetDemand?.formalDemand) return;
      try {
          const updated = await productionOperationsApi.validateDemand({
              tenantId: currentTenant?.id || 'TENANT-SHWS',
              accessToken: currentUser?.accessToken || '',
          }, targetDemand.formalDemand);
          setProductionDemands(prev => prev.map(item => item.id === demandId ? mapFormalDemandRow(updated) : item));
          showToast(updated.status === 'PENDING_REVIEW'
              ? `生产需求 [${demandId}] 校验通过，等待审批`
              : `生产需求 [${demandId}] 校验阻断：${updated.blockReasons?.join('；') || '请检查生产主数据'}`,
              updated.status === 'PENDING_REVIEW' ? 'success' : 'error');
      } catch (error) {
          showToast(error instanceof Error ? `需求校验失败：${error.message}` : '需求校验失败', 'error');
      }
  };

  const handleApproveDemand = async (demandId) => {
      const targetDemand = productionDemands.find(item => item.id === demandId);
      if (!targetDemand?.formalDemand) return;
      try {
          const updated = await productionOperationsApi.approveDemand({
              tenantId: currentTenant?.id || 'TENANT-SHWS',
              accessToken: currentUser?.accessToken || '',
          }, targetDemand.formalDemand);
          setProductionDemands(prev => prev.map(item => item.id === demandId ? mapFormalDemandRow(updated) : item));
          showToast(`生产需求 [${demandId}] 已审批，等待计划员接收`, 'success');
      } catch (error) {
          showToast(error instanceof Error ? `需求审批失败：${error.message}` : '需求审批失败', 'error');
      }
  };

  const handleClaimDemand = async (demandId) => {
      const targetDemand = productionDemands.find(item => item.id === demandId);
      if (!targetDemand?.formalDemand) return;
      try {
          const updated = await productionOperationsApi.claimDemand({
              tenantId: currentTenant?.id || 'TENANT-SHWS',
              accessToken: currentUser?.accessToken || '',
          }, targetDemand.formalDemand);
          setProductionDemands(prev => prev.map(item => item.id === demandId ? mapFormalDemandRow(updated) : item));
          showToast(`生产需求 [${demandId}] 已接收，可推送 MRP`, 'success');
      } catch (error) {
          showToast(error instanceof Error ? `需求接收失败：${error.message}` : '需求接收失败', 'error');
      }
  };

  const handleCreateMpsFromDemand = async (demandId) => {
      const targetDemand = productionDemands.find(item => item.id === demandId);
      if (!targetDemand) return;
      if (!targetDemand.formalDemand || !targetDemand.apiId || !['APPROVED', 'PLANNED'].includes(targetDemand.apiStatus) || !targetDemand.formalDemand.acceptedAt) {
          showToast('需求必须先保存、审批并接收，才能展算', 'warning');
          return;
      }
      const formalMpsId = `MPS-${targetDemand.apiId.slice(0, 8)}`;
      const pendingMps = {
          id: formalMpsId,
          demandSource: targetDemand.type === '销售缺货' ? '销售缺货' : targetDemand.type === '客户加急' ? '订单加急' : '普通生产',
          source: `${targetDemand.type} (${targetDemand.source})`,
          product: targetDemand.product,
          quantity: targetDemand.shortage,
          date: targetDemand.requiredDate,
          status: '已推展算',
          priority: targetDemand.priority,
          sourceSalesOrder: targetDemand.sourceSalesOrder,
          sourceFactVersion: targetDemand.sourceFactVersion,
          sourceCustomer: targetDemand.customer,
          demandId: targetDemand.apiId,
      };
      setMps(prev => [pendingMps, ...prev.filter(item => item.demandId !== targetDemand.apiId)]);
      try {
          const result = await productionOperationsApi.startPlanningTask({
              tenantId: currentTenant?.id || 'TENANT-SHWS',
              accessToken: currentUser?.accessToken || '',
          }, 'MRP', [targetDemand.apiId], `${targetDemand.apiId}:${targetDemand.formalDemand?.version || 1}`);
          const mpsLine = result.result?.mpsLines?.find((line) => line.demandId === targetDemand.apiId);
          if (result.status !== 'SUCCEEDED' || !mpsLine || !planningResultCoversDemand(result.result, targetDemand.apiId)) {
              throw new Error('计划任务未返回覆盖当前需求的 MPS 结果');
          }
          const nextMps = {
              id: formalMpsId,
              taskId: result.taskId,
              demandSource: targetDemand.type === '销售缺货' ? '销售缺货' : targetDemand.type === '客户加急' ? '订单加急' : '普通生产',
              source: `${targetDemand.type} (${targetDemand.source})`,
              product: targetDemand.product,
              quantity: Number(mpsLine.plannedQty),
              date: mpsLine.dueDate,
              status: '已展算',
              formalMps: true,
              priority: targetDemand.priority,
              sourceSalesOrder: targetDemand.sourceSalesOrder,
              sourceFactVersion: targetDemand.sourceFactVersion,
              sourceCustomer: targetDemand.customer,
              demandId: targetDemand.apiId,
          };
          setMps(prev => [nextMps, ...prev.filter(item => item.demandId !== targetDemand.apiId)]);
          const shortages = result.result?.materialShortages || [];
          if (shortages.length) {
              const rows = shortages.map((shortage) => ({
                  id: `MRP-${result.taskId.slice(0, 8)}-${shortage.materialId}`,
                  mrpTaskId: result.taskId,
                  demandId: shortage.demandId,
                  source: nextMps.id,
                  itemCode: shortage.materialId,
                  itemName: shortage.materialName || shortage.materialId,
                  type: '采购件',
                  grossReq: Number(shortage.grossRequiredQty),
                  stock: Number(shortage.availableQty),
                  onWay: 0,
                  netReq: Number(shortage.shortageQty),
                  plannedQty: Number(shortage.shortageQty),
                  lotRule: '按需(L4L)',
                  status: '待转采购',
                  pegging: [],
              }));
              setMrp(prev => [...rows, ...prev.filter(item => item.mrpTaskId !== result.taskId)]);
              setActiveTab('mrp');
          }
          setProductionDemands(prev => prev.map(item => item.id === demandId ? {
              ...item,
              apiStatus: 'PLANNED',
              status: '已展算',
              reason: `计划任务 ${result.taskId} · ${result.result?.solver || 'Reference MRP'}`,
              formalDemand: { ...item.formalDemand, status: 'PLANNED', version: item.formalDemand.version + 1 },
          } : item));
          onBusinessFlowAction?.('formalMrpCompleted', { mrpTaskId: result.taskId, demandId: targetDemand.apiId, materialShortages: shortages });
          showToast(shortages.length ? `MPS/MRP 任务 [${result.taskId}] 已完成，发现 ${shortages.length} 项采购缺料` : `MPS/MRP 任务 [${result.taskId}] 已完成且物料齐套`, shortages.length ? 'warning' : 'success');
      } catch (error) {
          setMps(prev => prev.map(item => item.demandId === targetDemand.apiId ? { ...item, status: '展算失败', reason: error instanceof Error ? error.message : 'MRP 计算失败' } : item));
          showToast(error instanceof Error ? `MPS/MRP 计算失败：${error.message}` : 'MPS/MRP 计算失败', 'error');
      }
  };

  const handleRunApsFromMps = async (mpsId) => {
      const targetMps = mps.find(item => item.id === mpsId);
      const targetDemand = productionDemands.find(item => item.apiId === targetMps?.demandId);
      if (!targetMps?.formalMps || targetMps.status !== '已展算' || targetDemand?.apiStatus !== 'PLANNED') {
          showToast('只有 MRP 成功且结果覆盖需求的生产主计划才能运行 APS', 'warning');
          return;
      }
      if (!formalCtx) {
          showToast('请先登录正式会话后再运行 APS', 'warning');
          return;
      }
      setMps(prev => prev.map(item => item.id === mpsId ? { ...item, status: '已推排程' } : item));
      try {
          const result = await productionOperationsApi.startPlanningTask(formalCtx, 'APS', [targetMps.demandId], `${targetMps.demandId}:aps:${targetMps.taskId || 'mrp'}`);
          const candidate = result.result?.scheduleCandidates?.find(item => (item.demandIds || []).includes(targetMps.demandId));
          if (result.status !== 'SUCCEEDED' || !candidate || !scheduleResultCoversDemand(result.result, targetMps.demandId)) {
              throw new Error('排程任务未返回覆盖当前需求的正式候选');
          }
          setMps(prev => prev.map(item => item.id === mpsId ? {
              ...item,
              status: '已排程',
              scheduleCandidateId: candidate.id,
              plannedStart: candidate.startAt,
              plannedDue: candidate.dueDate,
              reason: `APS 任务 ${result.taskId}`,
          } : item));
          showToast(`APS 任务 [${result.taskId}] 已完成，可以创建正式工单`, 'success');
      } catch (error) {
          setMps(prev => prev.map(item => item.id === mpsId ? { ...item, status: '已展算', reason: error instanceof Error ? error.message : 'APS 排程失败' } : item));
          showToast(error instanceof Error ? `APS 排程失败：${error.message}` : 'APS 排程失败', 'error');
      }
  };

  const handleCreateFormalOrderFromMps = async (mpsId) => {
      const targetMps = mps.find(item => item.id === mpsId);
      const targetDemand = productionDemands.find(item => item.apiId === targetMps?.demandId);
      if (!targetMps?.scheduleCandidateId || targetMps.status !== '已排程' || targetDemand?.apiStatus !== 'PLANNED') {
          showToast('只有覆盖当前需求的成功 APS 候选才能创建工单', 'warning');
          return;
      }
      if (!formalCtx) {
          showToast('请先登录正式会话后再创建工单', 'warning');
          return;
      }
      const seed = `${currentTenant?.id || 'TENANT-SHWS'}:${targetMps.demandId}:${targetMps.scheduleCandidateId}`;
      setMps(prev => prev.map(item => item.id === mpsId ? { ...item, status: '创建工单中' } : item));
      try {
          const order = await productionOperationsApi.createWorkOrder(formalCtx, {
              productId: targetDemand.formalDemand.productId,
              productName: targetDemand.formalDemand.productName,
              factoryResourceId: targetDemand.formalDemand.factoryResourceId,
              workCenterResourceId: targetDemand.formalDemand.factoryResourceId === 'FAC-SZ-01' ? 'WC-SZ-ASSY-01' : 'WC-SH-ASSY-01',
              plannedQty: targetDemand.formalDemand.qty,
              inputQty: targetDemand.formalDemand.qty,
              uom: targetDemand.formalDemand.uom,
              dueDate: targetDemand.formalDemand.dueDate,
              scheduleCandidateId: targetMps.scheduleCandidateId,
              inventoryWarehouseId: targetDemand.formalDemand.inventoryWarehouseId || targetDemand.sourceTrace?.payloadSnapshot?.warehouseId || targetDemand.sourceTrace?.payloadSnapshot?.inventoryWarehouseId,
              correlationId: targetDemand.formalDemand.correlationId,
              demandLinks: [{
                  demandId: targetMps.demandId,
                  allocatedQty: targetDemand.formalDemand.qty,
                  promisedDate: targetDemand.formalDemand.dueDate,
              }],
          }, `work-order-create:${seed}`);
          const mapped = mapFormalWorkOrder(order);
          setOrders(prev => [mapped, ...prev.filter(item => item.apiId !== order.id)]);
          setMps(prev => prev.map(item => item.id === mpsId ? {
              ...item,
              status: '已建工单',
              workOrderId: order.id,
              workOrderCode: order.code,
          } : item));
          setActiveTab('orders');
          showToast(`正式工单 [${order.code}] 已创建并关联生产需求`, 'success');
      } catch (error) {
          setMps(prev => prev.map(item => item.id === mpsId ? { ...item, status: '已排程', reason: error instanceof Error ? error.message : '创建工单失败' } : item));
          showToast(error instanceof Error ? `创建正式工单失败：${error.message}` : '创建正式工单失败', 'error');
      }
  };

  const handleProductionFlowAction = async (action) => {
      if (action === 'runMrp') {
          const target = productionDemands.find(item => item.apiId === businessFlow?.productionDemandId) || productionDemands.find(item => item.apiStatus === 'APPROVED');
          if (!target || target.apiStatus !== 'APPROVED') {
              showToast('请先在 MPS 页面完成需求校验与审批，再执行 MPS/MRP', 'warning');
              setActiveTab('mps');
              return;
          }
          await handleCreateMpsFromDemand(target.id);
          return;
      }
      if (action === 'createPr') {
          const shortage = businessFlow?.materialShortages?.[0];
          if (!businessFlow?.mrpTaskId || !businessFlow?.mrpDemandId || !shortage?.materialId) {
              showToast('当前流程缺少正式 MRP 缺料结果，不能创建采购申请', 'error');
              return;
          }
          try {
              const request = await procurementApi.createRequest({ tenantId: currentTenant?.id || 'TENANT-SHWS', accessToken: currentUser?.accessToken || '' }, { mrpTaskId: businessFlow.mrpTaskId, demandId: businessFlow.mrpDemandId, materialId: shortage.materialId });
              setMrp(prev => prev.map(item => item.mrpTaskId === businessFlow.mrpTaskId && item.itemCode === shortage.materialId ? { ...item, status: '已转采购', purchaseRequestId: request.id } : item));
              onBusinessFlowAction?.('formalPrCreated', { purchaseRequest: request });
          } catch (error) {
              showToast(error instanceof Error ? `采购申请创建失败：${error.message}` : '采购申请创建失败', 'error');
          }
          return;
      }
      onBusinessFlowAction?.(action);
  };

  const handleMergeDemandToPlan = (demandId) => {
      showToast('请执行全局 MRP，按各需求分别保留来源并统一计算物料', 'warning');
  };

  const handleHoldDemand = (demandId) => {
      showToast('该需求仍保留服务端状态，暂缓审批尚未开放', 'warning');
  };

  const handleViewDemandSource = (demand) => {
      if (demand.sourceTrace) {
          const t = demand.sourceTrace;
          const lines = [
              `需求 ${demand.id}`,
              `来源类型：${t.sourceType}`,
              t.salesOrderId ? `销售订单：${t.salesOrderId}` : null,
              t.salesOrderLineId ? `订单行：${t.salesOrderLineId}` : null,
              t.shipmentRequestId ? `发货申请：${t.shipmentRequestId}` : null,
              t.inventoryFactVersion != null ? `库存事实版本：v${t.inventoryFactVersion}` : null,
              `Correlation：${t.correlationId}`,
              t.traceId ? `Trace：${t.traceId}` : null,
          ].filter(Boolean);
          showToast(lines.join('；'), 'warning');
      } else {
          showToast(`${demand.id} 来源：${demand.source}；原因：${demand.reason}`, 'warning');
      }
  };

  // --- MPS 交互 ---
  const handleConfirmMps = (mpsId) => {
      if (formalCtx) { handleCalcMrp(mpsId); return; }
      setMps(prev => prev.map(m => m.id === mpsId ? { ...m, status: "待展算" } : m));
      try {
          const prodStorageKey = `industrial-ai-production-legacy:${currentTenant?.id || "TENANT-SHWS"}`;
          const rawProd = window.sessionStorage.getItem(prodStorageKey);
          if (rawProd) {
              const prodData = JSON.parse(rawProd);
              if (Array.isArray(prodData.mps)) {
                  prodData.mps = prodData.mps.map(item => item.id === mpsId ? { ...item, status: "待展算" } : item);
                  window.sessionStorage.setItem(prodStorageKey, JSON.stringify(prodData));
              }
          }
      } catch (e) { /* ignore */ }
      showToast(`MPS计划 [${mpsId}] 已确认，可进行 MRP 展算`, "success");
  };
  const handleConfirmDemandToMps = (demandId) => {
      if (formalCtx) { void handleCreateMpsFromDemand(demandId); return; }
      const targetDemand = productionDemands.find(item => item.id === demandId);
      if (!targetDemand) return;
      const newMpsId = `MPS-${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
      const newMps = {
          id: newMpsId,
          demandSource: targetDemand.type === '销售缺货' ? '销售缺货' : targetDemand.type === '客户加急' ? '订单加急' : '普通生产',
          source: targetDemand.source,
          product: targetDemand.product,
          quantity: targetDemand.shortage,
          date: targetDemand.requiredDate,
          status: '待展算',
          priority: targetDemand.priority,
          sourceSalesOrder: targetDemand.sourceSalesOrder,
          sourceCustomer: targetDemand.customer,
          demandId: targetDemand.apiId || targetDemand.id,
      };
      setMps(prev => [newMps, ...prev]);
      setProductionDemands(prev => prev.map(item => item.id === demandId ? {
          ...item,
          apiId: item.apiId || item.id,
          apiStatus: 'PLANNED',
          status: '已生成MPS',
      } : item));
      try {
          const prodStorageKey = `industrial-ai-production-legacy:${currentTenant?.id || "TENANT-SHWS"}`;
          const rawProd = window.sessionStorage.getItem(prodStorageKey);
          const prodData = rawProd ? JSON.parse(rawProd) : {};
          if (!Array.isArray(prodData.mps)) prodData.mps = [];
          prodData.mps.unshift(newMps);
          if (!Array.isArray(prodData.productionDemands)) prodData.productionDemands = [];
          prodData.productionDemands = prodData.productionDemands.map(item =>
              item.id === demandId ? { ...item, apiId: item.apiId || item.id, apiStatus: 'PLANNED', status: '已生成MPS' } : item
          );
                  window.sessionStorage.setItem(prodStorageKey, JSON.stringify(prodData));
      } catch (e) { /* ignore */ }
      showToast(`需求 [${demandId}] 已确认，生成 MPS [${newMpsId}] 进入待展算`, "success");
  };
  const handleAddMps = async (data) => {
      if (!formalCtx) { showToast('请先登录', 'error'); return false; }
      try {
          const productId = data.product.split(' - ')[0].trim();
          const inventory = loadInventoryMasterData(window.localStorage, currentTenant?.id);
          const warehouse = inventory.warehouses.find(item => item.code === 'WH-FG-01' || item.id === 'WH-FG-01');
          const demand = await productionOperationsApi.createDemand(formalCtx, {
              code: data.id.replace(/^MPS-/, 'DM-'), sourceType: 'MANUAL', sourceDescription: data.source, productId, productName: data.product,
              qty: String(data.quantity), uom: 'PCS', dueDate: data.date, factoryResourceId: 'FAC-SH-01',
              inventoryWarehouseId: warehouse?.id || 'WH-FG-01', priority: data.priority === '普通' ? 50 : 80,
          }, `manual-production:${currentTenant.id}:${data.id}`);
          setProductionDemands(prev => [mapFormalDemandRow(demand), ...prev.filter(item => item.apiId !== demand.id)]);
          showToast(`需求 ${demand.code} 已保存，请先校验和审批`, 'success');
          return true;
      } catch (error) { showToast(error instanceof Error ? `计划保存失败：${error.message}` : '计划保存失败', 'error'); return false; }
  };
  const handleUpdateMps = (data) => {
      if (mps.find(item => item.id === data.id)?.formalMps) { showToast('已展算计划不能直接修改，请通过来源需求调整', 'warning'); return; }
      setMps(prev => prev.map(m => m.id === data.id ? { ...m, ...data } : m));
      showToast(`MPS主计划 [${data.id}] 已更新`, 'success');
  };
  const handleDeleteMps = (id) => {
      if (mps.find(item => item.id === id)?.formalMps) { showToast('正式计划保留业务追溯，不能直接删除', 'warning'); return; }
      setMps(prev => prev.filter(m => m.id !== id));
      showToast(`MPS 计划单 [${id}] 已删除`, 'success');
  };
  const handleCalcMrp = (mpsId) => {
      const targetMps = mps.find(m => m.id === mpsId);
      const targetDemand = productionDemands.find(item => item.apiId === targetMps?.demandId);
      if (!targetDemand?.formalDemand || !targetDemand.formalDemand.acceptedAt) {
          showToast('该 MPS 未关联已接收的正式生产需求，不能推送 MRP', 'warning');
          return;
      }
      void handleCreateMpsFromDemand(targetDemand.id);
  };

  // --- MRP 交互 ---
  const handleIssueMrp = (sourceId, netReq) => {
      showToast('请从主计划运行 APS 后创建工单', 'warning');
      setActiveTab('mps');
  };
  const handleGlobalMrp = async () => {
      const eligible = productionDemands.filter(item => item.formalDemand?.acceptedAt && !item.formalDemand?.workOrderId
          && ['APPROVED', 'PLANNED'].includes(item.apiStatus));
      if (!eligible.length) { showToast('没有可展算的已接收需求', 'warning'); return; }
      if (!formalCtx) return;
      try {
          const result = await productionOperationsApi.startPlanningTask(formalCtx, 'MRP', eligible.map(item => item.apiId),
              eligible.map(item => `${item.apiId}:${item.formalDemand.version}`).sort().join('|'));
          const latest = await productionOperationsApi.listDemands(formalCtx);
          setProductionDemands(latest.items.map(mapFormalDemandRow));
          const rows = latest.items.filter(item => item.mrpTaskId === result.taskId).flatMap(item => {
              const row = recoverMpsFromPlannedDemand(item, { id: result.taskId, status: result.status, result: result.result });
              return row ? [row] : [];
          });
          setMps(prev => [...rows, ...prev.filter(item => !rows.some(row => row.demandId === item.demandId))]);
          const shortages = (result.result?.materialShortages || []).map(line => ({
              id: `MRP-${result.taskId.slice(0, 8)}-${line.demandId}-${line.materialId}`,
              mrpTaskId: result.taskId, demandId: line.demandId, source: `MPS-${line.demandId.slice(0, 8)}`,
              itemCode: line.materialId, itemName: line.materialName || line.materialId, type: '采购件',
              grossReq: Number(line.grossRequiredQty), stock: Number(line.availableQty), onWay: 0,
              netReq: Number(line.shortageQty), plannedQty: Number(line.shortageQty), lotRule: '按需(L4L)',
              status: '待转采购', pegging: [],
          }));
          setMrp(prev => [...shortages, ...prev.filter(item => !eligible.some(demand => demand.apiId === item.demandId))]);
          showToast(`全局 MRP 已完成，覆盖 ${rows.length} 项需求，缺料 ${shortages.length} 项`, shortages.length ? 'warning' : 'success');
      } catch (error) { showToast(error instanceof Error ? `全局展算失败：${error.message}` : '全局展算失败', 'error'); }
  };
  const handleCreatePurchase = async (row) => {
      if (!formalCtx || !row.mrpTaskId || !row.demandId) return;
      try {
          const request = await procurementApi.createRequest(formalCtx, { mrpTaskId: row.mrpTaskId, demandId: row.demandId, materialId: row.itemCode });
          setMrp(prev => prev.map(item => item.id === row.id ? { ...item, status: '已转采购', purchaseRequestId: request.id } : item));
          showToast(`采购申请 ${request.requestNo} 已保存，等待审批`, 'success');
      } catch (error) { showToast(error instanceof Error ? `采购申请失败：${error.message}` : '采购申请失败', 'error'); }
  };

  // --- Orders 交互 ---
  const handleCheckKit = async (woId) => {
      const order = orders.find(x => x.id === woId);
      if (order?.formalOrder && formalCtx) {
          try {
              const checked = await productionOperationsApi.checkKitting(formalCtx, order.formalOrder);
              setOrders(prev => prev.map(o => o.id === woId ? mapFormalWorkOrder(checked) : o));
              const impact = await productionOperationsApi.releaseImpact(formalCtx, checked.id);
              if (!impact.canRelease) {
                  showToast(`工单 [${woId}] 下达预检未通过：${impact.blockers.map(b => b.message).join('；')}`, 'error');
                  return;
              }
              showToast(`工单 [${woId}] 齐套预检通过，物料已锁定预留，允许下发！`, 'success');
          } catch (error) {
              showToast(error instanceof Error ? `齐套检查失败：${error.message}` : '齐套检查失败', 'error');
          }
          return;
      }
      showToast('工单尚未保存，无法执行齐套检查', 'error');
  };
  const handleDispatch = async (woId) => {
      let o = orders.find(x => x.id === woId);
      if (o?.formalOrder && formalCtx) {
          try {
              const released = await productionOperationsApi.workOrderCommand(formalCtx, o.formalOrder, 'release', '正式下发车间');
              setOrders(prev => prev.map(x => x.id === woId ? mapFormalWorkOrder(released) : x));
              setJobs(prev => [formalProductionJob(released), ...prev.filter(job => job.apiId !== released.id)]);
              showToast(`工单 [${woId}] 已通过正式 API 下发车间`, 'success');
              setActiveTab('execution');
          } catch (error) {
              showToast(error instanceof Error ? `工单下发失败：${error.message}` : '工单下发失败', 'error');
          }
          return;
      }
      if (o && (o.kitting !== '100%' || o.status !== '齐套待下发')) {
          showToast(`工单 [${woId}] 尚未完成齐套与预占，禁止下发车间`, 'error');
          return;
      }
      if(o) {
          setOrders(orders.map(x => x.id === woId ? { ...x, status: '执行中' } : x));
          let randStr = woId.split('-')[1] || Math.floor(Math.random()*1000);
          setJobs(prev => [...prev, { id: `JOB-${randStr}-10`, orderId: woId, opId: '10', opName: 'SMT贴片加工', targetQty: o.quantity, okQty:0, ngQty:0, status:'待领料', machineId:'贴片机-M01', operator: '待定', isRework:false, ngHandled: false, opType: '内部' }]);
          showToast(`工单 [${woId}] 已成功下发车间，并拆分为工序任务！`, 'success');
          setActiveTab('execution');
      }
  };
  const handleUpdateOrder = (data) => {
      if (orders.find(item => item.id === data.id)?.formalOrder) { showToast('正式工单已锁定业务数量，不能直接修改', 'warning'); return; }
      setOrders(prev => prev.map(o => o.id === data.id ? { ...o, ...data } : o));
      showToast(`生产工单 [${data.id}] 已更新`, 'success');
  };
  const handleDeleteOrder = (id) => {
      if (orders.find(item => item.id === id)?.formalOrder) { showToast('正式工单保留业务追溯，不能直接删除', 'warning'); return; }
      setOrders(prev => prev.filter(o => o.id !== id));
      showToast(`生产工单 [${id}] 已删除`, 'success');
  };

  // --- Execution 交互 ---
  const handleMaterialReq = (jobId) => {
      const job = jobs.find((item) => item.id === jobId);
      if (!job || job.status !== '待领料') {
          showToast('只有待领料工序可以发起物料出库', 'error');
          return;
      }
      const materialQty = Number(job.materialQty || job.targetQty * 2);
      setActionModal({
          kind: 'materialIssue',
          record: { ...job, materialId: job.materialId || 'RM201', materialName: job.materialName || 'AI算力芯片', materialQty, unit: job.materialUnit || 'PCS' },
          title: '发起生产物料出库',
          desc: '确认后生成库存出库任务；仓库完成出库前，当前工序保持领料处理中。',
          icon: ArrowUpFromLine,
          tone: 'amber',
          confirmText: '生成出库任务',
          details: [
              { label: '生产工单', value: job.orderId },
              { label: '工序任务', value: `${job.id} / ${job.opName}` },
              { label: '需求物料', value: `${job.materialId || 'RM201'} ${job.materialName || 'AI算力芯片'}` },
              { label: '申请数量', value: `${materialQty} ${job.materialUnit || 'PCS'}` },
              { label: '领料仓库', value: 'WH-RM-01 一号原材料仓' },
              { label: '目标仓库', value: 'WH-WIP-01 线边暂存仓' },
          ],
          steps: ['生成生产领料出库任务', '跳转库存出库管理', '仓库确认后回写物料就位'],
      });
  };
  const handleStartJob = async (jobId) => {
      const job = jobs.find(item => item.id === jobId);
      if (!job?.formalOrder || !formalCtx) { showToast('工单尚未保存，无法开工', 'error'); return; }
      try {
          const latest = await productionOperationsApi.getWorkOrder(formalCtx, job.formalOrder.id);
          const started = await productionOperationsApi.workOrderCommand(formalCtx, latest, latest.status === 'PAUSED' ? 'resume' : 'start');
          setJobs(prev => prev.map(item => item.id === jobId ? formalProductionJob(started) : item));
          setOrders(prev => prev.map(item => item.apiId === started.id ? mapFormalWorkOrder(started) : item));
          showToast('工单已开工，物料出库已登记', 'success');
      } catch (error) { showToast(error instanceof Error ? `开工失败：${error.message}` : '开工失败', 'error'); }
  };
  const handleReportJob = async (jobId) => {
      const job = jobs.find(j => j.id === jobId);
      if (job?.formalOrder && formalCtx) {
          try {
              const latest = await productionOperationsApi.getWorkOrder(formalCtx, job.formalOrder.id);
              if (latest.status !== 'IN_PROGRESS') throw new Error('请先开工再登记报工');
              setReportOrder(latest);
          } catch (error) {
              showToast(error instanceof Error ? `正式报工失败：${error.message}` : '正式报工失败', 'error');
          }
          return;
      }
      showToast('工单尚未保存，无法登记报工', 'error');
  };
  const handleSubmitReport = async (quantities) => {
      try {
          const result = await productionOperationsApi.submitReport(formalCtx, reportOrder, quantities);
          setJobs(prev => prev.map(item => item.apiId === result.workOrder.id ? formalProductionJob(result.workOrder) : item));
          setOrders(prev => prev.map(item => item.apiId === result.workOrder.id ? mapFormalWorkOrder(result.workOrder) : item));
          showToast('实际报工数量已保存', 'success');
          return true;
      } catch (error) {
          showToast(error instanceof Error ? `报工失败：${error.message}` : '报工失败', 'error');
          return false;
      }
  };
  const handleSendFqc = async (jobId) => {
      const job = jobs.find(item => item.id === jobId);
      if (!job?.formalOrder || !formalCtx) return;
      try {
          const latest = await productionOperationsApi.getWorkOrder(formalCtx, job.formalOrder.id);
          const inspected = (formalSnapshot?.inspections || []).filter(item => item.workOrderId === latest.id && !item.parentInspectionId)
              .reduce((sum, item) => sum + Number(item.sampleQty), 0);
          const remaining = Number(latest.reportedGoodQty) + Number(latest.reportedDefectQty) - inspected;
          if (remaining <= 0) throw new Error('报工成品已全部送检，请处理原检验单');
          const inspection = await productionOperationsApi.createInspection(formalCtx, latest, String(remaining));
          setQc(prev => [mapFormalInspection(inspection), ...prev.filter(item => item.apiId !== inspection.id)]);
          await refreshFormalProduction();
          setActiveTab('qc_cost');
          showToast(`已创建完工检验 ${inspection.code}`, 'success');
      } catch (error) { showToast(error instanceof Error ? `送检失败：${error.message}` : '送检失败', 'error'); }
  };
  const handleCloseOrder = async (orderId) => {
      const order = orders.find(item => item.id === orderId)?.formalOrder;
      if (!formalCtx || !order) return;
      try {
          if (order.status === 'COMPLETED') await productionOperationsApi.submitClose(formalCtx, order);
          else {
              const close = formalSnapshot?.closes.find(item => item.workOrderId === order.id && item.status === 'REVIEW_PENDING');
              if (!close) throw new Error('未找到待复核结案申请，请刷新');
              await productionOperationsApi.approveClose(formalCtx, close);
          }
          await refreshFormalProduction();
          showToast(order.status === 'COMPLETED' ? '结案已提交，请由另一名主管复核' : '工单已结案', 'success');
      } catch (error) { showToast(error instanceof Error ? `结案失败：${error.message}` : '结案失败', 'error'); }
  };
  const handleReturnMaterial = (jobId) => {
      showToast('退料单已生成，等待仓库点收冲减库存！', 'success');
  };
  const handleSendOutsource = (jobId) => {
      setJobs(jobs.map(j => j.id === jobId ? { ...j, status: '委外中' } : j));
      showToast(`委外发货单已生成，正发往供应商`, 'success');
  };
  const handleReceiveOutsource = (jobId) => {
      setJobs(jobs.map(j => j.id === jobId ? { ...j, status: '已完工', okQty: j.targetQty } : j));
      showToast(`委外件已运回，质检合格入库！`, 'success');
  };
  const handleReworkOrder = (originalId, ngCount) => {
      let j = jobs.find(x => x.id === originalId);
      if(j) {
          setJobs(prev => prev.map(x => x.id === originalId ? { ...x, ngHandled: true } : x));
          let rwId = `RW-${originalId.split('-')[1]}-${Math.floor(Math.random()*100)}`;
          setJobs(prev => [{ id: rwId, orderId: j.orderId+'(返工)', opId: '99', opName: '异常返修工序', targetQty: ngCount, okQty: 0, ngQty: 0, status: '待领料', machineId: '综合返修工作台', operator: '技术员', isRework: true, ngHandled: false, opType: '内部' }, ...prev]);
          showToast(`已生成逆向返修派工单！`, 'success');
      }
  };

  // --- QC & MRB 交互 ---
  const handleQcComplete = async (qcId, okQty, ngQty, scrapQty, reworkQty) => {
      const targetQcItem = qc.find(item => item.id === qcId);
      if (targetQcItem?.formalInspection && formalCtx) {
          try {
              const result = await productionOperationsApi.inspectionResult(formalCtx, targetQcItem.formalInspection, String(okQty), String(ngQty));
              setQc(prev => prev.map(item => item.id === qcId ? mapFormalInspection(result) : item));
              showToast(ngQty > 0 ? '不合格结果已保存，等待质量处置，禁止入库' : 'FQC 检验合格，等待成品入库', ngQty > 0 ? 'warning' : 'success');
              return;
          } catch (error) {
              showToast(error instanceof Error ? `FQC 登记失败：${error.message}` : 'FQC 登记失败', 'error');
              return;
          }
      }
      let mrbDesc = '';
      if (ngQty > 0) {
          let descArr = [];
          if (scrapQty > 0) { descArr.push(`报废${scrapQty}件`); setTimeout(() => showToast(`已扣减 ${scrapQty} 件实物报废库存`, 'warning'), 500); }
          if (reworkQty > 0) {
              descArr.push(`返修${reworkQty}件`);
              const targetQc = qc.find(q => q.id === qcId);
              const orderId = targetQc.orderId;
              const rwId = `RW-${orderId.split('-')[1]}-MRB`;
              setTimeout(() => {
                  setJobs(prev => [{ id: rwId, orderId: orderId+'(MRB返修)', opId: '99', opName: '异常返修工序', targetQty: reworkQty, okQty: 0, ngQty: 0, status: '待领料', machineId: '综合返修工作台', operator: '技术员', isRework: true, ngHandled: false, opType: '内部' }, ...prev]);
                  showToast(`已自动为车间下达 ${reworkQty} 件的返修工单！`, 'success');
              }, 1000);
          }
          mrbDesc = descArr.join('，');
      }
      const targetQuality = qc.find(item => item.id === qcId);
      const nextStatus = reworkQty > 0 ? '待返修复检' : targetQuality?.type.includes('FQC') ? '待入库' : '已结案';
      setQc(qc.map(q => q.id === qcId ? { ...q, status: nextStatus, okQty, ngQty, result: mrbDesc || (q.type.includes('FQC') ? '全良品待入库' : '过程检验通过') } : q));
      showToast(reworkQty > 0 ? '检验已记录，NG 已进入返修复检闭环，暂不可结案' : nextStatus === '待入库' ? 'FQC 已通过，等待库存确认后再结案' : '过程检验已通过，结果已回写车间工序', reworkQty > 0 ? 'warning' : 'success');
  };

  const handleConfirmInbound = async (qcId) => {
      const target = qc.find(item => item.id === qcId);
      if (!target || target.status !== '待入库' || !target.type.includes('FQC')) {
          showToast('只有已通过的 FQC 完工检验可以进入成品入库', 'error');
          return;
      }
      if (target.formalInspection && formalCtx) {
          try {
              const order = orders.find(o => o.apiId === target.formalInspection.workOrderId || o.id === target.orderId);
              if (order?.formalOrder) {
                  const inventoryWarehouseId = order.formalOrder.parameterSnapshot?.inventoryWarehouseId;
                  if (!inventoryWarehouseId) throw new Error('工单缺少目标入库仓库，请核对来源需求');
                  const result = await productionOperationsApi.createCompletion(formalCtx, order.formalOrder, target.formalInspection, inventoryWarehouseId);
                  showToast(`完工入库已提交正式 API，任务 ${result.taskId.slice(0, 8)}…，等待 WMS 确认`, 'success');
                  setQc(prev => prev.map(item => item.id === qcId ? { ...item, status: '入库处理中', completionId: result.completionId, result: '等待库存确认' } : item));
                  await refreshFormalProduction();
                  return;
              }
          } catch (error) {
              showToast(error instanceof Error ? `完工入库失败：${error.message}` : '完工入库失败', 'error');
              return;
          }
          return;
      }
      showToast('检验单尚未保存，无法确认成品入库', 'error');
  };
  const handleQualityDisposition = async (qcId, action) => {
      const quality = qc.find(item => item.id === qcId);
      if (!formalCtx || !quality?.formalInspection) return;
      try {
          if (action === 'complete') await productionOperationsApi.completeRework(formalCtx, quality.formalInspection);
          else if (action === 'retry') await productionOperationsApi.retryCompletion(formalCtx, quality.completionId);
          else await productionOperationsApi.disposition(formalCtx, quality.formalInspection, action);
          await refreshFormalProduction();
          showToast(action === 'complete' ? '返工完成已记录，复检单已创建' : '质量处置已保存', 'success');
      } catch (error) { showToast(error instanceof Error ? `处置失败：${error.message}` : '处置失败', 'error'); }
  };

  // --- Equipment 交互 ---
  const handleAddEq = (data) => {
      setEquipments(prev => [...prev, data]);
      showToast('设备资产注册保存成功', 'success');
  };
  const handleEditEq = (data) => {
      setEquipments(prev => prev.map(e => e.id === data.id ? data : e));
      showToast('设备资产修改保存成功', 'success');
  };
  const handleDeleteEq = (id) => {
      setEquipments(prev => prev.filter(e => e.id !== id));
      showToast('设备资产已被删除移去！', 'success');
  };
  const handleFixEquipment = (eqId) => {
      setEquipments(equipments.map(e => e.id === eqId ? { ...e, status: '运行正常', oee: '90%' } : e));
      showToast(`故障顺利消除，机台上线运行正常！`, 'success');
  };
  const handleSimulateFailure = (eqId) => {
      const targetEq = equipments.find(e => e.id === eqId);
      setEquipments(equipments.map(e => e.id === eqId ? { ...e, status: '故障停机', oee: '15%' } : e));
      showToast(`⚠️ 故障警报：设备发生故障过载停机！`, 'error');
      let job = jobs.find(j => (j.machineId === eqId || j.machineId === targetEq?.name) && j.status === '进行中');
      if (job) {
          setJobs(jobs.map(j => j.id === job.id ? { ...j, status: '锁定' } : j));
          showToast('AI现场中枢：受故障机台牵连，工序加工卡已被紧急锁定挂起！', 'warning');
      }
  };

  const handleAutoReschedule = () => {
      setOrders(prev => prev.map(o => o.id === 'WO-260102' ? { ...o, status: '齐套待下发', kitting: '100%', startDate: '2026-06-08', endDate: '2026-06-11' } : o));
      setJobs(prev => prev.map(j => j.machineId === '贴片机-M01' && j.status === '进行中' ? { ...j, machineId: '贴片机-M02' } : j));
      showToast('AI 已完成重新排产：瓶颈工序切换至 SMT-M02，WO-260102 齐套状态已更新。', 'success');
  };

  const handleTransferLine = () => {
      setJobs(prev => prev.map(j => j.id === 'JOB-260101-10' ? { ...j, machineId: '贴片机-M02', operator: '李工' } : j));
      showToast('已转移至备用产线 SMT-M02，并同步更新现场执行任务。', 'success');
      setActiveTab('execution');
  };

  const openProdAction = (kind) => {
      const configs = {
          reschedule: {
              kind,
              title: 'AI 自动重新排产',
              desc: '系统会重算受影响工单的齐套、产线和交期，并回写生产订单。',
              icon: Bot,
              tone: 'purple',
              confirmText: '执行重新排产',
              details: [
                  { label: '受影响工单', value: 'WO-260102' },
                  { label: '瓶颈工序', value: 'SMT-M01' },
                  { label: '推荐产线', value: 'SMT-M02' },
                  { label: '结果界面', value: '生产监控舱' }
              ]
          },
          transfer: {
              kind,
              title: '转移至备用产线',
              desc: '系统会把当前执行工序切换到备用产线，并跳转到车间与物流页查看派工结果。',
              icon: Route,
              tone: 'blue',
              confirmText: '转移并跳转',
              details: [
                  { label: '工序任务', value: 'JOB-260101-10' },
                  { label: '原机台', value: '贴片机-M01' },
                  { label: '目标机台', value: '贴片机-M02' },
                  { label: '目标界面', value: '车间与物流' }
              ]
          }
      };
      setActionModal(configs[kind]);
  };

	  const confirmProdAction = () => {
	      if (!actionModal) return;
	      const kind = actionModal.kind;
	      if (kind === 'materialIssue' && actionModal.record) {
	          const job = actionModal.record;
	          const result = createProductionMaterialIssueTask(window.sessionStorage, currentTenant?.id, {
	              jobId: job.id,
	              orderId: job.orderId,
	              operationName: job.opName,
	              materialId: job.materialId,
	              materialName: job.materialName,
	              requestedQty: job.materialQty,
	              unit: job.unit,
	              warehouseId: 'WH-RM-01',
	              targetWarehouse: 'WH-WIP-01',
	              actor: currentUser?.name || currentUser?.account || '当前生产用户',
	          });
	          setJobs((previous) => previous.map((item) => item.id === job.id ? { ...item, status: '领料处理中', materialIssueTaskId: result.task.id } : item));
	          setActionModal(null);
	          showToast(result.created ? `物料出库任务已生成：${result.task.id}` : `已存在物料出库任务：${result.task.id}`, result.created ? 'success' : 'warning');
	          onNavigateModule?.('库存管理', { query: { inventory: 'outbound', focusOutbound: result.task.id } });
	          return;
	      }
	      setActionModal(null);
	      if (kind === 'reschedule') handleAutoReschedule();
	      if (kind === 'transfer') handleTransferLine();
	  };

	  const permissionCodes = formalSnapshot?.permissions || currentUser?.permissions || [];
	  const hasPermission = (code) => permissionCodes.includes('*') || permissionCodes.includes(code);

	  return (
      <div className="w-full h-full font-sans flex flex-col relative bg-[#F5F7FA] selection:bg-blue-100">
          <CenterToast toast={toast} onClose={() => setToast({ show: false, msg: '', type: 'success' })} />
          <BusinessActionModal action={actionModal} onClose={() => setActionModal(null)} onConfirm={confirmProdAction} />
          {reportOrder && <ProductionReportModal order={reportOrder} onClose={() => setReportOrder(null)} onSubmit={handleSubmitReport} />}

	          <div className="relative mx-auto flex w-full max-w-[1600px] shrink-0 flex-col gap-6 px-8 pb-4 pt-8">
              <div className="flex justify-between items-start">
                  <div className="flex items-center">
                      <div className="w-[52px] h-[52px] bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-sm mr-4"><Factory className="w-6 h-6" /></div>
                      <div>
                          <h1 className="text-[22px] font-bold text-slate-800 tracking-wide mb-1.5 leading-tight">智能生产管理</h1>
                          <p className="text-[13px] text-slate-400 font-medium">计划排程、执行与质量防呆全域中枢</p>
                      </div>
                  </div>
              </div>
              
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-1.5 flex flex-wrap items-center gap-1 select-none relative w-max max-w-full z-50">
                  <button onClick={()=>setActiveTab('dashboard')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}><LayoutDashboard className="w-4 h-4" /> 生产监控舱</button>
                  <div className="w-px h-5 bg-slate-200 mx-1 shrink-0"></div>
                  <button onClick={()=>setActiveTab('mps')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${activeTab === 'mps' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}><Target className="w-4 h-4" /> 主计划(MPS)</button>
                  <button onClick={()=>setActiveTab('mrp')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${activeTab === 'mrp' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}><Calculator className="w-4 h-4" /> 运算控制台</button>
                  <button onClick={()=>setActiveTab('aps')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${activeTab === 'aps' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}><CalendarRange className="w-4 h-4" /> 排产甘特图</button>
                  <div className="w-px h-5 bg-slate-200 mx-1 shrink-0"></div>
                  <button onClick={()=>setActiveTab('orders')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${activeTab === 'orders' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}><ClipboardList className="w-4 h-4" /> 订单与齐套</button>
                  <button onClick={()=>setActiveTab('execution')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${activeTab === 'execution' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}><Hammer className="w-4 h-4" /> 车间与物流</button>
                  <button onClick={()=>setActiveTab('qc_cost')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${activeTab === 'qc_cost' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}><ShieldCheck className="w-4 h-4" /> 质量与结案</button>
                  <div className="w-px h-5 bg-slate-200 mx-1 shrink-0"></div>
                  
                  <div className="relative group">
                      <button type="button" onMouseDown={(event) => { event.preventDefault(); setActiveTab('bom'); }} onClick={() => setActiveTab('bom')} className={`shrink-0 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 ${['bom', 'routing', 'equipment'].includes(activeTab) ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                          <Database className="w-4 h-4" /> 基础主数据 <ChevronDown className="w-3.5 h-3.5 opacity-70 group-hover:rotate-180 transition-transform" />
                      </button>
                      <div className="absolute top-[100%] left-0 pt-1.5 hidden group-hover:block w-36 animate-in slide-in-from-top-2 z-[100]">
                          <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 flex flex-col gap-1">
                              <button onClick={() => setActiveTab('bom')} className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-bold transition-colors flex items-center gap-2 ${activeTab === 'bom' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}><Network className="w-4 h-4" /> BOM配置</button>
                              <button onClick={() => setActiveTab('routing')} className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-bold transition-colors flex items-center gap-2 ${activeTab === 'routing' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}><Route className="w-4 h-4" /> 工艺路线</button>
                              <button onClick={() => setActiveTab('equipment')} className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-bold transition-colors flex items-center gap-2 ${activeTab === 'equipment' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}><MonitorCog className="w-4 h-4" /> 设备机台</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

	          <main className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-8 pb-8">
	              <div className="flex-1 w-full h-full overflow-y-auto custom-scrollbar relative pr-2 pb-6">
	                  <BusinessFlowDock moduleName="生产管理" flow={businessFlow} onAction={handleProductionFlowAction} onNavigate={onNavigateModule} />
	                  {activeTab === 'dashboard' && <Prod_DashboardView onAutoReschedule={() => openProdAction('reschedule')} onTransferLine={() => openProdAction('transfer')} workOrders={orders} demands={productionDemands} />}{activeTab === 'mps' && <Prod_MpsView mps={mps} focusMps={focusedMpsId} bomData={bomData} productionDemands={productionDemands} onAddMps={handleAddMps} onUpdateMps={handleUpdateMps} onDeleteMps={handleDeleteMps} onCalcMrp={handleCalcMrp} onValidateDemand={handleValidateDemand} onApproveDemand={handleApproveDemand} onClaimDemand={handleClaimDemand} onCreateMpsFromDemand={handleCreateMpsFromDemand} onRunAps={handleRunApsFromMps} onCreateFormalOrder={handleCreateFormalOrderFromMps} onHoldDemand={handleHoldDemand} onMergeDemand={handleMergeDemandToPlan} onViewDemandSource={handleViewDemandSource} showToast={showToast} canCalcMrp={hasPermission('production.mrp.run')} canValidateDemand={hasPermission('production.demand.review')} canApproveDemandAction={hasPermission('production.demand.approve')} canClaimDemand={hasPermission('production.demand.claim')} canCreateMps={hasPermission('production.demandPool.createMps')} canRunAps={hasPermission('production.aps.run')} canCreateWorkOrder={hasPermission('production.work-order.create')} onConfirmMps={handleConfirmMps} onConfirmDemandToMps={handleConfirmDemandToMps} />}
                  {activeTab === 'mrp' && <Prod_MrpView mrp={mrp} onIssueMrp={handleIssueMrp} onRunGlobalMrp={handleGlobalMrp} onCreatePurchase={handleCreatePurchase} showToast={showToast} />}
                  {activeTab === 'aps' && <Prod_ApsView orders={orders} equipments={equipments} onUpdateOrder={handleUpdateOrder} showToast={showToast} />}
                  {activeTab === 'orders' && <Prod_OrdersView orders={orders} onCheckKit={handleCheckKit} onDispatch={handleDispatch} onUpdateOrder={handleUpdateOrder} onDeleteOrder={handleDeleteOrder} showToast={showToast} />}
                  {activeTab === 'execution' && <Prod_ExecutionView jobs={jobs} onStartJob={handleStartJob} onReportJob={handleReportJob} onSendFqc={handleSendFqc} onMaterialReq={handleMaterialReq} onReturnMaterial={handleReturnMaterial} onSendOutsource={handleSendOutsource} onReceiveOutsource={handleReceiveOutsource} onReworkOrder={handleReworkOrder} showToast={showToast} />}
	                  {activeTab === 'qc_cost' && <Prod_QcView qc={qc} orders={orders} onCloseOrder={handleCloseOrder} onQcComplete={handleQcComplete} onConfirmInbound={handleConfirmInbound} onDisposition={handleQualityDisposition} showToast={showToast} />}
	                  {activeTab === 'qc_cost' && (
	                      <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
	                          <CostAccumulationPanel workOrderNo={jobs.find(j => j.status === 'COMPLETED')?.orderId || 'WO-2026-001'} />
	                      </div>
	                  )}
	                  {activeTab === 'equipment' && <Prod_EquipmentView productionLines={productionLines} equipments={equipments} onAddEq={handleAddEq} onEditEq={handleEditEq} onDeleteEq={handleDeleteEq} onFixEquipment={handleFixEquipment} onSimulateFailure={handleSimulateFailure} />}
                  {activeTab === 'bom' && <Prod_BomView bomData={bomData} setBomData={setBomData} showToast={showToast} formalCtx={formalCtx} />}
                  {activeTab === 'routing' && <Prod_RoutingView routingData={routingData} setRoutingData={setRoutingData} equipments={equipments} showToast={showToast} />}
              </div>
          </main>
      </div>
  );
};

// ==========================================
// 3. 库存管理模块 (InventoryManagement)
// ==========================================
const inv_dashboardMetrics = [
  { id: 1, title: '总库存周转率', value: '4.2', suffix: '次/年', subtitle: '较上月提升 0.3', tag: '健康', tagColor: 'emerald' },
  { id: 2, title: '低位预警物料', value: '12', suffix: '项', subtitle: '低于动态安全水位', tag: '需补货', tagColor: 'amber' },
  { id: 3, title: '呆滞积压资金', value: '38.5', suffix: '万元', subtitle: '超90天未动存货', tag: '高风险', tagColor: 'red' },
  { id: 4, title: '本月出入库单', value: '456', suffix: '单', subtitle: '任务执行进度 98%', tag: '运转正常', tagColor: 'blue' },
];

const inv_stockData = [
  { id: 'RM201', name: 'AI算力芯片', kind: '物料', category: '原材料', warehouseId: 'WH-RM-01', warehouse: '一号原材料仓', location: 'A-01-01', stockQty: 1500, lockQty: 500, availQty: 1000, unit: 'PCS', status: '正常' },
  { id: 'RM202', name: '12层空PCB板', kind: '物料', category: '原材料', warehouseId: 'WH-RM-01', warehouse: '一号原材料仓', location: 'A-01-02', stockQty: 80, lockQty: 0, availQty: 80, unit: 'PCS', status: '低库存' },
  { id: 'RM203', name: 'DDR5内存模组32GB', kind: '物料', category: '原材料', warehouseId: 'WH-RM-01', warehouse: '一号原材料仓', location: 'A-02-03', stockQty: 600, lockQty: 100, availQty: 500, unit: 'PCS', status: '正常' },
  { id: 'RM204', name: 'NVMe SSD 1TB', kind: '物料', category: '原材料', warehouseId: 'WH-RM-02', warehouse: '二号原材料仓', location: 'B-01-05', stockQty: 45, lockQty: 0, availQty: 45, unit: 'PCS', status: '低库存' },
  { id: 'FG001', name: '工业控制器顶配版', kind: '产品', category: '成品', warehouseId: 'WH-FG-01', warehouse: '成品主仓', location: 'F-02-05', stockQty: 3500, lockQty: 1200, availQty: 2300, unit: '台', unitPrice: 500, status: '积压呆滞' },
  { id: 'FG002', name: '边缘计算网关Pro', kind: '产品', category: '成品', warehouseId: 'WH-FG-01', warehouse: '成品主仓', location: 'F-03-01', stockQty: 820, lockQty: 200, availQty: 620, unit: '台', unitPrice: 1200, status: '正常' },
  { id: 'FG003', name: '智能视觉检测终端', kind: '产品', category: '成品', warehouseId: 'WH-FG-01', warehouse: '成品主仓', location: 'F-03-02', stockQty: 150, lockQty: 30, availQty: 120, unit: '台', unitPrice: 3500, status: '正常' },
  { id: 'FG004', name: '工业数据采集模块', kind: '产品', category: '成品', warehouseId: 'WH-FG-01', warehouse: '成品主仓', location: 'F-04-01', stockQty: 30, lockQty: 0, availQty: 30, unit: '套', unitPrice: 800, status: '低库存' },
  { id: 'SA101', name: '核心主板组件', kind: '物料', category: '半成品', warehouseId: 'WH-WIP-01', warehouse: '线边暂存仓', location: 'W-01', stockQty: 420, lockQty: 420, availQty: 0, unit: '套', status: '正常' },
  { id: 'SA102', name: '电源管理模组', kind: '物料', category: '半成品', warehouseId: 'WH-WIP-01', warehouse: '线边暂存仓', location: 'W-02', stockQty: 280, lockQty: 80, availQty: 200, unit: '套', status: '正常' },
  { id: 'SA103', name: '散热模组总成', kind: '物料', category: '半成品', warehouseId: 'WH-WIP-02', warehouse: '组装线边仓', location: 'W-03', stockQty: 65, lockQty: 20, availQty: 45, unit: '套', status: '低库存' },
];

// 辅助函数：从库存管理-产品中查找"实际可用"(availQty)，作为销售订单可用量的唯一数据源
function resolveOrderAvailQty(order) {
  if (!order) return 0;
  const pn = order.productName || '';
  const pid = order.productId || '';
  const extracted = !pid && pn ? (pn.split(/\s+/)[0] || '').trim() : '';
  const eff = pid || extracted;
  const prods = inv_stockData.filter(p => p.kind === '产品');
  let m = eff ? prods.find(p => p.id === eff) : null;
  if (!m && pn) m = prods.find(p => pn.indexOf(p.name) >= 0 || p.name === pn);
  return m ? Number(m.availQty ?? 0) : Number(order.availableStock ?? 0);
}

const inv_inboundData = [
  { id: 'IN-260701-01', type: '采购入库', source: 'PO-260688', item: 'AI算力芯片', qty: 2000, date: '2026-07-01 10:30', status: '已入库', operator: '王仓管' },
  { id: 'IN-260701-02', type: '生产退料', source: 'JOB-260101-10', item: '12层空PCB板', qty: 5, date: '2026-07-01 14:15', status: '待质检', operator: '李质检' },
];

const inv_outboundData = [
  { id: 'OUT-260702-01', type: '销售发货', source: 'SO-20260615-001', item: '工业控制器顶配版', productId: 'FG001', qty: 1, date: '2026-07-02 11:15', status: '拣货中', operator: '张调度' },
  { id: 'OUT-260702-02', type: '销售发货', source: 'SO-20260620-003', item: '边缘计算网关Pro', productId: 'FG002', qty: 50, date: '2026-07-03 09:20', status: '已出库', operator: '王仓管' },
  // 测试：全部不足 → 去生产（FG004 availQty=30, 需求100, 缺口70）
  { id: 'OUT-260703-01', type: '销售发货', source: 'SO-20260710-005', item: '工业数据采集模块', productId: 'FG004', qty: 100, date: '2026-07-10 10:00', status: '待发货', operator: '张调度' },
  // 测试：部分充足部分不足 → 部分发货 + 去生产（FG001 充足, FG004 不足）
  { id: 'OUT-260703-02', type: '销售发货', source: 'SO-20260712-008', item: '工业控制器顶配版+工业数据采集模块', productId: 'FG001', qty: 110, date: '2026-07-12 14:30', status: '待发货', operator: '张调度',
    lines: [
      { productId: 'FG001', productName: '工业控制器顶配版', spec: '旗舰配置', qty: 10, unit: '台', unitPrice: 500 },
      { productId: 'FG004', productName: '工业数据采集模块', spec: '标准版', qty: 100, unit: '套', unitPrice: 800 },
    ],
  },
];

const invEntityLabels = {
  stock: '库存台账',
  inbound: '入库单',
  outbound: '出库单'
};

const invRecordFields = {
  stock: [
    { key: 'id', label: '物料编码' },
    { key: 'name', label: '物料名称' },
    { key: 'category', label: '类别' },
    { key: 'warehouse', label: '所在仓库' },
    { key: 'location', label: '库位' },
    { key: 'stockQty', label: '现有总量', type: 'number' },
    { key: 'lockQty', label: '冻结/预留', type: 'number' },
    { key: 'availQty', label: '实际可用', type: 'number' },
    { key: 'unit', label: '单位' },
    { key: 'status', label: '库存健康度' }
  ],
  inbound: [
    { key: 'id', label: '入库流水号' },
    { key: 'type', label: '业务类型' },
    { key: 'source', label: '来源单据' },
    { key: 'item', label: '产品明细' },
    { key: 'qty', label: '发生数量', type: 'number' },
    { key: 'date', label: '操作日期' },
    { key: 'status', label: '单据状态' },
    { key: 'operator', label: '操作人' }
  ],
  outbound: [
    { key: 'id', label: '出库流水号' },
    { key: 'type', label: '业务类型' },
    { key: 'source', label: '来源单据' },
    { key: 'item', label: '产品明细' },
    { key: 'qty', label: '发生数量', type: 'number' },
    { key: 'date', label: '操作日期' },
    { key: 'status', label: '单据状态' },
    { key: 'operator', label: '操作人' }
  ]
};

const Inv_RecordModal = ({ type, mode, record, onClose, onSubmit }) => {
  const [draft, setDraft] = useState(record || {});
  const fields = invRecordFields[type] || [];
  const readOnly = mode === 'view';
  const titlePrefix = mode === 'create' ? '新增' : readOnly ? '查看' : '编辑';

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 transition-opacity animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-[720px] overflow-hidden flex flex-col transform border border-slate-100">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2">
            <Warehouse size={16} className="text-blue-600" />
            {titlePrefix}{invEntityLabels[type]}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            {fields.map(field => (
              <div key={field.key}>
                <label className="block text-[12px] font-bold text-slate-500 mb-1.5">{field.label}</label>
                <input
                  type={field.type || 'text'}
                  value={draft[field.key] || ''}
                  readOnly={readOnly || (field.key === 'id' && mode !== 'create')}
                  onChange={(e) => setDraft(prev => ({ ...prev, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-[13px] outline-none transition-colors ${readOnly || (field.key === 'id' && mode !== 'create') ? 'bg-slate-50 border-slate-100 text-slate-600' : 'bg-white border-slate-200 focus:border-blue-500 text-slate-800'}`}
                />
              </div>
            ))}
          </div>
          {type === 'outbound' && readOnly && draft.lines && draft.lines.length > 0 && (
            <div>
              <div className="text-[12px] font-bold text-slate-500 mb-2">出库产品明细</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">产品编码</th>
                      <th className="px-3 py-2.5 font-medium">产品名称</th>
                      <th className="px-3 py-2.5 font-medium text-center">规格</th>
                      <th className="px-3 py-2.5 font-medium text-center">订单数量</th>
                      <th className="px-3 py-2.5 font-medium text-center">已发货</th>
                      <th className="px-3 py-2.5 font-medium text-center">剩余待发</th>
                      <th className="px-3 py-2.5 font-medium text-center">单位</th>
                      <th className="px-3 py-2.5 font-medium text-right">单价</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line, idx) => {
                      const shipped = Number(line.shippedQty || 0);
                      const remaining = Math.max(0, Number(line.qty || 0) - shipped);
                      return <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{line.productId}</td>
                        <td className="px-3 py-2.5 text-slate-800">{line.productName}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{line.spec || '-'}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{line.qty}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-emerald-600">{shipped > 0 ? shipped : '-'}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold {remaining > 0 ? 'text-rose-500' : 'text-slate-400'}">{remaining > 0 ? remaining : <CheckCircle2 size={12} className="inline text-emerald-500"/>}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{line.unit}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600">{line.unitPrice ? '¥' + Number(line.unitPrice).toFixed(2) : '-'}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              {draft.shipmentDetails && draft.shipmentDetails.length > 0 && <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                <div className="text-[11px] font-bold text-emerald-700 mb-1">出库记录</div>
                {draft.shipmentDetails.map((s, i) => <div key={i} className="text-[12px] text-emerald-600 font-mono">{s.productId} {s.productName} × {s.shipQty} {s.unit}</div>)}
              </div>}
            </div>
          )}
          {type === 'outbound' && readOnly && draft.formalTask?.lines && draft.formalTask.lines.length > 0 && (
            <div>
              <div className="text-[12px] font-bold text-slate-500 mb-2">销售订单产品明细</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">产品编码</th>
                      <th className="px-3 py-2.5 font-medium text-center">申请数量</th>
                      <th className="px-3 py-2.5 font-medium text-center">预留数量</th>
                      <th className="px-3 py-2.5 font-medium text-center">单位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.formalTask.lines.map((line, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{line.productId}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{line.requestedQty}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-slate-600">{line.reservedQty}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{line.uom || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
          <button onClick={onClose} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl">{readOnly ? '关闭' : '取消'}</button>
          {!readOnly && <button onClick={() => onSubmit(draft)} className="px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5"><Check size={16}/> 保存</button>}
        </div>
      </div>
    </div>
  );
};

const Inv_ActionReviewModal = ({
  action,
  onCancel,
  onConfirm,
  onGapProduction,
  onWarehouseRequired,
  submitting = false,
  warehouses = [],
  warehouseName: resolveWarehouseName,
  onWarehouseChange,
  stockState = { status: 'idle' } as OutboundStockState,
  warehouseLoadError = '',
}) => {
  const [values, setValues] = useState(() => Object.fromEntries([
    ...(action.quantityFields || []).map((field) => [field.id, String(field.value)]),
    ...(action.dateFields || []).map((field) => [field.id, String(field.value)]),
  ]));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [isSwitchingWarehouse, setIsSwitchingWarehouse] = useState(false);
  const requiresWarehouse = ['processOutbound', 'partialShipment'].includes(action.kind);
  const hasWarehouseOptions = warehouses.length > 0;
  const warehouseUnavailable = requiresWarehouse && !hasWarehouseOptions;
  const showWarehouseSelector = requiresWarehouse && hasWarehouseOptions;

  useEffect(() => {
    if (selectedWarehouseId && !warehouses.some((w) => w.id === selectedWarehouseId)) setSelectedWarehouseId('');
  }, [selectedWarehouseId, warehouses]);

  useEffect(() => {
    if (!requiresWarehouse || !selectedWarehouseId || !Array.isArray(action.lineStockInfo)) return;
    const nextValues = Object.fromEntries(action.lineStockInfo
      .filter((item) => Number(item.availQty) > 0)
      .map((item) => {
        const fieldId = `shipQty_${item.lineId || item.productId}`;
        const maxQty = Math.min(Number(item.remainingQty ?? item.qty), Number(item.availQty));
        return [fieldId, String(maxQty)];
      }));
    setValues(nextValues);
  }, [action.lineStockInfo, requiresWarehouse, selectedWarehouseId]);

  const handleWarehouseSwitch = async (newWarehouseId) => {
    setSelectedWarehouseId(newWarehouseId);
    if (onWarehouseChange) {
      setIsSwitchingWarehouse(true);
      try { await onWarehouseChange(newWarehouseId); } finally { setIsSwitchingWarehouse(false); }
    }
  };
  const toneMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100'
  };
  const buttonMap = {
    blue: 'bg-blue-600 hover:bg-blue-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    amber: 'bg-amber-500 hover:bg-amber-600',
    rose: 'bg-rose-600 hover:bg-rose-700'
  };
  const tone = action.tone || 'blue';
  const Icon = action.icon || ClipboardCheck;

  const stockReady = requiresWarehouse
    && Boolean(selectedWarehouseId)
    && stockState.status === 'ready'
    && stockState.warehouseId === selectedWarehouseId
    && Array.isArray(action.lineStockInfo)
    && action.lineStockInfo.length > 0;
  const shipmentDecision = classifyOutboundShipment(stockReady ? action.lineStockInfo : [], {
    allowPartialShipment: action.record?.formalTask
      ? Boolean(action.record.formalTask.allowPartialShipment)
      : true,
  });
  const activeStockLines = shipmentDecision.activeLines;
  const shippableStockLines = shipmentDecision.shippableLines;
  const shortageStockLines = shipmentDecision.shortageLines;
  const allowPartial = shipmentDecision.allowPartial;
  const isPartialShipmentMode = stockReady && shipmentDecision.action === 'partial-shipment';
  const isProductionOnlyMode = stockReady && shipmentDecision.action === 'production-only';
  const missingWarehouse = requiresWarehouse && !selectedWarehouseId;
  const partialShipmentValid = stockReady
    ? shippableStockLines.every(ls => {
        const fieldId = `shipQty_${ls.lineId || ls.productId}`;
        const maxQty = Math.min(ls.remainingQty ?? ls.qty, ls.availQty);
        const raw = values[fieldId];
        if (raw == null || raw === '') return false;
        const v = Number(raw);
        return !isNaN(v) && v > 0 && v <= maxQty;
      })
    : true;

  // 去生产：计算所有缺口产品的生产数量是否都有效（>= 缺口数）
  const productionRequestValid = action.kind === 'productionRequest' && action.lineStockInfo
    ? action.lineStockInfo.filter(ls => ls.shortage > 0).every(ls => {
        const fieldId = `prodQty_${ls.productId}`;
        const v = Number(values[fieldId] ?? ls.shortage);
        return v >= ls.shortage && !isNaN(v);
      })
    : true;

  const stockNotLoaded = requiresWarehouse && (
    missingWarehouse
    || stockState.status !== 'ready'
    || stockState.warehouseId !== selectedWarehouseId
    || !action.lineStockInfo?.length
    || shipmentDecision.action === 'not-loaded'
  );
  const confirmDisabled = submitting || warehouseUnavailable || stockNotLoaded || !partialShipmentValid || !productionRequestValid;
  const confirmLabel = isProductionOnlyMode
    ? '去生产'
    : isPartialShipmentMode
      ? '部分发货'
      : shipmentDecision.action === 'ship'
        ? '去发货'
      : action.confirmText || '确认执行';
  const stockFieldId = (item) => `shipQty_${item.lineId || item.productId}`;

  const handleConfirm = () => {
    if (missingWarehouse) {
      onWarehouseRequired?.();
      return;
    }
    onConfirm(values, selectedWarehouseId);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 transition-opacity animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[860px] max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-48px)] overflow-hidden flex flex-col border border-slate-100">
        <div className="p-5 shrink-0 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
          <div className="flex gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${toneMap[tone] || toneMap.blue}`}>
              <Icon size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-[15px]">{action.title}</h3>
              <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{action.desc}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
        </div>
        <div className="p-4 sm:p-6 min-h-0 overflow-y-auto">
          {warehouseUnavailable && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <div className="shrink-0 text-[12px] font-bold text-amber-700">{warehouseLoadError ? '仓库列表不可用' : '暂无可用仓库'}</div>
              <div className="text-[12px] text-amber-700">{warehouseLoadError || '当前租户还没有启用的发货仓库，请先在“库存管理 / 仓库”中创建或启用仓库。'}</div>
            </div>
          )}
          {showWarehouseSelector && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="shrink-0 text-[12px] font-bold text-slate-600">发货仓库</div>
              <select
                value={selectedWarehouseId}
                onChange={(e) => handleWarehouseSwitch(e.target.value)}
                disabled={isSwitchingWarehouse || submitting}
                className="min-w-0 w-full sm:w-auto sm:max-w-[320px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-400"
              >
                <option value="">请选择发货仓库</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
              </select>
              <div className="min-w-0 break-words sm:ml-auto text-[11px] text-blue-600 font-bold">
                {selectedWarehouseId
                  ? `确认后将从 ${resolveWarehouseName ? resolveWarehouseName(selectedWarehouseId) : selectedWarehouseId} 扣减库存`
                  : '请选择仓库后加载真实可用量'}
              </div>
            </div>
          )}
          {requiresWarehouse && selectedWarehouseId && stockState.status === 'loading' && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[12px] font-bold text-blue-700">正在读取选定仓库的真实可用量...</div>
          )}
          {requiresWarehouse && selectedWarehouseId && stockState.status === 'error' && (
            <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold text-rose-700">{stockState.error || '仓库可用量读取失败，请重新选择仓库'}</div>
          )}
          {requiresWarehouse && selectedWarehouseId && stockState.status === 'missing-product' && (
            <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] font-bold text-amber-700">{stockState.error}</div>
          )}
          {requiresWarehouse && selectedWarehouseId && !stockReady && stockState.status !== 'loading' && stockState.status !== 'error' && (
            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[12px] font-bold text-slate-600">请重新选择发货仓库以加载真实可用量</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(action.details || []).map(item => (
              <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                <div className="text-[11px] font-bold text-slate-400 mb-1">{item.label}</div>
                <div className="text-[13px] font-bold text-slate-800 break-words">{item.value}</div>
              </div>
            ))}
          </div>
          {action.record?.lines && action.record.lines.length > 0 && action.kind !== 'partialShipment' && action.kind !== 'productionRequest' && (!requiresWarehouse || stockReady) && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="text-[12px] font-bold text-slate-500 mb-2">销售订单产品明细</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">产品编码</th>
                      <th className="px-3 py-2.5 font-medium">产品名称</th>
                      <th className="px-3 py-2.5 font-medium text-center">规格</th>
                      <th className="px-3 py-2.5 font-medium text-center">数量</th>
                      <th className="px-3 py-2.5 font-medium text-center">单位</th>
                      <th className="px-3 py-2.5 font-medium text-right">单价</th>
                    </tr>
                  </thead>
                  <tbody>
                    {action.record.lines.map((line, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{line.productId}</td>
                        <td className="px-3 py-2.5 text-slate-800">{line.productName}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{line.spec || '-'}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{line.qty}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{line.unit}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600">{line.unitPrice ? '¥' + Number(line.unitPrice).toFixed(2) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {action.record?.formalTask?.lines && action.record.lines == null && action.record.formalTask.lines.length > 0 && action.kind !== 'partialShipment' && action.kind !== 'productionRequest' && (!requiresWarehouse || stockReady) && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="text-[12px] font-bold text-slate-500 mb-2">销售订单产品明细</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">产品编码</th>
                      <th className="px-3 py-2.5 font-medium text-center">申请数量</th>
                      <th className="px-3 py-2.5 font-medium text-center">预留数量</th>
                      <th className="px-3 py-2.5 font-medium text-center">单位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {action.record.formalTask.lines.map((line, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{line.productId}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{line.requestedQty}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-slate-600">{line.reservedQty}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{line.uom || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {['partialShipment', 'processOutbound'].includes(action.kind) && stockReady && action.lineStockInfo?.length > 0 && <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="text-[12px] font-bold text-slate-700 mb-2">{action.kind === 'partialShipment' ? '部分发货产品明细' : '发货产品明细'}</div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[12px]">
                <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">产品编码</th>
                    <th className="px-3 py-2.5 font-medium">产品名称</th>
                    <th className="px-3 py-2.5 font-medium">规格</th>
                    <th className="px-3 py-2.5 font-medium text-center">订单数量</th>
                    <th className="px-3 py-2.5 font-medium text-center">已发货</th>
                    <th className="px-3 py-2.5 font-medium text-center">剩余待发</th>
                    <th className="px-3 py-2.5 font-medium text-center">实际可用</th>
                    <th className="px-3 py-2.5 font-medium text-center">单位</th>
                    <th className="px-3 py-2.5 font-medium text-center">本次发货</th>
                    <th className="px-3 py-2.5 font-medium text-right">单价</th>
                  </tr>
                </thead>
                <tbody>
                  {action.lineStockInfo.map((ls, idx) => {
                    if (Number(ls.remainingQty ?? ls.qty) <= 0) return null;
                    const isShippable = ls.availQty > 0;
                    const fieldId = stockFieldId(ls);
                    const maxQty = Math.min(ls.remainingQty ?? ls.qty, ls.availQty);
                    const rawVal = values[fieldId];
                    const currentVal = (rawVal == null || rawVal === '') ? NaN : Number(rawVal);
                    const isValid = isShippable && !isNaN(currentVal) && currentVal > 0 && currentVal <= maxQty;
                    return <tr key={idx} className={`border-b border-slate-100 last:border-0 ${!isShippable ? 'bg-slate-50/50' : ''}`}>
                      <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{ls.productId}</td>
                      <td className="px-3 py-2.5 text-slate-800">{ls.productName || '-'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{(() => { const line = action.record?.lines?.find(l => l.productId === ls.productId); return line?.spec || '-'; })()}</td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{ls.qty}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-500">{ls.shippedQty ?? 0}</td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-700">{ls.remainingQty ?? ls.qty}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-500">
                        {ls.availQty}
                        {ls.shortage > 0 && <span className="text-rose-500 ml-1">(缺口{ls.shortage}{ls.allowPartialShipment === false ? ' · 禁止分批' : ''})</span>}
                        {ls.factVersion != null && <div className="text-[10px] text-slate-400">v{ls.factVersion}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{ls.uom || ls.unit || action.record?.lines?.find(l => l.productId === ls.productId)?.unit || '件'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {isShippable
                          ? <div className="flex flex-col items-center">
                              <input type="number" aria-label={`${ls.productId} 本次发货数量`} min={0.000001} max={maxQty} step={0.000001} value={values[fieldId] ?? maxQty} onChange={(event) => { const raw = event.target.value; if (raw === '') { setValues((current) => ({ ...current, [fieldId]: '' })); return; } const v = Number(raw); if (!Number.isFinite(v)) return; setValues((current) => ({ ...current, [fieldId]: v < 0 ? '0' : v > maxQty ? String(maxQty) : raw })); }} className={`w-20 h-8 rounded-lg border px-2 text-right font-mono text-[13px] outline-none ${!isValid ? 'border-rose-300 bg-rose-50' : 'border-slate-200 focus:border-blue-500'}`} />
                              {!isValid && <span className="text-[10px] text-rose-500 mt-0.5 whitespace-nowrap">大于0且不超过{maxQty}</span>}
                            </div>
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">{(() => { const line = action.record?.lines?.find(l => l.productId === ls.productId); return line?.unitPrice ? '¥' + Number(line.unitPrice).toFixed(2) : '-'; })()}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>}
          {action.kind === 'productionRequest' && action.lineStockInfo?.length > 0 && <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="text-[12px] font-bold text-slate-700 mb-2">
              {action.record?.formalTask ? '服务端复核生产缺口' : '缺口产品生产数量'}
              <span className="text-slate-400 font-normal">{action.record?.formalTask ? '（正式任务按剩余待发量和选定仓库真实可用量计算，不能手工改大）' : '（默认为缺口数，如需更多可手动调整，不可少于缺口数）'}</span>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#fafafa] text-slate-500 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">产品编码</th>
                    <th className="px-3 py-2.5 font-medium">产品名称</th>
                    <th className="px-3 py-2.5 font-medium">规格</th>
                    <th className="px-3 py-2.5 font-medium text-center">订单数量</th>
                    <th className="px-3 py-2.5 font-medium text-center">实际可用</th>
                    <th className="px-3 py-2.5 font-medium text-center">缺口</th>
                    <th className="px-3 py-2.5 font-medium text-center">单位</th>
                    <th className="px-3 py-2.5 font-medium text-center">需生产</th>
                  </tr>
                </thead>
                <tbody>
                  {action.lineStockInfo.filter(ls => ls.shortage > 0).map((ls, idx) => {
                    const fieldId = `prodQty_${ls.productId}`;
                    const defaultVal = ls.shortage;
                    const currentVal = Number(values[fieldId] ?? defaultVal);
                    const isValid = currentVal >= ls.shortage;
                    return <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{ls.productId}</td>
                      <td className="px-3 py-2.5 text-slate-800">{ls.productName || '-'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{(() => { const line = action.record?.lines?.find(l => l.productId === ls.productId); return line?.spec || '-'; })()}</td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{ls.qty}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-500">{ls.availQty}</td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-rose-600">{ls.shortage}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{(() => { const si = action.record?.lines?.find(l => l.productId === ls.productId); return si?.unit || '件'; })()}</td>
                      <td className="px-3 py-2.5 text-center">
                        {action.record?.formalTask ? (
                          <span className="font-mono font-bold text-slate-800">{ls.shortage}</span>
                        ) : (
                          <>
                            <input type="number" min={ls.shortage} step={1} value={values[fieldId] ?? defaultVal} onChange={(event) => { let v = Number(event.target.value); setValues((current) => ({ ...current, [fieldId]: String(v) })); }} className={`w-20 h-8 rounded-lg border px-2 text-right font-mono text-[13px] outline-none ${!isValid ? 'border-rose-300 bg-rose-50' : 'border-slate-200 focus:border-blue-500'}`} />
                            {!isValid && <div className="text-[10px] text-rose-500 mt-0.5">不可少于{ls.shortage}</div>}
                          </>
                        )}
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>}
          {action.quantityFields?.length > 0 && !["partialShipment","processOutbound"].includes(action.kind) && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="text-[12px] font-bold text-slate-700">{action.quantityTitle || '本次发货数量'}</div>
            {action.quantityFields.map((field) => <label key={field.id} className="grid grid-cols-[1fr_150px] items-center gap-4 text-[12px]">
              <span className="min-w-0 text-slate-600">{field.label}{field.max != null && <span className="ml-2 text-[11px] text-slate-400">最多 {field.max} {field.uom}</span>}</span>
              <input type="number" min="0.000001" max={field.max} step="any" value={values[field.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-right font-mono text-[13px] outline-none focus:border-blue-500" />
            </label>)}
          </div>}
          {action.productionFields?.length > 0 && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="text-[12px] font-bold text-slate-700">生产数量（默认为缺口数，可调整）</div>
            {action.productionFields.map((field) => <label key={field.id} className="grid grid-cols-[1fr_150px] items-center gap-4 text-[12px]">
              <span className="min-w-0 text-slate-600">{field.label}{field.min != null && <span className="ml-2 text-[11px] text-slate-400">最少 {field.min} {field.uom}</span>}</span>
              <input type="number" min={field.min || 1} step="any" value={values[field.id] ?? field.value ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-right font-mono text-[13px] outline-none focus:border-blue-500" />
            </label>)}
          </div>}
          {action.dateFields?.length > 0 && <div className="mt-3 space-y-3">
            {action.dateFields.map((field) => <label key={field.id} className="grid grid-cols-[1fr_150px] items-center gap-4 text-[12px]">
              <span className="text-slate-600">{field.label}</span>
              <input type="date" min={field.min} value={values[field.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 font-mono text-[12px] outline-none focus:border-blue-500" />
            </label>)}
          </div>}
          {action.note && !(action.kind === 'processOutbound' && !missingWarehouse) && <div className="mt-4 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl px-4 py-3 text-[12px] leading-relaxed font-medium">{action.note}</div>}
        </div>
        <div className="p-4 shrink-0 border-t border-slate-100 flex flex-wrap justify-end gap-3 bg-slate-50/50">
          <button disabled={submitting} onClick={onCancel} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl disabled:cursor-not-allowed disabled:opacity-50">{action.readOnly ? '关闭' : '取消'}</button>
          {!action.readOnly && (
            <div className="flex items-center gap-3">
              {isPartialShipmentMode && onGapProduction && (
                <button
                  disabled={submitting || isSwitchingWarehouse}
                  onClick={() => onGapProduction(values, selectedWarehouseId)}
                  className="px-5 py-2 text-[13px] font-bold text-amber-700 bg-white border border-amber-200 hover:bg-amber-50 rounded-xl flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Factory size={16}/> 去生产
                </button>
              )}
              <button
                disabled={confirmDisabled || isSwitchingWarehouse}
                onClick={handleConfirm}
                className={`px-5 py-2 text-[13px] font-bold text-white rounded-xl flex items-center gap-1.5 ${missingWarehouse ? 'cursor-not-allowed opacity-60' : 'hover:brightness-95'} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMap[isProductionOnlyMode ? 'amber' : tone] || buttonMap.blue}`}
              >
                <Check size={16}/> {submitting ? '提交中...' : confirmLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const formatOutboundProductSummary = (row) => {
  const formalLines = row?.formalTask?.lines;
  if (formalLines && formalLines.length > 0) {
    return formalLines.map((line) => {
      const stockItem = inv_stockData.find(s => s.id === line.productId);
      const name = stockItem?.name || '';
      return name ? `${line.productId} ${name}` : line.productId;
    }).join('；');
  }
  const localLines = row?.lines;
  if (localLines && localLines.length > 1) {
    return localLines.map((line) => {
      const stockItem = inv_stockData.find(s => s.id === line.productId);
      const name = stockItem?.name || line.productName || '';
      return name ? `${line.productId} ${name}` : line.productId;
    }).join('；');
  }
  if (localLines && localLines.length === 1) {
    const line = localLines[0];
    const stockItem = inv_stockData.find(s => s.id === line.productId);
    const name = stockItem?.name || line.productName || '';
    return name ? `${line.productId} ${name}` : (line.productId || line.productName || '-');
  }
  const productId = row?.productId;
  const item = row?.item;
  if (item && productId && item.startsWith(productId)) {
    return item;
  }
  if (productId && item && productId !== item) {
    return `${productId} ${item}`;
  }
  return item || productId || '-';
};

// 下载出库凭证：生成 HTML 文件并触发下载
const downloadOutboundVoucher = (row) => {
  const voucherDate = new Date().toISOString().slice(0, 10);
  const shippedAt = row.shippedAt ? new Date(row.shippedAt).toLocaleString('zh-CN') : voucherDate;
  const lines = row.lines || [];
  const linesHtml = lines.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
        <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:8px;text-align:left;">产品编码</th>
          <th style="padding:8px;text-align:left;">产品名称</th>
          <th style="padding:8px;text-align:center;">数量</th>
          <th style="padding:8px;text-align:center;">单位</th>
          <th style="padding:8px;text-align:right;">单价</th>
          <th style="padding:8px;text-align:right;">金额</th>
        </tr></thead>
        <tbody>
          ${lines.map(l => `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px;font-family:monospace;">${l.productId || '-'}</td>
            <td style="padding:8px;">${l.productName || '-'}</td>
            <td style="padding:8px;text-align:center;font-family:monospace;">${l.qty || l.requestedQty || '-'}</td>
            <td style="padding:8px;text-align:center;">${l.unit || l.uom || '件'}</td>
            <td style="padding:8px;text-align:right;">${l.unitPrice ? '¥' + Number(l.unitPrice).toFixed(2) : '-'}</td>
            <td style="padding:8px;text-align:right;font-family:monospace;">${l.unitPrice ? '¥' + (Number(l.qty || 0) * Number(l.unitPrice)).toFixed(2) : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : `<p style="margin-top:12px;color:#64748b;">产品：${row.item || '-'}　数量：${row.qty || '-'} ${row.unit || ''}</p>`;
  const shipmentDetailsHtml = row.shipmentDetails && row.shipmentDetails.length > 0
    ? `<div style="margin-top:12px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;">
        <strong>已发明细：</strong>${row.shipmentDetails.map(s => `${s.productId}×${s.shipQty}`).join('、')}
      </div>`
    : '';
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>出库凭证_${row.id}_${voucherDate}</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#1e293b;}
    .header{text-align:center;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px;}
    .header h1{font-size:24px;color:#1e40af;margin:0;}
    .header p{font-size:12px;color:#64748b;margin:4px 0 0;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}
    .info-item{background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e2e8f0;}
    .info-label{font-size:11px;color:#94a3b8;margin-bottom:2px;}
    .info-value{font-size:14px;font-weight:bold;color:#1e293b;}
    .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;}
    </style></head><body>
    <div class="header"><h1>出库凭证</h1><p>凭证生成日期：${voucherDate}</p></div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">出库单号</div><div class="info-value">${row.id}</div></div>
      <div class="info-item"><div class="info-label">来源订单</div><div class="info-value">${row.source || '-'}</div></div>
      <div class="info-item"><div class="info-label">业务类型</div><div class="info-value">${row.type || '销售发货'}</div></div>
      <div class="info-item"><div class="info-label">出库状态</div><div class="info-value">${row.status || '已出库'}</div></div>
      <div class="info-item"><div class="info-label">操作人</div><div class="info-value">${row.operator || '-'}</div></div>
      <div class="info-item"><div class="info-label">发货时间</div><div class="info-value">${shippedAt}</div></div>
    </div>
    ${linesHtml}${shipmentDetailsHtml}
    <div class="footer">本凭证由工业AI平台自动生成，仅供出库确认参考。</div>
    </body></html>`;
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `出库凭证_${row.id}_${voucherDate}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }
};

type OutboundStockState = {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'missing-product';
  warehouseId?: string;
  factVersions?: Record<string, number>;
  error?: string;
};

const InventoryManagement = ({ businessFlow, onBusinessFlowAction, onNavigateModule, currentTenant, currentUser }) => {
  const [activeTab, setActiveTab] = useState(() => resolveInventoryTab(window.location.search));
  const [requestedSalesOrderId, setRequestedSalesOrderId] = useState(() => resolveSalesOutboundOrderId(window.location.search));
  const [outboundSourceSearch, setOutboundSourceSearch] = useState('');
  const outboundSourceSearchRef = useRef<HTMLInputElement>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => resolveInventoryWarehouseId(window.location.search));
  const [, setStockData] = useState(inv_stockData);
  const [inboundData, setInboundData] = useState(inv_inboundData);
  const formalContext = useMemo(() => currentUser?.accessToken ? ({ tenantId: currentTenant.id, accessToken: currentUser.accessToken }) : null, [currentTenant?.id, currentUser?.accessToken]);
  const formalInventory = useFormalInventory(formalContext);
  // 后端会话建立后清除库存主数据 localStorage 原型数据
  useEffect(() => {
    if (formalContext?.accessToken) {
      localStorage.removeItem(`industrial-ai-inventory-master:v1:${currentTenant?.id}`);
    }
  }, [formalContext?.accessToken, currentTenant?.id]);
  const stockData = formalInventory.stockData;
  const warehouseList = formalInventory.warehouses.filter(warehouse => warehouse.status === 'active');
  const warehouseLoadError = formalInventory.error;
  const loadOutboundWarehouses = formalInventory.refresh;

  // 出库管理的可用量统一取库存管理-产品中的"实际可用"(availQty)
  const resolveOutboundAvailQty = (row) => {
    if (!row) return 0;
    const itemId = row.productId || '';
    const itemName = row.item || '';
    const extracted = !itemId && itemName ? (itemName.split(/\s+/)[0] || '').trim() : '';
    const effId = itemId || extracted;
    let m = effId ? stockData.find(s => s.id === effId) : null;
    if (!m && itemName) m = stockData.find(s => itemName.indexOf(s.name) >= 0 || s.name === itemName);
    return m ? Number(m.availQty ?? 0) : Number(row.availableQty ?? 0);
  };
  // 按产品明细逐行判断库存，返回每个产品的库存状态
  const resolveOutboundLineStockStatus = (row) => {
    if (row?.formalTask?.lines?.length) {
      const lineStatuses = row.formalTask.lines.map(line => {
        const needQty = Number(line.requestedQty || 0);
        const shippedQty = Number(line.postedQty || 0);
        const remainingQty = Math.max(0, needQty - shippedQty);
        const availQty = Math.max(0, Number(line.reservedQty || 0) - shippedQty);
        return {
          productId: line.productId,
          productName: line.productName || '',
          qty: needQty,
          availQty,
          shortage: Number(line.shortageQty || 0),
          shippedQty,
          remainingQty,
        };
      });
      const activeStatuses = lineStatuses.filter(line => line.remainingQty > 0);
      return {
        lineStatuses,
        totalShortage: activeStatuses.reduce((total, line) => total + line.shortage, 0),
        allSufficient: activeStatuses.every(line => line.shortage === 0),
        allInsufficient: activeStatuses.length > 0 && activeStatuses.every(line => line.availQty === 0),
        partialSufficient: activeStatuses.some(line => line.availQty > 0)
          && activeStatuses.some(line => line.shortage > 0),
        hasRemaining: activeStatuses.length > 0,
      };
    }
    const lines = row?.lines || [];
    if (lines.length === 0) {
      const availQty = resolveOutboundAvailQty(row);
      const qty = Number(row?.qty || 0);
      const shippedQty = Number(row?.shippedQty || 0);
      const remainingQty = Math.max(0, qty - shippedQty);
      const shortage = Math.max(0, remainingQty - availQty);
      return {
        lineStatuses: [{ productId: row?.productId, productName: row?.item, qty, availQty, shortage, shippedQty, remainingQty }],
        totalShortage: shortage,
        allSufficient: shortage === 0,
        allInsufficient: shortage > 0,
        partialSufficient: false,
      };
    }
    const checkLines = lines.length > 0 ? lines : (row?.formalTask?.lines || []);
    const lineStatuses = checkLines.map(line => {
      const pid = line.productId || '';
      const stockItem = stockData.find(s => s.id === pid);
      const availQty = Number(stockItem?.availQty ?? 0);
      const needQty = Number(line.qty || line.requestedQty || 0);
      const shippedQty = Number(line.shippedQty || 0);
      const remainingQty = Math.max(0, needQty - shippedQty);
      const shortage = Math.max(0, remainingQty - availQty);
      return { productId: pid, productName: line.productName || '', qty: needQty, availQty, shortage, shippedQty, remainingQty };
    });
    // 只统计仍需发货的行（remainingQty > 0）来判断库存状态
    const activeStatuses = lineStatuses.filter(l => l.remainingQty > 0);
    const totalShortage = activeStatuses.reduce((sum, l) => sum + l.shortage, 0);
    const sufficientCount = activeStatuses.filter(l => l.shortage === 0).length;
    const hasShippable = activeStatuses.some(l => l.availQty > 0);
    return {
      lineStatuses,
      totalShortage,
      allSufficient: activeStatuses.length === 0 || (totalShortage === 0 && hasShippable),
      allInsufficient: activeStatuses.length > 0 && (sufficientCount === 0 || !hasShippable),
      partialSufficient: hasShippable && sufficientCount > 0 && sufficientCount < activeStatuses.length,
      hasRemaining: activeStatuses.length > 0,
    };
  };

  const readLocalOutboundRows = () => {
    const localTasks = [
      ...restoreShippedSalesOutbounds(window.localStorage, currentTenant?.id),
    ];
    return [...localTasks, ...inv_outboundData.filter((seed) => !localTasks.some((task) =>
      task.id === seed.id || (seed.type === '销售发货' && task.source === seed.source)))];
  };
  const [outboundData, setOutboundData] = useState(() => readLocalOutboundRows());
  const filteredOutboundData = useMemo(() => {
    const keyword = outboundSourceSearch.trim().toLowerCase();
    return outboundData.filter(row => !keyword || String(row.source || '').toLowerCase().includes(keyword));
  }, [outboundData, outboundSourceSearch]);
  const warehouseName = (id) => resolveWarehouse(formalInventory.warehouses, id)?.name || id;

  const getOutboundSourceLines = (row) => {
    if (row?.formalTask?.lines?.length) return row.formalTask.lines;
    if (row?.lines?.length) return row.lines;
    const productId = row?.productId || String(row?.item || '').match(/[A-Z]{2,}\d+/)?.[0] || '';
    if (!productId) return [];
    return [{
      id: `${row?.id || row?.taskId || 'local'}:${productId}`,
      orderLineId: `${row?.id || row?.taskId || 'local'}:${productId}`,
      productId,
      productName: row?.item,
      requestedQty: row?.qty || 0,
      postedQty: row?.shippedQty || 0,
      reservedQty: 0,
      uom: row?.unit || '件',
      unit: row?.unit || '件',
      unitPrice: row?.unitPrice,
      allowPartialShipment: true,
    }];
  };

  const buildOutboundLineStock = (row, facts = [], selectedWarehouseId?) => {
    const task = row.formalTask || (row.shipmentRequestId ? row : undefined);
    if (task) return formalShipmentStock({
      ...task,
      warehouseId: resolveWarehouse(formalInventory.warehouses, task.warehouseId)?.id || task.warehouseId,
    }, facts, selectedWarehouseId);
    const factMap = new Map((facts || []).map(fact => [fact.productId, fact]));
    return getOutboundSourceLines(row).map(line => {
      const productId = line.productId;
      const needQty = Number(line.qty ?? line.requestedQty ?? 0);
      const shippedQty = Number(line.shippedQty ?? line.postedQty ?? 0);
      const remainingQty = Math.max(0, needQty - shippedQty);
      const fact = factMap.get(productId);
      const factQty = fact ? Number(fact.fulfillableQty) : 0;
      const reservedRemaining = Math.max(0, Number(line.reservedQty ?? 0) - shippedQty);
      const availQty = reservedRemaining > 0 ? reservedRemaining : factQty;
      const shortage = Math.max(0, remainingQty - availQty);
      const sourceLine = row?.lines?.find(item => item.productId === productId);
      return {
        lineId: line.id,
        orderLineId: line.orderLineId,
        productId,
        productName: line.productName || sourceLine?.productName || row?.item || productId,
        qty: needQty,
        availQty,
        shortage,
        shippedQty,
        remainingQty,
        uom: line.uom || sourceLine?.unit || row?.unit || '件',
        unit: line.uom || sourceLine?.unit || row?.unit || '件',
        unitPrice: sourceLine?.unitPrice ?? line.unitPrice,
        factVersion: fact?.factVersion,
        warehouseId: fact?.warehouseId,
        allowPartialShipment: line.allowPartialShipment,
        promisedDate: line.promisedDate,
        sourceLineRevision: line.sourceLineRevision,
      };
    });
  };

  const outboundStockSummary = (lineStockInfo) => {
    const active = (lineStockInfo || []).filter(item => Number(item.remainingQty) > 0);
    const shippable = active.filter(item => Number(item.availQty) > 0);
    const shortage = active.filter(item => Number(item.shortage) > 0);
    const allowPartial = !active.length || active.every(item => item.allowPartialShipment !== false);
    return { active, shippable, shortage, allowPartial };
  };

  const mapFormalTask = (task) => {
    const requestedQty = task.lines.reduce((total, line) => total + Number(line.requestedQty), 0);
    const reservedQty = task.lines.reduce((total, line) => total + Number(line.reservedQty), 0);
    const shortageQty = task.lines.reduce((total, line) => total + Number(line.shortageQty), 0);
    const status = mapFormalShipmentStatus(task);
    return {
      id: task.id,
      taskId: task.id,
      outboundId: task.outboundId,
      formalTask: task,
      type: '销售发货',
      source: task.salesOrderNo,
      salesOrderId: task.salesOrderId,
      item: task.lines.map((line) => line.productId).join('、'),
      productId: task.lines[0]?.productId,
      qty: requestedQty,
      unit: task.lines[0]?.uom || 'PCS',
      warehouse: task.warehouseId,
      factoryResourceId: task.factoryResourceId,
      shippedQty: task.lines.reduce((total, line) => total + Number(line.postedQty || 0), 0),
      availableQty: task.lines.reduce((total, line) => total + Math.max(0, Number(line.reservedQty || 0) - Number(line.postedQty || 0)), 0),
      shortageQty,
      inventoryFactVersion: task.inventoryFactVersion,
      productionDemandId: task.lines.find((line) => line.productionDemandId)?.productionDemandId,
      date: task.updatedAt?.slice(0, 16).replace('T', ' '),
      status,
      operator: '正式履约服务',
    };
  };

  const refreshFormalTasks = async () => {
    if (!formalContext) return;
    const formalSalesOrderId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedSalesOrderId || '')
      ? requestedSalesOrderId
      : undefined;
    const response = await listFulfillmentShipmentTasks(formalContext, formalSalesOrderId);
    const formal = response.items.map(mapFormalTask);
    setOutboundData((previous) => [...formal, ...previous.filter((item) => !item.formalTask && !formal.some((serverTask) =>
      serverTask.id === item.id || (item.type === '销售发货' && serverTask.source === item.source)))]);
    return response.items;
  };

  useEffect(() => {
    refreshFormalTasks().catch((error) => showToast('正式发货任务加载失败：' + (error instanceof Error ? error.message : '请稍后重试'), 'error'));
  }, [formalContext?.tenantId, formalContext?.accessToken, requestedSalesOrderId]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const tenantId = (event as CustomEvent<{ tenantId?: string }>).detail?.tenantId;
      if (tenantId && tenantId !== currentTenant?.id) return;
      setOutboundData(previous => [...readLocalOutboundRows(), ...previous.filter(item => item.formalTask)]);
      refreshFormalTasks().catch(() => {});
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('sales-fulfillment-changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('sales-fulfillment-changed', refresh);
    };
  }, [formalContext?.tenantId, formalContext?.accessToken, currentTenant?.id, requestedSalesOrderId]);

  const hasPendingFormalTask = outboundData.some(row => row.formalTask && row.formalTask.workflowStatus !== 'COMPLETED');

  useEffect(() => {
    if (!formalContext || activeTab !== 'outbound' || !hasPendingFormalTask) return;
    const timer = window.setInterval(() => {
      refreshFormalTasks().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeTab, hasPendingFormalTask, formalContext?.tenantId, formalContext?.accessToken]);

  useEffect(() => {
    const syncInventoryTab = () => {
      setActiveTab(resolveInventoryTab(window.location.search));
      setRequestedSalesOrderId(resolveSalesOutboundOrderId(window.location.search));
      setSelectedWarehouseId(resolveInventoryWarehouseId(window.location.search));
    };
    window.addEventListener('popstate', syncInventoryTab);
    return () => window.removeEventListener('popstate', syncInventoryTab);
  }, []);

  useEffect(() => {
    setOutboundData((previous) => [
      ...readLocalOutboundRows(),
      ...previous.filter((item) => item.formalTask),
    ]);
  }, [currentTenant?.id]);
  const [recordModal, setRecordModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionReview, setActionReview] = useState(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [outboundStockState, setOutboundStockState] = useState<OutboundStockState>({ status: 'idle' });
  const outboundStockRevision = useRef(0);
  useEffect(() => {
    ++outboundStockRevision.current;
    setOutboundStockState({ status: 'idle' });
    return () => { ++outboundStockRevision.current; };
  }, [formalContext?.tenantId, formalContext?.accessToken, actionReview?.record?.id]);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 3000);
  };

  const loadOutboundStock = async (row, warehouseId) => {
    const request = ++outboundStockRevision.current;
    if (!warehouseId) {
      setOutboundStockState({ status: 'idle' });
      return [];
    }
    if (!formalContext) throw new Error('请先登录正式会话后再读取仓库库存');
    warehouseId = resolveWarehouse(formalInventory.warehouses, warehouseId)?.id || warehouseId;
    setOutboundStockState({ status: 'loading', warehouseId });
    setActionReview(prev => prev ? { ...prev, lineStockInfo: [] } : prev);
    const productIds = [...new Set(getOutboundSourceLines(row).map(line => line.productId).filter(Boolean))]
      .filter((productId): productId is string => Boolean(productId));
    let facts;
    try {
      facts = await inventoryApi.getAvailability(formalContext, warehouseId, productIds);
    } catch (error) {
      if (request !== outboundStockRevision.current) return [];
      const message = error instanceof Error ? error.message : '仓库库存加载失败，请重试';
      setOutboundStockState({ status: 'error', warehouseId, error: message });
      showToast(message, 'error');
      return [];
    }
    if (request !== outboundStockRevision.current) return [];
    const lineStockInfo = buildOutboundLineStock(row, facts, warehouseId);
    const incompatibleLines = lineStockInfo.filter(item => item.unitMismatch);
    if (incompatibleLines.length > 0) {
      const message = incompatibleLines.map(item =>
        `${item.productId}：订单单位 ${item.uom}，库存单位 ${item.inventoryUom}，请核对单位换算`,
      ).join('；');
      setActionReview(prev => prev ? { ...prev, lineStockInfo } : prev);
      setOutboundStockState({ status: 'error', warehouseId, error: message });
      return lineStockInfo;
    }
    const missingProductIds = [...new Set(lineStockInfo
      .filter(item => item.factVersion == null || item.warehouseId == null)
      .map(item => item.productId)
      .filter(Boolean))];
    if (lineStockInfo.length > 0 && missingProductIds.length === lineStockInfo.length) {
      const message = `${warehouseName(warehouseId)}未查询到库存记录：${missingProductIds.join('、')}`;
      setActionReview(prev => prev ? { ...prev, lineStockInfo } : prev);
      setOutboundStockState({
        status: 'missing-product',
        warehouseId,
        factVersions: Object.fromEntries((facts || []).map(fact => [fact.productId, fact.factVersion])),
        error: message,
      });
      showToast(message, 'warning');
      return lineStockInfo;
    }
    if (missingProductIds.length > 0) {
      showToast(`${warehouseName(warehouseId)}未查询到库存记录：${missingProductIds.join('、')}，仅可部分发货或申请生产`, 'warning');
    }
    setActionReview(prev => prev ? { ...prev, lineStockInfo } : prev);
    setOutboundStockState({
      status: 'ready',
      warehouseId,
      factVersions: Object.fromEntries((facts || []).map(fact => [fact.productId, fact.factVersion])),
    });
    return lineStockInfo;
  };

  const submitFormalGapProduction = async (row, warehouseId, precheckedTask?: FulfillmentShipmentTask) => {
    if (!row?.formalTask) return false;
    if (!formalContext) throw new Error('请先登录正式会话');
    if (!warehouseId) throw new Error('请先选择发货仓库');
    setIsActionSubmitting(true);
    try {
      let task = precheckedTask || row.formalTask;
      if (!precheckedTask && ['UNCHECKED', 'SHORTAGE', 'RECHECKING', 'PARTIALLY_RESERVED'].includes(task.availabilityStatus)) {
        const expectedFactVersions = Object.entries(outboundStockState.factVersions ?? {})
          .map(([productId, factVersion]) => ({ productId, factVersion: Number(factVersion) }));
        const reserved = await checkAndReserveShipmentTask(
          formalContext,
          task,
          warehouseId,
          expectedFactVersions,
        );
        task = reserved.task;
        const mapped = mapFormalTask(task);
        setOutboundData(previous => previous.map(item => item.taskId === mapped.taskId ? mapped : item));
      }
      if (task.replenishmentStatus !== 'REQUIRED') {
        showToast('服务端复核后当前仓库库存已满足，不需要创建生产需求', 'success');
        setActionReview(null);
        return true;
      }
      const result = await createProductionRequestForTask(formalContext, task);
      const mapped = mapFormalTask(result.task);
      setOutboundData(previous => previous.map(item => item.taskId === mapped.taskId ? mapped : item));
      const demandLabels = (result.demands || []).map(item => item.code || item.id);
      showToast(
        result.restored || !demandLabels.length
          ? '缺口生产需求已存在，已定位生产主计划'
          : `缺口生产需求已创建：${demandLabels.join('、')}`,
        'warning',
      );
      setActionReview(null);
      onNavigateModule?.('生产管理', {
        query: { production: 'plan', focusMps: demandLabels[0] || mapped.productionDemandId || mapped.taskId },
      });
      return true;
    } catch (error) {
      showToast('缺口生产申请失败：' + (error instanceof Error ? error.message : '请稍后重试'), 'error');
      return false;
    } finally {
      setIsActionSubmitting(false);
    }
  };

  useEffect(() => {
    if (!businessFlow) return;
    if (isLinkedFlowAtLeast(businessFlow, 'stockCheck')) {
      setStockData(prev => prev.map(item => item.id === 'FG001' ? {
        ...item,
        stockQty: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? businessFlow.qty : (businessFlow.availableStock ?? 0),
        lockQty: isLinkedFlowAtLeast(businessFlow, 'delivery') ? 0 : Math.min(businessFlow.qty, businessFlow.availableStock ?? 0),
        availQty: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? businessFlow.qty : 0,
        status: isLinkedFlowAtLeast(businessFlow, 'finishedInbound') ? '正常' : '低库存'
      } : item));
    }
    if (isLinkedFlowAtLeast(businessFlow, 'materialInbound')) {
      const materialInbound = {
        id: businessFlow.purchaseReceipt?.receiptNo || 'IN-LINK-MAT-001',
        type: '采购入库',
        source: businessFlow.purchaseOrder?.orderNo || 'PO-LINK-001',
        item: businessFlow.purchaseReceipt?.materialId || 'AI算力芯片',
        qty: Number(businessFlow.purchaseReceipt?.receivedQty || businessFlow.qty * 2),
        date: businessFlow.purchaseReceipt?.receivedAt?.slice(0, 16).replace('T', ' ') || '2026-06-23 10:30',
        status: '已入库',
        operator: businessFlow.purchaseReceipt ? '正式采购入库服务' : '系统联动'
      };
      setInboundData(prev => prev.some(item => item.id === materialInbound.id) ? prev.map(item => item.id === materialInbound.id ? materialInbound : item) : [materialInbound, ...prev]);
      setStockData(prev => prev.map(item => item.id === 'RM201' ? { ...item, stockQty: Math.max(item.stockQty, 1500 + materialInbound.qty), availQty: Math.max(item.availQty, 1000 + materialInbound.qty), status: '正常' } : item));
    }
    if (isLinkedFlowAtLeast(businessFlow, 'finishedInbound')) {
      const finishedInbound = {
        id: 'IN-LINK-FG-001',
        type: '生产入库',
        source: 'WO-LINK-001',
        item: '工业控制器顶配版',
        qty: businessFlow.qty,
        date: '2026-06-28 16:20',
        status: '已入库',
        operator: '系统联动'
      };
      setInboundData(prev => prev.some(item => item.id === finishedInbound.id) ? prev.map(item => item.id === finishedInbound.id ? finishedInbound : item) : [finishedInbound, ...prev]);
    }
    if (isLinkedFlowAtLeast(businessFlow, 'delivery')) {
      const linkedOutbound = {
        id: 'OUT-LINK-SO-001',
        type: '销售发货',
        source: businessFlow.orderId,
        item: '工业控制器顶配版',
        qty: businessFlow.qty,
        date: '2026-06-29 09:30',
        status: '已出库',
        operator: '系统联动'
      };
      setOutboundData(prev => prev.some(item => item.id === linkedOutbound.id) ? prev.map(item => item.id === linkedOutbound.id ? linkedOutbound : item) : [linkedOutbound, ...prev]);
      setStockData(prev => prev.map(item => item.id === 'FG001' ? { ...item, lockQty: 0, availQty: 0, status: '正常' } : item));
    }
  }, [businessFlow?.currentStep, requestedSalesOrderId]);

  const requestedOutbound = requestedSalesOrderId
    ? outboundData.find((row) => row.source === requestedSalesOrderId || row.salesOrderId === requestedSalesOrderId)
    : null;

  const handleInventoryFlowAction = async (action) => {
    if (action === 'shipSales' && businessFlow?.orderId) {
      if (!formalContext) {
        showToast('请先登录正式会话', 'error');
        return;
      }
      try {
        const response = await listFulfillmentShipmentTasks(formalContext, businessFlow.orderId);
        let task = response.items[0];
        if (!task) throw new Error('未找到原销售发货任务');
        let outboundId = task.outboundId;
        if (task.availabilityStatus !== 'RESERVED') {
          const reserved = await checkAndReserveShipmentTask(formalContext, task);
          task = reserved.task;
          outboundId = reserved.outbound?.id || task.outboundId;
          if (task.availabilityStatus !== 'RESERVED') throw new Error('成品库存重新校验后仍未完全预留');
        }
        if (!outboundId) throw new Error('重新校验通过但未生成销售出库单');
        const outbound = await getFulfillmentOutbound(formalContext, outboundId);
        await postFulfillmentOutbound(formalContext, outbound);
        await refreshFormalTasks();
        onBusinessFlowAction?.('formalSalesShipped');
        showToast(`销售出库单 [${outbound.id}] 已正式过账`, 'success');
      } catch (error) {
        showToast(error instanceof Error ? `销售出库失败：${error.message}` : '销售出库失败', 'error');
      }
      return;
    }
    onBusinessFlowAction?.(action);
  };

  const navigateInventoryTab = (tab) => {
    setActiveTab(tab);
    if (tab !== 'outbound') setRequestedSalesOrderId('');
    setSelectedWarehouseId('');
    const nextUrl = createInventoryTabUrl(window.location, tab);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.pushState({}, '', nextUrl);
  };

  const selectInventoryWarehouse = (warehouseId) => {
    setActiveTab('warehouses');
    setSelectedWarehouseId(warehouseId);
    const nextUrl = warehouseId
      ? createInventoryWarehouseUrl(window.location, warehouseId)
      : createInventoryTabUrl(window.location, 'warehouses');
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.pushState({}, '', nextUrl);
  };

  const handleManualInbound = () => {
    setRecordModal({
      type: 'inbound',
      mode: 'create',
      record: {
        id: `IN-${Date.now().toString().slice(-8)}`,
        type: '手工入库',
        source: 'MANUAL',
        item: 'AI算力芯片',
        qty: 100,
        date: '2026-07-03 09:00',
        status: '待质检',
        operator: '王仓管'
      }
    });
  };

  const isSameStockRecord = (left, right) => left.id === right.id
    && (right.warehouseId ? left.warehouseId === right.warehouseId : left.warehouse === right.warehouse);

  const saveStock = (data) => {
    setStockData(prev => prev.map(row => isSameStockRecord(row, data) ? { ...row, ...data } : row));
    showToast(`库存台账 [${data.id}] 已更新`, 'success');
  };

  const saveInbound = (data) => {
    const exists = inboundData.some(row => row.id === data.id);
    setInboundData(prev => exists ? prev.map(row => row.id === data.id ? { ...row, ...data } : row) : [data, ...prev]);
    showToast(`入库单 [${data.id}] 已保存`, 'success');
  };

  const saveOutbound = (data) => {
    setOutboundData(prev => prev.map(row => row.id === data.id ? { ...row, ...data } : row));
    showToast(`出库单 [${data.id}] 已更新`, 'success');
  };

  const deleteRecord = () => {
    if (!deleteTarget) return;
    const { type, record } = deleteTarget;
    if (type === 'stock') {
      setStockData(prev => prev.filter(row => !isSameStockRecord(row, record)));
      showToast(`物料 [${record.id}] 已从台账移除`, 'success');
    }
    if (type === 'inbound') {
      setInboundData(prev => prev.filter(row => row.id !== record.id));
      showToast(`入库单 [${record.id}] 已删除`, 'success');
    }
    if (type === 'outbound') {
      setOutboundData(prev => prev.filter(row => row.id !== record.id));
      showToast(`出库单 [${record.id}] 已删除`, 'success');
    }
    setDeleteTarget(null);
  };

  const handleQuickInventory = () => {
    setActionReview({
      kind: 'quickInventory',
      title: '下发快速盘点任务',
      desc: '系统会生成盘点任务，并同步到相关库管 PDA。',
      icon: ScanLine,
      tone: 'blue',
      confirmText: '下发盘点',
      details: [
        { label: '盘点范围', value: '全部仓库 / 重点预警物料' },
        { label: '执行终端', value: '库管 PDA' },
        { label: '重点物料', value: 'RM202 12层空PCB板' },
        { label: '盘点结果', value: '自动回写库存健康度' }
      ]
    });
  };

  const completeInbound = (row) => {
    setActionReview({
      kind: 'completeInbound',
      record: row,
      title: '确认验收入库',
      desc: '验收入库后会把数量同步增加到现存量台账。',
      icon: ClipboardCheck,
      tone: 'emerald',
      confirmText: '确认入库',
      details: [
        { label: '入库单号', value: row.id },
        { label: '产品', value: row.item },
        { label: '数量', value: `+${row.qty}` },
        { label: '来源', value: row.source }
      ],
      note: '请确认实物已完成质检或到货验收，再执行入库。'
    });
  };

  const processOutbound = (row) => {
    setOutboundStockState({ status: 'idle' });
    setActionReview({
      kind: 'processOutbound',
      record: row,
      title: Number(row.shippedQty || 0) > 0 ? '继续销售发货' : '确认销售发货',
      desc: '请先选择发货仓库；系统会读取该仓库真实可用量，充足时确认发货，不足时转为部分发货或缺口生产。',
      icon: ArrowUpFromLine,
      tone: 'rose',
      confirmText: Number(row.shippedQty || 0) > 0 ? '继续发货' : '确认发货',
      details: [
        { label: '出库任务', value: row.taskId || row.id },
        { label: '来源订单', value: row.source },
        { label: '产品', value: row.item },
        { label: '累计已发', value: `${Number(row.shippedQty || 0)} ${row.unit || '件'}` },
        { label: '来源', value: row.source }
      ],
      lineStockInfo: [],
      note: '未选择仓库不能发货；提交前服务端会再次原子校验库存事实。'
    });
  };

  // 部分发货：完成可发货产品的出库，回写销售订单为"部分发货"
  const partialShipment = (row) => {
    const stockStatus = resolveOutboundLineStockStatus(row);
    // 可发货产品：有可用库存的产品（包括充足和部分充足）
    const shippableLines = stockStatus.lineStatuses.filter(l => l.availQty > 0);
    // 缺口产品：库存不足以满足剩余待发数量（包括部分缺口和完全缺货）
    const shortageLines = stockStatus.lineStatuses.filter(l => l.shortage > 0);
    // 完全缺货产品：可用库存为0
    const outOfStockLines = stockStatus.lineStatuses.filter(l => l.availQty === 0);
    // 部分可发产品：有库存但不足以满足全部待发数量
    const partialAvailLines = stockStatus.lineStatuses.filter(l => l.availQty > 0 && l.shortage > 0);
    // 构建可编辑发货数量字段：有可用库存的产品均可编辑，默认回显最大可发货数量
    const quantityFields = shippableLines.map(ls => ({
      id: `shipQty_${ls.productId}`,
      label: `${ls.productId} ${ls.productName}`,
      uom: (() => { const si = stockData.find(s => s.id === ls.productId); return si?.unit || '件'; })(),
      max: Math.min(ls.remainingQty ?? ls.qty, ls.availQty),
      value: Math.min(ls.remainingQty ?? ls.qty, ls.availQty),
    }));
    const descParts = [`本次可发货 ${shippableLines.length} 项产品`];
    if (partialAvailLines.length > 0) {
      descParts.push(`其中 ${partialAvailLines.length} 项仅可部分发货`);
    }
    if (outOfStockLines.length > 0) {
      descParts.push(`${outOfStockLines.length} 项产品完全缺货需去生产`);
    } else if (shortageLines.length > 0) {
      descParts.push(`${shortageLines.length} 项产品有缺口需去生产`);
    }
    setActionReview({
      kind: 'partialShipment',
      record: row,
      title: '部分发货确认',
      desc: descParts.join('，') + '。',
      icon: ArrowUpFromLine,
      tone: 'amber',
      confirmText: '确认部分发货',
      details: [
        { label: '出库单号', value: row.id },
        { label: '来源订单', value: row.source },
        { label: '可发货产品', value: shippableLines.map(l => `${l.productId}(最多${Math.min(l.remainingQty ?? l.qty, l.availQty)})`).join('、') || '无' },
        { label: '缺口产品', value: shortageLines.map(l => `${l.productId}(缺口${l.shortage})`).join('、') || '无' },
      ],
      quantityFields,
      lineStockInfo: stockStatus.lineStatuses,
      note: '部分发货后，销售订单状态将更新为"部分发货"，缺口产品需前往生产管理发起 MPS 生产计划。',
    });
  };

  // 去生产：跳转到生产管理 MPS 主计划，展示缺口产品并允许调整生产数量
  const navigateToProductionMPS = (row) => {
    const stockStatus = resolveOutboundLineStockStatus(row);
    const shortageLines = stockStatus.lineStatuses.filter(l => l.shortage > 0);
    // 构建缺口产品可编辑生产数量字段：默认值为缺口数，用户可调大
    const productionFields = shortageLines.map(ls => ({
      id: `prodQty_${ls.productId}`,
      label: `${ls.productId} ${ls.productName}`,
      uom: (() => { const si = stockData.find(s => s.id === ls.productId); return si?.unit || '件'; })(),
      min: ls.shortage,
      value: ls.shortage,
    }));
    setActionReview({
      kind: 'productionRequest',
      record: { ...row, availableQty: resolveOutboundAvailQty(row), shortageQty: stockStatus.totalShortage },
      title: '库存不足，去生产',
      desc: `共 ${shortageLines.length} 项产品库存不足，需向生产管理发起缺口生产申请，联动 MPS 主计划。`,
      icon: Factory,
      tone: 'amber',
      confirmText: '去生产',
      details: [
        { label: '销售订单', value: row.source },
        { label: '产品', value: row.item },
        { label: '本次发货', value: `${row.qty} ${row.unit || '件'}` },
        { label: '可用库存', value: `${resolveOutboundAvailQty(row)} ${row.unit || '件'}` },
        { label: '生产缺口', value: `${stockStatus.totalShortage} ${row.unit || '件'}` },
        { label: '需求日期', value: row.dueDate || '按订单交期' },
      ],
      productionFields,
      lineStockInfo: stockStatus.lineStatuses,
      note: '提交后将跳转到生产管理 MPS 主计划页面，创建缺口产品的生产计划。需生产数量默认为缺口数，如需更多可手动调整。'
    });
  };

  const viewProductionRequest = (row) => {
    setActionReview({
      kind: 'viewProductionRequest',
      readOnly: true,
      title: '生产申请详情',
      desc: '该生产申请由仓库在销售出库缺货时发起，来源订单和库存事实保持关联。',
      icon: Factory,
      tone: 'amber',
      details: [
        { label: '生产需求编号', value: row.productionDemandCode || row.productionDemandId || '-' },
        { label: '销售订单', value: row.source },
        { label: '产品', value: row.item },
        { label: '生产缺口', value: `${row.shortageQty || 0} ${row.unit || '件'}` },
        { label: '库存事实版本', value: row.inventoryFactVersion ? `v${row.inventoryFactVersion}` : '-' },
        { label: '接入记录', value: row.intakeId || '-' },
      ],
      note: '生产需求已通过正式生产接入 API 幂等创建；进入生产模块仍受应用开关、岗位权限和工厂数据范围控制。',
    });
  };

  const handleProcessDeadStock = () => {
    setActionReview({
      kind: 'deadStock',
      title: '生成呆滞物料调拨单',
      desc: '系统会创建一张调拨出库任务，并把 FG001 从呆滞状态转入去化流程。',
      icon: ArrowRightLeft,
      tone: 'amber',
      confirmText: '生成调拨单',
      details: [
        { label: '产品', value: 'FG001 工业控制器顶配版' },
        { label: '建议数量', value: '120 台' },
        { label: '调出仓', value: '成品主仓' },
        { label: '目标流程', value: '去化中转 / 销售协同' }
      ]
    });
  };

  const handleTransferStock = (row) => {
    setActionReview({
      kind: 'transferStock',
      record: row,
      title: '确认库存调拨',
      desc: '调拨后会更新该产品的仓库与库位信息。',
      icon: ArrowRightLeft,
      tone: 'amber',
      confirmText: '确认调拨',
      details: [
        { label: '产品', value: `${row.id} ${row.name}` },
        { label: '当前仓库', value: row.warehouse },
        { label: '当前库位', value: row.location },
        { label: '调入位置', value: '去化中转仓 / T-01-01' }
      ]
    });
  };

  const openInventoryProductionRequest = (row) => {
    const suggestedQty = suggestInventoryReplenishmentQty(row.availQty, row.safetyStock);
    const requiredDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setActionReview({
      kind: 'inventoryProductionPlan',
      record: row,
      title: '产品补货申请',
      desc: '确认后生成库存补货来源的 MPS 待展算计划，并流转到生产主计划。',
      icon: Factory,
      tone: 'blue',
      confirmText: '提交补货申请',
      details: [
        { label: '产品', value: `${row.id} ${row.name}` },
        { label: '默认仓库', value: `${row.warehouse} (${row.warehouseId})` },
        { label: '实际可用', value: `${row.availQty} ${row.unit}` },
        { label: '安全库存', value: `${row.safetyStock} ${row.unit}` },
      ],
      quantityTitle: '补货信息',
      quantityFields: [{ id: 'requestedQty', label: '申请补货数量', value: suggestedQty, uom: row.unit }],
      dateFields: [{ id: 'requiredDate', label: '需求日期', value: requiredDate, min: new Date().toISOString().slice(0, 10) }],
      note: '相同产品、仓库和库存快照存在活动计划时，将定位原 MPS，不重复创建。',
    });
  };

  const openInventoryPurchaseRequest = (row) => {
    const material = loadInventoryMasterData(window.localStorage, currentTenant?.id).materials.find((item) => item.id === row.id);
    const procurementType = row.procurementType || material?.procurementType || '外购';
    if (procurementType === '自制') {
      showToast('自制物料不能发起采购，请改为发起生产申请', 'warning');
      return;
    }
    const actionRow = { ...row, procurementType };
    const suggestedQty = suggestInventoryReplenishmentQty(row.availQty, row.safetyStock);
    const requiredDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setActionReview({
      kind: 'inventoryPurchaseRequest',
      record: actionRow,
      title: '物料补货申请',
      desc: '确认后生成库存补货来源的采购申请，流转到采购管理等待审批。',
      icon: FilePlus,
      tone: 'amber',
      confirmText: '生成采购申请',
      details: [
        { label: '物料', value: `${row.id} ${row.name}` },
        { label: '采购策略', value: procurementType },
        { label: '实际可用', value: `${row.availQty} ${row.unit}` },
        { label: '安全库存', value: `${row.safetyStock} ${row.unit}` },
      ],
      quantityTitle: '采购补货信息',
      quantityFields: [{ id: 'requestedQty', label: '申请采购数量', value: suggestedQty, uom: row.unit }],
      dateFields: [{ id: 'requiredDate', label: '需求日期', value: requiredDate, min: new Date().toISOString().slice(0, 10) }],
      note: '相同物料、仓库和库存快照存在未终结采购申请时，将定位原 PR。',
    });
  };

  const handleCreatePurchaseRequest = () => {
    setActionReview({
      kind: 'createPurchaseRequest',
      title: '生成采购申请',
      desc: '系统会把低库存预警转成采购申请，并在入库流水中生成待到货记录。',
      icon: FilePlus,
      tone: 'rose',
      confirmText: '生成 PR',
      details: [
        { label: '物料', value: 'RM202 12层空PCB板' },
        { label: '建议数量', value: '500 PCS' },
        { label: '需求来源', value: 'AI安全库存预警' },
        { label: '预计到货', value: '2026-07-06 09:00' }
      ]
    });
  };

  const handlePushSalesTask = () => {
    setActionReview({
      kind: 'pushSalesTask',
      title: '推送销售去化任务',
      desc: '系统会把 FG001 标记为去化中，并向销售管理模块推送处理任务。',
      icon: Send,
      tone: 'blue',
      confirmText: '推送任务',
      details: [
        { label: '物料', value: 'FG001 工业控制器顶配版' },
        { label: '库存风险', value: '90天低出库率' },
        { label: '建议动作', value: '降价促销 / 客户定向推荐' },
        { label: '接收部门', value: '销售部' }
      ]
    });
  };

  const handleOutboundWarehouseChange = async (warehouseId: string) => {
    if (!actionReview?.record || !formalContext) return;
    const row = actionReview.record;
    try {
      return await loadOutboundStock(row, warehouseId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '仓库可用量读取失败';
      setOutboundStockState({ status: 'error', error: message });
      setActionReview(prev => prev ? { ...prev, lineStockInfo: [] } : prev);
      showToast(message, 'error');
      return [];
    }
  };

  const confirmInventoryAction = async (shipmentQuantities: Record<string, string> = {}, selectedWarehouseId?: string) => {
    if (!actionReview) return;
    const row = actionReview.record;
    if ((actionReview.kind === 'inventoryProductionPlan' || actionReview.kind === 'inventoryPurchaseRequest') && row) {
      const requestedQty = Number(shipmentQuantities.requestedQty);
      const requiredDate = String(shipmentQuantities.requiredDate || '');
      if (!(requestedQty > 0)) {
        showToast('请输入大于 0 的申请数量', 'error');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requiredDate) || requiredDate < new Date().toISOString().slice(0, 10)) {
        showToast('请选择今天或之后的需求日期', 'error');
        return;
      }
      const actor = currentUser?.name || currentUser?.account || '当前库存用户';
      try {
        if (actionReview.kind === 'inventoryProductionPlan') {
          const result = createInventoryProductionPlan(window.localStorage, currentTenant?.id, row, {
            requestedQty, requiredDate, priority: row.status === '低库存' ? '紧急' : '普通', actor,
          });
          setActionReview(null);
          showToast(result.created ? `补货申请已流转到生产主计划：${result.request.mpsId}` : `该库存快照已有补货计划：${result.request.mpsId}`, result.created ? 'success' : 'warning');
          onNavigateModule?.('生产管理', { query: { production: 'plan', focusMps: result.request.mpsId } });
          return;
        }
        const result = createInventoryPurchaseRequest(window.localStorage, currentTenant?.id, row, { requestedQty, requiredDate, actor });
        setActionReview(null);
        showToast(result.created ? `采购申请已生成：${result.request.id}` : `已存在活动采购申请：${result.request.id}`, result.created ? 'success' : 'warning');
        onNavigateModule?.('采购管理', { query: { procurement: 'pr', focusPr: result.request.id } });
      } catch (error) {
        showToast(error instanceof Error ? error.message : '业务申请创建失败', 'error');
      }
      return;
    }
    if (actionReview.kind === 'productionRequest' && row) {
      // 非正式任务（种子数据）直接跳转到生产管理MPS主计划
      if (!row.formalTask) {
        const ss = resolveOutboundLineStockStatus(row);
        const shortageLines = ss.lineStatuses.filter(l => l.shortage > 0);
        // 读取用户输入的生产数量，默认为缺口数
        const productionLines = shortageLines.map(ls => {
          const fieldId = `prodQty_${ls.productId}`;
          const inputVal = Number(shipmentQuantities[fieldId] ?? ls.shortage);
          return { productId: ls.productId, productName: ls.productName, shortage: ls.shortage, prodQty: inputVal };
        });
        const prodSummary = productionLines.map(l => `${l.productId}:${l.prodQty}`).join('、');
        // 在生产模块 localStorage 中创建 MPS 草稿记录
        try {
          const prodStorageKey = `industrial-ai-production-legacy:${currentTenant?.id || 'TENANT-SHWS'}`;
          const rawProd = window.sessionStorage.getItem(prodStorageKey);
          const prodData = rawProd ? JSON.parse(rawProd) : {};
          if (!Array.isArray(prodData.mps)) prodData.mps = [];
          productionLines.forEach(pl => {
            const newMpsId = `MPS-${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
            prodData.mps.unshift({
              id: newMpsId,
              demandSource: '销售缺货',
              source: `出库单 ${row.id}`,
              product: pl.productName || pl.productId,
              quantity: pl.prodQty,
              date: new Date().toISOString().slice(0, 10),
              status: '草稿',
              priority: '普通',
              sourceSalesOrder: row.source,
              shortageQty: pl.shortage,
            });
          });
          window.sessionStorage.setItem(prodStorageKey, JSON.stringify(prodData));
        } catch (e2) { /* ignore */ }
        // 更新出库单状态为"生产申请中"
        setOutboundData(prev => prev.map(item => item.id === row.id ? { ...item, status: '生产申请中' } : item));
        // 回写销售订单为"生产中"
        recordSalesOrderProductionRequested(window.localStorage, currentTenant?.id, {
          orderId: row.source,
          availableQty: resolveOutboundAvailQty(row),
          shortageQty: productionLines.reduce((s, l) => s + l.shortage, 0),
          inventoryFactVersion: 1,
          intakeId: `INT-${Date.now()}`,
          operator: currentUser?.name || '当前用户',
          requestedAt: new Date().toISOString(),
        });
        onNavigateModule?.('生产管理', { query: { production: 'plan', focusOrder: row.source } });
        showToast(`已创建 ${productionLines.length} 条 MPS 草稿记录并跳转到生产管理，需生产：${prodSummary}`, 'success');
        setActionReview(null);
        return;
      }
      setIsActionSubmitting(true);
      try {
        if (row.formalTask) {
          if (!formalContext) throw new Error('请先登录正式会话');
          const result = await createProductionRequestForTask(
            formalContext,
            row.formalTask,
            { factoryResourceId: currentTenant.id === 'TENANT-HDJG' ? 'FAC-SZ-01' : 'FAC-SH-01' },
          );
          const mapped = mapFormalTask(result.task);
          setOutboundData((previous) => previous.map((item) => item.taskId === row.taskId ? mapped : item));
          showToast(`生产申请已提交：${result.demands.map((item) => item.code || item.id).join('、')}`, 'warning');
          setActionReview(null);
          return;
        }
        const productId = row.productId || String(row.item || '').match(/[A-Z]{2,}\d+/)?.[0];
        if (!productId) throw new Error('出库任务缺少可识别的产品编码');
        const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate || '')
          ? row.dueDate
          : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        const result = await createSalesOrderIntake({
          tenantId: currentTenant.id,
          accessToken: currentUser?.accessToken || '',
        }, {
          salesOrderId: row.source,
          sourceLineId: '1',
          sourceRevision: Number(row.sourceRevision || 1),
          productId,
          productName: row.item,
          orderedQty: String(row.qty),
          uom: 'PCS',
          dueDate,
          factoryResourceId: currentTenant.id === 'TENANT-HDJG' ? 'FAC-SZ-01' : 'FAC-SH-01',
          inventoryWarehouseId: row.warehouseId || row.warehouse || 'WH-FG-01',
        });
        const availableQty = Number(result.intake.availableQty);
        const shortageQty = Number(result.intake.shortageQty);
        const requestedAt = new Date().toISOString();
        const operator = currentUser?.name || currentUser?.account || '当前仓库用户';
        setOutboundData((previous) => previous.map((item) => item.id === row.id ? {
          ...item,
          availableQty,
          shortageQty,
          inventoryFactVersion: result.intake.inventoryFactVersion,
          intakeId: result.intake.id,
          productionDemandId: result.demand?.id,
          productionDemandCode: result.demand?.code,
          status: shortageQty > 0 ? '生产申请中' : '待出库',
        } : item));
        recordWarehouseProductionResult(window.localStorage, currentTenant.id, row.id, {
          availableQty,
          shortageQty,
          inventoryFactVersion: result.intake.inventoryFactVersion,
          intakeId: result.intake.id,
          productionDemandId: result.demand?.id,
          productionDemandCode: result.demand?.code,
        });
        recordSalesOrderProductionRequested(window.localStorage, currentTenant.id, {
          orderId: row.source,
          availableQty,
          shortageQty,
          inventoryFactVersion: result.intake.inventoryFactVersion,
          intakeId: result.intake.id,
          productionDemandId: result.demand?.id,
          productionDemandCode: result.demand?.code,
          requestedAt,
          operator,
        });
        onBusinessFlowAction?.('approveOrder', {
          id: row.source,
          client: row.customer,
          productName: row.item,
          qty: row.qty,
          amount: row.amount || businessFlow?.amount || '待回写',
          availableStock: availableQty,
          shortage: shortageQty,
          intake: result.intake,
          productionDemand: result.demand,
        });
        showToast(
          shortageQty > 0
            ? `生产申请已提交：${result.demand?.code || result.demand?.id}`
            : `库存事实已更新，${row.source} 可以继续出库`,
          shortageQty > 0 ? 'warning' : 'success',
        );
        setActionReview(null);
      } catch (error) {
        const apiError = error instanceof ProductionApiError ? error : null;
        showToast(
          '生产申请提交失败：' + (apiError?.suggestion || (error instanceof Error ? error.message : '请稍后重试')),
          'error',
        );
      } finally {
        setIsActionSubmitting(false);
      }
      return;
    }
    if (actionReview.kind === 'quickInventory') {
      try {
        const ctx = formalContext;
        if (ctx) {
          await inventoryApi.createStocktakeTask(ctx, {
            warehouseId: 'WH-01',
            scope: 'spot',
            reason: '快速盘点 - 重点预警物料',
            assignedTo: currentUser?.name || 'system',
            lines: [{ productId: 'RM202', productCode: 'RM202', productName: '12层空PCB板', systemQty: '0', uom: 'PCS' }],
          });
          showToast('盘点任务已通过正式 API 创建并分发到库管 PDA', 'success');
        } else {
          setStockData(prev => prev.map(item => item.id === 'RM202' ? { ...item, status: '低库存' } : item));
          showToast('盘点任务已分发（本地模式），低库存项已重新标记预警', 'success');
        }
      } catch (e) {
        setStockData(prev => prev.map(item => item.id === 'RM202' ? { ...item, status: '低库存' } : item));
        showToast('盘点任务已分发，低库存项已重新标记预警', 'success');
      }
    }
    if (actionReview.kind === 'completeInbound' && row) {
      setInboundData(prev => prev.map(item => item.id === row.id ? { ...item, status: '已入库' } : item));
      setStockData(prev => prev.map(item => item.name === row.item ? {
        ...item,
        stockQty: item.stockQty + row.qty,
        availQty: item.availQty + row.qty,
        status: item.status === '低库存' ? '正常' : item.status
      } : item));
      showToast(`入库单 [${row.id}] 已验收，库存数量已同步增加`, 'success');
    }
    if (actionReview.kind === 'partialShipment' && row) {
      try {
      const completedAt = new Date();
      const operator = currentUser?.name || currentUser?.account || row.operator || '当前用户';
      const ss = resolveOutboundLineStockStatus(row);
      const shippableLines = ss.lineStatuses.filter(l => l.availQty > 0);
      // 读取用户输入的发货数量，校验不可为0或超过 min(剩余待发, 实际可用)
      const actualShipLines = shippableLines.map(ls => {
        const fieldId = `shipQty_${ls.productId}`;
        const maxQty = Math.min(ls.remainingQty ?? ls.qty, ls.availQty);
        const rawInput = shipmentQuantities[fieldId];
        const inputVal = (rawInput == null || rawInput === '') ? maxQty : Number(rawInput);
        // 上限截断到 min(剩余待发, 实际可用)
        const clampedVal = Math.min(inputVal, maxQty);
        return { ...ls, shipQty: clampedVal };
      });
      // 校验：所有可发货产品的发货数量必须 > 0（不可为0）
      const hasInvalid = actualShipLines.some(l => l.shipQty <= 0 || isNaN(l.shipQty));
      if (hasInvalid) {
        showToast('发货数量不可为0，请检查后重试', 'error');
        return;
      }
      const shippedQty = actualShipLines.reduce((sum, l) => sum + l.shipQty, 0);
      const lineShipments = actualShipLines.map(ls => ({ productId: ls.productId, shipQty: ls.shipQty }));
      // 判断是否全量完成：所有订单行累计 shippedQty >= 订单数量
      const allFullyShipped = ss.lineStatuses.every(ls => {
        const ship = actualShipLines.find(a => a.productId === ls.productId);
        const totalShipped = (ls.shippedQty ?? 0) + (ship ? ship.shipQty : 0);
        return totalShipped >= ls.qty;
      });
      const newOutboundStatus = allFullyShipped ? '已出库' : '部分发货';
      // 更新出库单lines中每行的已发货数量
      const updatedLines = (row.lines || []).map(line => {
        const ship = actualShipLines.find(a => a.productId === line.productId);
        return ship ? { ...line, shippedQty: (Number(line.shippedQty) || 0) + ship.shipQty } : line;
      });
      // 构建出库明细记录
      const shipmentDetails = actualShipLines.map(ls => ({ productId: ls.productId, productName: ls.productName, shipQty: ls.shipQty, unit: ls.unit || '件' }));
      setOutboundData(prev => prev.map(item => item.id === row.id ? { ...item, status: newOutboundStatus, operator, shippedAt: completedAt.toISOString(), shippedQty: (Number(item.shippedQty) || 0) + shippedQty, lines: updatedLines.length > 0 ? updatedLines : item.lines, shipmentDetails: [...(item.shipmentDetails || []), ...shipmentDetails] } : item));
      actualShipLines.forEach(ls => {
        setStockData(prev => prev.map(item => item.id === ls.productId ? {
          ...item,
          stockQty: Math.max(0, item.stockQty - ls.shipQty),
          availQty: Math.max(0, item.availQty - ls.shipQty)
        } : item));
      });
      // 销售订单状态由后端出库 API（POST /api/v1/inventory/outbounds/{id}/post）回写，无需前端写 localStorage
      const shipSummary = actualShipLines.map(l => `${l.productId}:${l.shipQty}`).join('、');
      showToast(`出库单 [${row.id}] 已${allFullyShipped ? '全量' : '部分'}发货（${shipSummary}），销售订单已回写`, 'success');
      if (businessFlow?.orderId === row.source) onBusinessFlowAction?.('shipSales');
      setActionReview(null);
      return;
      } catch (e) {
        showToast('部分发货失败：' + (e instanceof Error ? e.message : String(e)), 'error');
      }
    }
    if (actionReview.kind === 'productionRequest' && row) {
      const ss = resolveOutboundLineStockStatus(row);
      const shortageLines = ss.lineStatuses.filter(l => l.shortage > 0);
      const operator = currentUser?.name || currentUser?.account || row.operator || '当前用户';
      let createdCount = 0;
      const createdMpsIds = [];
      shortageLines.forEach(ls => {
        const fieldId = `prodQty_${ls.productId}`;
        const rawInput = shipmentQuantities[fieldId];
        const prodQty = (rawInput == null || rawInput === '') ? ls.shortage : Number(rawInput);
        if (!(prodQty > 0)) return;
        try {
          const stockRow = { id: ls.productId, name: ls.productName || ls.productId, warehouseId: row.warehouseId || 'WH-01', availQty: ls.availQty, safetyStock: ls.qty, unit: ls.unit || '件' };
          const result = createInventoryProductionPlan(window.localStorage, currentTenant?.id, stockRow, { requestedQty: prodQty, requiredDate: row.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), priority: '高', actor: operator });
          if (result.created) createdCount++;
          createdMpsIds.push(result.request.mpsId);
        } catch (e) { /* ignore duplicate */ }
      });
      setOutboundData(prev => prev.map(item => item.id === row.id ? { ...item, status: '生产申请中' } : item));
      onNavigateModule?.('生产管理', { query: { production: 'plan', focusOrder: row.source } });
      showToast(`已为 ${createdCount} 项缺口产品创建 MPS 生产计划，正在跳转到生产计划页面`, 'success');
      setActionReview(null);
      return;
    }
    if (actionReview.kind === 'processOutbound' && row) {
      if (row.type === '销售发货' && !row.formalTask) {
        showToast('正式销售发货任务尚未同步，请刷新后重试', 'warning');
        return;
      }
      if (row.formalTask) {
        setIsActionSubmitting(true);
        try {
          if (!formalContext) throw new Error('请先登录正式会话');
          if (!selectedWarehouseId) {
            showToast('请先选择发货仓库', 'warning');
            return;
          }
          if (outboundStockState.status !== 'ready' || outboundStockState.warehouseId !== selectedWarehouseId || !actionReview.lineStockInfo?.length) {
            showToast('仓库库存尚未加载完成，请重新选择发货仓库', 'warning');
            return;
          }
          let task = {
            ...row.formalTask,
            warehouseId: resolveWarehouse(formalInventory.warehouses, row.formalTask.warehouseId)?.id || row.formalTask.warehouseId,
          };
          if (['RESERVED', 'PARTIALLY_RESERVED'].includes(task.availabilityStatus) && task.warehouseId !== selectedWarehouseId) {
            throw new Error('当前任务已有库存预留，不能直接切换发货仓库');
          }
          let outbound;
          const initialSummary = outboundStockSummary(actionReview.lineStockInfo);
          if (task.availabilityStatus !== 'RESERVED') {
            if (!initialSummary.allowPartial && initialSummary.shortage.length > 0) {
              await submitFormalGapProduction(row, selectedWarehouseId);
              return;
            }
            const expectedFactVersions = Object.entries(outboundStockState.factVersions ?? {})
              .map(([productId, factVersion]) => ({ productId, factVersion: Number(factVersion) }));
            const reserved = await prepareFormalOutbound(formalContext, task, selectedWarehouseId, expectedFactVersions);
            task = reserved.task;
            const mapped = mapFormalTask(task);
            setOutboundData((previous) => previous.map((item) => item.taskId === row.taskId ? mapped : item));
            outbound = reserved.outbound || (task.outboundId ? await getFulfillmentOutbound(formalContext, task.outboundId) : undefined);
            const reservedSummary = outboundStockSummary(buildOutboundLineStock(task));
            if (reservedSummary.shortage.length > 0 && reservedSummary.shippable.length === 0) {
              await submitFormalGapProduction({ ...row, formalTask: task }, selectedWarehouseId, task);
              return;
            }
          }
          if (!outbound) {
            const prepared = await prepareFormalOutbound(formalContext, task, selectedWarehouseId);
            task = prepared.task;
            outbound = prepared.outbound;
          }
          if (!outbound) throw new Error('库存预留完成但未生成出库单');
          const quantitiesByOrderLineId: Record<string, string> = {};
          const actualShipLines: Array<{ productId: string; shipQty: number; orderLineId: string }> = [];
          task.lines.forEach(line => {
            const reservedRemaining = subtractQuantity(line.reservedQty, line.postedQty);
            if (compareQuantity(reservedRemaining, '0') === 0) return;
            const rawValue = shipmentQuantities[`shipQty_${line.id}`];
            const requestedQty = rawValue == null || rawValue === '' ? reservedRemaining : String(rawValue);
            if (compareQuantity(requestedQty, '0') <= 0 || compareQuantity(requestedQty, reservedRemaining) > 0) {
              throw new Error(`${line.productId} 本次发货数量必须大于 0 且不超过 ${reservedRemaining}`);
            }
            quantitiesByOrderLineId[line.orderLineId] = requestedQty;
            actualShipLines.push({ productId: line.productId, shipQty: Number(requestedQty), orderLineId: line.orderLineId });
          });
          if (!actualShipLines.length) {
            await submitFormalGapProduction({ ...row, formalTask: task }, selectedWarehouseId, task);
            return;
          }
          const posted = await postFormalOutbound(formalContext, outbound, quantitiesByOrderLineId);
          setOutboundData(previous => previous.map(item => item.taskId === posted.task.id ? mapFormalTask(posted.task) : item));
          window.dispatchEvent(new CustomEvent('sales-fulfillment-changed', { detail: { tenantId: formalContext.tenantId } }));
          await refreshFormalTasks();
          const remainingAfterShip = posted.order.lines.reduce((sum, line) => sum + Number(line.remainingQty), 0);
          if (businessFlow?.orderId === row.source) onBusinessFlowAction?.('shipSales');
          showToast(`销售出库单 [${outbound.id}] 已${remainingAfterShip > 0 ? '部分' : '全量'}发货并回写销售订单`, 'success');
          setActionReview(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : '请稍后重试';
          showToast('销售出库失败：' + message, 'error');
          setOutboundStockState({ status: 'error', error: message });
          refreshFormalTasks().catch(() => {});
        } finally {
          setIsActionSubmitting(false);
        }
        return;
      }
      const completedAt = new Date();
      const operator = currentUser?.name || currentUser?.account || row.operator || '当前用户';
      // 销售订单状态由后端出库 API 回写，无需前端写 localStorage
      setOutboundData(prev => prev.map(item => item.id === row.id ? { ...item, status: '已出库', operator, shippedAt: completedAt.toISOString() } : item));
      // 按产品明细逐行扣减库存（stockQty 和 availQty）；无明细行时回退到单产品匹配
      const shipLines = (row.lines && row.lines.length > 0)
        ? row.lines.map(line => ({ productId: line.productId, shipQty: Number(line.qty || 0) }))
        : (() => {
          const pid = row.productId || String(row.item || '').match(/[A-Z]{2,}\d+/)?.[0] || '';
          return pid ? [{ productId: pid, shipQty: Number(row.qty || 0) }] : [];
        })();
      shipLines.forEach(ls => {
        if (!ls.productId) return;
        setStockData(prev => prev.map(item => item.id === ls.productId ? {
          ...item,
          stockQty: Math.max(0, item.stockQty - ls.shipQty),
          availQty: Math.max(0, item.availQty - ls.shipQty)
        } : item));
      });
      if (row.type === '销售发货') {
        if (businessFlow?.orderId === row.source) onBusinessFlowAction?.('shipSales');
        showToast(`出库单 [${row.id}] 已完成，销售订单状态由后端同步`, 'success');
      } else {
        showToast(`出库单 [${row.id}] 已完成拣货并扣减库存`, 'success');
      }
    }
    if (actionReview.kind === 'deadStock') {
      try {
        const ctx = formalContext;
        if (ctx) {
          const resp = await inventoryApi.createTransferOrder(ctx, {
            fromWarehouseId: 'WH-01', toWarehouseId: 'WH-TR-01',
            productId: 'FG001', productCode: 'FG001', productName: '工业控制器顶配版',
            transferQty: '120', uom: 'PCS', reason: 'AI呆滞物料去化',
          });
          showToast(`呆滞物料调拨单 [${resp.transfer.transferNo}] 已通过正式 API 创建`, 'success');
        } else throw new Error('no context');
      } catch (e) {
        setStockData(prev => prev.map(item => item.id === 'FG001' ? { ...item, status: '去化中' } : item));
        setOutboundData(prev => [{
          id: `OUT-DIS-${Date.now().toString().slice(-5)}`,
          type: '调拨出库',
          source: 'AI呆滞处理',
          item: '工业控制器顶配版',
          qty: 120,
          date: '2026-07-03 10:00',
          status: '拣货中',
          operator: '系统AI'
        }, ...prev]);
        showToast('呆滞物料调拨单已生成（本地模式），FG001 已进入去化流程', 'success');
      }
    }
    if (actionReview.kind === 'transferStock' && row) {
      try {
        const ctx = formalContext;
        if (ctx) {
          const resp = await inventoryApi.createTransferOrder(ctx, {
            fromWarehouseId: row.warehouseId || 'WH-01', toWarehouseId: 'WH-TR-01',
            productId: row.id, productCode: row.id, productName: row.name,
            transferQty: String(row.stockQty || row.availQty || '1'), uom: row.uom || 'PCS',
            reason: '库存调拨至去化中转仓',
          });
          showToast(`物料 [${row.id}] 调拨单 [${resp.transfer.transferNo}] 已通过正式 API 创建`, 'success');
        } else throw new Error('no context');
      } catch (e) {
        setStockData(prev => prev.map(item => isSameStockRecord(item, row) ? { ...item, warehouseId: 'WH-TR-01', warehouse: '去化中转仓', location: 'T-01-01', status: '正常' } : item));
        showToast(`物料 [${row.id}] 已调拨至去化中转仓（本地模式）`, 'success');
      }
    }
    if (actionReview.kind === 'createPurchaseRequest') {
      setInboundData(prev => [{
        id: `IN-PR-${Date.now().toString().slice(-5)}`,
        type: '采购到货预期',
        source: 'PR-RM202-500',
        item: '12层空PCB板',
        qty: 500,
        date: '2026-07-06 09:00',
        status: '待到货',
        operator: '系统AI'
      }, ...prev]);
      showToast('PR-RM202-500 已生成，入库流水已创建待到货记录', 'success');
      setActiveTab('inbound');
    }
    if (actionReview.kind === 'pushSalesTask') {
      setStockData(prev => prev.map(item => item.id === 'FG001' ? { ...item, status: '去化中' } : item));
      showToast('销售去化任务已推送，FG001 已标记为去化中', 'success');
    }
    setActionReview(null);
  };

  const getStockStatusBadge = (status) => {
    switch(status) {
      case '正常': return <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-0.5 rounded-lg text-[11px] font-bold">正常可用</span>;
      case '低库存': return <span className="bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max"><AlertTriangle size={12}/> 预警</span>;
      case '积压呆滞': return <span className="bg-amber-50 text-amber-600 border border-amber-100 px-2.5 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max"><Clock size={12}/> 呆滞积压</span>;
      case '去化中': return <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2.5 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max"><TrendingDown size={12}/> 去化中</span>;
      default: return <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-lg text-[11px] font-bold">未知</span>;
    }
  };

  return (
    <div className="w-full h-full font-sans flex flex-col relative">
      <CenterToast toast={toast} onClose={() => setToast({ show: false, msg: '', type: 'success' })} />
      {recordModal && <Inv_RecordModal type={recordModal.type} mode={recordModal.mode} record={recordModal.record} onClose={() => setRecordModal(null)} onSubmit={(draft) => { recordModal.type === 'stock' ? saveStock(draft) : recordModal.type === 'inbound' ? saveInbound(draft) : saveOutbound(draft); setRecordModal(null); }} />}
      {deleteTarget && <Sales_ConfirmModal title={`删除${invEntityLabels[deleteTarget.type]}`} desc={`确定删除 ${deleteTarget.record.id} 吗？该操作仅影响当前演示数据。`} confirmText="删除" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={deleteRecord} />}
      {actionReview && (
        <Inv_ActionReviewModal
          action={actionReview}
          submitting={isActionSubmitting}
          onCancel={() => setActionReview(null)}
          onConfirm={confirmInventoryAction}
          onGapProduction={(_values, warehouseId) => {
            if (actionReview.record?.formalTask) void submitFormalGapProduction(actionReview.record, warehouseId);
          }}
          onWarehouseRequired={() => showToast('请先选择发货仓库', 'warning')}
          warehouses={warehouseList}
          warehouseName={warehouseName}
          warehouseLoadError={warehouseLoadError}
          onWarehouseChange={handleOutboundWarehouseChange}
          stockState={outboundStockState}
        />
      )}
      <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
        <div className="flex justify-between items-start mb-6 shrink-0">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl mr-4 shadow-sm"><Package size={24} /></div>
            <div className="flex flex-col justify-center">
              <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">库存管理</h1>
              <div className="text-[13px] text-slate-500 mt-1 font-medium">全域仓库物资流转中心</div>
            </div>
          </div>
          {!['warehouses', 'products', 'materials'].includes(activeTab) && <button onClick={handleManualInbound} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center text-[13px] font-bold transition-colors shadow-sm"><Import size={16} className="mr-2"/> 手工入库</button>}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
          <button onClick={() => navigateInventoryTab('dashboard')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><LayoutDashboard size={14} className="mr-1.5" /> 库存监控舱</button>
          <button onClick={() => navigateInventoryTab('stock')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'stock' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Database size={14} className="mr-1.5" /> 现存量台账</button>
          <div className="w-px h-5 bg-slate-200 mx-1 self-center"></div>
          <button onClick={() => navigateInventoryTab('inbound')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'inbound' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><ArrowDownToLine size={14} className="mr-1.5" /> 入库流水</button>
          <button onClick={() => navigateInventoryTab('outbound')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'outbound' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><ArrowUpFromLine size={14} className="mr-1.5" /> 出库管理</button>
          <div className="w-px h-5 bg-slate-200 mx-1 self-center"></div>
          <button onClick={() => navigateInventoryTab('warehouses')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'warehouses' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Warehouse size={14} className="mr-1.5" /> 仓库</button>
          <button onClick={() => navigateInventoryTab('products')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'products' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Package size={14} className="mr-1.5" /> 产品</button>
          <button onClick={() => navigateInventoryTab('materials')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'materials' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Box size={14} className="mr-1.5" /> 物料</button>
        </div>
        <BusinessFlowDock moduleName="库存管理" flow={businessFlow} onAction={handleInventoryFlowAction} onNavigate={onNavigateModule} />
        <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
            {activeTab === 'dashboard' && (
                <UnifiedMonitorCabin
                  metrics={[
                    { title: '总库存周转率', value: '-', suffix: '次/年', subtitle: '待后端统计', theme: 'emerald', icon: RefreshCw, trend: 'flat' },
                    { title: '低位预警物料', value: String(inv_stockData.filter(item => item.kind === '物料' && item.availQty < 0).length), suffix: '项', subtitle: '低于安全库存', theme: 'amber', icon: AlertTriangle, trend: 'flat' },
                    { title: '呆滞积压资金', value: '-', suffix: '万元', subtitle: '待后端统计', theme: 'rose', icon: Wallet, trend: 'flat' },
                    { title: '本月出入库单', value: '-', suffix: '单', subtitle: '待后端统计', theme: 'blue', icon: ClipboardCheck, trend: 'flat' },
                  ]}
                  aiCards={[
                    { title: 'AI 呆滞物料分析与调拨建议', icon: Clock, tone: 'amber',
                      subject: '暂无呆滞物料数据', badge: '-',
                      lines: [<><span className="font-bold text-slate-800">分析：</span>暂无呆滞物料数据。请在库存台账录入产品和物料信息后查看分析结果。</>]
                    },
                    { title: 'AI 动态安全库存水位预警', icon: AlertTriangle, tone: 'rose',
                      subject: '暂无低水位预警数据', badge: '-',
                      lines: [<><span className="font-bold text-slate-800">预警：</span>暂无低于安全库存的物料。</>]
                    }
                  ]}
                  trend={{
                    title: '库存周转与安全水位趋势',
                    metric: '-',
                    metricLabel: '待统计',
                    metricColor: '#f43f5e',
                    ringColor: '#ffe4e6',
                    insightTitle: '库存健康度',
                    insight: '库存数据待后端统计后展示。',
                    recommendation: '请确认库存可用量数据已同步。',
                    chartTitle: '近半年库存周转与水位趋势',
                    legend: [
                      { label: '库存周转率', color: '#2563eb' },
                      { label: '安全水位预测', color: '#f43f5e' },
                    ],
                    primary: '#2563eb',
                    secondary: '#f43f5e',
                    gradientId: 'inventoryTrendGradient',
                  }}
                />
            )}
            {activeTab === 'stock' && (
              <InventoryStockQueryPanel
                tenantId={currentTenant?.id}
                stockData={stockData}
                formalMasterData={formalInventory.masterData}
                stockStatus={formalInventory.status}
                stockError={formalInventory.error}
                onRefreshStock={formalInventory.refresh}
                onQuickInventory={handleQuickInventory}
                onView={(row) => setRecordModal({ type: 'stock', mode: 'view', record: row })}
                onEdit={(row) => setRecordModal({ type: 'stock', mode: 'edit', record: row })}
                onTransfer={handleTransferStock}
                onDelete={(row) => setDeleteTarget({ type: 'stock', record: row })}
                onCreateProductionRequest={openInventoryProductionRequest}
                onCreatePurchaseRequest={openInventoryPurchaseRequest}
              />
            )}
            {activeTab === 'inbound' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><ArrowDownToLine className="w-4.5 h-4.5 text-emerald-600" /> 入库流水明细</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px]">
                            <thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase">
                                <tr><th className="px-6 py-4 font-bold">单据流水号</th><th className="px-6 py-4 font-bold">业务类型</th><th className="px-6 py-4 font-bold">来源 / 目标单据</th><th className="px-6 py-4 font-bold">核心物料</th><th className="px-6 py-4 font-bold text-right">发生数量</th><th className="px-6 py-4 font-bold">操作日期</th><th className="px-6 py-4 font-bold">单据状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {inboundData.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono font-bold text-blue-600">
                                            <div>{row.id}</div>
                                            {row.outboundId && row.outboundId !== row.id && <div className="text-[10px] text-emerald-600 font-normal mt-0.5">出库单 {row.outboundId.slice(0, 8)}…</div>}
                                        </td>
                                        <td className="px-6 py-4"><span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-slate-200">{row.type}</span></td>
                                        <td className="px-6 py-4 text-slate-600 font-mono font-bold text-[12px]">{row.source}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{row.item}</td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-[14px] text-emerald-600">+{row.qty}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-[12px]">{row.date}</td>
                                        <td className="px-6 py-4">
                                            {row.status === '已入库' ? <span className="text-emerald-600 font-bold text-[12px] flex items-center gap-1"><CheckCircle2 size={14}/> {row.status}</span> : <span className="text-amber-600 font-bold text-[12px] flex items-center gap-1"><Clock size={14}/> {row.status}</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                            <button title="查看入库单" onClick={() => setRecordModal({ type: 'inbound', mode: 'view', record: row })} className="p-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"><Eye size={14}/></button>
                                            <button title="编辑入库单" onClick={() => setRecordModal({ type: 'inbound', mode: 'edit', record: row })} className="p-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"><Edit2 size={14}/></button>
                                            {row.status !== '已入库' && <button title="验收入库" onClick={() => completeInbound(row)} className="p-1.5 border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"><ClipboardCheck size={14}/></button>}
                                            <button title="删除入库单" onClick={() => setDeleteTarget({ type: 'inbound', record: row })} className="p-1.5 border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><Trash2 size={14}/></button>
                                          </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination total={inboundData.length} page={1} limit={10} />
                </div>
            )}
            {activeTab === 'outbound' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    {requestedSalesOrderId && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-6 py-3" role="status">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white"><Link size={15}/></div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-bold text-blue-800">来自销售订单 {requestedOutbound?.source || requestedSalesOrderId}</div>
                            <div className="mt-0.5 text-[11px] text-blue-600">{requestedOutbound ? `已定位出库任务 ${requestedOutbound.id}` : '出库任务尚未生成，请返回销售订单重新发起'}</div>
                          </div>
                        </div>
                        <button onClick={() => onNavigateModule?.('销售管理', { query: { tab: 'orders', focusOrder: requestedOutbound?.source || requestedSalesOrderId } })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-bold text-blue-700 hover:bg-blue-100"><ArrowRight size={14} className="rotate-180"/>返回销售订单</button>
                      </div>
                    )}
                    <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
                        <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><ArrowUpFromLine className="w-4.5 h-4.5 text-rose-500" /> 出库管理</h4>
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                          <label htmlFor="inventory-outbound-source-search" className="text-[12px] font-bold text-slate-600">销售订单号</label>
                          <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 sm:w-80">
                            <Search size={14} className="shrink-0 text-slate-400" />
                            <input ref={outboundSourceSearchRef} id="inventory-outbound-source-search" type="text" role="searchbox" value={outboundSourceSearch} onChange={event => setOutboundSourceSearch(event.target.value)} placeholder="搜索来源 / 目标单据" className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none focus-visible:outline-none" />
                            <button type="button" title="清空销售订单号搜索" aria-label="清空销售订单号搜索" disabled={!outboundSourceSearch} onClick={() => { setOutboundSourceSearch(''); outboundSourceSearchRef.current?.focus(); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:invisible"><X size={14} /></button>
                          </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap">
                            <thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase">
                                <tr><th className="px-4 py-3 font-bold">单据流水号</th><th className="px-4 py-3 font-bold">业务类型</th><th className="px-4 py-3 font-bold">来源 / 目标单据</th><th className="px-4 py-3 font-bold">产品明细</th><th className="px-4 py-3 font-bold text-right">发生数量</th><th className="px-4 py-3 font-bold">操作日期</th><th className="px-4 py-3 font-bold">单据状态</th><th className="px-4 py-3 font-bold text-right">操作</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredOutboundData.map((row) => (
                                    <tr key={row.id} className={`transition-colors ${row.source === requestedSalesOrderId || row.salesOrderId === requestedSalesOrderId ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50/50'}`}>
                                        <td className="px-4 py-3 font-mono font-bold text-blue-600">{row.id}</td>
                                        <td className="px-4 py-3"><span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-slate-200">{row.type}</span></td>
                                        <td className="px-4 py-3 text-slate-600 font-mono font-bold text-[12px]">{row.source}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800 max-w-[200px] truncate">
                                            <div title={formatOutboundProductSummary(row)} className="truncate">{formatOutboundProductSummary(row)}</div>
                                            {row.shipmentDetails && row.shipmentDetails.length > 0 && <div className="mt-0.5 text-[10px] text-emerald-600 font-mono font-bold">已发: {row.shipmentDetails.map(s => `${s.productId}×${s.shipQty}`).join('、')}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-[14px] text-rose-500">
                                            {row.shippedQty && Number(row.shippedQty) > 0
                                              ? <div className="flex flex-col items-end"><span className="text-rose-500">-{row.shippedQty}</span>{Number(row.shippedQty) < Number(row.qty) && <span className="text-[10px] text-slate-400 font-normal">/ {row.qty}</span>}</div>
                                              : <span>-{row.qty}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 font-mono text-[12px]">{formatSalesOutboundDateTime(row.date)}</td>
                                        <td className="px-4 py-3">
                                            {row.status === '已出库'
                                              ? <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 w-max"><CheckCircle2 size={12}/> 已完成</span>
                                              : row.status === '已取消'
                                                ? <span className="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 w-max"><X size={12}/> 已取消</span>
                                              : row.status === '库存不足'
                                                ? <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 w-max"><AlertTriangle size={12}/> 库存不足</span>
                                                : ['生产申请中', '生产补货中', '部分发货 · 生产补货中'].includes(row.status)
                                                  ? <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 w-max"><Factory size={12}/> {row.status}</span>
                                                  : row.status === '待重新校验库存'
                                                    ? <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 w-max"><RefreshCw size={12}/> 待重新校验库存</span>
                                                  : <span className="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 w-max"><Box size={12}/> {row.status}</span>}
                                            {row.status?.startsWith('部分发货') && Number(row.shippedQty) > 0 && <div className="mt-1 text-[10px] font-mono text-emerald-600 font-bold">已发 {row.shippedQty} / {row.qty}</div>}
                                            {row.type === '销售发货' && row.formalTask && row.inventoryFactVersion == null && <div className="mt-1 text-[10px] font-mono text-slate-400">待计算</div>}
                                            {row.type === '销售发货' && ((row.formalTask && row.inventoryFactVersion != null) || !row.formalTask) && (() => {
                                              const ss = resolveOutboundLineStockStatus(row);
                                              return <div className="mt-1 space-y-0.5">
                                                {ss.lineStatuses.map((ls, i) => (
                                                  <div key={i} className={`text-[10px] font-mono ${ls.shortage > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                                                    {ls.productId}{row.warehouse && warehouseList.length > 0 ? <span className="text-slate-400"> ({warehouseName(row.warehouse)})</span> : ''}: 可用 {ls.availQty}{ls.shortage > 0 ? <span className="text-rose-600"> · 缺口 {ls.shortage}</span> : ''}{ls.shippedQty > 0 && <span className="text-emerald-600"> · 已发 {ls.shippedQty}</span>}
                                                  </div>
                                                ))}
                                              </div>;
                                            })()}
                                            {row.shipmentDetails && row.shipmentDetails.length > 0 && <div className="mt-1 text-[10px] font-mono text-emerald-600 font-bold">已发: {row.shipmentDetails.map(s => `${s.productId}×${s.shipQty}`).join('、')}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                              <button title="查看出库单" onClick={() => setRecordModal({ type: 'outbound', mode: 'view', record: row })} className="p-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"><Eye size={14}/></button>
                                              {row.type !== '销售发货' && <button title="编辑出库单" onClick={() => setRecordModal({ type: 'outbound', mode: 'edit', record: row })} className="p-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"><Edit2 size={14}/></button>}
                                              {row.type === '销售发货' && !row.formalTask && !['已出库', '已取消'].includes(row.status)
                                                ? <button disabled title="正式销售发货必须等待服务端发货任务同步" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 text-[12px] font-bold text-slate-400 cursor-not-allowed"><Truck size={14}/>去发货</button>
                                                : row.status === '已取消' ? <span title="来源订单已取消" className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-500">订单已取消</span>
                                                : ['生产申请中', '生产补货中', '部分发货 · 生产补货中'].includes(row.status) ? <button title="查看生产申请" onClick={() => viewProductionRequest(row)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-[12px] font-bold text-amber-700 hover:bg-amber-100"><Factory size={14}/>查看生产申请</button>
                                                : row.status === '已出库' ? <button title="下载出库凭证" onClick={() => downloadOutboundVoucher(row)} className="p-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"><Download size={14}/></button>
                                                : row.type === '销售发货' && row.status !== '已出库' ? (() => {
                                                    const hasPartialShipped = Number(row.shippedQty) > 0;
                                                    return <button
                                                      title="选择发货仓库后校验真实可用量"
                                                      onClick={() => processOutbound(row)}
                                                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100"
                                                    >
                                                      <Truck size={14}/>{hasPartialShipped ? '继续发货' : '去发货'}
                                                    </button>;
                                                  })()
                                                : row.status !== '已出库' && row.type !== '销售发货' && !/^SO-\d{8}-\d{3,4}$/.test(row.source || '')
                                                ? <span title="该手工调拨出库单未关联销售订单" className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[11px] font-bold text-slate-400">未关联正式订单</span>
                                                : row.status !== '已出库' ? <button title="完成拣货出库" onClick={() => processOutbound(row)} className="p-1.5 border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"><CheckCircle2 size={14}/></button> : <button title="下载出库凭证" onClick={() => downloadOutboundVoucher(row)} className="p-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"><Download size={14}/></button>}
                                              {row.type !== '销售发货' && <button title="删除出库单" onClick={() => setDeleteTarget({ type: 'outbound', record: row })} className="p-1.5 border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><Trash2 size={14}/></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredOutboundData.length === 0 && <tr><td colSpan={8} className="px-6 py-12 text-center text-[13px] text-slate-400">{outboundSourceSearch.trim() ? '没有匹配的来源 / 目标单据' : '暂无出库任务'}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <Pagination total={filteredOutboundData.length} page={1} limit={10} />
                </div>
            )}
            {['warehouses', 'products', 'materials'].includes(activeTab) && (
              <InventoryMasterDataPanel
                activeTab={activeTab}
                tenantId={currentTenant?.id}
                stockData={stockData}
                formalMasterData={formalInventory.masterData}
                stockStatus={formalInventory.status}
                stockError={formalInventory.error}
                onRefreshStock={formalInventory.refresh}
                selectedWarehouseId={selectedWarehouseId}
                onSelectWarehouse={selectInventoryWarehouse}
                onToast={showToast}
                onCreateProductionRequest={openInventoryProductionRequest}
                onCreatePurchaseRequest={openInventoryPurchaseRequest}
                apiContext={formalContext}
                onWarehousesChanged={loadOutboundWarehouses}
              />
            )}
        </div>
      </main>
    </div>
  );
};

// ==========================================
// 4. 采购管理模块 (ProcurementManagement) 
// ==========================================
const proc_prData = [{ id: 'PR-260705-01', source: 'MRP运算自动生成', item: 'AI算力芯片 (RM201)', qty: 1000, reqDate: '2026-07-15', status: '待处理', applicant: '系统AI' }, { id: 'PR-260705-02', source: '手工提报申请', item: '微型贴片电容 (PR001)', qty: 5000, reqDate: '2026-07-20', status: '已转订单', applicant: '张工' }];
const proc_poData = [{ id: 'PO-260706-001', supplier: '深圳华芯科技', item: 'AI算力芯片 (RM201)', amount: '¥ 125,000.00', deliveryDate: '2026-07-14', status: '供应商确认', creator: '李采购' }];
const proc_suppliersData = [{ id: 'SUP-001', name: '深圳华芯科技有限公司', level: 'A', onTimeRate: '98.5%', qualityRate: '99.2%', leadTime: '7天', status: '合格供应商' }];

const Procurement_SupplierCreateModal = ({ submitting, onClose, onSubmit }: any) => {
  const [draft, setDraft] = useState({
    code: '', name: '', shortName: '', contactPerson: '', phone: '', email: '', address: '',
    rating: 'B', leadTimeDays: 7, paymentTerms: 'net30', remark: '',
  });
  const [error, setError] = useState('');
  const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors bg-white focus:border-blue-500 text-slate-800';
  const updateField = (key: string, value: string | number) => setDraft((previous: any) => ({ ...previous, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.code.trim() || !draft.name.trim()) {
      setError('请填写供应商编码和名称');
      return;
    }
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      setError('请输入有效的供应商邮箱');
      return;
    }
    const leadTimeDays = draft.leadTimeDays === '' ? Number.NaN : Number(draft.leadTimeDays);
    if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365) {
      setError('请输入 0 到 365 之间的整数交期');
      return;
    }
    setError('');
    onSubmit(draft);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl w-[760px] max-w-full max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center text-[16px] font-bold text-slate-800">
            <Store size={18} className="text-blue-600 mr-2" /> 新增供应商
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-lg px-4 py-2.5 text-[13px] font-medium">{error}</div>}
          <section>
            <div className="flex items-center mb-4"><div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div><span className="text-[15px] font-bold text-slate-800">基本信息</span></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">供应商编码 <span className="text-rose-500">*</span></label>
                <input value={draft.code} onChange={(event) => updateField('code', event.target.value)} placeholder="SUP-002" maxLength={50} className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">供应商名称 <span className="text-rose-500">*</span></label>
                <input value={draft.name} onChange={(event) => updateField('name', event.target.value)} placeholder="苏州芯联电子有限公司" maxLength={200} className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">供应商简称</label>
                <input value={draft.shortName} onChange={(event) => updateField('shortName', event.target.value)} placeholder="苏州芯联电子" className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">系统评级</label>
                <select value={draft.rating} onChange={(event) => updateField('rating', event.target.value)} className={inputClass}>
                  {['A', 'B', 'C', 'D'].map(item => <option key={item} value={item}>{item} 级</option>)}
                </select>
              </div>
            </div>
          </section>
          <section>
            <div className="flex items-center mb-4"><div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div><span className="text-[15px] font-bold text-slate-800">联系与合作</span></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">联系人</label>
                <input value={draft.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} placeholder="王经理" className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">联系电话</label>
                <input value={draft.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="13800138000" className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">邮箱</label>
                <input type="email" value={draft.email} onChange={(event) => updateField('email', event.target.value)} placeholder="purchase@company.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">平均交期（天）</label>
                <input type="number" min={0} max={365} step={1} value={draft.leadTimeDays} onChange={(event) => updateField('leadTimeDays', event.target.value === '' ? '' : Number(event.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">付款条款</label>
                <select value={draft.paymentTerms} onChange={(event) => updateField('paymentTerms', event.target.value)} className={inputClass}>
                  <option value="net30">月结 30 天</option>
                  <option value="net45">月结 45 天</option>
                  <option value="net60">月结 60 天</option>
                  <option value="prepaid">预付款</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">地址</label>
                <input value={draft.address} onChange={(event) => updateField('address', event.target.value)} placeholder="江苏省苏州市工业园区" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[13px] text-slate-600 mb-1.5 font-medium">备注</label>
                <textarea value={draft.remark} onChange={(event) => updateField('remark', event.target.value)} rows={3} placeholder="记录供应商资质、合作范围或特殊约定" className={`${inputClass} resize-none`} />
              </div>
            </div>
          </section>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50/50 rounded-b-xl">
          <button type="button" onClick={onClose} className="px-5 py-2 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">取消</button>
          <button type="submit" disabled={submitting} className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 创建供应商
          </button>
        </div>
      </form>
    </div>
  );
};

const ProcurementManagement = ({ businessFlow, onBusinessFlowAction, onNavigateModule, currentTenant, currentUser }) => {
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('procurement');
    return ['dashboard', 'pr', 'order', 'supplier'].includes(requested || '') ? requested : 'dashboard';
  });
  const focusedPrId = new URLSearchParams(window.location.search).get('focusPr');
  const [actionModal, setActionModal] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  const [formalRequests, setFormalRequests] = useState([]);
  const [formalOrders, setFormalOrders] = useState([]);
  const [formalSuppliers, setFormalSuppliers] = useState([]);
  const [supplierCreateOpen, setSupplierCreateOpen] = useState(false);
  const [supplierCreating, setSupplierCreating] = useState(false);
  const [localRequests, setLocalRequests] = useState(() => loadInventoryPurchaseRequests(window.localStorage, currentTenant?.id));
  const formalContext = currentUser?.accessToken ? { tenantId: currentTenant?.id || 'TENANT-SHWS', accessToken: currentUser.accessToken } : null;

  const showCenterToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 2600);
  };

  const refreshProcurement = async () => {
    if (!formalContext) return;
    const [requests, orders, suppliers] = await Promise.all([procurementApi.listRequests(formalContext), procurementApi.listOrders(formalContext), procurementApi.listSuppliers(formalContext)]);
    setFormalRequests(Array.isArray(requests.items) ? requests.items : []);
    setFormalOrders(Array.isArray(orders.items) ? orders.items : []);
    setFormalSuppliers(Array.isArray(suppliers.items) ? suppliers.items : []);
  };

  useEffect(() => {
    refreshProcurement().catch((error) => showCenterToast(error instanceof Error ? `正式采购数据加载失败：${error.message}` : '正式采购数据加载失败', 'error'));
  }, [formalContext?.tenantId, formalContext?.accessToken]);

  const handleCreateSupplier = async (draft: any) => {
    if (!formalContext) {
      showCenterToast('请先登录正式会话后再创建供应商', 'error');
      return;
    }
    try {
      setSupplierCreating(true);
      const supplier = await procurementApi.createSupplier(formalContext, {
        code: draft.code.trim(),
        name: draft.name.trim(),
        shortName: draft.shortName.trim(),
        contactPerson: draft.contactPerson.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        address: draft.address.trim(),
        rating: draft.rating,
        leadTimeDays: Number(draft.leadTimeDays),
        paymentTerms: draft.paymentTerms,
        remark: draft.remark.trim(),
      });
      await refreshProcurement();
      setSupplierCreateOpen(false);
      showCenterToast(`供应商 ${supplier.code || supplier.name} 已创建`, 'success');
    } catch (error) {
      showCenterToast(error instanceof Error ? `创建供应商失败：${error.message}` : '创建供应商失败', 'error');
    } finally {
      setSupplierCreating(false);
    }
  };

  useEffect(() => {
    setLocalRequests(loadInventoryPurchaseRequests(window.localStorage, currentTenant?.id));
  }, [currentTenant?.id]);

  const linkedPrRow = businessFlow && isLinkedFlowAtLeast(businessFlow, 'purchaseRequest') ? {
    id: 'PR-LINK-001',
    source: `MRP-LINK-001 / ${businessFlow.orderId}`,
    item: 'AI算力芯片 (RM201)',
    qty: businessFlow.qty * 2,
    reqDate: '2026-06-23',
    status: isLinkedFlowAtLeast(businessFlow, 'purchaseOrder') ? '已转订单' : '待审批',
    applicant: '系统联动'
  } : null;
  const linkedPoRow = businessFlow && isLinkedFlowAtLeast(businessFlow, 'purchaseOrder') ? {
    id: 'PO-LINK-001',
    supplier: '深圳华芯科技',
    item: 'AI算力芯片 (RM201)',
    amount: '¥ 25,600.00',
    deliveryDate: '2026-06-23',
    status: isLinkedFlowAtLeast(businessFlow, 'materialInbound') ? '已送货入库' : '供应商确认',
    creator: '系统联动'
  } : null;
  const formalPrRows = formalRequests.map(request => ({
    ...request,
    id: request.requestNo || request.id,
    apiId: request.id,
    source: `MRP ${request.mrpTaskId || '未知任务'} / ${request.demandId || '未知需求'}`,
    item: `${request.materialName || request.materialId || '未知物料'} (${request.materialId || '-'})`,
    qty: Number(request.requiredQty || 0),
    reqDate: request.requiredDate || request.dueDate || '-',
    status: request.status === 'PENDING_APPROVAL' ? '待审批' : request.status === 'CONVERTED' ? '已转订单' : request.status === 'REJECTED' ? '已驳回' : request.status === 'CANCELED' ? '已取消' : '已审批',
    applicant: '正式采购服务',
    formalRequest: request
  }));
  const formalPoRows = formalOrders.map(order => ({
    ...order,
    id: order.orderNo || order.id,
    apiId: order.id,
    supplier: order.supplierName || '未知供应商',
    item: `${order.materialName || order.materialId || '未知物料'} (${order.materialId || '-'})`,
    amount: order.totalAmount ? `¥ ${parseFloat(order.totalAmount).toLocaleString('zh-CN')}` : `${order.orderedQty || 0} ${order.uom || ''}`.trim(),
    deliveryDate: order.promisedDate || '-',
    status: order.status === 'RECEIVED' ? '已送货入库' : order.status === 'PARTIALLY_RECEIVED' ? '部分入库' : order.status === 'CANCELED' ? '已取消' : '供应商确认',
    creator: '正式采购服务',
    formalOrder: order
  }));
  const prRows = [...formalPrRows, ...localRequests, ...(linkedPrRow ? [linkedPrRow] : []), ...proc_prData]
    .filter((row, index, rows) => rows.findIndex((item) => item.id === row.id) === index);
  const poRows = formalPoRows.length ? [...formalPoRows, ...proc_poData] : linkedPoRow ? [linkedPoRow, ...proc_poData.filter(row => row.id !== linkedPoRow.id)] : proc_poData;
  const formalSupplierRows = formalSuppliers.map(supplier => ({
    ...supplier,
    id: supplier.code || supplier.id,
    apiId: supplier.id,
    name: supplier.name || '未知供应商',
    level: supplier.rating || '-',
    onTimeRate: '98.5%',
    qualityRate: '99.2%',
    leadTime: `${supplier.leadTimeDays ?? '-'}天`,
    status: supplier.status === 'enabled' ? '合格供应商' : supplier.status === 'disabled' ? '已停用' : '黑名单',
    formalSupplier: supplier
  }));

  const openProcAction = (kind) => {
    const configs = {
      adopt: {
        kind,
        title: '采纳 AI 寻源并生成采购订单',
        desc: '系统会把 PR-260705-01 转为正式采购订单，并跳转到采购订单页核对。',
        icon: ShoppingCart,
        tone: 'blue',
        confirmText: '生成 PO 并跳转',
        details: [
          { label: '采购申请', value: 'PR-260705-01' },
          { label: '推荐供应商', value: '深圳华芯科技' },
          { label: '采购物料', value: 'AI算力芯片 RM201' },
          { label: '建议数量', value: '1000 PCS' }
        ],
        steps: ['锁定推荐供应商', '生成采购订单草稿', '跳转至采购订单台账']
      },
      quote: {
        kind,
        title: '发起备选供应商询价',
        desc: '系统会生成备选询价任务，并跳转到供应商管理页查看候选供应商。',
        icon: Store,
        tone: 'rose',
        confirmText: '发起询价并跳转',
        details: [
          { label: '风险订单', value: 'PO-260706-001' },
          { label: '备选供应商', value: '苏州芯联电子' },
          { label: '询价数量', value: '300 PCS' },
          { label: '目标', value: '降低停线风险' }
        ],
        steps: ['创建备选询价单', '通知采购员跟进', '跳转到供应商管理']
      },
      notify: {
        kind,
        title: '通知生产计划调整',
        desc: '系统会把采购交期风险推送给生产计划员，并跳转回采购监控舱保留风险上下文。',
        icon: Send,
        tone: 'amber',
        confirmText: '发送通知',
        details: [
          { label: '风险来源', value: '深圳华芯科技交付波动' },
          { label: '影响物料', value: 'AI算力芯片 RM201' },
          { label: '接收角色', value: '生产计划员 / MPS负责人' },
          { label: '建议动作', value: '预留替代供应窗口' }
        ],
        steps: ['生成风险通知', '推送生产计划', '保留采购监控舱上下文']
      }
    };
    setActionModal(configs[kind]);
  };

  const openProcRowAction = (kind, row) => {
    const configs = {
      prView: {
        kind,
        title: '查看采购申请明细',
        desc: `查看 ${row.id} 的需求来源、请购物料、申请人和审批状态。`,
        icon: Eye,
        tone: 'blue',
        confirmText: '已查看',
        details: [
          { label: '申请单号', value: row.id },
          { label: '需求来源', value: row.source },
          { label: '请购物料', value: row.item },
          { label: '申请人', value: row.applicant || '系统' }
        ]
      },
      prApprove: {
        kind,
        record: row,
        title: '审批采购申请并转 PO',
        desc: `确认后会把 ${row.id} 标记为审批通过，并跳转到采购订单台账。`,
        icon: CheckCircle2,
        tone: 'emerald',
        confirmText: '审批通过',
        details: [
          { label: '申请单号', value: row.id },
          { label: '需求数量', value: `${row.qty} PCS` },
          { label: '需求日期', value: row.reqDate },
          { label: '当前状态', value: row.status }
        ],
        steps: ['复核需求来源', '审批通过采购申请', '跳转采购订单台账']
      },
      prReject: {
        kind,
        record: row,
        title: '驳回采购申请',
        desc: `确认后会把 ${row.id} 标记为已驳回。`,
        icon: XCircle,
        tone: 'red',
        confirmText: '确认驳回',
        details: [
          { label: '申请单号', value: row.id },
          { label: '请购物料', value: row.item },
          { label: '需求数量', value: `${row.qty} PCS` },
          { label: '当前状态', value: row.status }
        ]
      },
      poView: {
        kind,
        title: '查看采购订单详情',
        desc: `查看 ${row.id} 的供应商、交付日期和订单状态。`,
        icon: Eye,
        tone: 'blue',
        confirmText: '已查看',
        details: [
          { label: '采购单号', value: row.id },
          { label: '供应商', value: row.supplier },
          { label: '订单金额', value: row.amount },
          { label: '计划到货', value: row.deliveryDate }
        ]
      },
      poDelivery: {
        kind,
        record: row,
        title: '登记供应商送货',
        desc: `确认 ${row.id} 的供应商送货信息，并推送库存入库。`,
        icon: Truck,
        tone: 'emerald',
        confirmText: '登记送货',
        details: [
          { label: '采购单号', value: row.id },
          { label: '采购物料', value: row.item },
          { label: '供应商', value: row.supplier },
          { label: '当前状态', value: row.status }
        ],
        steps: ['登记 ASN 送货', '通知仓库收货', '同步采购履约状态']
      },
      poCancel: {
        kind,
        record: row,
        title: '取消采购订单',
        desc: `确认后会把 ${row.id} 标记为已取消。`,
        icon: XCircle,
        tone: 'red',
        confirmText: '确认取消',
        details: [
          { label: '采购单号', value: row.id },
          { label: '供应商', value: row.supplier },
          { label: '采购物料', value: row.item },
          { label: '当前状态', value: row.status }
        ]
      },
      supplierView: {
        kind,
        title: '查看供应商档案',
        desc: `查看 ${row.name} 的绩效、评级和合作状态。`,
        icon: Store,
        tone: 'blue',
        confirmText: '已查看',
        details: [
          { label: '供应商编码', value: row.id },
          { label: '供应商名称', value: row.name },
          { label: '系统评级', value: row.level },
          { label: '历史准交率', value: row.onTimeRate }
        ]
      },
      supplierScore: {
        kind,
        title: '刷新供应商绩效评分',
        desc: `系统会重新计算 ${row.name} 的准交、质量和交期表现。`,
        icon: Gauge,
        tone: 'purple',
        confirmText: '刷新评分',
        details: [
          { label: '准交率', value: row.onTimeRate },
          { label: '质量合格率', value: row.qualityRate },
          { label: '平均交期', value: row.leadTime },
          { label: '当前状态', value: row.status }
        ]
      }
    };
    setActionModal(configs[kind]);
  };

  const confirmProcAction = async () => {
    if (!actionModal) return;
    if (actionModal.kind === 'adopt') {
      if (businessFlow?.currentStep === 'purchaseRequest') onBusinessFlowAction?.('approvePr');
      setActiveTab('order');
      showCenterToast('采购订单草稿已生成，已跳转到 PO 台账', 'success');
    }
    if (actionModal.kind === 'quote') {
      setActiveTab('supplier');
      showCenterToast('备选询价任务已创建，已跳转到供应商管理', 'success');
    }
    if (actionModal.kind === 'notify') {
      setActiveTab('dashboard');
      showCenterToast('生产计划通知已发送', 'warning');
    }
    if (actionModal.kind === 'prView' || actionModal.kind === 'poView' || actionModal.kind === 'supplierView') {
      showCenterToast('单据详情已打开', 'success');
    }
    if (actionModal.kind === 'prApprove') {
      if (actionModal.record?.formalRequest) {
        try {
          if (!formalContext) throw new Error('请先登录正式会话');
          const result = await procurementApi.approveRequest(formalContext, actionModal.record.formalRequest);
          await refreshProcurement();
          onBusinessFlowAction?.('formalPoCreated', { purchaseOrder: result.order });
          setActiveTab('order');
          showCenterToast(`采购申请已审批，正式 PO ${result.order.orderNo} 已生成`, 'success');
        } catch (error) {
          showCenterToast(error instanceof Error ? `采购审批失败：${error.message}` : '采购审批失败', 'error');
          return;
        }
      } else if (actionModal.record?.localRequest) {
        const updated = updateInventoryPurchaseRequestStatus(window.localStorage, currentTenant?.id, actionModal.record.id, '已转订单');
        if (updated) setLocalRequests((previous) => previous.map((item) => item.id === updated.id ? updated : item));
        setActiveTab('order');
        showCenterToast(`采购申请 ${actionModal.record.id} 已审批，等待生成正式采购订单`, 'success');
      } else {
        if (businessFlow?.currentStep === 'purchaseRequest') onBusinessFlowAction?.('approvePr');
        setActiveTab('order');
        showCenterToast('采购申请已审批通过，已跳转采购订单台账', 'success');
      }
    }
    if (actionModal.kind === 'poDelivery') {
      if (actionModal.record?.formalOrder) {
        try {
          if (!formalContext) throw new Error('请先登录正式会话');
          const result = await procurementApi.receiveOrder(formalContext, actionModal.record.formalOrder);
          await refreshProcurement();
          onBusinessFlowAction?.('formalMaterialInbound', { receipt: result.receipt, availability: result.availability });
          showCenterToast(`采购入库 ${result.receipt.receiptNo} 已正式过账`, 'success');
        } catch (error) {
          showCenterToast(error instanceof Error ? `采购入库失败：${error.message}` : '采购入库失败', 'error');
          return;
        }
      } else {
        if (businessFlow?.currentStep === 'purchaseOrder') onBusinessFlowAction?.('receiveMaterial');
        showCenterToast('供应商送货已登记，库存收货任务已生成', 'success');
      }
    }
    if (actionModal.kind === 'prReject') {
      if (actionModal.record?.formalRequest) {
        try {
          if (!formalContext) throw new Error('请先登录正式会话');
          await procurementApi.rejectRequest(formalContext, actionModal.record.formalRequest, '审批不通过');
          await refreshProcurement();
          showCenterToast(`采购申请 ${actionModal.record.id} 已驳回`, 'warning');
        } catch (error) {
          showCenterToast(error instanceof Error ? `驳回失败：${error.message}` : '驳回失败', 'error');
          return;
        }
      } else {
        showCenterToast(`采购申请 ${actionModal.record.id} 已驳回`, 'warning');
      }
    }
    if (actionModal.kind === 'poCancel') {
      if (actionModal.record?.formalOrder) {
        try {
          if (!formalContext) throw new Error('请先登录正式会话');
          await procurementApi.cancelOrder(formalContext, actionModal.record.formalOrder, '订单取消');
          await refreshProcurement();
          showCenterToast(`采购订单 ${actionModal.record.id} 已取消`, 'warning');
        } catch (error) {
          showCenterToast(error instanceof Error ? `取消失败：${error.message}` : '取消失败', 'error');
          return;
        }
      } else {
        showCenterToast(`采购订单 ${actionModal.record.id} 已取消`, 'warning');
      }
    }
    if (actionModal.kind === 'supplierScore') {
      showCenterToast('供应商绩效评分已刷新', 'success');
    }
    setActionModal(null);
  };

  const getPOStatusBadge = (status) => {
    if(status.includes('确认')) return <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max"><CheckCircle2 size={12}/> {status}</span>;
    return <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-bold">{status}</span>;
  };

  const handleProcurementFlowAction = (action) => {
    if (action === 'approvePr' && businessFlow?.purchaseRequest) {
      const row = formalPrRows.find(item => item.apiId === businessFlow.purchaseRequest.id);
      if (!row) {
        showCenterToast('正式采购申请尚未加载，请刷新后重试', 'warning');
        return;
      }
      setActiveTab('pr');
      openProcRowAction('prApprove', row);
      return;
    }
    if (action === 'receiveMaterial' && businessFlow?.purchaseOrder) {
      const row = formalPoRows.find(item => item.apiId === businessFlow.purchaseOrder.id);
      if (!row) {
        showCenterToast('正式采购订单尚未加载，请刷新后重试', 'warning');
        return;
      }
      setActiveTab('order');
      openProcRowAction('poDelivery', row);
      return;
    }
    onBusinessFlowAction?.(action);
  };

  return (
    <div className="w-full h-full font-sans flex flex-col relative">
      <CenterToast toast={toast} onClose={() => setToast({ show: false, msg: '', type: 'success' })} />
      <BusinessActionModal action={actionModal} onClose={() => setActionModal(null)} onConfirm={confirmProcAction} />
      {supplierCreateOpen && <Procurement_SupplierCreateModal submitting={supplierCreating} onClose={() => setSupplierCreateOpen(false)} onSubmit={handleCreateSupplier} />}
      <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
        <div className="flex justify-between items-start mb-6 shrink-0">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl mr-4 shadow-sm"><ShoppingCart size={24} /></div>
            <div className="flex flex-col justify-center">
              <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">采购管理</h1>
              <div className="text-[13px] text-slate-500 mt-1 font-medium">供应链协同与寻源采购决策中心</div>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><LayoutDashboard size={14} className="mr-1.5" /> 采购监控舱</button>
          <button onClick={() => setActiveTab('pr')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'pr' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><FilePlus size={14} className="mr-1.5" /> 采购申请(PR)</button>
          <button onClick={() => setActiveTab('order')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'order' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><FileText size={14} className="mr-1.5" /> 采购订单(PO)</button>
          <button onClick={() => setActiveTab('supplier')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'supplier' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Store size={14} className="mr-1.5" /> 供应商管理</button>
        </div>
        <BusinessFlowDock moduleName="采购管理" flow={businessFlow} onAction={handleProcurementFlowAction} onNavigate={onNavigateModule} />
        <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
            {activeTab === 'dashboard' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <StatCard title="待处理采购申请" value={String(formalRequests.filter(r => r.status === 'PENDING_APPROVAL').length)} unit="单" icon={FilePlus} trend="up" trendValue="当前待处理" theme="blue" />
                      <StatCard title="本月累计采购额" value={String(Math.round(formalOrders.reduce((s,o) => s + Number(o.totalAmount || 0), 0) / 10000 * 10) / 10)} unit="万元" icon={BadgeDollarSign} trend="flat" trendValue="订单总额" theme="purple" />
                      <StatCard title="整体供应商准交率" value="-" unit="%" icon={CheckCircle2} trend="flat" trendValue="待后端统计" theme="emerald" />
                      <StatCard title="异常交付订单" value={String(formalOrders.filter(o => o.status === 'PARTIALLY_RECEIVED').length)} unit="单" icon={AlertTriangle} trend="flat" trendValue="部分收货中" theme="red" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
                        <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]">
                          <div className="bg-purple-50 p-1.5 rounded-lg text-purple-600 mr-2.5 border border-purple-100"><Bot size={18} /></div>
                          AI 供应商寻源与优选推荐
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 relative">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800 text-[14px]">采购申请：{formalRequests.find(r => r.status === 'PENDING_APPROVAL')?.prNo || '暂无待审批 PR'}</h3>
                            <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${formalRequests.find(r => r.status === 'PENDING_APPROVAL') ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : 'bg-slate-50 border border-slate-100 text-slate-400'}`}>{formalRequests.find(r => r.status === 'PENDING_APPROVAL') ? 'AI 已寻源' : '无待审批'}</span>
                          </div>
                          <div className="text-[13px] text-slate-600 leading-relaxed space-y-3 mb-5">
                            <p><span className="font-bold text-slate-800">历史画像匹配：</span> 模型分析了 3 家潜在供应商的历史交期与退货率。推荐将此单下发给 <strong>[深圳华芯科技]</strong>。</p>
                            <p><span className="font-bold text-slate-800">推荐理由：</span> 该供应商在过去半年内对同类芯片的交期达标率为 98.5%，且当前承诺价格低于市场均价 2%。</p>
                          </div>
                          <div className="flex gap-4">
                            <button onClick={() => openProcAction('adopt')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm">一键采纳并生成 PO</button>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
                        <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]">
                          <div className="bg-rose-50 p-1.5 rounded-lg text-rose-600 mr-2.5 border border-rose-100"><ShieldAlert size={18} /></div>
                          AI 交期风险预警与替代供应
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800 text-[14px]">{formalOrders.find(o => o.status === 'PARTIALLY_RECEIVED')?.poNo || '暂无在途 PO'} / {formalOrders.find(o => o.status === 'PARTIALLY_RECEIVED')?.materialName || '-'}</h3>
                            <span className="px-2.5 py-1 bg-rose-50 border border-rose-100 text-rose-600 text-[11px] font-bold rounded-lg">高风险</span>
                          </div>
                          <div className="text-[13px] text-slate-600 leading-relaxed space-y-3 mb-5">
                            <p><span className="font-bold text-slate-800">风险来源：</span> 深圳华芯科技近 7 天产线稼动率下降，叠加物流线路拥堵，预计晚交风险升至 68%。</p>
                            <p><span className="font-bold text-slate-800">AI 建议：</span> 保留原 PO，同时向备选供应商「苏州芯联」发起 300 PCS 询价，降低停线风险。</p>
                          </div>
                          <div className="flex gap-4">
                            <button onClick={() => openProcAction('quote')} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm">发起备选询价</button>
                            <button onClick={() => openProcAction('notify')} className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm">通知生产计划</button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <MonitorTrendChart
                      trend={{
                        title: 'PR → PO → 到货闭环趋势',
                        metric: formalOrders.length > 0 ? Math.round(formalOrders.filter(o => o.status === 'RECEIVED').length / formalOrders.length * 100) + '%' : '-',
                        metricLabel: '准交率',
                        metricColor: '#10b981',
                        ringColor: '#d1fae5',
                        insightTitle: '采购闭环分析',
                        insight: 'PR 转 PO 效率稳定提升，但高价值芯片类订单仍受供应商产能和物流波动影响。',
                        recommendation: '对高金额 PR 启用优先寻源策略，并为核心芯片建立备选供应商询价池，降低单点晚交风险。',
                        chartTitle: '近半年采购准交率与异常订单趋势',
                        legend: [
                          { label: '供应商准交率', color: '#2563eb' },
                          { label: 'AI 晚交风险预测', color: '#f43f5e' },
                        ],
                        primary: '#2563eb',
                        secondary: '#f43f5e',
                        yAxis: [100, 95, 90, 85, 80],
                        gradientId: 'procTrendGradient',
                        forecastPath: 'M 780 55 C 845 80, 895 105, 950 96',
                      }}
                    />

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                      <div className="xl:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center text-slate-800 font-bold text-[16px]">
                            <Activity className="text-blue-600 mr-2" size={18} />
                            PR → PO → 到货流转监控
                          </div>
                          <span className="text-[12px] text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full">本周采购闭环</span>
                        </div>
                        <div className="grid grid-cols-4 gap-4 mb-6">
                          {[
                            { label: 'PR待审核', value: '3', color: 'blue', icon: FilePlus },
                            { label: '待寻源', value: '2', color: 'purple', icon: Store },
                            { label: 'PO待确认', value: '4', color: 'amber', icon: FileText },
                            { label: '待到货', value: '6', color: 'emerald', icon: Truck }
                          ].map((item, idx) => {
                            const StepIcon = item.icon;
                            const colorClass = item.color === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-100' : item.color === 'purple' ? 'bg-purple-50 text-purple-600 border-purple-100' : item.color === 'amber' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100';
                            return (
                              <div key={item.label} className="relative">
                                {idx < 3 && <div className="hidden lg:block absolute top-5 left-[calc(100%-8px)] w-4 border-t border-slate-200"></div>}
                                <div className={`border rounded-xl p-4 ${colorClass}`}>
                                  <div className="flex items-center justify-between mb-3">
                                    <StepIcon size={18} />
                                    <span className="text-[24px] font-bold">{item.value}</span>
                                  </div>
                                  <div className="text-[12px] font-bold">{item.label}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {[
                            { id: 'PR-260705-01', title: 'AI算力芯片', meta: 'MRP自动生成 · 1000 PCS', status: '建议转PO', tone: 'blue' },
                            { id: 'PO-260706-001', title: '深圳华芯科技', meta: '2026-07-14 到货 · ¥125,000', status: '供应商确认', tone: 'emerald' },
                            { id: 'ASN-260707-02', title: '12层空PCB板', meta: '预计晚到 1 天 · 500 PCS', status: '需跟催', tone: 'rose' }
                          ].map(item => (
                            <div key={item.id} className="border border-slate-100 bg-slate-50/70 rounded-xl p-4">
                              <div className="flex justify-between items-start mb-2">
                                <span className="font-mono text-[12px] font-bold text-blue-600">{item.id}</span>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${item.tone === 'rose' ? 'bg-rose-50 text-rose-600 border-rose-100' : item.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{item.status}</span>
                              </div>
                              <div className="font-bold text-[13px] text-slate-800">{item.title}</div>
                              <div className="text-[12px] text-slate-500 mt-1">{item.meta}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]">
                          <Award className="text-emerald-600 mr-2" size={18} />
                          供应商绩效排行
                        </div>
                        <div className="space-y-4">
                          {[
                            { name: '深圳华芯科技', score: 96, desc: '芯片类 · A级', risk: '低风险' },
                            { name: '苏州芯联电子', score: 91, desc: 'PCB/封装 · A级', risk: '备选推荐' },
                            { name: '宁波精密五金', score: 82, desc: '结构件 · B级', risk: '需复核' }
                          ].map(row => (
                            <div key={row.name} className="border border-slate-100 rounded-xl p-4 bg-slate-50/60">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <div className="font-bold text-[13px] text-slate-800">{row.name}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">{row.desc}</div>
                                </div>
                                <span className="font-mono text-[18px] font-bold text-slate-800">{row.score}</span>
                              </div>
                              <div className="h-1.5 bg-white border border-slate-100 rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${row.score}%` }}></div>
                              </div>
                              <div className="text-[11px] text-slate-500 font-medium">{row.risk}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]">
                          <CalendarDays className="text-blue-600 mr-2" size={18} />
                          近期待到货日程
                        </div>
                        <div className="space-y-3">
                          {[
                            { date: '07-14', item: 'AI算力芯片 RM201', supplier: '深圳华芯科技', qty: '1000 PCS', status: '供应商确认' },
                            { date: '07-15', item: '微型贴片电容 PR001', supplier: '苏州芯联电子', qty: '5000 PCS', status: '运输中' },
                            { date: '07-17', item: '铝合金防护外壳 RM305', supplier: '宁波精密五金', qty: '300 套', status: '待发货' }
                          ].map(row => (
                            <div key={`${row.date}-${row.item}`} className="flex items-center gap-4 border border-slate-100 rounded-xl p-4 bg-slate-50/60">
                              <div className="w-14 h-14 rounded-xl bg-white border border-slate-100 flex flex-col items-center justify-center shrink-0">
                                <span className="text-[11px] text-slate-400 font-bold">JUL</span>
                                <span className="text-[16px] text-slate-800 font-bold">{row.date.split('-')[1]}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-[13px] text-slate-800 truncate">{row.item}</div>
                                <div className="text-[12px] text-slate-500 mt-1">{row.supplier} · {row.qty}</div>
                              </div>
                              <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-lg text-[11px] font-bold">{row.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]">
                          <ListTodo className="text-amber-600 mr-2" size={18} />
                          采购待办与异常闭环
                        </div>
                        <div className="space-y-3">
                          {[
                            { title: '大额采购申请待审批', desc: 'PR-260705-01 金额 12.5 万，需部门总监复核', action: '查看审批' },
                            { title: '供应商确认超时', desc: 'PO-260706-003 已超过 8 小时未确认', action: '一键催办' },
                            { title: '到货质检差异', desc: 'IN-260701-02 退料待质检，需确认可回用比例', action: '查看质检' }
                          ].map(row => (
                            <div key={row.title} className="flex items-center gap-4 border border-slate-100 rounded-xl p-4 bg-slate-50/60">
                              <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                <Clock size={16} />
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-[13px] text-slate-800">{row.title}</div>
                                <div className="text-[12px] text-slate-500 mt-1">{row.desc}</div>
                              </div>
                              <button className="text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-[12px] font-bold shrink-0">{row.action}</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                </div>
            )}
            {activeTab === 'pr' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><FilePlus className="w-4.5 h-4.5 text-blue-600" /> 采购申请单 (PR)</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap">
                            <thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase">
                                <tr><th className="px-6 py-4 font-bold">申请单号</th><th className="px-6 py-4 font-bold">需求来源</th><th className="px-6 py-4 font-bold">请购物料</th><th className="px-6 py-4 font-bold text-right">需求数量</th><th className="px-6 py-4 font-bold">状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                {prRows.map((row) => (
                                    <tr key={row.id} aria-current={row.id === focusedPrId ? 'true' : undefined} className={`transition-colors ${row.id === focusedPrId ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50/50'}`}>
                                        <td className="px-6 py-4 font-bold text-blue-600 font-mono">{row.id}</td>
                                        <td className="px-6 py-4"><div className="flex items-center gap-2"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold text-[11px] border border-slate-200">{row.source}</span>{row.id === focusedPrId && <span className="rounded border border-blue-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-blue-700">本次补货</span>}</div></td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{row.item}</td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-800 text-[14px]">{row.qty}</td>
                                        <td className="px-6 py-4"><span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-lg text-[11px] font-bold">{row.status}</span></td>
                                        <td className="px-6 py-4">
                                          <TableActionGroup>
                                            <TableActionButton icon={Eye} label="查看" onClick={() => openProcRowAction('prView', row)} />
                                            <TableActionButton icon={CheckCircle2} label="审批" tone="emerald" onClick={() => openProcRowAction('prApprove', row)} disabled={row.status === '已转订单'} />
                                            <TableActionButton icon={XCircle} label="驳回" tone="red" onClick={() => openProcRowAction('prReject', row)} disabled={row.status === '已转订单'} />
                                          </TableActionGroup>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination total={prRows.length} page={1} limit={10} />
                </div>
            )}
            {activeTab === 'order' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><ShoppingCart className="w-4.5 h-4.5 text-blue-600" /> 采购订单台账 (PO)</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap">
                            <thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase">
                                <tr><th className="px-6 py-4 font-bold">采购单号</th><th className="px-6 py-4 font-bold">供应商</th><th className="px-6 py-4 font-bold">采购物料简述</th><th className="px-6 py-4 font-bold text-right">订单总额</th><th className="px-6 py-4 font-bold">状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {poRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-blue-600 font-mono">{row.id}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2"><Store size={14} className="text-slate-400"/> {row.supplier}</td>
                                        <td className="px-6 py-4 font-bold text-slate-700">{row.item}</td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-800 text-[14px]">{row.amount}</td>
                                        <td className="px-6 py-4">{getPOStatusBadge(row.status)}</td>
                                        <td className="px-6 py-4">
                                          <TableActionGroup>
                                            <TableActionButton icon={Eye} label="查看" onClick={() => openProcRowAction('poView', row)} />
                                            <TableActionButton icon={Truck} label="送货" tone="emerald" onClick={() => openProcRowAction('poDelivery', row)} disabled={row.status.includes('入库') || row.status === '已取消'} />
                                            <TableActionButton icon={XCircle} label="取消" tone="red" onClick={() => openProcRowAction('poCancel', row)} disabled={row.status.includes('入库') || row.status === '已取消'} />
                                          </TableActionGroup>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination total={poRows.length} page={1} limit={10} />
                </div>
            )}
            {activeTab === 'supplier' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><Users className="w-4.5 h-4.5 text-blue-600" /> 供应商名录与绩效评估</h4>
                        <button onClick={() => setSupplierCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"><Plus size={14} />新增供应商</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap">
                            <thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase">
                                <tr><th className="px-6 py-4 font-bold">供应商编码</th><th className="px-6 py-4 font-bold">供应商名称</th><th className="px-6 py-4 font-bold text-center">评级</th><th className="px-6 py-4 font-bold text-right">历史准交率</th><th className="px-6 py-4 font-bold">当前状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[...formalSupplierRows, ...proc_suppliersData].map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-blue-600 font-mono">{row.id}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2"><Store size={14} className="text-slate-400"/> {row.name}</td>
                                        <td className="px-6 py-4 text-center"><span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-lg text-[12px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-600">{row.level}</span></td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">{row.onTimeRate}</td>
                                        <td className="px-6 py-4"><span className="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-emerald-100 flex items-center gap-1 w-max"><CheckCircle2 size={12}/> 合格</span></td>
                                        <td className="px-6 py-4">
                                          <TableActionGroup>
                                            <TableActionButton icon={Eye} label="档案" onClick={() => openProcRowAction('supplierView', row)} />
                                            <TableActionButton icon={Gauge} label="评分" tone="purple" onClick={() => openProcRowAction('supplierScore', row)} />
                                          </TableActionGroup>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination total={Math.max(1, Math.ceil([...formalSupplierRows, ...proc_suppliersData].length / 10))} page={1} limit={10} />
                </div>
            )}
        </div>
      </main>
    </div>
  );
};

// ==========================================
// 5. 财务管理模块 (FinancialManagement) 
// ==========================================
const FinancialManagement = ({ businessFlow, onBusinessFlowAction, onNavigateModule, currentUser, currentTenant, refreshSignal = 0 }) => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [actionModal, setActionModal] = useState(null);
    const [paymentModal, setPaymentModal] = useState(null);
    const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
    const [apiArData, setApiArData] = useState([]);
    const [apiApData, setApiApData] = useState([]);
    const [apiCostData, setApiCostData] = useState([]);
    const [apiDashboard, setApiDashboard] = useState(null);
    const [financeLoadError, setFinanceLoadError] = useState('');
    const [arSourceOrderInput, setArSourceOrderInput] = useState('');
    const [arSourceOrder, setArSourceOrder] = useState('');
    const [apSourceOrderInput, setApSourceOrderInput] = useState('');
    const [apSourceOrder, setApSourceOrder] = useState('');
    const formatCurrency = (val) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(val);

    const finCtx = useMemo(() => currentUser?.accessToken ? ({ tenantId: currentTenant?.id || 'TENANT-SHWS', accessToken: currentUser.accessToken }) : null, [currentTenant?.id, currentUser?.accessToken]);

    const mapApiAr = (item) => ({
      id: item.docNo, customer: item.customerName, soId: item.sourceDocNo || item.sourceId,
      sourceType: item.sourceType, sourceId: item.sourceId, _backend: item,
      amount: parseFloat(item.totalAmount), received: parseFloat(item.receivedAmount),
      unreceived: parseFloat(item.outstandingAmount), dueDate: item.dueDate || '',
      status: item.status === 'done' ? '已结清' : item.status === 'processing' ? '部分收款' : item.status === 'void' ? '已作废' : '待收款'
    });
    const mapApiAp = (item) => ({
      id: item.docNo, supplier: item.supplierName, poId: item.sourceDocNo || item.sourceId,
      sourceType: item.sourceType, sourceId: item.sourceId, _backend: item,
      amount: parseFloat(item.totalAmount), paid: parseFloat(item.paidAmount),
      unpaid: parseFloat(item.outstandingAmount), dueDate: item.dueDate || '',
      status: item.status === 'done' ? '已结清' : item.status === 'processing' ? '部分付款' : item.status === 'void' ? '已作废' : '待付款'
    });
    const mapApiCost = (item) => ({
      id: item.docNo, woId: item.workOrderNo || item.workOrderId || '', product: item.productName,
      materialCost: parseFloat(item.materialCost), mfgCost: parseFloat(item.manufacturingCost),
      laborCost: parseFloat(item.laborCost), totalCost: parseFloat(item.totalCost),
      unitCost: parseFloat(item.unitCost), standardUnitCost: parseFloat(item.standardUnitCost),
      variance: (parseFloat(item.variancePct) >= 0 ? '+' : '') + parseFloat(item.variancePct).toFixed(1) + '%',
      status: item.status === 'done' ? '已核算' : item.status === 'void' ? '已作废' : '核算中'
    });

    const toWan = (value?: string) => ((Number.parseFloat(value || '0') || 0) / 10000).toFixed(1);

    useEffect(() => {
      if (!finCtx) return;
      const timer = setTimeout(() => setArSourceOrder(arSourceOrderInput.trim()), 250);
      return () => clearTimeout(timer);
    }, [arSourceOrderInput]);

    useEffect(() => {
      if (!finCtx) return;
      const timer = setTimeout(() => setApSourceOrder(apSourceOrderInput.trim()), 250);
      return () => clearTimeout(timer);
    }, [apSourceOrderInput]);

    useEffect(() => {
      if (!finCtx) {
        setApiArData([]); setApiApData([]); setApiCostData([]); setApiDashboard(null);
        setFinanceLoadError('请使用正式登录会话查看财务数据');
        return;
      }
      let active = true;
      const load = async () => {
        const results = await Promise.allSettled([
          financeApi.listReceivables(finCtx, { page: 1, pageSize: 200, sourceOrder: arSourceOrder || undefined }),
          financeApi.listPayables(finCtx, { page: 1, pageSize: 200, sourceOrder: apSourceOrder || undefined }),
          financeApi.listCostAccounting(finCtx, { page: 1, pageSize: 200 }),
          financeApi.getFinanceDashboard(finCtx),
        ]);
        if (!active) return;
        const names = ['应收账款', '应付账款', '生产成本', '财务看板'];
        const failures = results.map((result, index) => result.status === 'rejected' ? {
          name: names[index],
          reason: result.reason instanceof Error ? result.reason.message : '请稍后重试',
        } : null).filter(Boolean);
        setApiArData(results[0].status === 'fulfilled' ? results[0].value.items.map(mapApiAr) : []);
        setApiApData(results[1].status === 'fulfilled' ? results[1].value.items.map(mapApiAp) : []);
        setApiCostData(results[2].status === 'fulfilled' ? results[2].value.items.map(mapApiCost) : []);
        setApiDashboard(results[3].status === 'fulfilled' ? results[3].value : null);
        setFinanceLoadError(failures.map(item => `${item.name}加载失败：${item.reason}`).join('；'));
      };
      void load();
      return () => { active = false; };
    }, [finCtx?.tenantId, finCtx?.accessToken, arSourceOrder, apSourceOrder, refreshSignal]);

    const showCenterToast = (msg, type = 'success') => {
      setToast({ show: true, msg, type });
      setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 2600);
    };

    const arRows = apiArData;
    const apRows = apiApData;
    const baseCostRows = apiCostData;
    const visibleArRows = arSourceOrder ? arRows.filter(row => row.soId === arSourceOrder) : arRows;
    const visibleApRows = apSourceOrder ? apRows.filter(row => row.poId === apSourceOrder) : apRows;
    const priorityArRows = apiArData
      .filter(row => row.unreceived > 0)
      .sort((left, right) => (left.dueDate || '9999-12-31').localeCompare(right.dueDate || '9999-12-31'))
      .slice(0, 5);
    const financeCalendarRows = [
      ...apiArData.filter(row => row.unreceived > 0).map(row => ({
        date: row.dueDate || '未设置', title: '应收回款', desc: row.soId,
        amount: formatCurrency(row.unreceived), tone: 'emerald',
      })),
      ...apiApData.filter(row => row.unpaid > 0).map(row => ({
        date: row.dueDate || '未设置', title: '供应商付款', desc: row.poId,
        amount: formatCurrency(row.unpaid), tone: 'rose',
      })),
    ].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 6);

    const openFinanceAction = (kind) => {
      const configs = {
        collect: {
          kind,
          title: '查看未收应收',
          desc: '打开应收账款列表，按源销售订单核对未结余额并完成收款。',
          icon: Receipt,
          tone: 'blue',
          confirmText: '打开应收账款',
          details: [
            { label: '当前未结应收', value: formatCurrency((Number.parseFloat(apiDashboard?.totalReceivable || '0') || 0)) },
            { label: '待结算笔数', value: String(apiDashboard?.pendingSettlementCount ?? '-') }
          ],
          steps: ['筛选源销售订单', '核对未结余额', '登记并确认收款']
        },
        extend: {
          kind,
          title: '查看未付应付',
          desc: '打开应付账款列表，按源采购订单核对未付余额并完成付款。',
          icon: CreditCard,
          tone: 'amber',
          confirmText: '打开应付账款',
          details: [
            { label: '当前未结应付', value: formatCurrency((Number.parseFloat(apiDashboard?.totalPayable || '0') || 0)) },
            { label: '待结算笔数', value: String(apiDashboard?.pendingSettlementCount ?? '-') }
          ]
        },
        cost: {
          kind,
          title: '查看成本核算',
          desc: '打开生产成本核算列表，核对后端已归集的成本单。',
          icon: PieChart,
          tone: 'purple',
          confirmText: '跳转成本核算',
          details: [
            { label: '成本单数量', value: String(apiCostData.length) },
            { label: '数据来源', value: '财务核算服务' }
          ]
        }
      };
      setActionModal(configs[kind]);
    };

    const openFinanceRowAction = (kind, row) => {
      if (kind === 'arCollect') {
        setPaymentModal({ arNo: row.id, balance: formatCurrency(row.amount - row.received) });
        return;
      }
      const configs = {
        arView: {
          kind,
          title: '查看应收单据',
          desc: `查看 ${row.id} 的销售来源、客户账期与回款状态。`,
          icon: Receipt,
          tone: 'blue',
          confirmText: '已查看',
          details: [
            { label: '应收单号', value: row.id },
            { label: '客户名称', value: row.customer },
            { label: '源销售订单', value: row.soId },
            { label: '到期日', value: row.dueDate }
          ]
        },
        arCollect: {
          kind,
          title: '完成应收结算',
          desc: `按 ${row.id} 的未结余额登记回款，并在同一事务中生成发票、凭证并核销应收。`,
          icon: ArrowDownToLine,
          tone: 'emerald',
          confirmText: '确认结算',
          _documentId: row._backend?.id,
          details: [
            { label: '应收单号', value: row.id },
            { label: '应收总额', value: formatCurrency(row.amount) },
            { label: '未收金额', value: formatCurrency(row.unreceived) },
            { label: '当前状态', value: row.status }
          ],
          steps: ['核对未结余额', '登记收款流水', '生成发票和凭证', '核销并更新应收']
        },
        apView: {
          kind,
          title: '查看应付单据',
          desc: `查看 ${row.id} 的供应商、采购来源和付款状态。`,
          icon: CreditCard,
          tone: 'blue',
          confirmText: '已查看',
          details: [
            { label: '应付单号', value: row.id },
            { label: '供应商', value: row.supplier },
            { label: '源采购订单', value: row.poId },
            { label: '到期日', value: row.dueDate }
          ]
        },
        apPay: {
          kind,
          title: '完成应付结算',
          desc: `按 ${row.id} 的未付余额登记付款，并在同一事务中生成发票、凭证并核销应付。`,
          icon: ArrowUpFromLine,
          tone: 'amber',
          confirmText: '确认结算',
          _documentId: row._backend?.id,
          details: [
            { label: '应付单号', value: row.id },
            { label: '应付总额', value: formatCurrency(row.amount) },
            { label: '未付金额', value: formatCurrency(row.unpaid) },
            { label: '当前状态', value: row.status }
          ],
          steps: ['核对未付余额', '登记付款流水', '生成发票和凭证', '核销并更新应付']
        },
        costView: {
          kind,
          title: '查看成本核算明细',
          desc: `查看 ${row.id} 的材料、制造、人工成本和标准差异。`,
          icon: PieChart,
          tone: 'blue',
          confirmText: '已查看',
          details: [
            { label: '核算单号', value: row.id },
            { label: '关联工单', value: row.woId },
            { label: '实际总价', value: formatCurrency(row.totalCost) },
            { label: '差异率', value: row.variance }
          ]
        },
      };
      setActionModal(configs[kind]);
    };

    const confirmFinanceAction = async () => {
      if (!actionModal) return;
      if (actionModal.kind === 'collect') {
        setActiveTab('receivable');
        showCenterToast('已打开应收账款列表', 'success');
      }
      if (actionModal.kind === 'extend') {
        setActiveTab('payable');
        showCenterToast('已打开应付账款列表', 'success');
      }
      if (actionModal.kind === 'cost') {
        setActiveTab('cost');
        showCenterToast('已打开成本核算列表', 'success');
      }
      if (actionModal.kind === 'arView' || actionModal.kind === 'apView' || actionModal.kind === 'costView') {
        showCenterToast('财务单据详情已打开', 'success');
      }
      if (actionModal.kind === 'arCollect') {
        await onBusinessFlowAction?.('settleFinanceDocument', { kind: 'receivable', documentId: actionModal._documentId });
      }
      if (actionModal.kind === 'apPay') {
        await onBusinessFlowAction?.('settleFinanceDocument', { kind: 'payable', documentId: actionModal._documentId });
      }
      setActionModal(null);
    };

    return (
      <div className="w-full h-full font-sans flex flex-col relative">
        <CenterToast toast={toast} onClose={() => setToast({ show: false, msg: '', type: 'success' })} />
        <BusinessActionModal action={actionModal} onClose={() => setActionModal(null)} onConfirm={confirmFinanceAction} />
        <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-start mb-6 shrink-0">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl mr-4 shadow-sm"><Wallet size={24} /></div>
              <div className="flex flex-col justify-center">
                <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">财务管理</h1>
                <div className="text-[13px] text-slate-500 mt-1 font-medium">业财一体化与应收应付资金中枢</div>
              </div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
            <button onClick={() => setActiveTab('dashboard')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><LayoutDashboard size={14} className="mr-1.5" /> 财务监控舱</button>
            <button onClick={() => setActiveTab('receivable')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'receivable' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Receipt size={14} className="mr-1.5" /> 应收账款(AR)</button>
            <button onClick={() => setActiveTab('payable')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'payable' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><CreditCard size={14} className="mr-1.5" /> 应付账款(AP)</button>
            <div className="w-px h-5 bg-slate-200 mx-1 self-center"></div>
            <button onClick={() => setActiveTab('cost')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'cost' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><PieChart size={14} className="mr-1.5" /> 生产成本核算</button>
          </div>
          <BusinessFlowDock moduleName="财务管理" flow={businessFlow} onAction={onBusinessFlowAction} onNavigate={onNavigateModule} />
          {financeLoadError && (
            <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-bold text-rose-600">
              {financeLoadError}
            </div>
          )}
          <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
              {activeTab === 'dashboard' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          <StatCard title="未结应收 (AR)" value={toWan(apiDashboard?.totalReceivable)} unit="万元" icon={Receipt} trend="flat" trendValue="当前未结余额" theme="blue" />
                          <StatCard title="未结应付 (AP)" value={toWan(apiDashboard?.totalPayable)} unit="万元" icon={CreditCard} trend="flat" trendValue="当前未付余额" theme="purple" />
                          <StatCard title="累计已收款" value={toWan(apiDashboard?.totalReceived)} unit="万元" icon={Landmark} trend="flat" trendValue="收款流水合计" theme="emerald" />
                          <StatCard title="累计已付款" value={toWan(apiDashboard?.totalPaid)} unit="万元" icon={Coins} trend="flat" trendValue="付款流水合计" theme="amber" />
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
                              <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]"><div className="bg-blue-50 p-1.5 rounded-lg text-blue-600 mr-2.5 border border-blue-100"><Wallet size={18} /></div>应收应付资金概览</div>
                              <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 relative">
                                  <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 text-[14px]">当前资金义务</h3><span className="px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-600 text-[11px] font-bold rounded-lg">实时看板</span></div>
                                  <div className="text-[13px] text-slate-600 leading-relaxed space-y-3 mb-5">
                                      <p><span className="font-bold text-slate-800">未结应收：</span> {formatCurrency(Number.parseFloat(apiDashboard?.totalReceivable || '0') || 0)}</p>
                                      <p><span className="font-bold text-slate-800">未结应付：</span> {formatCurrency(Number.parseFloat(apiDashboard?.totalPayable || '0') || 0)}</p>
                                      <p><span className="font-bold text-slate-800">待结算单据：</span> {apiDashboard?.pendingSettlementCount ?? 0} 笔</p>
                                  </div>
                                  <div className="flex gap-3">
                                      <button onClick={() => openFinanceAction('collect')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm">核对应收</button>
                                      <button onClick={() => openFinanceAction('extend')} className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm">核对应付</button>
                                  </div>
                              </div>
                          </div>
                          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
                              <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]"><div className="bg-amber-50 p-1.5 rounded-lg text-amber-600 mr-2.5 border border-amber-100"><PieChart size={18} /></div>最新成本核算</div>
                              <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 relative">
                                  {apiCostData[0] ? (
                                      <>
                                          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 text-[14px]">{apiCostData[0].product}</h3><span className="px-2.5 py-1 bg-amber-50 border border-amber-100 text-amber-600 text-[11px] font-bold rounded-lg">{apiCostData[0].status}</span></div>
                                          <div className="grid grid-cols-3 gap-3 mb-4">
                                              <div className="bg-white border border-slate-100 rounded-xl p-3"><div className="text-[11px] text-slate-400 font-bold mb-1">材料成本</div><div className="text-[16px] font-bold text-slate-800 font-mono">{formatCurrency(apiCostData[0].materialCost)}</div></div>
                                              <div className="bg-white border border-slate-100 rounded-xl p-3"><div className="text-[11px] text-slate-400 font-bold mb-1">实际总价</div><div className="text-[16px] font-bold text-slate-800 font-mono">{formatCurrency(apiCostData[0].totalCost)}</div></div>
                                              <div className="bg-white border border-rose-100 rounded-xl p-3"><div className="text-[11px] text-rose-400 font-bold mb-1">差异率</div><div className="text-[16px] font-bold text-rose-600 font-mono">{apiCostData[0].variance}</div></div>
                                          </div>
                                          <button onClick={() => openFinanceAction('cost')} className="mt-2 w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm">打开成本核算</button>
                                      </>
                                  ) : (
                                      <div className="py-8 text-center text-[13px] font-bold text-slate-500">暂无后端成本核算单据</div>
                                  )}
                              </div>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                          <div className="xl:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                              <div className="flex items-center justify-between mb-5">
                                  <div className="flex items-center text-slate-800 font-bold text-[16px]"><div className="bg-blue-50 p-1.5 rounded-lg text-blue-600 mr-2.5 border border-blue-100"><ArrowUpFromLine size={18} /></div>应收回款优先级</div>
                                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">按到期日排序</span>
                              </div>
                              <div className="space-y-3">
                                  {priorityArRows.map(row => (
                                      <div key={row.id} className="flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[13px] border bg-blue-50 text-blue-600 border-blue-100"><Receipt size={16} /></div>
                                          <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 mb-1"><span className="font-bold text-slate-800 text-[13px] truncate">{row.customer}</span><span className="text-[11px] text-slate-400 font-bold">{row.dueDate || '未设到期日'}</span></div>
                                              <div className="text-[12px] text-slate-500">源销售订单 {row.soId}</div>
                                          </div>
                                          <div className="text-right shrink-0">
                                              <div className="font-mono font-bold text-slate-800 text-[14px]">{formatCurrency(row.unreceived)}</div>
                                              <button onClick={() => openFinanceRowAction('arCollect', row)} className="mt-1 text-[11px] font-bold text-blue-600 hover:text-blue-700">去结算</button>
                                          </div>
                                      </div>
                                  ))}
                                  {priorityArRows.length === 0 && <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-[13px] font-bold text-slate-500">暂无未结应收</div>}
                              </div>
                          </div>
                          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                              <div className="flex items-center mb-5 text-slate-800 font-bold text-[16px]"><div className="bg-emerald-50 p-1.5 rounded-lg text-emerald-600 mr-2.5 border border-emerald-100"><CalendarDays size={18} /></div>资金日历</div>
                              <div className="space-y-4">
                                  {financeCalendarRows.map(item => (
                                      <div key={`${item.date}-${item.title}`} className="flex gap-3">
                                          <div className="w-12 shrink-0 text-center"><div className="text-[12px] font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg py-1.5">{item.date}</div></div>
                                          <div className="flex-1 border-b border-slate-100 pb-4">
                                              <div className="flex items-center justify-between mb-1"><span className="font-bold text-slate-800 text-[13px]">{item.title}</span><span className={`font-mono font-bold text-[13px] ${item.tone === 'emerald' ? 'text-emerald-600' : item.tone === 'amber' ? 'text-amber-600' : 'text-rose-600'}`}>{item.amount}</span></div>
                                              <div className="text-[12px] text-slate-500">{item.desc}</div>
                                          </div>
                                      </div>
                                  ))}
                                  {financeCalendarRows.length === 0 && <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-[13px] font-bold text-slate-500">暂无到期资金安排</div>}
                              </div>
                          </div>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                              <div className="flex items-center text-slate-800 font-bold text-[16px]"><div className="bg-purple-50 p-1.5 rounded-lg text-purple-600 mr-2.5 border border-purple-100"><Activity size={18} /></div>实际资金收付概览</div>
                              <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">来自财务流水</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                              {[
                                  { label: '应收总额', value: apiDashboard?.totalReceivable ? Number.parseFloat(apiDashboard.totalReceivable) : 0, tone: 'text-blue-600' },
                                  { label: '已收金额', value: apiDashboard?.totalReceived ? Number.parseFloat(apiDashboard.totalReceived) : 0, tone: 'text-emerald-600' },
                                  { label: '应付总额', value: apiDashboard?.totalPayable ? Number.parseFloat(apiDashboard.totalPayable) : 0, tone: 'text-purple-600' },
                                  { label: '已付金额', value: apiDashboard?.totalPaid ? Number.parseFloat(apiDashboard.totalPaid) : 0, tone: 'text-rose-600' },
                              ].map(item => (
                                  <div key={item.label} className="border border-slate-100 bg-slate-50 rounded-xl p-5">
                                      <div className="text-[12px] font-bold text-slate-500 mb-2">{item.label}</div>
                                      <div className={`text-[22px] font-bold font-mono ${item.tone}`}>{formatCurrency(item.value)}</div>
                                  </div>
                              ))}
                          </div>
                          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="border border-slate-100 rounded-xl p-4"><div className="text-[12px] text-slate-500 font-bold">应收单据</div><div className="text-[18px] font-bold text-slate-800 mt-1">{apiDashboard?.receivableCount ?? 0} 笔</div></div>
                              <div className="border border-slate-100 rounded-xl p-4"><div className="text-[12px] text-slate-500 font-bold">应付单据</div><div className="text-[18px] font-bold text-slate-800 mt-1">{apiDashboard?.payableCount ?? 0} 笔</div></div>
                              <div className="border border-slate-100 rounded-xl p-4"><div className="text-[12px] text-slate-500 font-bold">待结算</div><div className="text-[18px] font-bold text-slate-800 mt-1">{apiDashboard?.pendingSettlementCount ?? 0} 笔</div></div>
                          </div>
                      </div>
                  </div>
              )}
              {activeTab === 'receivable' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                      <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
                          <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><Receipt className="w-4.5 h-4.5 text-blue-600" /> 应收账款明细 (AR)</h4>
                          <div className="relative bg-white border border-slate-200 rounded-lg flex items-center px-3 py-2 w-full sm:w-[320px]" title="输入完整源销售订单号精准查询">
                              <Search size={15} className="text-slate-400 mr-2 shrink-0" />
                              <input value={arSourceOrderInput} onChange={(event) => setArSourceOrderInput(event.target.value)} placeholder="源销售订单精准查询" className="text-[13px] outline-none w-full bg-transparent" />
                          </div>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">应收单号</th><th className="px-6 py-4 font-bold">客户名称</th><th className="px-6 py-4 font-bold">源销售订单</th><th className="px-6 py-4 font-bold text-right">应收总额</th><th className="px-6 py-4 font-bold text-right text-emerald-600">已收款</th><th className="px-6 py-4 font-bold">状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">{visibleArRows.map(row => (
                              <tr key={row.id} className="hover:bg-slate-50/50 transition-colors"><td className="px-6 py-4 font-bold text-blue-600 font-mono">{row.id}</td><td className="px-6 py-4 font-bold text-slate-800">{row.customer}</td><td className="px-6 py-4 text-slate-500 font-mono">{row.soId}</td><td className="px-6 py-4 text-right font-mono font-bold">{formatCurrency(row.amount)}</td><td className="px-6 py-4 text-right font-mono font-bold text-emerald-600">{formatCurrency(row.received)}</td><td className="px-6 py-4"><span className={`${row.status === '已结清' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'} px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 w-max`}><CheckCircle2 size={12}/>{row.status}</span></td><td className="px-6 py-4"><TableActionGroup><TableActionButton icon={Eye} label="查看" onClick={() => openFinanceRowAction('arView', row)} /><TableActionButton icon={ArrowDownToLine} label="收款" tone="emerald" onClick={() => openFinanceRowAction('arCollect', row)} disabled={row.status === '已结清'} /></TableActionGroup></td></tr>
                          ))}</tbody></table>
                      </div><Pagination total={visibleArRows.length} page={1} limit={10} />
                  </div>
              )}
              {activeTab === 'payable' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                      <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
                          <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><CreditCard className="w-4.5 h-4.5 text-blue-600" /> 应付账款明细 (AP)</h4>
                          <div className="relative bg-white border border-slate-200 rounded-lg flex items-center px-3 py-2 w-full sm:w-[320px]" title="输入完整源采购订单号精准查询">
                              <Search size={15} className="text-slate-400 mr-2 shrink-0" />
                              <input value={apSourceOrderInput} onChange={(event) => setApSourceOrderInput(event.target.value)} placeholder="源采购订单精准查询" className="text-[13px] outline-none w-full bg-transparent" />
                          </div>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">应付单号</th><th className="px-6 py-4 font-bold">供应商名称</th><th className="px-6 py-4 font-bold">源采购订单</th><th className="px-6 py-4 font-bold text-right">应付总额</th><th className="px-6 py-4 font-bold text-right text-emerald-600">已付款</th><th className="px-6 py-4 font-bold">状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">{visibleApRows.map(row => (
                              <tr key={row.id} className="hover:bg-slate-50/50 transition-colors"><td className="px-6 py-4 font-bold text-blue-600 font-mono">{row.id}</td><td className="px-6 py-4 font-bold text-slate-800">{row.supplier}</td><td className="px-6 py-4 text-slate-500 font-mono">{row.poId}</td><td className="px-6 py-4 text-right font-mono font-bold">{formatCurrency(row.amount)}</td><td className="px-6 py-4 text-right font-mono font-bold text-emerald-600">{formatCurrency(row.paid)}</td><td className="px-6 py-4"><span className={`${row.status === '已结清' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'} border px-2.5 py-1 rounded-lg text-[11px] font-bold`}>{row.status}</span></td><td className="px-6 py-4"><TableActionGroup><TableActionButton icon={Eye} label="查看" onClick={() => openFinanceRowAction('apView', row)} /><TableActionButton icon={ArrowUpFromLine} label="付款" tone="amber" onClick={() => openFinanceRowAction('apPay', row)} disabled={row.status === '已结清'} /></TableActionGroup></td></tr>
                          ))}</tbody></table>
                      </div><Pagination total={visibleApRows.length} page={1} limit={10} />
                  </div>
              )}
              {activeTab === 'cost' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                      <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><PieChart className="w-4.5 h-4.5 text-blue-600" /> 生产成本核算</h4></div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">核算单号</th><th className="px-6 py-4 font-bold">产出归集物料</th><th className="px-6 py-4 font-bold text-right bg-slate-50">实际核算总价</th><th className="px-6 py-4 font-bold text-center">差异率</th><th className="px-6 py-4 font-bold">结账状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">{baseCostRows.map(row => (
                              <tr key={row.id} className="hover:bg-slate-50/50 transition-colors"><td className="px-6 py-4 font-bold text-blue-600 font-mono">{row.id}</td><td className="px-6 py-4 font-bold text-slate-800">{row.product}</td><td className="px-6 py-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">{formatCurrency(row.totalCost)}</td><td className="px-6 py-4 text-center font-mono font-bold"><span className={`px-2.5 py-0.5 rounded text-[11px] ${row.variance.startsWith('-') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{row.variance}</span></td><td className="px-6 py-4"><span className={`${row.status === '已核算' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'} border px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max`}>{row.status === '已核算' ? <CheckCircle2 size={12}/> : <RefreshCw size={12} className="animate-spin-slow"/>}{row.status}</span></td><td className="px-6 py-4"><TableActionGroup><TableActionButton icon={Eye} label="明细" onClick={() => openFinanceRowAction('costView', row)} /></TableActionGroup></td></tr>
                          ))}</tbody></table>
                      </div><Pagination total={baseCostRows.length} page={1} limit={10} />
                  </div>
              )}
          </div>
        </main>
      {paymentModal && (
          <PaymentAllocationModal
              open
              arNo={paymentModal.arNo}
              balance={paymentModal.balance}
              onClose={() => setPaymentModal(null)}
              onSubmit={(amount, method, remark) => {
                  setPaymentModal(null);
                  setToast({ show: true, msg: `收款 ${amount} 已登记核销（${method}）`, type: 'success' });
              }}
          />
      )}
      </div>
    );
};

// ==========================================
// 6. 人员管理模块 (PersonnelManagement)
// ==========================================
const PersonnelManagement = ({ currentTenant, currentUser }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [actionModal, setActionModal] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });

  // Phase 9: 人员管理 API 集成
  const formalContext = useMemo(() => currentUser?.accessToken ? ({ tenantId: currentTenant.id, accessToken: currentUser.accessToken }) : null, [currentTenant?.id, currentUser?.accessToken]);
  const [employees, setEmployees] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [skills, setSkills] = useState([]);

  const mapBackendEmployee = (emp) => ({
    id: emp.employeeNo, name: emp.name, dept: emp.department, role: emp.position,
    phone: emp.phone || '138****' + (emp.employeeNo || '').slice(-4),
    status: emp.status === 'active' ? '在职' : emp.status === 'transferring' ? '调动中' : emp.status === 'leave' ? '休假' : emp.status === 'resigned' ? '离职' : '在职',
    _backend: emp,
  });
  const mapBackendAttendance = (att) => ({
    id: att.recordNo, empName: att.employeeName, date: att.recordDate,
    shift: att.shift, clockIn: att.clockIn || '-', clockOut: att.clockOut || '-',
    status: att.status, _backend: att,
  });
  const mapBackendSkill = (sk) => ({
    id: sk.certNo, empName: sk.employeeName, skillName: sk.skillName,
    issueDate: sk.issueDate || '-', expiryDate: sk.expiryDate || '-',
    level: sk.level, status: sk.status, _backend: sk,
  });

  const refreshPersonnel = async () => {
    if (!formalContext) return;
    try {
      const [empRes, attRes, skillRes] = await Promise.all([
        personnelApi.listEmployees(formalContext, { page: 1, pageSize: 50 }).catch(() => null),
        personnelApi.listAttendances(formalContext, { page: 1, pageSize: 50 }).catch(() => null),
        personnelApi.listSkills(formalContext, { page: 1, pageSize: 50 }).catch(() => null),
      ]);
      setEmployees(empRes?.items?.map(mapBackendEmployee) || []);
      setAttendances(attRes?.items?.map(mapBackendAttendance) || []);
      setSkills(skillRes?.items?.map(mapBackendSkill) || []);
    } catch {
      setEmployees([]);
      setAttendances([]);
      setSkills([]);
    }
  };
  useEffect(() => { refreshPersonnel(); }, [formalContext?.tenantId, formalContext?.accessToken]);

  const showCenterToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 2600);
  };

  const openHrAction = (kind) => {
    const configs = {
      rest: {
        kind,
        title: '生成强制调休与 HR 介入任务',
        desc: '系统会把高离职风险预警转为 HR 待办，并跳转到考勤与排班页处理。',
        icon: ShieldAlert,
        tone: 'rose',
        confirmText: '生成并跳转排班',
        details: [
          { label: '员工', value: '王建国' },
          { label: '部门', value: '总装车间' },
          { label: '近30天加班', value: '85 小时' },
          { label: '建议动作', value: '安排调休 / HR 访谈' }
        ]
      },
      skill: {
        kind,
        title: '生成资质复训与替班任务',
        desc: '系统会跳转到资质技能页，标记临期证书并准备替班建议。',
        icon: Award,
        tone: 'amber',
        confirmText: '跳转资质技能',
        details: [
          { label: '临期人员', value: '12 人' },
          { label: '影响岗位', value: '焊接 / 电气调试' },
          { label: '风险窗口', value: '未来 14 天' },
          { label: '处理方式', value: '复训提醒 + 同技能替班' }
        ]
      }
    };
    setActionModal(configs[kind]);
  };

  const openHrRowAction = (kind, row) => {
    const configs = {
      employeeView: {
        kind,
        title: '查看员工档案',
        desc: `查看 ${row.name} 的部门、岗位、联系方式和在职状态。`,
        icon: User,
        tone: 'blue',
        confirmText: '已查看',
        details: [
          { label: '工号', value: row.id },
          { label: '姓名', value: row.name },
          { label: '部门', value: row.dept },
          { label: '岗位', value: row.role },
          { label: '联系电话', value: row.phone },
          { label: '当前状态', value: row.status }
        ]
      },
      employeeEdit: {
        kind,
        title: '编辑员工基础信息',
        desc: `${row.name} 的员工档案为基础资料，可维护部门、岗位、联系方式和在职状态。`,
        icon: Edit2,
        tone: 'purple',
        confirmText: '保存档案信息',
        details: [
          { label: '工号', value: row.id },
          { label: '当前状态', value: row.status }
        ],
        fields: [
          { label: '姓名', value: row.name },
          { label: '所属部门', value: row.dept, options: ['总装车间', '机加工车间', '质量部', '采购部', '仓储部', '财务部'] },
          { label: '岗位', value: row.role, options: ['高级装配工', '装配工', '质检员', '仓库管理员', '采购专员', '生产计划员'] },
          { label: '联系电话', value: row.phone },
          { label: '在职状态', value: row.status, options: ['在职', '试用', '休假', '停用', '离职办理中'] },
          { label: '维护说明', type: 'textarea', wide: true, value: '更新员工基础信息后，同步人员档案、排班与权限范围。' },
        ],
        checks: ['同步员工档案表', '更新岗位与排班引用', '写入人员维护日志']
      },
      attendanceDetail: {
        kind,
        title: '查看考勤明细',
        desc: `查看 ${row.empName} 在 ${row.date} 的打卡与班次信息。`,
        icon: CalendarDays,
        tone: 'blue',
        confirmText: '已查看',
        details: [
          { label: '员工', value: row.empName },
          { label: '日期', value: row.date },
          { label: '班次', value: row.shift },
          { label: '打卡时间', value: `${row.clockIn} - ${row.clockOut}` }
        ]
      },
      attendanceAdjust: {
        kind,
        title: '调整排班',
        desc: `为 ${row.empName} 维护 ${row.date} 的班次安排，保存后同步给班组长确认。`,
        icon: CalendarRange,
        tone: 'amber',
        confirmText: '保存排班调整',
        details: [
          { label: '员工', value: row.empName },
          { label: '原班次', value: row.shift },
          { label: '日期', value: row.date },
          { label: '当前考勤', value: row.status }
        ],
        fields: [
          { label: '调整后班次', value: row.shift === '早班' ? '中班' : '早班', options: ['早班', '中班', '晚班', '夜班', '休息', '调休'] },
          { label: '生效日期', type: 'date', value: row.date },
          { label: '调整原因', value: '人员调配', options: ['人员调配', '调休补班', '临时请假', '加班支援', '资质替岗', '其它'] },
          { label: '班组长', value: '李班长', options: ['李班长', '赵班长', '陈主管', 'HR专员'] },
          { label: '交接说明', type: 'textarea', wide: true, value: '请确认交接工序、设备权限和当天考勤口径。' },
        ],
        checks: ['通知班组长确认', '同步考勤台账', '更新排班看板'],
        note: '原来的三步流程只是系统后台动作提示，不应该占据主要操作区域；当前已改为可维护班次的表单，保存后再自动触发通知与同步。'
      },
      skillView: {
        kind,
        title: '查看资质证书',
        desc: `查看 ${row.empName} 的 ${row.skillName} 证书信息。`,
        icon: Award,
        tone: 'blue',
        confirmText: '已查看',
        details: [
          { label: '证书编号', value: row.id },
          { label: '持证人', value: row.empName },
          { label: '资质名称', value: row.skillName },
          { label: '到期日期', value: row.expiryDate }
        ],
        attachments: [
          {
            name: `${row.skillName}扫描件.pdf`,
            meta: `证书附件 · PDF · 已归档 · ${row.empName}`
          }
        ]
      },
      skillRenew: {
        kind,
        title: '发起资质复训',
        desc: `为 ${row.empName} 发起 ${row.skillName} 的复训与证书续期提醒。`,
        icon: Send,
        tone: 'emerald',
        confirmText: '发起复训',
        details: [
          { label: '证书编号', value: row.id },
          { label: '持证人', value: row.empName },
          { label: '资质等级', value: row.level },
          { label: '当前状态', value: row.status }
        ]
      }
    };
    setActionModal(configs[kind]);
  };

  const confirmHrAction = () => {
    if (!actionModal) return;
    if (actionModal.kind === 'rest') {
      setActiveTab('attendance');
      showCenterToast('调休与 HR 介入任务已生成，已跳转排班页', 'warning');
    }
    if (actionModal.kind === 'skill') {
      setActiveTab('skills');
      showCenterToast('资质复训任务已生成，已跳转资质技能页', 'success');
    }
    if (actionModal.kind === 'employeeView' || actionModal.kind === 'attendanceDetail' || actionModal.kind === 'skillView') {
      showCenterToast('人员明细已打开', 'success');
    }
    if (actionModal.kind === 'employeeEdit') {
      showCenterToast('员工基础信息已保存', 'success');
    }
    if (actionModal.kind === 'attendanceAdjust') {
      showCenterToast('排班调整已保存并通知班组长', 'success');
    }
    if (actionModal.kind === 'skillRenew') {
      showCenterToast('资质复训提醒已发起', 'success');
    }
    setActionModal(null);
  };

  return (
    <div className="w-full h-full font-sans flex flex-col relative">
      <CenterToast toast={toast} onClose={() => setToast({ show: false, msg: '', type: 'success' })} />
      <BusinessActionModal action={actionModal} onClose={() => setActionModal(null)} onConfirm={confirmHrAction} />
      <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
        <div className="flex justify-between items-start mb-6 shrink-0">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl mr-4 shadow-sm"><Users size={24} /></div>
            <div className="flex flex-col justify-center">
              <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">人员管理 (HR)</h1>
              <div className="text-[13px] text-slate-500 mt-1 font-medium">员工档案、资质证书与岗位管理</div>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><LayoutDashboard size={14} className="mr-1.5" /> 人员监控舱</button>
          <button onClick={() => setActiveTab('directory')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'directory' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><BookOpen size={14} className="mr-1.5" /> 员工档案表</button>
          {/* 考勤与排班暂不露出
          <button onClick={() => setActiveTab('attendance')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'attendance' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><CalendarDays size={14} className="mr-1.5" /> 考勤与排班</button>
          */}
          <button onClick={() => setActiveTab('skills')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'skills' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Award size={14} className="mr-1.5" /> 资质技能</button>
        </div>
        <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
            {activeTab === 'dashboard' && (
                <UnifiedMonitorCabin
                  metrics={[
                    { title: '在职员工总数', value: String(employees.length), unit: '人', icon: Users, trend: 'flat', trendValue: '当前在职', theme: 'blue' },
                    { title: '在职比例', value: employees.length > 0 ? Math.round(employees.filter(e => e.status === '在职').length / employees.length * 100) + '' : '-', unit: '%', icon: UserCheck, trend: 'flat', trendValue: '在职/总数', theme: 'emerald' },
                    { title: '资质证书数', value: String(skills.length), unit: '份', icon: Award, trend: 'flat', trendValue: '已登记证书', theme: 'amber' },
                    { title: '涉及部门数', value: String(new Set(employees.map(e => e.dept)).size), unit: '个', icon: Building, trend: 'flat', trendValue: '涉及部门', theme: 'red' },
                  ]}
                  aiCards={[
                    {
                      title: 'AI 离职风险预警',
                      icon: ShieldAlert,
                      tone: 'rose',
                      subject: '预警对象：总装车间 - 王建国',
                      badge: '极高离职风险',
                      lines: [
                        <><span className="font-bold text-slate-800">AI 归因：</span>近 30 天累计加班 85 小时，且不良率环比上升。建议立即安排调休并由 HR 介入。</>,
                      ],
                      actions: <button onClick={() => openHrAction('rest')} className="ml-auto bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm">生成调休任务</button>
                    },
                    {
                      title: 'AI 资质临期预警',
                      icon: Award,
                      tone: 'amber',
                      subject: '特种岗位资质：12 人临期',
                      badge: '需复核排班',
                      lines: [
                        <><span className="font-bold text-slate-800">风险识别：</span>检测到 2 名员工的关键岗位证书即将到期，若未及时复训将影响工序合规。</>,
                        <><span className="font-bold text-slate-800">AI 建议：</span>自动生成证书复训提醒，并通知直接主管跟进。</>,
                      ],
                      actions: <button onClick={() => openHrAction('skill')} className="ml-auto bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm">生成复训与替班</button>
                    },
                  ]}
                  trend={{
                    title: '人员资质与稳定性趋势',
                    metric: '8人',
                    metricLabel: '高风险',
                    metricColor: '#f43f5e',
                    ringColor: '#ffe4e6',
                    insightTitle: '人员稳定性洞察',
                    insight: '资质临期数量上升，需关注关键岗位的证书续期和人员稳定性。',
                    recommendation: '优先跟进资质临期员工的复训安排，确保证书在到期前完成更新。',
                    chartTitle: '近半年人员稳定性趋势',
                    legend: [
                      { label: '人员稳定性', color: '#2563eb' },
                      { label: '离职风险预测', color: '#f43f5e' },
                    ],
                    primary: '#2563eb',
                    secondary: '#f43f5e',
                    yAxis: [100, 95, 90, 85, 80],
                    gradientId: 'hrTrendGradient',
                    forecastPath: 'M 780 42 C 840 58, 895 82, 950 78',
                  }}
                />
            )}
            {activeTab === 'directory' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><BookOpen className="w-4.5 h-4.5 text-blue-600" /> 花名册</h4>

                        </div>
                        <div className="flex gap-3 items-center">
                            <div className="relative flex-1 max-w-xs"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/><input placeholder="搜索工号、姓名、部门..." className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 text-[12px] outline-none focus:border-blue-400"/></div>
                            <select className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-blue-400"><option value="">全部状态</option><option>在职</option><option>离职</option><option>休假</option></select>
                            <select className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-blue-400"><option value="">全部部门</option><option>总装车间</option><option>计划物流部</option></select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">工号</th><th className="px-6 py-4 font-bold">姓名</th><th className="px-6 py-4 font-bold">部门</th><th className="px-6 py-4 font-bold">岗位</th><th className="px-6 py-4 font-bold">入职日期</th><th className="px-6 py-4 font-bold">状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{employees.map(r=><tr key={r.id} className="hover:bg-slate-50/50"><td className="px-6 py-4 font-bold text-blue-600 font-mono">{r.id}</td><td className="px-6 py-4 font-bold text-slate-800">{r.name}</td><td className="px-6 py-4 font-medium text-slate-700">{r.dept}</td><td className="px-6 py-4 font-medium text-slate-600">{r.role}</td><td className="px-6 py-4 text-slate-500 font-mono text-[12px]">{r._backend?.hireDate || '-'}</td><td className="px-6 py-4"><span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max"><CheckCircle2 size={12}/>在职</span></td><td className="px-6 py-4"><TableActionGroup><TableActionButton icon={Eye} label="档案" onClick={() => openHrRowAction('employeeView', r)} /><TableActionButton icon={Edit2} label="维护" tone="purple" onClick={() => openHrRowAction('employeeEdit', r)} /></TableActionGroup></td></tr>)}</tbody></table>
                    </div><Pagination total={employees.length} page={1} limit={10} />
                </div>
            )}
            {false && activeTab === 'attendance' && ( /* 考勤与排班暂不露出 */
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><CalendarDays className="w-4.5 h-4.5 text-blue-600" /> 考勤与排班</h4>
                            <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 text-slate-600 text-[12px] font-medium hover:bg-slate-50" onClick={() => showCenterToast('考勤导出功能开发中')}><Download size={14}/>导出考勤</button>
                        </div>
                        <div className="flex gap-3 items-center">
                            <input type="date" className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-blue-400" defaultValue="2026-10-01"/>
                            <span className="text-slate-400 text-[12px]">至</span>
                            <input type="date" className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-blue-400" defaultValue="2026-10-31"/>
                            <select className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-blue-400"><option value="">全部员工</option><option>张工</option><option>李敏</option><option>王强</option></select>
                            <select className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-blue-400"><option value="">全部班次</option><option>白班</option><option>夜班</option></select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">姓名</th><th className="px-6 py-4 font-bold">日期</th><th className="px-6 py-4 font-bold">班次</th><th className="px-6 py-4 font-bold font-mono">打卡时间</th><th className="px-6 py-4 font-bold">状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{attendances.map(r=><tr key={r.id} className="hover:bg-slate-50/50"><td className="px-6 py-4 font-bold text-slate-800">{r.empName}</td><td className="px-6 py-4 text-slate-700 font-mono font-bold">{r.date}</td><td className="px-6 py-4 font-medium text-slate-600">{r.shift}</td><td className="px-6 py-4 font-mono font-bold text-slate-800">{r.clockIn} - {r.clockOut}</td><td className="px-6 py-4"><span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max"><CheckCircle2 size={12}/>{r.status}</span></td><td className="px-6 py-4"><TableActionGroup><TableActionButton icon={Eye} label="明细" onClick={() => openHrRowAction('attendanceDetail', r)} /><TableActionButton icon={CalendarRange} label="调班" tone="amber" onClick={() => openHrRowAction('attendanceAdjust', r)} /></TableActionGroup></td></tr>)}</tbody></table>
                    </div><Pagination total={attendances.length} page={1} limit={10} />
                </div>
            )}
            {activeTab === 'skills' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><Award className="w-4.5 h-4.5 text-blue-600" /> 特种资质防呆库</h4></div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">证书编号</th><th className="px-6 py-4 font-bold">持证人</th><th className="px-6 py-4 font-bold">资质名称</th><th className="px-6 py-4 font-bold">到期日期</th><th className="px-6 py-4 font-bold">状态</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{skills.map(r=><tr key={r.id} className="hover:bg-slate-50/50"><td className="px-6 py-4 font-bold text-blue-600 font-mono">{r.id}</td><td className="px-6 py-4 font-bold text-slate-800">{r.empName}</td><td className="px-6 py-4 font-bold text-slate-800">{r.skillName}</td><td className="px-6 py-4 text-slate-700 font-mono font-bold">{r.expiryDate}</td><td className="px-6 py-4"><span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 w-max"><CheckCircle2 size={12}/>{r.status}</span></td><td className="px-6 py-4"><TableActionGroup><TableActionButton icon={Eye} label="证书" onClick={() => openHrRowAction('skillView', r)} /></TableActionGroup></td></tr>)}</tbody></table>
                    </div><Pagination total={skills.length} page={1} limit={10} />
                </div>
            )}
        </div>
      </main>
    </div>
  );
};


// ==========================================
// 7. 产业链管理模块 (SupplyChainManagement)
// ==========================================
const SupplyRiskBadge = ({ level }) => {
  const tone = level === '高' || level === '高风险'
    ? 'bg-rose-50 text-rose-600 border-rose-100'
    : level === '中' || level === '中风险'
      ? 'bg-amber-50 text-amber-600 border-amber-100'
      : 'bg-emerald-50 text-emerald-600 border-emerald-100';
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${tone}`}>{level}</span>;
};

const SupplyStatusPill = ({ status }) => {
  const tone = ['正常', '附件完整', '正常合作', '低'].includes(status)
    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
    : ['异常', '待核验'].includes(status)
      ? 'bg-rose-50 text-rose-600 border-rose-100'
      : 'bg-amber-50 text-amber-600 border-amber-100';
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${tone}`}><span className="w-1.5 h-1.5 rounded-full bg-current"></span>{status}</span>;
};

const isCustomerAbnormal = (customer) => customer.operation !== '正常' || customer.alerts.length > 0;

const CustomerRiskStrategyCards = ({ items }) => (
  <div className={`grid grid-cols-1 ${items.length > 1 ? 'xl:grid-cols-2' : ''} gap-4`}>
    {items.map(item => (
      <div key={`${item.id}-operation`} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="font-bold text-[14px] text-slate-800 truncate">{item.name}</div>
            <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">{item.size} · {item.industry} · 法定代表人：{item.legal}</div>
          </div>
          <SupplyRiskBadge level={item.pressure} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3"><div className="text-[11px] text-slate-400 font-bold mb-1">经营状态</div><div className={`text-[12px] font-bold ${item.operation === '异常' ? 'text-rose-600' : 'text-slate-800'}`}>{item.operation}</div></div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3"><div className="text-[11px] text-slate-400 font-bold mb-1">应收余额</div><div className="text-[12px] font-bold text-slate-800">{item.receivable}</div></div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3"><div className="text-[11px] text-slate-400 font-bold mb-1">逾期天数</div><div className="text-[12px] font-bold text-slate-800">{item.overdueDays} 天</div></div>
        </div>
        <div className={`${item.exposure === '高' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-700'} mt-4 border rounded-xl px-4 py-3 text-[12px] font-medium leading-relaxed`}>
          {item.alerts.length ? item.alerts.join('；') : '暂无经营异常。'} 建议：{item.exposure === '高' ? '冻结新增赊销额度，改为预付款或分批交付，并由财务发起催收。' : '保留低额度账期，持续同步企业经营信息。'}
        </div>
      </div>
    ))}
  </div>
);

const SupplyChainManagement = ({ currentTenant, currentUser }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [actionModal, setActionModal] = useState(null);
  const [riskDetailOpen, setRiskDetailOpen] = useState(false);
  const [selectedRiskCustomer, setSelectedRiskCustomer] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });

  // Phase 9: 产业链管理 API 集成
  const formalContext = useMemo(() => currentUser?.accessToken ? ({ tenantId: currentTenant.id, accessToken: currentUser.accessToken }) : null, [currentTenant?.id, currentUser?.accessToken]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [riskEvents, setRiskEvents] = useState([]);
  const [verifyingCustomerId, setVerifyingCustomerId] = useState<string | null>(null);

  const mapBackendSupplier = (sup) => ({
    id: sup.supplierNo, name: sup.name, creditCode: sup.creditCode || '-',
    type: sup.type, category: sup.category,
    qualification: sup.qualification || '附件待上传',
    certs: (sup.metadata?.certs) || (sup.qualification === '附件完整' ? '营业执照 / ISO9001' : '附件待上传'),
    expire: (sup.metadata?.expire) || '-',
    admittance: sup.admittance || '可建档',
    rating: sup.rating, risk: sup.riskLevel, owner: sup.owner || '-',
    cooperation: sup.cooperationCount > 0 ? sup.cooperationCount + ' 次' : '0 次',
    amount: sup.totalAmount || '-', _backend: sup,
  });
  const mapBackendCustomer = (cus) => ({
    id: cus.customerNo, name: cus.name, creditCode: cus.creditCode || '-',
    legal: cus.legalRepresentative || '-', operation: cus.operationStatus || '待核验',
    businessStatus: cus.businessStatus || '-', size: cus.enterpriseSize || '-',
    receivable: cus.receivable || '¥ 0', overdueDays: cus.overdueDays || 0,
    exposure: cus.exposureLevel || '低', pressure: cus.pressureLevel || '低',
    role: cus.role || '下游客户', industry: cus.industry || '-',
    revenue: cus.revenue || '-', alerts: cus.alerts || [], _backend: cus,
  });
  const mapBackendRiskEvent = (risk) => ({
    company: risk.companyName, type: risk.riskType,
    level: risk.riskLevel, owner: risk.owner, action: risk.action,
    _backend: risk,
  });

  const refreshSupplyChain = async () => {
    if (!formalContext) return;
    try {
      const [supRes, cusRes, riskRes] = await Promise.all([
        supplyChainApi.listSuppliers(formalContext, { page: 1, pageSize: 50 }).catch(() => null),
        supplyChainApi.listCustomers(formalContext, { page: 1, pageSize: 50 }).catch(() => null),
        supplyChainApi.listRiskEvents(formalContext, { page: 1, pageSize: 50 }).catch(() => null),
      ]);
      setSuppliers(supRes?.items?.map(mapBackendSupplier) || []);
      setCustomers(cusRes?.items?.map(mapBackendCustomer) || []);
      setRiskEvents(riskRes?.items?.map(mapBackendRiskEvent) || []);
    } catch {
      setSuppliers([]);
      setCustomers([]);
      setRiskEvents([]);
    }
  };
  useEffect(() => { refreshSupplyChain(); }, [formalContext?.tenantId, formalContext?.accessToken]);

  const showCenterToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 2600);
  };

  const openCustomerRiskDetail = (customer) => {
    setSelectedRiskCustomer(customer);
    setRiskDetailOpen(true);
  };

  const verifyCustomerSurvival = async (row) => {
    if (!formalContext || verifyingCustomerId) return;
    setVerifyingCustomerId(row.id);
    try {
      const verification = await supplyChainApi.verifyCompany(formalContext, {
        name: row.name,
        creditCode: row.creditCode === '-' ? undefined : row.creditCode,
      });

      if (verification.candidates.length !== 1 || !verification.registrationStatus) {
        showCenterToast(verification.message, verification.result === 'NOT_FOUND' ? 'warning' : 'warning');
        return;
      }

      const candidate = verification.candidates[0];
      const businessStatus = `企查查 ${candidate.registrationStatus} · ${new Date(verification.verifiedAt).toLocaleString('zh-CN')}`;
      const saved = await supplyChainApi.updateCustomer(formalContext, row._backend, {
        operationStatus: verification.result === 'SURVIVING' ? '存续' : verification.result === 'NOT_SURVIVING' ? '非存续' : '待确认',
        businessStatus,
        metadata: {
          ...(row._backend.metadata || {}),
          qccVerification: {
            keyNo: candidate.keyNo, name: candidate.name, creditCode: candidate.creditCode,
            legalRepresentative: candidate.legalRepresentative, registrationStatus: candidate.registrationStatus,
            establishedOn: candidate.establishedOn, result: verification.result, verifiedAt: verification.verifiedAt,
          },
        },
      });
      setCustomers((prev) => prev.map((item) => item.id === row.id ? mapBackendCustomer(saved.customer) : item));
      showCenterToast(`已核验：${candidate.name} ${candidate.registrationStatus}`, verification.result === 'SURVIVING' ? 'success' : 'warning');
    } catch (error) {
      const message = error instanceof Error ? error.message : '企查查核验失败';
      showCenterToast(message, 'warning');
    } finally {
      setVerifyingCustomerId(null);
    }
  };

  const openSupplyAction = (kind) => {
    const configs = {
      trace: {
        kind,
        title: '穿透客户经营风险链路',
        desc: '系统会把客户经营异常、应收逾期、交付订单和小企业现金流压力放到同一张风险链路里。',
        icon: Route,
        tone: 'rose',
        confirmText: '跳转风险中心',
        details: [
          { label: '风险客户', value: '上蔡泉洁商贸有限公司' },
          { label: '经营状态', value: '异常' },
          { label: '应收逾期', value: '¥ 186,000 / 42 天' },
          { label: '传导影响', value: '小企业客户可能拖累本方现金流' }
        ],
        steps: ['对接企业经营信息', '匹配应收账款与账期', '计算客户承压等级', '生成风控与催收建议']
      },
      diversify: {
        kind,
        title: '生成客户信用额度优化任务',
        desc: '系统会按客户经营状态、欠款、规模和历史合作情况重算账期与额度。',
        icon: Gauge,
        tone: 'purple',
        confirmText: '跳转客户经营',
        details: [
          { label: '高压客户', value: '3 家' },
          { label: '逾期金额', value: '¥ 336,000' },
          { label: '建议策略', value: '冻结赊销 + 分批交付 + 预付款' },
          { label: '责任部门', value: '销售 / 财务 / 风控' }
        ],
        checks: ['经营异常客户改为人工审批', '小企业客户账期缩短到 15 天', '大客户保留绿色履约通道']
      }
    };
    setActionModal(configs[kind]);
  };

  const openSupplyRowAction = (kind, row) => {
    const configs = {
      supplierView: {
        kind,
        layout: 'supplierArchive',
        title: '供应商详情与附件维护',
        desc: `${row.name} 的企业信息、附件档案和重新上传入口已合并到同一处。`,
        icon: FileText,
        tone: 'blue',
        confirmText: '保存附件更新',
        details: [
          { label: '供应商编码', value: row.id },
          { label: '企业名称', value: row.name },
          { label: '统一社会信用代码', value: row.creditCode },
          { label: '主营品类', value: row.category },
          { label: '附件状态', value: row.qualification },
          { label: '责任人', value: row.owner }
        ],
        fields: [
          { label: '重新上传附件', type: 'file', wide: true, value: '营业执照、体系证书或行业许可附件', placeholder: '点击选择附件后保存；旧附件保留版本记录，可在档案中追溯。', accept: '.pdf,.png,.jpg,.jpeg' },
          { label: '附件类型', value: row.qualification === '附件临期提醒' ? '质量体系证书' : '营业执照', options: ['营业执照', '质量体系证书', '行业许可证', '采购协议', '其他附件'] },
          { label: '更新提醒', value: row.expire === '-' ? '到期前60天提醒' : '沿用当前有效期', options: ['不提醒', '到期前30天提醒', '到期前60天提醒', '到期前90天提醒', '沿用当前有效期'] },
          { label: '附件说明', type: 'textarea', wide: true, value: row.certs, placeholder: '补充附件版本、适用品类或审核说明' },
        ],
        checks: ['保存到供应商档案', '保留旧附件版本记录', '临期附件进入提醒列表'],
        matrixHeaders: ['档案项', '当前内容', '有效期/负责人'],
        matrix: [
          { name: '企业信息', actions: row.creditCode === '-' ? '待补充统一社会信用代码' : '已记录统一社会信用代码', scope: row.creditCode },
          { name: '附件档案', actions: row.certs, scope: row.expire === '-' ? '未设置有效期' : row.expire },
          { name: '合作规则', actions: row.admittance, scope: row.owner },
        ],
        note: `${row.certs}。附件用于留档查看；仅关键件、监管许可或高金额采购场景需要在下单前补齐必要材料。`
      },
      supplierRisk: {
        kind,
        title: '上传供应商附件',
        desc: `为 ${row.name} 上传营业执照、质量体系或行业许可等附件，便于后续查看。`,
        icon: UploadCloud,
        tone: row.risk === '低' ? 'emerald' : 'blue',
        confirmText: '保存附件',
        details: [
          { label: '企业名称', value: row.name },
          { label: '主营品类', value: row.category },
          { label: '附件状态', value: row.qualification },
          { label: '合作规则', value: row.admittance }
        ],
        fields: [
          { label: '附件说明', value: row.certs, wide: true },
          { label: '附件类型', value: '营业执照', options: ['营业执照', '质量体系证书', '行业许可证', '采购协议', '其他附件'] },
          { label: '责任人', value: row.owner },
          { label: '更新提醒', value: '到期前60天提醒', options: ['不提醒', '到期前30天提醒', '到期前60天提醒', '到期前90天提醒'] },
        ],
        checks: ['保存到供应商档案', '需要时同步采购负责人', '临期附件进入提醒列表'],
        note: '普通供应商只需附件留档；涉及关键件、监管许可或高金额采购时，再按采购制度要求补充必要材料。'
      },
      customerView: {
        kind,
        title: '查看客户企业经营画像',
        desc: `查看 ${row.name} 的经营状态、企业规模、应收账款和风险承压情况。`,
        icon: Landmark,
        tone: 'blue',
        confirmText: '已查看',
        details: [
          { label: '客户编码', value: row.id },
          { label: '客户名称', value: row.name },
          { label: '法定代表人', value: row.legal },
          { label: '企业经营状态', value: row.operation }
        ],
        matrix: [
          { name: '工商状态', actions: row.businessStatus, scope: row.creditCode },
          { name: '企业规模', actions: row.size, scope: row.industry },
          { name: '应收账款', actions: `${row.receivable} / 逾期 ${row.overdueDays} 天`, scope: row.exposure },
        ],
        note: row.alerts?.length ? row.alerts.join('；') : '当前未发现经营异常，按正常账期和履约规则执行。'
      },
      customerLink: {
        kind,
        title: '建立客户风控与回款策略',
        desc: `系统会为 ${row.name} 结合企业经营、应收余额和客户规模生成风控动作。`,
        icon: Receipt,
        tone: row.exposure === '高' ? 'rose' : 'purple',
        confirmText: '生成策略',
        details: [
          { label: '客户名称', value: row.name },
          { label: '应收余额', value: row.receivable },
          { label: '逾期天数', value: `${row.overdueDays} 天` },
          { label: '承压等级', value: row.pressure }
        ],
        steps: row.exposure === '高'
          ? ['冻结新增赊销额度', '销售转预付款或分批交付', '财务发起催收计划', '经营异常解除后复核额度']
          : ['维持当前账期', '持续同步企业经营信息', '逾期超过15天自动预警'],
        checks: ['同步销售客户档案', '同步财务应收账款', '写入风险数据中心']
      }
    };
    setActionModal(configs[kind]);
  };

  const confirmSupplyAction = () => {
    if (!actionModal) return;
    if (actionModal.kind === 'trace') {
      setActiveTab('risk');
      showCenterToast('客户经营风险链路已生成，已跳转风险数据中心', 'warning');
    }
    if (actionModal.kind === 'diversify') {
      setActiveTab('customers');
      showCenterToast('客户信用额度优化任务已生成，已跳转客户经营', 'success');
    }
    if (actionModal.kind === 'supplierView') {
      showCenterToast('供应商详情与附件更新已保存', 'success');
    }
    if (actionModal.kind === 'customerView') {
      showCenterToast('客商经营档案已打开', 'success');
    }
    if (actionModal.kind === 'supplierRisk') {
      showCenterToast('供应商附件已保存到档案', 'success');
    }
    if (actionModal.kind === 'customerLink') {
      showCenterToast('客户风控与回款策略已生成', 'success');
    }
    setActionModal(null);
  };

  return (
    <div className="w-full h-full font-sans flex flex-col relative">
      <CenterToast toast={toast} onClose={() => setToast({ show: false, msg: '', type: 'success' })} />
      <BusinessActionModal action={actionModal} onClose={() => setActionModal(null)} onConfirm={confirmSupplyAction} />
      {riskDetailOpen && selectedRiskCustomer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[125] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-[1180px] max-w-[calc(100vw-48px)] max-h-[90vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-50/60 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
                  <Receipt size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[18px] font-bold text-slate-800">{selectedRiskCustomer.name} 风控与回款策略</h3>
                  <p className="text-[13px] text-slate-500 leading-relaxed mt-1.5">当前策略只对应这家企业，按企业经营状态、应收余额和逾期天数生成处置建议。</p>
                </div>
              </div>
              <button onClick={() => { setRiskDetailOpen(false); setSelectedRiskCustomer(null); }} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar bg-slate-50/40">
              <CustomerRiskStrategyCards items={[selectedRiskCustomer]} />
            </div>
          </div>
        </div>
      )}
      <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
        <div className="flex justify-between items-start mb-6 shrink-0">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl mr-4 shadow-sm"><Network size={24} /></div>
            <div className="flex flex-col justify-center">
              <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">产业链管理</h1>
              <div className="text-[13px] text-slate-500 mt-1 font-medium">供应商信息附件 · 客户企业经营 · 应收风险预警</div>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max max-w-full overflow-x-auto custom-scrollbar relative z-10">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><LayoutDashboard size={14} className="mr-1.5" /> 首页大盘</button>
          <button onClick={() => setActiveTab('suppliers')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 whitespace-nowrap ${activeTab === 'suppliers' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Store size={14} className="mr-1.5" /> 供应商信息</button>
          <button onClick={() => setActiveTab('customers')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 whitespace-nowrap ${activeTab === 'customers' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Users size={14} className="mr-1.5" /> 客户经营</button>
          <button onClick={() => setActiveTab('risk')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 whitespace-nowrap ${activeTab === 'risk' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><ShieldAlert size={14} className="mr-1.5" /> 风险数据中心</button>
        </div>
        <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
            {activeTab === 'dashboard' && (
                <UnifiedMonitorCabin
                  metrics={[
                    { title: '供应商附件待完善', value: '2', unit: '家', icon: UploadCloud, trend: 'down', trendValue: '-1家', theme: 'amber' },
                    { title: '附件临期提醒', value: '1', unit: '家', icon: FileText, trend: 'down', trendValue: '-0家', theme: 'red' },
                    { title: '客户经营异常', value: '1', unit: '家', icon: AlertTriangle, trend: 'down', trendValue: '+1家', theme: 'red' },
                    { title: '高压应收客户', value: '3', unit: '家', icon: Receipt, trend: 'down', trendValue: '+3家', theme: 'purple' },
                  ]}
                  aiCards={[
                    {
                      title: 'AI 客户经营与回款风险',
                      icon: Receipt,
                      tone: 'rose',
                      subject: '上蔡泉洁商贸有限公司：经营异常 + 逾期42天',
                      badge: '小企业承压高',
                      lines: [
                        <><span className="font-bold text-slate-800">风险识别：</span>该客户存在经营异常记录，同时应收账款已逾期。若继续赊销，可能把客户经营压力传导成本方现金流风险。</>,
                        <><span className="font-bold text-slate-800">AI 建议：</span>冻结新增账期，改为预付款或分批交付，并把客户经营解除情况作为恢复额度条件。</>,
                      ],
                      actions: <button onClick={() => openSupplyAction('trace')} className="ml-auto bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm">穿透经营风险</button>
                    },
                    {
                      title: 'AI 供应商附件档案',
                      icon: UploadCloud,
                      tone: 'purple',
                      subject: '附件按需上传，不对所有供应商做资质审查',
                      badge: '2家待完善',
                      lines: [
                        <><span className="font-bold text-slate-800">档案洞察：</span>深圳恒通缺少营业执照附件，苏州精密传感器 ISO 附件临期；普通供应商可先建档查看信息。</>,
                        <><span className="font-bold text-slate-800">AI 建议：</span>附件作为供应商档案管理，只有关键件、监管许可或高金额采购时再重点校验。</>,
                      ],
                      actions: <button onClick={() => setActiveTab('suppliers')} className="ml-auto bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm">查看供应商信息</button>
                    },
                  ]}
                  trend={{
                    title: '客商经营健康与现金流风险趋势',
                    metric: '¥33.6万',
                    metricLabel: '风险应收',
                    metricColor: '#f43f5e',
                    ringColor: '#ffe4e6',
                    insightTitle: '经营承压分析',
                    insight: '产业链风险不只来自供应交付，也来自客户经营异常和欠款。小企业客户一旦经营恶化，逾期应收会更快传导成本方资金压力。',
                    recommendation: '对高压客户缩短账期、冻结新增赊销；对大型稳定客户保留履约绿色通道；供应商附件按采购场景留档和提醒。',
                    chartTitle: '近半年经营健康指数与风险应收趋势',
                    legend: [
                      { label: '经营健康指数', color: '#2563eb' },
                      { label: '风险应收预测', color: '#f43f5e' },
                    ],
                    primary: '#2563eb',
                    secondary: '#f43f5e',
                    yAxis: [100, 80, 60, 40, 20],
                    gradientId: 'supplyTrendGradient',
                    forecastPath: 'M 780 70 C 835 88, 895 122, 950 112',
                  }}
                />
            )}
            {activeTab === 'suppliers' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><Store className="w-4.5 h-4.5 text-blue-600" /> 上游供应商信息与附件</h4>
                        <div className="text-[12px] text-slate-500 mt-1">查看供应商基本信息；营业执照、体系证书和行业许可作为附件上传留档</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="bg-slate-50 border border-slate-100 text-slate-500 px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5"><ShieldCheck size={13}/> 企业存续支持企查查核验</span>
                        <div className="relative bg-white border border-slate-200 rounded-lg flex items-center px-3 py-2 w-[280px]"><Search size={15} className="text-slate-400 mr-2" /><input placeholder="搜索企业名称、统一社会信用代码" className="text-[13px] outline-none w-full bg-transparent" /></div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">企业名称</th><th className="px-6 py-4 font-bold">统一社会信用代码</th><th className="px-6 py-4 font-bold">主营品类</th><th className="px-6 py-4 font-bold">附件档案</th><th className="px-6 py-4 font-bold">合作规则</th><th className="px-6 py-4 font-bold text-center">提醒</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {suppliers.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50/50">
                              <td className="px-6 py-4">
                                <button type="button" onClick={() => openSupplyRowAction('supplierView', r)} className="font-bold text-blue-600 hover:text-blue-700 hover:underline text-left">{r.name}</button>
                                <div className="text-[11px] text-slate-400 mt-1">{r.type} · {r.cooperation}</div>
                              </td>
                              <td className="px-6 py-4 font-mono text-slate-600">{r.creditCode}</td>
                              <td className="px-6 py-4 text-slate-700 font-medium">{r.category}</td>
                              <td className="px-6 py-4"><SupplyStatusPill status={r.qualification} /><div className="text-[11px] text-slate-400 mt-1 max-w-[260px] truncate">{r.certs}</div></td>
                              <td className="px-6 py-4 text-slate-700 font-medium max-w-[220px] truncate">{r.admittance}</td>
                              <td className="px-6 py-4 text-center"><SupplyRiskBadge level={r.risk} /></td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-end min-w-[86px]">
                                  <button type="button" onClick={() => openSupplyRowAction('supplierView', r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors shadow-sm text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100"><Eye size={14} />信息</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody></table>
                    </div>
                    <Pagination total={suppliers.length} page={1} limit={10} />
                </div>
            )}
            {activeTab === 'customers' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><Users className="w-4.5 h-4.5 text-blue-600" /> 下游客户企业经营</h4>
                        <div className="text-[12px] text-slate-500 mt-1">对接企业经营、工商异常、应收欠款和客户承压，避免风险客户拖累本方现金流</div>
                      </div>
                      <div className="relative bg-white border border-slate-200 rounded-lg flex items-center px-3 py-2 w-[280px]"><Search size={15} className="text-slate-400 mr-2" /><input placeholder="搜索企业名称、统一社会信用代码" className="text-[13px] outline-none w-full bg-transparent" /></div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">客户企业</th><th className="px-6 py-4 font-bold">统一社会信用代码</th><th className="px-6 py-4 font-bold">企业经营</th><th className="px-6 py-4 font-bold text-right">应收余额</th><th className="px-6 py-4 font-bold text-center">逾期</th><th className="px-6 py-4 font-bold text-center">承压</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {customers.map(r => {
                            const showRiskButton = isCustomerAbnormal(r);
                            return (
                              <tr key={r.id} className={`${r.exposure === '高' ? 'bg-rose-50/30' : ''} hover:bg-slate-50/60`}>
                                <td className="px-6 py-4"><button type="button" onFocus={() => openSupplyRowAction('customerView', r)} onMouseDown={() => openSupplyRowAction('customerView', r)} onClick={() => openSupplyRowAction('customerView', r)} className="font-bold text-blue-600 hover:text-blue-700 hover:underline text-left">{r.name}</button><div className="text-[11px] text-slate-400 mt-1">{r.size} · {r.industry}</div></td>
                                <td className="px-6 py-4 font-mono text-slate-600">{r.creditCode}</td>
                                <td className="px-6 py-4"><SupplyStatusPill status={r.operation} /><div className="text-[11px] text-slate-400 mt-1">{r.businessStatus}</div></td>
                                <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">{r.receivable}</td>
                                <td className="px-6 py-4 text-center font-mono font-bold text-slate-700">{r.overdueDays} 天</td>
                                <td className="px-6 py-4 text-center"><SupplyRiskBadge level={r.pressure} /></td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center justify-end gap-2 min-w-[190px]">
                                    <button type="button" onFocus={() => openSupplyRowAction('customerView', r)} onMouseDown={() => openSupplyRowAction('customerView', r)} onClick={() => openSupplyRowAction('customerView', r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors shadow-sm text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100"><Landmark size={14} />经营</button>
                                    <button type="button" onClick={() => verifyCustomerSurvival(r)} disabled={verifyingCustomerId !== null} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors shadow-sm text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed">
                                      <ShieldCheck size={14} />{verifyingCustomerId === r.id ? '核验中' : '存续'}
                                    </button>
                                    {showRiskButton && (
                                      <button type="button" onClick={() => openCustomerRiskDetail(r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors shadow-sm text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100"><Receipt size={14} />风控</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody></table>
                    </div>
                    <Pagination total={customers.length} page={1} limit={10} />
                </div>
            )}
            {activeTab === 'risk' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6">
                    <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center"><AlertTriangle size={22} /></div>
                        <div>
                          <div className="text-[18px] font-bold text-slate-800">小企业客户承压预警</div>
                          <div className="text-[13px] text-slate-500 leading-relaxed mt-2">客户经营异常、工商信息缺失和应收逾期会叠加放大风险。系统建议对小企业客户优先采用预付款、分批交付和人工授信复核。</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-6">
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4"><div className="text-[11px] text-rose-500 font-bold mb-1">高压客户</div><div className="text-[22px] font-bold text-rose-600">3</div></div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4"><div className="text-[11px] text-amber-600 font-bold mb-1">逾期金额</div><div className="text-[22px] font-bold text-amber-600">33.6万</div></div>
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4"><div className="text-[11px] text-purple-600 font-bold mb-1">待核验客户</div><div className="text-[22px] font-bold text-purple-600">2</div></div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <div className="font-bold text-[15px] text-slate-800 mb-4 flex items-center gap-2"><Wallet size={16} className="text-blue-600" /> 客户经营联动规则</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                          ['经营正常 + 无逾期', '保留原账期，自动放行履约'],
                          ['经营异常 + 有逾期', '冻结新增赊销，转预付款'],
                          ['小企业 + 信息缺失', '人工复核授信，限制额度'],
                        ].map(([title, desc]) => (
                          <div key={title} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                            <div className="font-bold text-[13px] text-slate-800 mb-2">{title}</div>
                            <div className="text-[12px] text-slate-500 leading-relaxed">{desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><ShieldAlert className="w-4.5 h-4.5 text-rose-600" /> 风险异常企业名录</h4>
                      <button onClick={() => openSupplyAction('diversify')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-[13px] font-bold shadow-sm">生成额度策略</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px] whitespace-nowrap"><thead className="bg-white text-slate-500 border-b border-slate-200 text-[12px] uppercase"><tr><th className="px-6 py-4 font-bold">企业名称</th><th className="px-6 py-4 font-bold">异常类型</th><th className="px-6 py-4 font-bold">等级</th><th className="px-6 py-4 font-bold">责任部门</th><th className="px-6 py-4 font-bold">建议动作</th><th className="px-6 py-4 font-bold text-right">操作</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{riskEvents.map(r => {
                        const matchedCustomer = customers.find(item => item.name === r.company);
                        return <tr key={`${r.company}-${r.type}`} className="hover:bg-slate-50/60"><td className="px-6 py-4 font-bold text-blue-600">{r.company}</td><td className="px-6 py-4 text-slate-700">{r.type}</td><td className="px-6 py-4"><SupplyRiskBadge level={r.level} /></td><td className="px-6 py-4 text-slate-600 font-bold">{r.owner}</td><td className="px-6 py-4 text-slate-700">{r.action}</td><td className="px-6 py-4 text-right"><button type="button" onClick={() => openCustomerRiskDetail(matchedCustomer)} disabled={!matchedCustomer} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100"><Eye size={14} />查看</button></td></tr>;
                      })}</tbody></table>
                    </div>
                  </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
};

// ==========================================
// 8. AI智能中枢模块 (AIHubManagement)
// ==========================================
const ai_digitalEmployees = [
  { id: 'ADE-01', name: '采销对账专员', dept: '财务部', desc: '自动核对采购入库单与供应商发票，精准识别数量与价格差异。', tasks: 1250, accuracy: '99.9%', status: '运行中', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', border: 'border-blue-100' },
  { id: 'ADE-03', name: '排产调度引擎', dept: '生产部', desc: '基于设备实时OEE、人员出勤与紧急插单动态演算APS排程。', tasks: 320, accuracy: '99.1%', status: '运行中', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', border: 'border-emerald-100' },
  { id: 'ADE-05', name: '呆滞物料分析师', dept: '仓储部', desc: '定期盘点库存账龄，自动预警呆滞风险并生成低价促销调拨建议。', tasks: 56, accuracy: '99.5%', status: '运行中', iconBg: 'bg-rose-50', iconColor: 'text-rose-600', border: 'border-rose-100' }
];

const ai_industrialAssistantConfig = [
  { title: '助手身份', value: 'AI 工业助手', desc: '面向销售、生产、库存、采购、财务的跨模块业务问答与分析。', icon: Bot, tone: 'blue' },
  { title: '知识范围', value: 'ERP / MES / WMS / 财务', desc: '已接入订单、BOM、工单、库存流水、PR/PO、AR/AP 数据。', icon: Database, tone: 'emerald' },
  { title: '执行权限', value: '建议 + 草稿', desc: '可生成分析、预警、单据草稿；关键业务动作需人工确认。', icon: ShieldCheck, tone: 'amber' },
  { title: '响应模式', value: '实时分析', desc: '支持自然语言查询、异常归因、趋势预测、任务派发建议。', icon: Activity, tone: 'purple' },
];

const ai_assistantSkills = [
  '生产异常归因',
  '缺料风险推演',
  '库存账龄分析',
  '采购交期预警',
  '应收应付对账',
  '销售订单跟进',
];

const ai_knowledgeSources = [
  { name: '销售订单与客户档案', status: '已同步', rows: '2.4万' },
  { name: 'BOM / MPS / MRP / 工单', status: '已同步', rows: '8,620' },
  { name: '库存流水与安全水位', status: '实时', rows: '12.8万' },
  { name: '采购 PR/PO 与供应商绩效', status: '已同步', rows: '3.1万' },
  { name: '财务 AR/AP 与资金计划', status: '实时', rows: '1.7万' },
];

const AIHubManagement = ({ onOpenAssistant }) => {
    const [activeTab, setActiveTab] = useState('assistant');
    const [isIndustrialAssistantOpen, setIsIndustrialAssistantOpen] = useState(false);
    const [assistantDrawerWidth, setAssistantDrawerWidth] = useState(520);
    const [isResizingAssistant, setIsResizingAssistant] = useState(false);
    const [assistantInput, setAssistantInput] = useState('');
    const [assistantMessages, setAssistantMessages] = useState([
      { role: 'assistant', text: '你好！我是工业AI助手。我可以帮你分析生产数据、预警库存风险、优化排产计划、生成业务报告。请问有什么需要帮助的？', time: '刚刚' }
    ]);

    useEffect(() => {
      if (!isResizingAssistant) return;
      const handleMouseMove = (event) => {
        const nextWidth = Math.min(Math.max(window.innerWidth - event.clientX, 420), Math.min(920, window.innerWidth - 280));
        setAssistantDrawerWidth(nextWidth);
      };
      const handleMouseUp = () => setIsResizingAssistant(false);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }, [isResizingAssistant]);

    const sendIndustrialAssistantMessage = (text = assistantInput) => {
      const value = text.trim();
      if (!value) return;
      setAssistantMessages(prev => [
        ...prev,
        { role: 'user', text: value, time: '刚刚' },
        { role: 'assistant', text: `已收到：“${value}”。我会优先关联销售订单、库存水位、MPS/MRP、采购交期与财务应收应付，生成一份可追溯的工业业务分析。`, time: '刚刚' }
      ]);
      setAssistantInput('');
    };

    return (
        <div className="w-full h-full font-sans flex flex-col">
            <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
                <div className="flex justify-between items-start mb-6 shrink-0">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center rounded-2xl mr-4 shadow-md"><Sparkles size={24} /></div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">AI 智能中枢</h1>
                            <div className="text-[13px] text-slate-500 mt-1 font-medium">企业级大模型驱动的 AI 助手与数字员工调度平台</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
                  <button onClick={() => setActiveTab('assistant')} className={`flex items-center px-5 py-2.5 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'assistant' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><MessageCircle size={15} className="mr-1.5" /> 工业 Copilot 助手</button>
                  <div className="w-px h-5 bg-slate-200 mx-1 self-center"></div>
                  <button onClick={() => setActiveTab('digital_employee')} className={`flex items-center px-5 py-2.5 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'digital_employee' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><UserCheck size={15} className="mr-1.5" /> AI 数字员工专员</button>
                </div>
                <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
                    {activeTab === 'assistant' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                {ai_industrialAssistantConfig.map(item => {
                                  const Icon = item.icon;
                                  const tone = monitorToneMap[item.tone] || monitorToneMap.blue;
                                  return (
                                    <div key={item.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-blue-200 transition-colors">
                                      <div className="flex items-start justify-between mb-4">
                                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tone.shell}`}><Icon size={20} /></div>
                                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">已启用</span>
                                      </div>
                                      <div className="text-[12px] font-bold text-slate-400 mb-1">{item.title}</div>
                                      <div className="text-[16px] font-bold text-slate-800 mb-2">{item.value}</div>
                                      <div className="text-[12px] text-slate-500 leading-relaxed">{item.desc}</div>
                                    </div>
                                  );
                                })}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
                              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                  <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><Settings className="w-4.5 h-4.5 text-blue-600" /> 工业助手配置</h4>
                                  <button onClick={onOpenAssistant} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-[13px] font-bold shadow-sm flex items-center"><MessageCircle size={15} className="mr-1.5"/> 打开助手</button>
                                </div>
                                <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                                  <div className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                                    <div className="font-bold text-[13px] text-slate-800 mb-3 flex items-center gap-2"><Bot size={15} className="text-blue-600" /> 助手基础设定</div>
                                    <div className="space-y-3">
                                      {[
                                        ['默认称呼', '工业AI助手'],
                                        ['业务风格', '先诊断、再给建议、最后生成动作草稿'],
                                        ['回答深度', '展示依据数据与关联单据'],
                                        ['安全策略', '关键业务动作需人工确认'],
                                      ].map(([label, value]) => (
                                        <div key={label} className="flex items-start justify-between gap-4 bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                                          <span className="text-[12px] text-slate-500 font-bold shrink-0">{label}</span>
                                          <span className="text-[12px] text-slate-800 font-bold text-right leading-relaxed">{value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                                    <div className="font-bold text-[13px] text-slate-800 mb-3 flex items-center gap-2"><Zap size={15} className="text-amber-500" /> 可调用能力</div>
                                    <div className="flex flex-wrap gap-2">
                                      {ai_assistantSkills.map(skill => (
                                        <span key={skill} className="px-3 py-2 rounded-lg bg-white border border-blue-100 text-blue-600 text-[12px] font-bold">{skill}</span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                                  <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2"><Database className="w-4.5 h-4.5 text-blue-600" /> 知识库与数据源</h4>
                                </div>
                                <div className="p-5 space-y-3">
                                  {ai_knowledgeSources.map(source => (
                                    <div key={source.name} className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                                      <div className="flex items-center justify-between gap-3 mb-1">
                                        <span className="font-bold text-[13px] text-slate-800">{source.name}</span>
                                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">{source.status}</span>
                                      </div>
                                      <div className="text-[12px] text-slate-500">可检索记录：{source.rows}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'digital_employee' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
                            {ai_digitalEmployees.map(emp => (
                                <div key={emp.id} className={`bg-white rounded-2xl border p-6 shadow-sm hover:-translate-y-1 transition-all ${emp.status==='运行中'?'border-slate-200 hover:border-blue-300':'opacity-70'}`}>
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className={`p-3 rounded-xl border ${emp.iconBg} ${emp.iconColor} ${emp.border}`}><Bot size={22} /></div>
                                        <div><h3 className="font-bold text-[16px] text-slate-800">{emp.name}</h3><span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 mt-1 inline-block">{emp.dept}</span></div>
                                    </div>
                                    <p className="text-[13px] text-slate-600 mb-6 h-10">{emp.desc}</p>
                                    <div className="grid grid-cols-2 gap-3 mb-5">
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                            <div className="text-[11px] text-slate-400 font-bold mb-1">触发方式</div>
                                            <div className="text-[12px] font-bold text-slate-800">定时 + 事件</div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                            <div className="text-[11px] text-slate-400 font-bold mb-1">人工复核</div>
                                            <div className="text-[12px] font-bold text-slate-800">高风险必审</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between pt-4 border-t border-slate-100 text-[12px] font-bold">
                                        <span className="flex items-center gap-1 text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> 自动值守中</span>
                                        <span className="text-slate-500 font-mono">今日任务: {emp.tasks}</span>
                                    </div>
                                    <button className="mt-5 w-full bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-600 py-2.5 rounded-xl text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5"><Settings size={14}/> 配置数字员工</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
            {isIndustrialAssistantOpen && (
              <div className="fixed inset-y-0 right-0 z-[130] flex justify-end pointer-events-none">
                <div
                  className="relative h-full bg-white border-l-4 border-blue-600 shadow-2xl pointer-events-auto flex flex-col animate-in slide-in-from-right duration-200"
                  style={{ width: assistantDrawerWidth }}
                >
                  <div
                    onMouseDown={() => setIsResizingAssistant(true)}
                    className="absolute left-[-10px] top-0 bottom-0 w-5 cursor-col-resize group flex items-center justify-center"
                    title="向左拖拽放大对话窗口"
                  >
                    <div className="w-1.5 h-16 rounded-full bg-blue-300 group-hover:bg-blue-600 transition-colors shadow-sm"></div>
                  </div>
                  <div className="h-[72px] bg-blue-600 text-white px-6 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center"><Bot size={20} /></div>
                      <div>
                        <div className="text-[16px] font-bold">AI 工业助手</div>
                        <div className="text-[12px] text-blue-100 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>在线 · 实时分析中</div>
                      </div>
                    </div>
                    <button type="button" aria-label="关闭 AI 助手" onClick={() => setIsIndustrialAssistantOpen(false)} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X size={18}/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#FBFCFF] p-5">
                    <div className="space-y-5">
                      {assistantMessages.map((message, index) => {
                        const isUser = message.role === 'user';
                        return (
                          <div key={`${message.role}-${index}`} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                            {!isUser && <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0"><Bot size={15}/></div>}
                            <div className={`max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                              <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${isUser ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'}`}>
                                {message.text}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1.5">{message.time}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-white shrink-0">
                    <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2">
                      {['查询热丝的库存？', '库存哪些物料需要补货？', '上传文档详情？'].map(prompt => (
                        <button key={prompt} onClick={() => sendIndustrialAssistantMessage(prompt)} className="px-3 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 text-[12px] font-bold transition-colors">{prompt}</button>
                      ))}
                    </div>
                    <div className="p-4 flex items-center gap-3">
                      <button type="button" aria-label="上传附件" className="w-11 h-11 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-colors border border-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><UploadCloud size={18}/></button>
                      <div className="flex-1 h-11 border border-slate-200 bg-slate-50 rounded-xl px-4 flex items-center focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
                        <input
                          value={assistantInput}
                          onChange={(event) => setAssistantInput(event.target.value)}
                          onKeyDown={(event) => event.key === 'Enter' && sendIndustrialAssistantMessage()}
                          aria-label="向 AI 助手提问"
                          placeholder="输入问题，回车发送..."
                          className="w-full bg-transparent outline-none focus-visible:outline-none text-[13px] text-slate-700"
                        />
                      </div>
                      <button type="button" aria-label="发送问题" onClick={() => sendIndustrialAssistantMessage()} className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"><Send size={18}/></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
    );
};

// ==========================================
// 9. AI数据分析模块 (AIDataAnalysisManagement)
// ==========================================
const AIDataAnalysisManagement = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [queryText, setQueryText] = useState('');
    const [hasQueried, setHasQueried] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    
    // Sandbox parameters
    const [materialPriceInc, setMaterialPriceInc] = useState(0);
    const [demandInc, setDemandInc] = useState(0);

    // Sandbox calculations
    const baseProfit = 1250;
    const baseDelivery = 15;
    const baseInventory = 320;
    const projectedProfit = baseProfit - (materialPriceInc * 15) + (demandInc * 20);
    const projectedDelivery = baseDelivery + (demandInc * 0.5) + (materialPriceInc > 10 ? 3 : 0);
    const projectedInventory = baseInventory + (materialPriceInc * 5) + (demandInc * 8);

    const handleQuery = () => {
        if (!queryText.trim()) return;
        setIsThinking(true);
        setTimeout(() => {
            setIsThinking(false);
            setHasQueried(true);
        }, 1200);
    };

    return (
        <div className="w-full h-full font-sans flex flex-col relative bg-[#F5F7FA]">
            <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
                <div className="flex justify-between items-start mb-6 shrink-0">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-gradient-to-tr from-purple-600 to-blue-600 text-white flex items-center justify-center rounded-2xl mr-4 shadow-md"><BrainCircuit size={24} /></div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">AI 数据分析</h1>
                            <div className="text-[13px] text-slate-500 mt-1 font-medium">看过去 · 问原因 · 测未来 —— 全局经营大脑</div>
                        </div>
                    </div>
                </div>
                
                <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
                    <button onClick={() => setActiveTab('dashboard')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><LayoutDashboard size={14} className="mr-1.5" /> 经营决策舱</button>
                    <button onClick={() => setActiveTab('copilot')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'copilot' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><MessageCircle size={14} className="mr-1.5" /> AI 数据问答 (NL2SQL)</button>
                    <button onClick={() => setActiveTab('rootcause')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'rootcause' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><GitMerge size={14} className="mr-1.5" /> 智能归因树</button>
                    <button onClick={() => setActiveTab('sandbox')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'sandbox' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Layers size={14} className="mr-1.5" /> 推演沙盘</button>
                </div>

                <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
                    {/* 3.1 经营决策驾驶舱 */}
                    {activeTab === 'dashboard' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <StatCard title="本月总营收 (预估)" value="1,850" unit="万元" icon={BadgeDollarSign} trend="up" trendValue="+12.5%" theme="blue" />
                                <StatCard title="综合毛利率" value="32.4" unit="%" icon={PieChart} trend="up" trendValue="+1.2%" theme="emerald" />
                                <StatCard title="整体订单准交率" value="94.2" unit="%" icon={CheckCircle2} trend="down" trendValue="-2.1%" theme="amber" />
                                <StatCard title="全厂设备综合效率 (OEE)" value="82.5" unit="%" icon={Activity} trend="up" trendValue="+0.8%" theme="purple" />
                            </div>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* 业务雷达图 */}
                                <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col hover:border-blue-300 transition-colors">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="font-bold text-slate-800 text-[15px] flex items-center"><Target size={16} className="text-blue-600 mr-2"/> 部门绩效达成雷达</h3>
                                        <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">当期实时</span>
                                    </div>
                                    <div className="flex-1 flex justify-center items-center py-4 relative">
                                        <svg viewBox="0 0 200 200" className="w-56 h-56 transform -rotate-90">
                                            {/* 背景网格 */}
                                            <polygon points="100,10 178,50 178,150 100,190 22,150 22,50" fill="none" stroke="#f1f5f9" strokeWidth="1.5"/>
                                            <polygon points="100,32 158,65 158,135 100,168 42,135 42,65" fill="none" stroke="#e2e8f0" strokeWidth="1.5"/>
                                            <polygon points="100,55 139,78 139,122 100,145 61,122 61,78" fill="none" stroke="#f1f5f9" strokeWidth="1.5"/>
                                            {/* 坐标轴 */}
                                            <line x1="100" y1="10" x2="100" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                                            <line x1="178" y1="50" x2="100" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                                            <line x1="178" y1="150" x2="100" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                                            <line x1="100" y1="190" x2="100" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                                            <line x1="22" y1="150" x2="100" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                                            <line x1="22" y1="50" x2="100" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                                            {/* 数据多边形 (蓝: 目标, 紫: 实际) */}
                                            <polygon points="100,20 165,58 165,142 100,180 35,142 35,58" fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4"/>
                                            <polygon points="100,25 140,65 170,145 100,160 50,120 40,55" fill="rgba(139, 92, 246, 0.25)" stroke="#8b5cf6" strokeWidth="2"/>
                                            {/* 数据点 */}
                                            <circle cx="100" cy="25" r="3" fill="#8b5cf6" />
                                            <circle cx="140" cy="65" r="3" fill="#8b5cf6" />
                                            <circle cx="170" cy="145" r="3" fill="#8b5cf6" />
                                            <circle cx="100" cy="160" r="3" fill="#8b5cf6" />
                                            <circle cx="50" cy="120" r="3" fill="#8b5cf6" />
                                            <circle cx="40" cy="55" r="3" fill="#8b5cf6" />
                                        </svg>
                                        <span className="absolute top-0 right-[40%] text-[11px] font-bold text-slate-600">销售转化</span>
                                        <span className="absolute top-[25%] right-2 text-[11px] font-bold text-slate-600">生产达成</span>
                                        <span className="absolute bottom-[25%] right-4 text-[11px] font-bold text-slate-600">采购准交</span>
                                        <span className="absolute bottom-0 left-[45%] text-[11px] font-bold text-slate-600">质量合格</span>
                                        <span className="absolute bottom-[25%] left-4 text-[11px] font-bold text-rose-500">库存周转 (低)</span>
                                        <span className="absolute top-[25%] left-2 text-[11px] font-bold text-slate-600">回款率</span>
                                    </div>
                                    <div className="flex justify-center gap-4 text-[11px] font-bold mt-2">
                                        <span className="flex items-center gap-1 text-blue-500"><span className="w-2 h-2 bg-blue-500 rounded-full"></span>目标值</span>
                                        <span className="flex items-center gap-1 text-purple-500"><span className="w-2 h-2 bg-purple-500 rounded-full"></span>实际值</span>
                                    </div>
                                </div>

                                {/* 高风险红绿灯预警 */}
                                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-blue-300 transition-colors">
                                    <div className="flex items-center justify-between mb-5">
                                        <h3 className="font-bold text-slate-800 text-[15px] flex items-center"><AlertTriangle size={16} className="text-amber-500 mr-2"/> 全平台高风险聚合监测</h3>
                                        <button className="text-[12px] text-blue-600 font-bold hover:underline">查看完整预警单</button>
                                    </div>
                                    <div className="space-y-4">
                                        {/* 预警卡片 1 */}
                                        <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/30 flex items-start gap-4 hover:bg-rose-50/60 transition-colors">
                                            <div className="w-2 h-2 mt-1.5 bg-rose-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)] shrink-0"></div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-bold text-slate-800 text-[14px]">财务资金流断裂风险预警</span>
                                                    <span className="text-[11px] text-slate-500 font-mono">2小时前</span>
                                                </div>
                                                <p className="text-[12px] text-slate-600 mb-2">系统测算发现未来 15 天内应付账款波峰叠加，存在 <strong className="text-rose-600">¥ 41,200.00</strong> 流动性缺口。</p>
                                                <button className="text-[11px] bg-white border border-slate-200 px-3 py-1 rounded shadow-sm font-bold text-slate-700 hover:text-blue-600 flex items-center gap-1"><Link size={12}/> 穿透至财务管理 (AP)</button>
                                            </div>
                                        </div>
                                        {/* 预警卡片 2 */}
                                        <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/30 flex items-start gap-4 hover:bg-amber-50/60 transition-colors">
                                            <div className="w-2 h-2 mt-1.5 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)] shrink-0"></div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-bold text-slate-800 text-[14px]">核心客户 (VIP) 流失高危预警</span>
                                                    <span className="text-[11px] text-slate-500 font-mono">5小时前</span>
                                                </div>
                                                <p className="text-[12px] text-slate-600 mb-2">客户 [test01客户] 对应报价单已过期，且历史同类订单逾期率达 85%，流失概率陡增。</p>
                                                <button className="text-[11px] bg-white border border-slate-200 px-3 py-1 rounded shadow-sm font-bold text-slate-700 hover:text-blue-600 flex items-center gap-1"><Link size={12}/> 穿透至销售管理 (报价)</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3.2 AI 自然语言问答报表 (Data Copilot) */}
                    {activeTab === 'copilot' && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[600px] animate-in fade-in duration-300">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                                <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-600" /> 工业AI平台助手 - 报表随心问</h3>
                            </div>
                            
                            <div className="flex-1 p-6 overflow-y-auto bg-[#fafcff]/50 custom-scrollbar flex flex-col gap-6">
                                <div className="self-start max-w-[80%] flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white shrink-0"><Bot size={16}/></div>
                                    <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm shadow-sm text-[13px] text-slate-700">
                                        您好！我是您的数据副驾驶。您可以直接用自然语言向我提问，例如：
                                        <ul className="mt-2 space-y-1 text-blue-600 cursor-pointer">
                                            <li onClick={() => setQueryText('帮我对比一下去年第三季度和今年第三季度华东地区的工业控制器销量和毛利变化')} className="hover:underline">“帮我对比一下去年第三季度和今年第三季度华东地区的工业控制器销量和毛利变化”</li>
                                            <li className="hover:underline">“盘点一下当前超90天未动库的成品并按资金占用排序”</li>
                                        </ul>
                                    </div>
                                </div>

                                {hasQueried && (
                                    <>
                                        <div className="self-end max-w-[80%] flex gap-3 flex-row-reverse animate-in fade-in slide-in-from-bottom-2">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0"><User size={16}/></div>
                                            <div className="bg-blue-600 text-white p-3.5 rounded-2xl rounded-tr-sm shadow-sm text-[13px]">
                                                {queryText}
                                            </div>
                                        </div>
                                        
                                        <div className="self-start max-w-[85%] flex gap-3 animate-in fade-in slide-in-from-bottom-4">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white shrink-0"><Bot size={16}/></div>
                                            <div className="bg-white border border-purple-200 p-5 rounded-2xl rounded-tl-sm shadow-md flex flex-col w-full">
                                                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                                                    <span className="font-bold text-[14px] flex items-center gap-1.5"><PieChart size={16} className="text-purple-600"/> 华东区工业控制器 Q3 销量与毛利对比</span>
                                                    <button className="text-[12px] bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-slate-100"><Layers size={14}/> 钉 (Pin) 到看板</button>
                                                </div>
                                                
                                                {/* 模拟生成的图表 */}
                                                <div className="flex items-end justify-center gap-16 h-48 mb-6 mt-2 relative">
                                                    {/* Y轴线与刻度 */}
                                                    <div className="absolute left-10 top-0 bottom-6 w-px bg-slate-200"></div>
                                                    <div className="absolute left-6 top-0 text-[10px] text-slate-400">10k</div>
                                                    <div className="absolute left-6 top-1/2 text-[10px] text-slate-400">5k</div>
                                                    
                                                    {/* 柱状组 1 */}
                                                    <div className="flex flex-col items-center gap-3 z-10">
                                                        <div className="flex items-end gap-3 h-32">
                                                            <div className="relative group w-12 bg-blue-300 rounded-t-md border-b-0 border border-blue-400 hover:bg-blue-400 transition-colors" style={{ height: '60%' }}>
                                                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">6,200</span>
                                                            </div>
                                                            <div className="relative group w-12 bg-emerald-300 rounded-t-md border-b-0 border border-emerald-400 hover:bg-emerald-400 transition-colors" style={{ height: '40%' }}>
                                                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">¥2.4m</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-slate-500 font-bold text-[12px]">2025年 Q3</span>
                                                    </div>
                                                    
                                                    {/* 柱状组 2 */}
                                                    <div className="flex flex-col items-center gap-3 z-10">
                                                        <div className="flex items-end gap-3 h-32">
                                                            <div className="relative group w-12 bg-blue-600 rounded-t-md border-b-0 border border-blue-700 shadow-sm hover:bg-blue-500 transition-colors" style={{ height: '85%' }}>
                                                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">8,950</span>
                                                            </div>
                                                            <div className="relative group w-12 bg-emerald-500 rounded-t-md border-b-0 border border-emerald-600 shadow-sm hover:bg-emerald-400 transition-colors" style={{ height: '65%' }}>
                                                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">¥4.1m</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-slate-800 font-bold text-[12px]">2026年 Q3</span>
                                                    </div>
                                                    
                                                    {/* 底边基线 */}
                                                    <div className="absolute left-10 right-10 bottom-6 h-px bg-slate-300"></div>
                                                </div>

                                                <div className="flex justify-center gap-6 text-[12px] font-bold text-slate-600 mb-4">
                                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-600 rounded-sm"></span> 销量 (台)</span>
                                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-sm"></span> 毛利 (万元)</span>
                                                </div>

                                                <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl text-[13px] text-purple-900 leading-relaxed">
                                                    <span className="font-bold flex items-center gap-1 mb-1"><Sparkles size={14}/> AI 分析洞察：</span>
                                                    相比去年同期，今年Q3华东区工业控制器销量增长了 <strong className="text-blue-700">44.3%</strong>，得益于高配版占比提升，综合毛利大幅提升了 <strong className="text-emerald-700">70.8%</strong>。
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {isThinking && (
                                    <div className="self-start max-w-[80%] flex gap-3 animate-in fade-in">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white shrink-0"><Bot size={16}/></div>
                                        <div className="bg-white border border-slate-200 px-5 py-3.5 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2 text-slate-500 text-[13px] font-bold">
                                            <RefreshCw size={14} className="animate-spin" />
                                            正在生成 SQL 并连接 OLAP 数据仓...
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                                <div className="relative flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2 px-4 focus-within:ring-2 focus-within:ring-purple-200 focus-within:border-purple-400 transition-all shadow-sm">
                                    <input 
                                        value={queryText}
                                        onChange={(e) => setQueryText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                                        placeholder="输入业务问题，例如：查询上个月由于缺料导致的停机时长总计..." 
                                        className="w-full bg-transparent outline-none py-2.5 text-[14px] text-slate-700" 
                                    />
                                    <button onClick={handleQuery} className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition-colors active:scale-95"><Send size={16}/></button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3.3 异常诊断与根因分析 (Root Cause Analysis) */}
                    {activeTab === 'rootcause' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-100"><AlertTriangle size={24}/></div>
                                    <div>
                                        <h2 className="text-[18px] font-bold text-rose-700 mb-1">指标异动触发：本月总装车间交付延期率骤升</h2>
                                        <p className="text-[13px] text-rose-600/80 font-medium">监测时间：2026-06-21 08:30 | 波动幅度：<span className="font-bold">+15%</span></p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-rose-200 shadow-sm">
                                    <Sparkles size={14} className="text-purple-600"/>
                                    <span className="text-[12px] font-bold text-purple-700">AI 已完成全链路归因溯源</span>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm relative flex flex-col">
                                <div className="p-6 lg:p-8 flex-1">
                                    <h3 className="font-bold text-slate-800 text-[15px] mb-6">决策树追溯视图 (Decision Tree)</h3>
                                    
                                    {/* 增加横向滚动容器以防止小屏幕下被截断 */}
                                    <div className="w-full overflow-x-auto custom-scrollbar pb-6 pt-3 px-1">
                                        {/* 归因链路 (自适应弹性排布) */}
                                        <div className="flex flex-col lg:flex-row items-center lg:items-stretch justify-start lg:justify-between gap-4 lg:gap-6 min-w-max lg:min-w-0 relative z-10">
                                            
                                            {/* 节点 1: 表现层 */}
                                            <div className="w-[260px] lg:w-0 lg:flex-1 lg:min-w-[210px] bg-white border-2 border-rose-200 rounded-xl p-5 shadow-sm relative shrink-0 flex flex-col">
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200 whitespace-nowrap">表现层指标</div>
                                                <h4 className="font-bold text-[14px] text-slate-800 mt-2 mb-2">订单延期率攀升</h4>
                                                <p className="text-[12px] text-slate-500">成品 (FG001) 组装工单大面积超时，偏离标准排程。</p>
                                            </div>
                                            
                                            <div className="flex items-center justify-center shrink-0">
                                                <ArrowRight size={20} className="text-slate-300 hidden lg:block" />
                                                <ArrowDownToLine size={20} className="text-slate-300 block lg:hidden" />
                                            </div>

                                            {/* 节点 2: 生产层 */}
                                            <div className="w-[260px] lg:w-0 lg:flex-1 lg:min-w-[210px] bg-white border border-amber-200 rounded-xl p-5 shadow-sm relative shrink-0 flex flex-col">
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-50 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap">追溯 1：生产执行层</div>
                                                <h4 className="font-bold text-[14px] text-slate-800 mt-2 mb-2">SMT-M01 机台故障频发</h4>
                                                <p className="text-[12px] text-slate-500">前置贴片工序 OEE 下降至 62%，成为产线瓶颈。</p>
                                            </div>

                                            <div className="flex items-center justify-center shrink-0">
                                                <ArrowRight size={20} className="text-slate-300 hidden lg:block" />
                                                <ArrowDownToLine size={20} className="text-slate-300 block lg:hidden" />
                                            </div>

                                            {/* 节点 3: 质量层 */}
                                            <div className="w-[260px] lg:w-0 lg:flex-1 lg:min-w-[210px] bg-white border border-amber-200 rounded-xl p-5 shadow-sm relative shrink-0 flex flex-col">
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-50 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap">追溯 2：质量检验层</div>
                                                <h4 className="font-bold text-[14px] text-slate-800 mt-2 mb-2">RM201 芯片贴片不良</h4>
                                                <p className="text-[12px] text-slate-500">机台抛料率增高，首件检验 (IPQC) 发现批量引脚虚焊。</p>
                                            </div>

                                            <div className="flex items-center justify-center shrink-0">
                                                <ArrowRight size={20} className="text-slate-300 hidden lg:block" />
                                                <ArrowDownToLine size={20} className="text-slate-300 block lg:hidden" />
                                            </div>

                                            {/* 节点 4: 供应链根因 */}
                                            <div className="w-[260px] lg:w-0 lg:flex-1 lg:min-w-[210px] bg-purple-50 border-2 border-purple-400 rounded-xl p-5 shadow-md relative shrink-0 flex flex-col">
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1 whitespace-nowrap"><Target size={10}/> 锁定根因</div>
                                                <h4 className="font-bold text-[14px] text-purple-900 mt-2 mb-2">供应商封装工艺变更</h4>
                                                <p className="text-[12px] text-purple-700">供应商 [深圳华芯科技] 本批次私自变更了底部焊盘工艺参数，导致与现有 SMT 温度曲线不匹配。</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 border-t border-slate-100 pt-6">
                                        <h3 className="font-bold text-[14px] text-slate-800 mb-4 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500"/> AI 自动化行动建议</h3>
                                        <div className="flex flex-wrap gap-4">
                                            <button className="bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 px-5 py-3 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 shadow-sm"><ShoppingCart size={16} className="text-blue-500"/> 派发工单：要求采购部向供应商索赔并退货</button>
                                            <button className="bg-slate-50 border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-slate-700 px-5 py-3 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 shadow-sm"><MonitorCog size={16} className="text-emerald-500"/> 派发工单：要求工艺部紧急调整 SMT 炉温曲线</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3.4 预测与推演沙盘 (Predictive Simulation Sandbox) */}
                    {activeTab === 'sandbox' && (
                        <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in duration-300">
                            {/* 左侧：参数调节区 */}
                            <div className="lg:w-[40%] bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                                    <h3 className="font-bold text-slate-800 text-[15px] flex items-center"><Settings size={16} className="mr-2 text-blue-600"/> 宏观环境变量模拟设定 (What-If)</h3>
                                </div>
                                <div className="p-6 space-y-8 flex-1">
                                    <div>
                                        <div className="flex justify-between items-center mb-4">
                                            <label className="text-[14px] font-bold text-slate-700 flex items-center gap-2"><ShoppingCart size={16} className="text-amber-500"/> 原材料采购成本普涨预测</label>
                                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[12px] font-mono font-bold">+{materialPriceInc}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="30" step="1" 
                                            value={materialPriceInc} 
                                            onChange={(e) => setMaterialPriceInc(Number(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                        <div className="flex justify-between text-[11px] text-slate-400 mt-2"><span>0%</span><span>30%</span></div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-4">
                                            <label className="text-[14px] font-bold text-slate-700 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500"/> 市场需求激增 / 爆单预测</label>
                                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[12px] font-mono font-bold">+{demandInc}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="50" step="5" 
                                            value={demandInc} 
                                            onChange={(e) => setDemandInc(Number(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                        />
                                        <div className="flex justify-between text-[11px] text-slate-400 mt-2"><span>0%</span><span>50%</span></div>
                                    </div>
                                    
                                    <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex items-start gap-3 mt-4">
                                        <Info size={16} className="text-blue-500 shrink-0 mt-0.5"/>
                                        <p className="text-[12px] text-slate-600 leading-relaxed">
                                            拖动滑块调整未来 3-6 个月的外部假设条件。右侧 AI 模型将联动底层 <strong>MPS(主计划)</strong>、<strong>BOM成本</strong> 及 <strong>产能负荷</strong>，实时测算对企业核心经营指标的连锁影响。
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 右侧：推演结果区 */}
                            <div className="lg:w-[60%] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-bl-full pointer-events-none"></div>
                                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center z-10">
                                    <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2"><Sparkles size={16} className="text-purple-600"/> AI 动态推演结果 (影响预估)</h3>
                                </div>
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                    {/* 预测卡片 1: 净利润 */}
                                    <div className="p-5 border border-slate-200 rounded-2xl shadow-sm bg-[#fafcff]">
                                        <div className="text-[13px] font-bold text-slate-500 mb-2">预估月度净利润</div>
                                        <div className="flex items-baseline gap-2 mb-3">
                                            <span className={`text-[28px] font-bold font-mono ${projectedProfit < baseProfit ? 'text-rose-500' : projectedProfit > baseProfit ? 'text-emerald-500' : 'text-slate-800'}`}>
                                                ¥{projectedProfit.toLocaleString()}
                                            </span>
                                            <span className="text-[12px] text-slate-500">万元</span>
                                        </div>
                                        <div className="text-[12px] flex items-center justify-between border-t border-slate-100 pt-3">
                                            <span className="text-slate-400">当前基线: ¥{baseProfit}万</span>
                                            {projectedProfit !== baseProfit && (
                                                <span className={`font-bold flex items-center ${projectedProfit > baseProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {projectedProfit > baseProfit ? <ArrowUpFromLine size={12} className="mr-1"/> : <ArrowDownToLine size={12} className="mr-1"/>}
                                                    {Math.abs(projectedProfit - baseProfit).toLocaleString()}万
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 预测卡片 2: 交付周期 */}
                                    <div className="p-5 border border-slate-200 rounded-2xl shadow-sm bg-[#fafcff]">
                                        <div className="text-[13px] font-bold text-slate-500 mb-2">预估平均订单交付周期</div>
                                        <div className="flex items-baseline gap-2 mb-3">
                                            <span className={`text-[28px] font-bold font-mono ${projectedDelivery > baseDelivery ? 'text-rose-500' : 'text-slate-800'}`}>
                                                {projectedDelivery}
                                            </span>
                                            <span className="text-[12px] text-slate-500">天</span>
                                        </div>
                                        <div className="text-[12px] flex items-center justify-between border-t border-slate-100 pt-3">
                                            <span className="text-slate-400">当前基线: {baseDelivery}天</span>
                                            {projectedDelivery > baseDelivery && (
                                                <span className="font-bold flex items-center text-rose-500">
                                                    <ArrowUpFromLine size={12} className="mr-1"/> 延期 {projectedDelivery - baseDelivery} 天
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 预测卡片 3: 库存资金占用 */}
                                    <div className="p-5 border border-slate-200 rounded-2xl shadow-sm bg-[#fafcff] md:col-span-2">
                                        <div className="text-[13px] font-bold text-slate-500 mb-2">预估库存资金占用总额</div>
                                        <div className="flex items-baseline gap-2 mb-3">
                                            <span className={`text-[28px] font-bold font-mono ${projectedInventory > baseInventory ? 'text-amber-500' : 'text-slate-800'}`}>
                                                ¥{projectedInventory.toLocaleString()}
                                            </span>
                                            <span className="text-[12px] text-slate-500">万元</span>
                                        </div>
                                        {/* 简单的横向条形图 */}
                                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex mt-2">
                                            <div className="bg-slate-400 h-full transition-all" style={{width: `${(baseInventory / 600) * 100}%`}}></div>
                                            <div className="bg-amber-400 h-full transition-all relative" style={{width: `${((projectedInventory - baseInventory) / 600) * 100}%`}}></div>
                                        </div>
                                        <div className="text-[12px] flex items-center justify-between mt-2">
                                            <span className="text-slate-400">当前基线: ¥{baseInventory}万</span>
                                            {projectedInventory > baseInventory && (
                                                <span className="font-bold flex items-center text-amber-500">
                                                    新增占用 ¥{projectedInventory - baseInventory}万
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

// ==========================================
// 10. 消息管理模块 (MessageManagement)
// ==========================================
const channelOptions = ['企微机器人', '短信 (SMS)', '系统站内信', '邮件 (Email)', '钉钉机器人'];

const createEmptyRule = (index = 1) => ({
    id: `R-${String(index).padStart(3, '0')}`,
    name: '新建消息路由规则',
    trigger: '请选择业务事件与触发阈值',
    target: '请选择接收人或岗位',
    channels: ['系统站内信'],
    aiRewrite: false,
    status: true,
    freq: '即时触达',
    template: '请输入消息模板，支持 {变量名} 作为动态变量。'
});

const RuleConfigModal = ({ config, onClose, onSave }: any) => {
    const [draft, setDraft] = useState(config?.rule || createEmptyRule());
    const modeTitle = config?.mode === 'new' ? '新建路由规则' : config?.mode === 'channels' ? '配置触达渠道' : config?.mode === 'template' ? '配置消息模板' : '编辑路由规则';

    if (!config) return null;

    const updateDraft = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
    const toggleChannel = (channel) => {
        setDraft(prev => {
            const exists = prev.channels.includes(channel);
            const nextChannels = exists ? prev.channels.filter(item => item !== channel) : [...prev.channels, channel];
            return { ...prev, channels: nextChannels.length ? nextChannels : ['系统站内信'] };
        });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[125] flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-[760px] max-w-[calc(100vw-48px)] max-h-[90vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
                <div className="p-6 border-b border-slate-100 bg-slate-50/60 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                            <Workflow size={22} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[18px] font-bold text-slate-800">{modeTitle}</h3>
                            <p className="text-[13px] text-slate-500 leading-relaxed mt-1.5">配置触发条件、接收对象、触达渠道和消息模板，保存后立即更新当前规则卡片。</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 p-1.5 rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
                        <label className="block">
                            <span className="block text-[12px] font-bold text-slate-500 mb-2">规则名称</span>
                            <input value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white" />
                        </label>
                        <label className="block">
                            <span className="block text-[12px] font-bold text-slate-500 mb-2">状态</span>
                            <select value={draft.status ? 'enabled' : 'disabled'} onChange={(e) => updateDraft('status', e.target.value === 'enabled')} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white">
                                <option value="enabled">启用</option>
                                <option value="disabled">停用</option>
                            </select>
                        </label>
                    </div>
                    <label className="block">
                        <span className="block text-[12px] font-bold text-slate-500 mb-2">触发条件</span>
                        <input value={draft.trigger} onChange={(e) => updateDraft('trigger', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white font-mono" />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="block text-[12px] font-bold text-slate-500 mb-2">发送给</span>
                            <input value={draft.target} onChange={(e) => updateDraft('target', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white" />
                        </label>
                        <label className="block">
                            <span className="block text-[12px] font-bold text-slate-500 mb-2">频控策略</span>
                            <select value={draft.freq} onChange={(e) => updateDraft('freq', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white">
                                <option>即时触达</option>
                                <option>即时触达，升级报警</option>
                                <option>每 2 小时聚合发送</option>
                                <option>每日 09:00 汇总发送</option>
                            </select>
                        </label>
                    </div>
                    <div>
                        <div className="text-[12px] font-bold text-slate-500 mb-2">触达渠道</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {channelOptions.map(channel => {
                                const checked = draft.channels.includes(channel);
                                return (
                                    <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-bold transition-colors ${checked ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                        <span className="flex items-center gap-1.5">{channel.includes('短信') ? <Phone size={13}/> : channel.includes('邮件') ? <Send size={13}/> : channel.includes('机器人') ? <MessageCircle size={13}/> : <Inbox size={13}/>} {channel}</span>
                                        {checked && <Check size={14} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <label className="flex items-center justify-between gap-4 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                        <span>
                            <span className="block text-[13px] font-bold text-purple-800">AI 动态文案润色</span>
                            <span className="block text-[12px] text-purple-600 mt-0.5">开启后会根据业务上下文调整语气和重点。</span>
                        </span>
                        <input type="checkbox" checked={draft.aiRewrite} onChange={(e) => updateDraft('aiRewrite', e.target.checked)} className="w-5 h-5 accent-purple-600" />
                    </label>
                    <label className="block">
                        <span className="block text-[12px] font-bold text-slate-500 mb-2">消息模板</span>
                        <textarea value={draft.template} onChange={(e) => updateDraft('template', e.target.value)} className="w-full h-28 resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 bg-white leading-relaxed" />
                    </label>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">取消</button>
                    <button onClick={() => onSave(draft)} className="px-5 py-2.5 text-[13px] font-bold rounded-xl transition-colors bg-blue-600 hover:bg-blue-700 text-white">保存配置</button>
                </div>
            </div>
        </div>
    );
};

const MessageManagement = ({ onNavigateModule, msgs, setMsgs, focusMsgId, focusTick }) => {
    const [activeTab, setActiveTab] = useState('inbox');
    const [msgFilter, setMsgFilter] = useState('all'); // all, ai, approval, system
    const [selectedMsgId, setSelectedMsgId] = useState(focusMsgId || msgs[0]?.id);
    const [rules, setRules] = useState([]);
    const [ruleConfig, setRuleConfig] = useState(null);
    const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
    const [actionModal, setActionModal] = useState(null);

    useEffect(() => {
        if (!focusMsgId) return;
        setActiveTab('inbox');
        setMsgFilter('all');
        setSelectedMsgId(focusMsgId);
    }, [focusMsgId, focusTick]);

    const showToast = (msg, type = 'success') => {
        setToast({ show: true, msg, type });
        setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 3000);
    };

    const openRuleConfig = (mode, rule = null) => {
        const nextRule = rule ? { ...rule, channels: [...rule.channels] } : createEmptyRule(rules.length + 1);
        setRuleConfig({ mode, rule: nextRule });
    };

    const saveRuleConfig = (draft) => {
        setRules(prev => prev.some(rule => rule.id === draft.id)
            ? prev.map(rule => rule.id === draft.id ? draft : rule)
            : [draft, ...prev]);
        setRuleConfig(null);
        showToast(`路由规则「${draft.name}」已保存`, 'success');
    };

    const toggleRuleStatus = (ruleId) => {
        let nextStatus = false;
        let nextName = '';
        setRules(prev => prev.map(rule => {
            if (rule.id !== ruleId) return rule;
            nextStatus = !rule.status;
            nextName = rule.name;
            return { ...rule, status: nextStatus };
        }));
        showToast(`「${nextName}」已${nextStatus ? '启用' : '停用'}`, nextStatus ? 'success' : 'warning');
    };

    const handleAction = (msgId, action) => {
        const msg = msgs.find(m => m.id === msgId);
        const targetModule = action.includes('财务') || action.includes('催款') ? '财务管理'
            : action.includes('采购') || action.includes('批准') || action.includes('驳回') || action.includes('单据') ? '采购管理'
            : action.includes('APS') || action.includes('排产') ? '生产管理'
            : null;
        const isCollectionNotice = action.includes('催款');
        const isFinanceDrill = action.includes('财务') && !isCollectionNotice;
        const modalConfig = {
            kind: targetModule ? 'navigate' : 'process',
            msgId,
            targetModule,
            title: action,
            desc: targetModule ? `确认后将穿透跳转到「${targetModule}」，并把该消息标记为已读。` : '确认后将执行该消息动作，并把消息标记为已读。',
            icon: targetModule ? Link : Workflow,
            tone: targetModule ? 'blue' : (action.includes('忽略') || action.includes('驳回') ? 'amber' : 'emerald'),
            confirmText: targetModule ? `跳转${targetModule}` : '确认执行',
            details: [
                { label: '消息标题', value: msg?.title || '-' },
                { label: '动作', value: action },
                { label: '来源', value: msg?.source || '-' },
                { label: '目标界面', value: targetModule || '消息中心当前页' }
            ],
            checks: targetModule ? ['标记消息已读', `打开${targetModule}`] : ['标记消息已读', '写入处理记录'],
            note: targetModule ? '确认后会携带当前消息上下文进入目标模块，便于继续处理，不再展示无业务含义的步骤序号。' : '确认后会执行当前动作并保留处理记录。'
        };

        if (isFinanceDrill) {
            setActionModal({
                ...modalConfig,
                desc: '确认后将携带资金缺口、影响周期和催收线索进入财务管理看板。',
                details: [
                    { label: '消息标题', value: msg?.title || '-' },
                    { label: '资金缺口', value: '¥41,200.00' },
                    { label: '风险窗口', value: '未来 15 天' },
                    { label: '目标界面', value: '财务管理 / 资金看板' }
                ],
                matrixHeaders: ['看板区域', '带入内容', '处理价值'],
                matrix: [
                    { name: '现金流预测', actions: '应付账款波峰叠加', scope: '定位缺口形成时点' },
                    { name: '应收催收', actions: 'test01客户催收线索', scope: '优先平滑资金曲线' },
                    { name: '风险消息', actions: msg?.id || '-', scope: '保留来源与已读状态' }
                ],
                checks: ['标记消息已读', '携带风险上下文', '打开财务资金看板'],
                note: '这个弹窗用于确认跳转时会带入哪些业务上下文，避免进入财务模块后重新查找风险来源。'
            });
            return;
        }

        if (isCollectionNotice) {
            setActionModal({
                ...modalConfig,
                title: '一键生成催款通知',
                desc: '系统已根据资金流风险生成催款通知草稿，确认后进入财务管理继续发送。',
                confirmText: '生成并打开财务管理',
                details: [
                    { label: '催收对象', value: 'test01客户' },
                    { label: '资金缺口', value: '¥41,200.00' },
                    { label: '建议动作', value: '发起应收账款催收' },
                    { label: '关联消息', value: msg?.id || '-' }
                ],
                fields: [
                    {
                        label: '催款通知预览',
                        type: 'textarea',
                        wide: true,
                        value: 'test01客户您好，系统识别到当前应收账款回款节奏会影响未来15天资金平衡，请优先确认待回款安排。如已付款，请回复付款凭证以便财务核销。'
                    }
                ],
                checks: ['附带应收账款明细', '标记风险消息已读', '跳转财务管理继续发送'],
                note: '这里展示的是将要生成的催款草稿内容，用户可以先判断语气和业务对象是否正确，再进入财务模块处理。'
            });
            return;
        }

        setActionModal(modalConfig);
    };

    const confirmMessageAction = () => {
        if (!actionModal) return;
        setMsgs(msgs.map(m => m.id === actionModal.msgId ? { ...m, read: true } : m));
        const targetModule = actionModal.targetModule;
        setActionModal(null);
        if (targetModule && onNavigateModule) {
            onNavigateModule(targetModule);
            return;
        }
        showToast(`已执行操作：${actionModal.title}`, actionModal.tone === 'amber' ? 'warning' : 'success');
    };

    const filteredMsgs = msgs.filter(m => msgFilter === 'all' ? true : m.type === msgFilter);
    const activeMsg = msgs.find(m => m.id === selectedMsgId) || filteredMsgs[0];

    const getLevelIcon = (level) => {
        if (level === 'critical') return <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(244,63,94,0.6)]"></div>;
        if (level === 'warning') return <div className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_6px_rgba(245,158,11,0.6)]"></div>;
        return <div className="w-2 h-2 bg-blue-500 rounded-full"></div>;
    };

    const getTypeBadge = (type) => {
        if (type === 'ai') return <span className="bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><Sparkles size={10}/> AI 预警</span>;
        if (type === 'approval') return <span className="bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><CheckCircle2 size={10}/> 待审批</span>;
        return <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><Bell size={10}/> 系统通知</span>;
    };

    return (
        <div className="w-full h-full font-sans flex flex-col relative bg-[#F5F7FA]">
            <CenterToast toast={toast} onClose={() => setToast({ show: false, msg: '', type: 'success' })} />
            <BusinessActionModal action={actionModal} onClose={() => setActionModal(null)} onConfirm={confirmMessageAction} />
            {ruleConfig && <RuleConfigModal key={`${ruleConfig.mode}-${ruleConfig.rule.id}`} config={ruleConfig} onClose={() => setRuleConfig(null)} onSave={saveRuleConfig} />}

            <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
                <div className="flex justify-between items-start mb-6 shrink-0">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl mr-4 shadow-sm"><MessageSquare size={24} /></div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">消息中心</h1>
                            <div className="text-[13px] text-slate-500 mt-1 font-medium">全域业务通知与 AI 洞察聚合枢纽</div>
                        </div>
                    </div>
                </div>
                
                <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
                    <button onClick={() => setActiveTab('inbox')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'inbox' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Inbox size={14} className="mr-1.5" /> 统一收件箱</button>
                    <div className="w-px h-5 bg-slate-200 mx-1 self-center"></div>
                    <button onClick={() => setActiveTab('rules')} className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'rules' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}><Workflow size={14} className="mr-1.5" /> 消息路由与规则配置</button>
                </div>

                <div className="w-full flex-1 overflow-hidden">
                    {/* 1. 统一消息收件箱 (Message Inbox) */}
                    {activeTab === 'inbox' && (
                        <div className="flex h-full gap-6 animate-in fade-in duration-300">
                            {/* 左侧：列表与过滤 */}
                            <div className="w-[380px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col shrink-0 overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50">
                                    <div className="relative">
                                        <input type="text" placeholder="搜索消息标题或内容..." className="w-full bg-white border border-slate-200 text-[13px] rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 placeholder-slate-400" />
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                                        <button onClick={() => setMsgFilter('all')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${msgFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>全部</button>
                                        <button onClick={() => setMsgFilter('ai')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${msgFilter === 'ai' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>@AI 预警</button>
                                        <button onClick={() => setMsgFilter('approval')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${msgFilter === 'approval' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>待办审批</button>
                                        <button onClick={() => setMsgFilter('system')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${msgFilter === 'system' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>系统通知</button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                                    {filteredMsgs.map(msg => (
                                        <div 
                                            key={msg.id} 
                                            onClick={() => {
                                                setSelectedMsgId(msg.id);
                                                if(!msg.read) setMsgs(msgs.map(m => m.id === msg.id ? { ...m, read: true } : m));
                                            }}
                                            className={`p-4 cursor-pointer transition-colors relative group ${selectedMsgId === msg.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                                        >
                                            {selectedMsgId === msg.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    {!msg.read && <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>}
                                                    {getTypeBadge(msg.type)}
                                                </div>
                                                <span className="text-[11px] text-slate-400 font-mono">{msg.time}</span>
                                            </div>
                                            <h4 className={`text-[13px] font-bold text-slate-800 mb-1.5 flex items-center gap-2 ${!msg.read ? 'text-slate-900' : 'text-slate-700'}`}>
                                                {getLevelIcon(msg.level)} {msg.title}
                                            </h4>
                                            <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{msg.content}</p>
                                        </div>
                                    ))}
                                    {filteredMsgs.length === 0 && <div className="p-8 text-center text-slate-400 text-[13px]">暂无该分类消息</div>}
                                </div>
                            </div>

                            {/* 右侧：消息详情与操作区 */}
                            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
                                {activeMsg ? (
                                    <>
                                        <div className="px-8 py-6 border-b border-slate-100 shrink-0">
                                            <div className="flex items-center gap-3 mb-4">
                                                {getTypeBadge(activeMsg.type)}
                                                <span className="text-[12px] text-slate-400 font-mono flex items-center gap-1"><Clock size={12}/> {activeMsg.time}</span>
                                                <span className="text-[12px] text-slate-400 flex items-center gap-1 ml-auto"><Server size={12}/> 来源: {activeMsg.source}</span>
                                            </div>
                                            <h2 className="text-[20px] font-bold text-slate-800 flex items-center gap-2">
                                                {getLevelIcon(activeMsg.level)} {activeMsg.title}
                                            </h2>
                                        </div>
                                        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar bg-[#fafcff]/50">
                                            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-[14px] leading-relaxed text-slate-700">
                                                {activeMsg.content}
                                                
                                                {/* 为 AI 预警添加特殊的详情区块 */}
                                                {activeMsg.type === 'ai' && (
                                                    <div className="mt-6 pt-5 border-t border-purple-100 bg-purple-50/50 -mx-6 -mb-6 p-6 rounded-b-2xl">
                                                        <h5 className="font-bold text-purple-800 text-[13px] flex items-center gap-1.5 mb-3"><Sparkles size={14}/> AI 智能归因与上下文摘要</h5>
                                                        <ul className="space-y-2 text-[13px] text-purple-900/80">
                                                            <li className="flex items-start gap-2"><ArrowRight size={14} className="mt-0.5 shrink-0 text-purple-400"/> <span>追溯发现，客户历史逾期订单占比达 35%。</span></li>
                                                            <li className="flex items-start gap-2"><ArrowRight size={14} className="mt-0.5 shrink-0 text-purple-400"/> <span>当前账户体系中，现金流健康指数降至 62分（阈值 70）。</span></li>
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* 快捷交互操作卡片 (Actionable Area) */}
                                            {activeMsg.actions && (
                                                <div className="mt-8 flex gap-3">
                                                    {activeMsg.actions.map((act, idx) => (
                                                        <button 
                                                            key={idx} 
                                                            onClick={() => handleAction(activeMsg.id, act)}
                                                            className={`px-6 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2 ${
                                                                idx === 0 
                                                                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {idx === 0 ? <Check size={16} /> : <ArrowRightLeft size={16} />}
                                                            {act}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                        <Inbox size={48} className="text-slate-200 mb-4" />
                                        <p className="font-bold text-[14px]">请选择一条消息以查看详情</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 2. 消息推送与路由配置 (Message Routing) */}
                    {activeTab === 'rules' && (
                        <div className="flex flex-col h-full animate-in fade-in duration-300">
                            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 mb-6 shrink-0 flex justify-between items-center">
                                <div>
                                    <h2 className="text-[16px] font-bold text-slate-800 mb-1">事件订阅与路由分发</h2>
                                    <p className="text-[13px] text-slate-500">配置全域系统异常、AI 预警及审批流的触达规则，防止信息过载。</p>
                                </div>
                                <button onClick={() => openRuleConfig('new')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center shadow-sm">
                                    <Plus size={16} className="mr-1.5"/> 新建路由规则
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-6">
                                    {rules.map(rule => (
                                        <div key={rule.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col transition-colors ${rule.status ? 'border-slate-200 hover:border-blue-300' : 'border-slate-200/60 opacity-75'}`}>
                                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => toggleRuleStatus(rule.id)} className={`p-2 rounded-lg text-white font-bold text-[12px] shadow-sm transition-colors ${rule.status ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-400 hover:bg-slate-500'}`}>
                                                        {rule.status ? '已启用' : '已停用'}
                                                    </button>
                                                    <h3 className="font-bold text-slate-800 text-[15px]">{rule.name}</h3>
                                                </div>
                                                <button onClick={() => openRuleConfig('edit', rule)} className="text-slate-400 hover:text-blue-600 transition-colors p-1 rounded hover:bg-blue-50"><Edit2 size={16}/></button>
                                            </div>
                                            <div className="p-6 flex-1 flex flex-col gap-5">
                                                {/* Trigger & Condition */}
                                                <div>
                                                    <div className="text-[12px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">触发条件 (Trigger)</div>
                                                    <div className="bg-[#F8FAFC] border border-slate-200 p-3 rounded-xl text-[13px] text-slate-700 font-medium font-mono flex items-center gap-2">
                                                        <Activity size={14} className="text-rose-500 shrink-0"/> {rule.trigger}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-center">
                                                    <ArrowDownToLine size={16} className="text-slate-300" />
                                                </div>

                                                {/* Action & Channels */}
                                                <div>
                                                    <div className="text-[12px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">执行动作 (Action & Channels)</div>
                                                    <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <span className="text-[13px] text-slate-500">发送给:</span>
                                                            <span className="text-[13px] font-bold text-slate-800">{rule.target}</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 mb-4">
                                                            {rule.channels.map((ch, i) => (
                                                                <button key={i} onClick={() => openRuleConfig('channels', rule)} className="bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-sm hover:bg-blue-50 transition-colors">
                                                                    {ch.includes('企微') || ch.includes('钉钉') ? <MessageCircle size={12}/> : ch.includes('短信') ? <Phone size={12}/> : <Inbox size={12}/>}
                                                                    {ch}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center justify-between pt-3 border-t border-blue-200/50">
                                                            <span className="text-[12px] text-slate-500 flex items-center gap-1"><Clock size={14}/> 频控: {rule.freq}</span>
                                                            {rule.aiRewrite ? (
                                                                <button onClick={() => openRuleConfig('template', rule)} className="text-[11px] bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded font-bold flex items-center gap-1 hover:bg-purple-200 transition-colors"><Sparkles size={12}/> AI 动态文案润色已开启</button>
                                                            ) : (
                                                                <button onClick={() => openRuleConfig('template', rule)} className="text-[11px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded font-bold flex items-center gap-1 hover:bg-slate-200 transition-colors"><FileText size={12}/> 静态变量模板</button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// ==========================================
// 平台主应用 Component (App Routing)
// ==========================================

const roleWorkbenchMeta = {
  老板: { title: '经营驾驶舱', summary: '聚焦交付、现金、产能与风险，所有指标均可追溯到业务单据。' },
  销售: { title: '销售作战台', summary: '集中处理商机、报价、订单、交付承诺与客户回款风险。' },
  计划员: { title: '计划协同台', summary: '从销售需求到 MPS、MRP 与产能排程，统一跟踪缺料和交期。' },
  采购: { title: '采购协同台', summary: '跟踪采购申请、询比价、订单交付与供应商履约。' },
  仓管: { title: '仓储作业台', summary: '围绕收、发、存、盘与批次追溯，快速处理异常任务。' },
  车间: { title: '车间执行台', summary: '聚焦派工、报工、质检、设备与在制品流转。' },
  财务: { title: '业财协同台', summary: '销售与采购业务自动形成应收应付、发票、流水和凭证。' },
  人事: { title: '组织与人才台', summary: '统一管理员工、岗位、考勤、技能与关键人才风险。' },
  超级管理员: { title: '平台治理台', summary: '管理租户、组织、权限、审批、审计与系统运行状态。' },
};

const workbenchMetricVisual = (key: string, index: number) => {
  const tones = ['blue', 'purple', 'amber', 'emerald'] as const;
  const icons = {
    monthlyReceivable: BadgeDollarSign,
    newOrderAmount: BadgeDollarSign,
    purchaseAmount: ShoppingCart,
    openReceivable: Receipt,
    openPayable: CreditCard,
    overdueReceivable: Coins,
    settlementDocuments: Landmark,
    productionCompletionRate: Factory,
    activeWorkOrders: Factory,
    overdueWorkOrders: AlertTriangle,
    pendingDemands: ListTodo,
    openFqc: Microscope,
    pendingOrderReviews: ClipboardCheck,
    dueDeliveryOrders: Clock,
    pendingPurchaseRequests: FilePlus,
    pendingPurchaseOrders: Truck,
    pendingPurchaseReceipts: Microscope,
    pendingShipments: ArrowUpFromLine,
    openStocktakes: ClipboardList,
    lowStockItems: AlertTriangle,
    attendanceRate: UserCheck,
  } as Record<string, typeof Factory>;
  return { icon: icons[key] || Activity, iconTone: tones[index % tones.length] };
};

const formatMetricValue = (value: string, unit: string) => {
  const amount = Number(value);
  if (unit !== '元' || !Number.isFinite(amount) || Math.abs(amount) < 10000) return value;
  return (amount / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
};

const formatMetricUnit = (value: string, unit: string) => {
  const amount = Number(value);
  return unit === '元' && Number.isFinite(amount) && Math.abs(amount) >= 10000 ? '万' : unit;
};

const FeedbackManagement = ({ currentTenant, currentUser, onToast }) => {
  const [issues, setIssues] = useState([
    { id: 'FB-260721-018', title: '移动端扫码报工后返回状态不明确', module: '生产管理', priority: '高', reporter: '王建国', time: '今天 10:26', status: '处理中' },
    { id: 'FB-260720-011', title: '采购订单希望增加供应商交期变更记录', module: '采购管理', priority: '中', reporter: '李采购', time: '昨天 16:42', status: '已受理' },
    { id: 'FB-260718-006', title: '库存批次导出字段与现场模板不一致', module: '库存管理', priority: '低', reporter: '周仓管', time: '7月18日', status: '已解决' },
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [module, setModule] = useState('工作台');
  const [priority, setPriority] = useState('中');
  const [description, setDescription] = useState('');

  const submitFeedback = () => {
    if (!title.trim() || !description.trim()) {
      onToast('请填写问题标题和具体表现', 'warning');
      return;
    }
    const id = `FB-260721-${String(issues.length + 19).padStart(3, '0')}`;
    setIssues(prev => [{ id, title: title.trim(), module, priority, reporter: currentUser.name, time: '刚刚', status: '待受理' }, ...prev]);
    setTitle('');
    setDescription('');
    setIsCreating(false);
    onToast(`${id} 已提交，处理进度会同步到消息中心`, 'success');
  };

  const priorityClass = (value) => value === '高' ? 'bg-rose-50 text-rose-600 border-rose-100' : value === '中' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-200';
  const statusClass = (value) => value === '已解决' ? 'bg-emerald-50 text-emerald-700' : value === '处理中' ? 'bg-blue-50 text-blue-700' : value === '已受理' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700';

  return (
    <div className="flex-1 overflow-y-auto bg-[#f4f7fb] custom-scrollbar">
      <main className="max-w-[1380px] mx-auto px-6 py-7">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-7">
          <div>
            <div className="text-[11px] font-black tracking-[0.14em] text-blue-600">PRODUCT FEEDBACK</div>
            <h1 className="mt-2 text-[26px] font-black text-slate-950">问题反馈</h1>
            <p className="mt-2 text-[13px] text-slate-500 font-medium">提交使用问题、业务建议和数据异常；每条反馈都绑定租户、模块和处理记录。</p>
          </div>
          <button onClick={() => setIsCreating(prev => !prev)} className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm transition-colors">
            {isCreating ? <X size={16}/> : <Plus size={16}/>} {isCreating ? '收起反馈表单' : '提交新问题'}
          </button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-2xl overflow-hidden mb-6">
          {[
            ['当前租户', currentTenant.name],
            ['待受理', `${issues.filter(item => item.status === '待受理').length} 项`],
            ['处理中', `${issues.filter(item => item.status === '处理中' || item.status === '已受理').length} 项`],
            ['近30日解决率', '94.6%'],
          ].map(([label, value]) => <div key={label} className="bg-white px-5 py-4"><div className="text-[11px] font-bold text-slate-400">{label}</div><div className="mt-1.5 text-[15px] font-black text-slate-800 truncate">{value}</div></div>)}
        </section>

        {isCreating && (
          <section className="bg-white border border-blue-100 rounded-2xl shadow-[0_12px_30px_rgba(37,99,235,0.08)] p-6 mb-6">
            <div className="flex items-center gap-3 mb-5"><div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Edit2 size={17}/></div><div><h2 className="text-[16px] font-black text-slate-900">描述遇到的问题</h2><p className="text-[12px] text-slate-500 mt-0.5">系统会自动附带当前租户与登录用户，不需要重复填写。</p></div></div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <label className="lg:col-span-2"><span className="block text-[12px] font-bold text-slate-700 mb-2">问题标题</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：采购订单审批后未更新状态" className="w-full h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>
              <label><span className="block text-[12px] font-bold text-slate-700 mb-2">所属模块</span><select value={module} onChange={event => setModule(event.target.value)} className="w-full h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] outline-none focus:border-blue-500">{['工作台','AI智能中枢','销售管理','生产管理','库存管理','采购管理','财务管理','人员管理','平台管理'].map(item => <option key={item}>{item}</option>)}</select></label>
              <label><span className="block text-[12px] font-bold text-slate-700 mb-2">影响程度</span><select value={priority} onChange={event => setPriority(event.target.value)} className="w-full h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] outline-none focus:border-blue-500">{['低','中','高'].map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="lg:col-span-4"><span className="block text-[12px] font-bold text-slate-700 mb-2">具体表现与期望结果</span><textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="请说明操作步骤、实际结果和期望结果，便于快速定位。" rows={4} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y"/></label>
            </div>
            <div className="mt-5 flex justify-end gap-3"><button onClick={() => setIsCreating(false)} className="h-10 px-4 rounded-lg text-[13px] font-bold text-slate-600 hover:bg-slate-100">保留稍后填写</button><button onClick={submitFeedback} className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold flex items-center gap-2"><Send size={15}/> 提交问题</button></div>
          </section>
        )}

        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4"><div><h2 className="text-[16px] font-black text-slate-900">反馈记录</h2><p className="text-[12px] text-slate-500 mt-1">状态、回复和解决版本都会持续留痕。</p></div><span className="text-[12px] font-bold text-slate-400">共 {issues.length} 条</span></div>
          <div className="divide-y divide-slate-100">
            {issues.map(issue => (
              <button key={issue.id} onClick={() => onToast(`${issue.id} 的处理详情已展开`, 'success')} className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors grid grid-cols-1 lg:grid-cols-[150px_minmax(0,1fr)_130px_110px_120px] gap-3 lg:items-center">
                <div className="text-[12px] font-black text-blue-600">{issue.id}</div>
                <div className="min-w-0"><div className="text-[13px] font-black text-slate-800 truncate">{issue.title}</div><div className="mt-1 text-[11px] font-medium text-slate-400">{issue.module} · {issue.reporter} · {issue.time}</div></div>
                <span className={`w-max px-2.5 py-1 rounded-md border text-[11px] font-bold ${priorityClass(issue.priority)}`}>{issue.priority}影响</span>
                <span className={`w-max px-2.5 py-1 rounded-md text-[11px] font-bold ${statusClass(issue.status)}`}>{issue.status}</span>
                <span className="text-[12px] font-bold text-slate-500 flex items-center gap-1.5">查看进度 <ChevronRight size={14}/></span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default function App() {
  const {
    activeModule,
    moduleNavigationRevision,
    activeRole,
    allTenantOptions,
    currentTenant,
    currentTenantId,
    currentUser,
    navigateModule: setActiveModule,
    setActiveRole,
    setCurrentTenantId,
    setCurrentUser,
  } = useAppRuntime();
  const formalContext = useMemo(() => currentUser?.accessToken ? ({ tenantId: currentTenant.id, accessToken: currentUser.accessToken }) : null, [currentTenant?.id, currentUser?.accessToken]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [loginPageView, setLoginPageView] = useState<'login' | 'forgot' | 'reset-password' | 'register' | 'first-login'>('login');
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const [firstLoginSession, setFirstLoginSession] = useState<{ account: string; tempPassword: string } | null>(null);
  const [messages, setMessages] = useState([]);
  const [focusedMessageId, setFocusedMessageId] = useState<string | undefined>(undefined);
  const [messageFocusTick, setMessageFocusTick] = useState(0);

  // Phase 7: 消息中心 API 集成
  const mapBackendMessage = (msg: any) => {
    const typeMap: Record<string, string> = { order: 'approval', payment: 'system', shipping: 'system', inventory: 'ai', production: 'system', procurement: 'approval', finance: 'ai', system: 'system' };
    const levelMap: Record<string, string> = { urgent: 'critical', high: 'warning', normal: 'info', low: 'info' };
    const timeAgo = (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
      return `${Math.floor(diff / 86400000)}天前`;
    };
    return {
      id: msg.id, type: typeMap[msg.category] || 'system', level: levelMap[msg.priority] || 'info',
      title: msg.title, content: msg.body, time: timeAgo(msg.createdAt),
      read: msg.isRead, source: msg.senderName || msg.sourceType || '系统',
      actions: msg.sourceDocNo ? ['查看单据详情'] : [], _backend: msg,
    };
  };

  const refreshMessages = async () => {
    if (!formalContext) return;
    try {
      const response = await messagesApi.listMessages(formalContext, { page: 1, pageSize: 50 });
      setMessages(response.items.map(mapBackendMessage));
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => { refreshMessages(); }, [formalContext?.tenantId, formalContext?.accessToken]);
  const [salesResetSignal, setSalesResetSignal] = useState(0);
  const [businessFlow, setBusinessFlow] = useState(null);
  const [financeRefreshTick, setFinanceRefreshTick] = useState(0);
  const [flowToast, setFlowToast] = useState({ show: false, msg: '', type: 'success' });
  const [isGlobalAssistantOpen, setIsGlobalAssistantOpen] = useState(false);
  const [globalAssistantWidth, setGlobalAssistantWidth] = useState(520);
  const [isGlobalAssistantResizing, setIsGlobalAssistantResizing] = useState(false);
  const [globalAssistantInput, setGlobalAssistantInput] = useState('');
  const [globalAssistantMessages, setGlobalAssistantMessages] = useState<any[]>([
    { role: 'assistant', text: '你好，我是工业 AI 助手。你可以直接问经营、销售、生产、库存和采购数据；涉及生成单据或改变 ERP 数据时，我会先给出依据、影响范围和审批要求。', time: '刚刚' }
  ]);
  const [profileModal, setProfileModal] = useState(null);
  const [platformState, setPlatformState] = useState(() => loadPlatformState(currentTenant));
  const roleMeta = roleWorkbenchMeta[activeRole] || roleWorkbenchMeta.老板;
  const [workbenchDashboard, setWorkbenchDashboard] = useState<WorkbenchDashboardDto | null>(null);
  const [workbenchError, setWorkbenchError] = useState('');
  const [workbenchLoading, setWorkbenchLoading] = useState(false);

  useEffect(() => {
    if (!formalContext) {
      setWorkbenchDashboard(null);
      setWorkbenchError('');
      return;
    }
    let cancelled = false;
    const role = activeRole as WorkbenchRole;
    const refresh = async () => {
      setWorkbenchLoading(true);
      try {
        const dashboard = await workbenchApi.getDashboard(formalContext, role);
        if (!cancelled) {
          setWorkbenchDashboard(dashboard);
          setWorkbenchError('');
        }
      } catch (error) {
        if (!cancelled) {
          setWorkbenchDashboard(null);
          setWorkbenchError(error instanceof Error ? error.message : '工作台数据读取失败');
        }
      } finally {
        if (!cancelled) {
          setWorkbenchLoading(false);
        }
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRole, formalContext?.tenantId, formalContext?.accessToken]);

  const workbenchMetrics = useMemo(() => {
    if (!workbenchDashboard) return [];
    const generatedAt = new Date(workbenchDashboard.generatedAt);
    const updatedAt = `${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`;
    return workbenchDashboard.metrics.map((metric, index) => {
      const { icon, iconTone } = workbenchMetricVisual(metric.key, index);
      return { ...metric, value: formatMetricValue(metric.value, metric.unit), displayUnit: formatMetricUnit(metric.value, metric.unit), updatedAt, icon, iconTone };
    });
  }, [workbenchDashboard]);
  const todayLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  const authorizedTenantOptions = allTenantOptions.filter((tenant) =>
    !currentUser?.tenantIds?.length || currentUser.tenantIds.includes(tenant.id),
  );

  useEffect(() => {
    setPlatformState(loadPlatformState(currentTenant));
    const onPlatformChange = (event) => {
      if (event.detail?.tenantId === currentTenant.id) setPlatformState(event.detail.state || loadPlatformState(currentTenant));
    };
    const onStorage = (event) => {
      if (event.key === platformStorageKey(currentTenant.id)) setPlatformState(loadPlatformState(currentTenant));
    };
    window.addEventListener(PLATFORM_STATE_CHANGED_EVENT, onPlatformChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PLATFORM_STATE_CHANGED_EVENT, onPlatformChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [currentTenantId]);

	  const handleLogin = async ({ account, password, phone, smsCode, captchaId, captchaCode }) => {
      let session;
      if (phone && smsCode) {
        session = await loginWithSms(phone, smsCode);
      } else {
        const loginResult = await loginWithPassword({ account, password, captchaId, captchaCode });
        if (loginResult.firstLogin) {
          setFirstLoginSession({ account: loginResult.account, tempPassword: password });
          setLoginPageView('first-login');
          return;
        }
        session = loginResult;
      }
	    saveAuthenticatedSession(session);
    setCurrentUser(session);
    if (isRoleName(session.role)) setActiveRole(session.role);
    setActiveModule('工作台');
    showFlowToast('登录成功，欢迎进入工业AI平台', 'success');
  };

  const handleLogout = () => {
    clearAuthenticatedSession();
    setCurrentUser(null);
    setProfileModal(null);
    setActiveModule('工作台');
    setIsGlobalAssistantOpen(false);
    setIsNotificationsOpen(false);
  };

  const openProfileModal = () => {
    setProfileModal({
      title: '个人信息',
      desc: '当前登录用户的基础资料与会话信息。',
      icon: UserCheck,
      tone: 'blue',
      confirmText: '知道了',
      details: [
        { label: '用户名称', value: currentUser.name },
        { label: '当前工作角色', value: activeRole },
        { label: '当前租户', value: currentTenant.name },
        { label: '登录账号', value: currentUser.account || '-' },
	        { label: '登录方式', value: currentUser.loginType === 'phone' ? '手机号登录' : '账号登录' },
	        { label: '权限来源', value: currentUser.permissionSource || 'erp.wanshen.top 旧权限底座' },
	        { label: '已适配权限', value: `${currentUser.permissions?.length || 0} 项` },
	        { label: '登录时间', value: currentUser.loginAt ? new Date(currentUser.loginAt).toLocaleString('zh-CN', { hour12: false }) : '-' },
        { label: '会话状态', value: '已登录' },
      ],
      note: '个人信息来自本次前端登录会话；正式接入后可同步企业账号中心、角色权限和安全审计记录。'
    });
  };

  const showFlowToast = (msg, type = 'success') => {
    setFlowToast({ show: true, msg, type });
    setTimeout(() => setFlowToast({ show: false, msg: '', type: 'success' }), 2600);
  };

  const switchTenant = (tenantId) => {
    const nextTenant = authorizedTenantOptions.find(item => item.id === tenantId);
    if (!nextTenant) return;
    setCurrentTenantId(tenantId);
    setActiveModule('工作台');
    setBusinessFlow(null);
    showFlowToast(`已切换到 ${nextTenant.name}，业务上下文与数据权限已刷新`, 'success');
  };

  const switchRole = (role) => {
    if (!isRoleName(role)) return;
    setActiveRole(role);
    setActiveModule('工作台');
    showFlowToast(`已进入${roleWorkbenchMeta[role]?.title || role + '工作台'}`, 'success');
  };

  const localDate = () => {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  };

  const readFinanceError = (error: unknown) => (
    error instanceof Error ? error.message : '财务操作失败，请稍后重试'
  );

  const findFinanceDocument = async (kind: 'receivable' | 'payable', sourceOrder: string) => {
    if (!formalContext || !sourceOrder) return null;
    const response = kind === 'receivable'
      ? await financeApi.listReceivables(formalContext, { page: 1, pageSize: 1, sourceOrder })
      : await financeApi.listPayables(formalContext, { page: 1, pageSize: 1, sourceOrder });
    return response.items[0] || null;
  };

  const loadLinkedFinanceDocuments = async (flow) => {
    const receivable = await findFinanceDocument('receivable', flow?.orderId || '');
    const payable = flow?.purchaseOrder?.id ? await findFinanceDocument('payable', flow.purchaseOrder.id) : null;
    return { receivable, payable };
  };

  const handleBusinessFlowAction = async (action, payload = null) => {
    if (action === 'resetFlow') {
      setBusinessFlow(null);
      showFlowToast('当前流程上下文已关闭，请从销售订单重新发起');
      return;
    }

    if (action === 'generateFinanceDocs') {
      if (!formalContext) {
        showFlowToast('请使用正式登录会话生成财务单据', 'error');
        return;
      }
      if (!businessFlow?.orderId) {
        showFlowToast('缺少来源销售订单，不能生成财务单据', 'error');
        return;
      }
      try {
        const documents = await loadLinkedFinanceDocuments(businessFlow);
        if (!documents.receivable) throw new Error('销售出库尚未回写正式应收单');
        if (businessFlow.purchaseOrder?.id && !documents.payable) throw new Error('采购入库尚未回写正式应付单');
        setBusinessFlow(prev => ({
          ...prev,
          currentStep: 'financeDocs',
          receivable: documents.receivable,
          payable: documents.payable,
          completed: Array.from(new Set([...prev.completed, 'delivery'])),
          ledger: [...prev.ledger, { module: '财务管理', text: `已接收正式应收单 ${documents.receivable.docNo}${documents.payable ? ` 和应付单 ${documents.payable.docNo}` : ''}` }],
        }));
        setFinanceRefreshTick(value => value + 1);
        setActiveModule('财务管理');
        showFlowToast('正式应收应付单据已接收', 'success');
      } catch (error) {
        showFlowToast(readFinanceError(error), 'error');
      }
      return;
    }

    if (action === 'settleFinance') {
      if (!formalContext) {
        showFlowToast('请使用正式登录会话完成结算', 'error');
        return;
      }
      try {
        const documents = await loadLinkedFinanceDocuments(businessFlow);
        if (!documents.receivable) throw new Error('未找到正式应收单');
        const paymentDate = localDate();
        const receivableTask = documents.receivable.status === 'done'
          ? Promise.resolve({ document: documents.receivable })
          : financeApi.settleReceivable(formalContext, documents.receivable.id, {
            paymentDate,
            referenceNo: businessFlow.orderId,
            remark: '销售订单业务闭环结算',
          });
        const payableTask = documents.payable && documents.payable.status !== 'done'
          ? financeApi.settlePayable(formalContext, documents.payable.id, {
            paymentDate,
            referenceNo: businessFlow.purchaseOrder?.orderNo || businessFlow.purchaseOrder?.id,
            remark: '采购订单业务闭环结算',
          })
          : Promise.resolve(documents.payable ? { document: documents.payable } : null);
        const [receivableResult, payableResult] = await Promise.all([receivableTask, payableTask]);
        setBusinessFlow(prev => ({
          ...prev,
          currentStep: 'settlement',
          receivable: receivableResult.document,
          payable: payableResult?.document || null,
          completed: Array.from(new Set([...prev.completed, 'financeDocs'])),
          ledger: [...prev.ledger, { module: '财务管理', text: `正式收付款、发票和凭证已完成${payableResult ? '' : '（无采购应付）'}` }],
        }));
        setFinanceRefreshTick(value => value + 1);
        setActiveModule('财务管理');
        showFlowToast('正式收付款、发票和凭证已完成', 'success');
      } catch (error) {
        showFlowToast(readFinanceError(error), 'error');
      }
      return;
    }

    if (action === 'settleFinanceDocument' && payload?.documentId) {
      if (!formalContext) {
        showFlowToast('请使用正式登录会话完成结算', 'error');
        return;
      }
      try {
        const paymentDate = localDate();
        const result = payload.kind === 'payable'
          ? await financeApi.settlePayable(formalContext, payload.documentId, { paymentDate, remark: '财务应付结算' })
          : await financeApi.settleReceivable(formalContext, payload.documentId, { paymentDate, remark: '财务应收结算' });
        const documents = businessFlow?.orderId ? await loadLinkedFinanceDocuments(businessFlow) : { receivable: null, payable: null };
        const financeComplete = (!documents.receivable || documents.receivable.status === 'done')
          && (!businessFlow?.purchaseOrder?.id || !documents.payable || documents.payable.status === 'done');
        setBusinessFlow(prev => {
          if (!prev) return prev;
          const matchesFlow = (doc, orderNo) => doc && (doc.sourceDocNo === orderNo || doc.sourceId === orderNo);
          return {
            ...prev,
            currentStep: matchesFlow(documents.receivable, prev.orderId) && financeComplete ? 'settlement' : prev.currentStep,
            receivable: matchesFlow(documents.receivable, prev.orderId) ? documents.receivable : prev.receivable,
            payable: matchesFlow(documents.payable, prev.purchaseOrder?.id) ? documents.payable : prev.payable,
            completed: matchesFlow(documents.receivable, prev.orderId) && financeComplete
              ? Array.from(new Set([...prev.completed, 'financeDocs']))
              : prev.completed,
            ledger: [...prev.ledger, { module: '财务管理', text: `正式结算完成：${result.document.docNo}` }],
          };
        });
        setFinanceRefreshTick(value => value + 1);
        showFlowToast(`正式结算完成：${result.document.docNo}`, 'success');
      } catch (error) {
        showFlowToast(readFinanceError(error), 'error');
      }
      return;
    }

    if (action === 'confirmSalesOrder' && payload) {
      setBusinessFlow({
        ...createInitialBusinessFlow(),
        id: `FLOW-${payload.id}`,
        orderId: payload.id,
        customer: payload.client,
        product: payload.productName || payload.product,
        qty: payload.qty,
        amount: payload.amount,
        availableStock: payload.availableStock,
        shortage: null,
        stockEnough: null,
        currentStep: 'approval',
        completed: ['opportunity', 'approval'],
        ledger: [
          { module: '销售管理', text: `销售订单 ${payload.id} 已确认` },
          { module: '销售管理', text: '销售发货内容已确认，等待发起发货' },
        ],
      });
      showFlowToast('订单已确认，可在已确认列表继续去发货');
      return;
    }

    if (action === 'approveOrder' && payload) {
      setBusinessFlow({
        ...createInitialBusinessFlow(),
        id: `FLOW-${payload.id}`,
        orderId: payload.id,
        customer: payload.client,
        product: payload.productName || payload.product,
        qty: payload.qty,
        amount: payload.amount,
        availableStock: payload.availableStock,
        shortage: payload.shortage,
        stockEnough: Number(payload.shortage || 0) === 0,
        productionDemandId: payload.productionDemand?.id,
        productionDemandCode: payload.productionDemand?.code,
        productionDemandStatus: payload.productionDemand?.status,
        inventoryFactVersion: payload.intake?.inventoryFactVersion,
        intakeId: payload.intake?.id,
        correlationId: payload.intake?.correlationId,
        currentStep: 'stockCheck',
        completed: ['opportunity', 'approval'],
        ledger: [
          { module: '销售管理', text: `已创建销售订单 ${payload.id}` },
          { module: '销售管理', text: `订单已审批，需求数量 ${payload.qty}` },
          { module: '库存管理', text: `库存事实 v${payload.intake?.inventoryFactVersion || '-'} 校验完成，可用 ${payload.availableStock}，缺口 ${payload.shortage || 0}` },
          ...(payload.productionDemand ? [{ module: '生产管理', text: `已创建生产需求 ${payload.productionDemand.code}` }] : [])
        ]
      });
      showFlowToast(payload.productionDemand ? '库存事实不足，生产需求已事务化创建' : '库存事实充足，可跳过生产与采购');
      return;
    }

    if (action === 'formalMrpCompleted' && payload) {
      setBusinessFlow(prev => {
        const base = prev || {
          ...createInitialBusinessFlow(),
          id: `FLOW-${payload.demandId}`,
          orderId: '',
          customer: '业务来源',
          product: '',
          qty: 0,
          shortage: 0,
          stockEnough: false,
          productionDemandId: payload.demandId,
          productionDemandCode: payload.productionDemandCode || '',
          correlationId: '',
        };
        return {
        ...base,
        currentStep: 'mpsMrp',
        mrpTaskId: payload.mrpTaskId,
        mrpDemandId: payload.demandId,
        materialShortages: payload.materialShortages || [],
        completed: Array.from(new Set([...base.completed, 'productionDemand'])),
        ledger: [...base.ledger, { module: '生产管理', text: `正式 MRP ${payload.mrpTaskId} 已完成，采购缺料 ${payload.materialShortages?.length || 0} 项` }],
        };
      });
      return;
    }

    if (action === 'formalPrCreated' && payload?.purchaseRequest) {
      setBusinessFlow(prev => prev ? ({ ...prev, currentStep: 'purchaseRequest', purchaseRequest: payload.purchaseRequest, completed: Array.from(new Set([...prev.completed, 'mpsMrp'])), ledger: [...prev.ledger, { module: '采购管理', text: `采购申请 ${payload.purchaseRequest.requestNo} 已创建并等待审批` }] }) : prev);
      setActiveModule('采购管理', { query: { procurement: 'pr', focusPr: payload.purchaseRequest.requestNo } });
      showFlowToast(`正式采购申请 ${payload.purchaseRequest.requestNo} 已创建`);
      return;
    }

    if (action === 'formalPoCreated' && payload?.purchaseOrder) {
      setBusinessFlow(prev => prev ? ({ ...prev, currentStep: 'purchaseOrder', purchaseOrder: payload.purchaseOrder, completed: Array.from(new Set([...prev.completed, 'purchaseRequest'])), ledger: [...prev.ledger, { module: '采购管理', text: `采购申请已审批，采购订单 ${payload.purchaseOrder.orderNo} 已生成` }] }) : prev);
      showFlowToast(`正式采购订单 ${payload.purchaseOrder.orderNo} 已生成`);
      return;
    }

    if (action === 'formalMaterialInbound' && payload?.receipt) {
      setBusinessFlow(prev => prev ? ({ ...prev, currentStep: 'materialInbound', purchaseReceipt: payload.receipt, materialAvailability: payload.availability, completed: Array.from(new Set([...prev.completed, 'purchaseOrder'])), ledger: [...prev.ledger, { module: '库存管理', text: `采购入库 ${payload.receipt.receiptNo} 已过账，物料库存事实 v${payload.receipt.inventoryFactVersion}` }] }) : prev);
      setActiveModule('库存管理', { query: { inventory: 'inbound' } });
      showFlowToast(`采购入库 ${payload.receipt.receiptNo} 已完成，等待生产齐套`);
      return;
    }

    if (action === 'startProduction') {
      if (!businessFlow?.mrpDemandId) {
        showFlowToast('缺少正式生产需求，不能创建工单', 'error');
        return;
      }
      try {
        const context = { tenantId: currentTenant.id, accessToken: currentUser?.accessToken || '' };
        const aps = await productionOperationsApi.startPlanningTask(context, 'APS', [businessFlow.mrpDemandId], `${businessFlow.mrpDemandId}:after-purchase:${businessFlow.purchaseReceipt?.id || 'none'}`);
        const candidate = aps.result?.scheduleCandidates?.[0];
        if (aps.status !== 'SUCCEEDED' || !candidate) throw new Error('APS 未返回覆盖当前需求的正式候选');
        const demandList = await productionOperationsApi.listDemands(context);
        const demand = demandList.items.find((item) => item.id === businessFlow.mrpDemandId);
        const inventoryWarehouseId = demand?.source?.payloadSnapshot?.warehouseId
          || demand?.source?.payloadSnapshot?.inventoryWarehouseId
          || demand?.source?.inventoryWarehouseId;
        if (!demand || !inventoryWarehouseId) throw new Error('生产需求缺少发货目标仓库');
        const plannedQty = demand.qty;
        const workOrder = await productionOperationsApi.createWorkOrder(context, {
          productId: demand.productId, productName: demand.productName || businessFlow.product, factoryResourceId: demand.factoryResourceId,
          workCenterResourceId: 'WC-01', plannedQty, inputQty: plannedQty, uom: 'PCS', dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          bomSnapshotId: crypto.randomUUID(), routingSnapshotId: crypto.randomUUID(), scheduleCandidateId: candidate.id,
          kittingStatus: 'SHORTAGE', correlationId: businessFlow.correlationId,
          inventoryWarehouseId,
          demandLinks: [{ demandId: businessFlow.mrpDemandId, allocatedQty: plannedQty, customerLocked: true }],
        }, `work-order:${businessFlow.mrpDemandId}:${candidate.id}`);
        const checked = await productionOperationsApi.checkKitting(context, workOrder);
        const released = await productionOperationsApi.workOrderCommand(context, checked, 'release');
        const started = await productionOperationsApi.workOrderCommand(context, released, 'start');
        setBusinessFlow(prev => ({ ...prev, currentStep: 'production', workOrder: started, completed: Array.from(new Set([...prev.completed, 'materialInbound'])), ledger: [...prev.ledger, { module: '生产管理', text: `物料齐套校验通过，工单 ${started.code} 已下达并开工` }] }));
        setActiveModule('生产管理', { query: { production: 'orders' } });
        showFlowToast(`正式工单 ${started.code} 已开工`);
      } catch (error) {
        showFlowToast(error instanceof Error ? `生产下达失败：${error.message}` : '生产下达失败', 'error');
      }
      return;
    }

    if (action === 'finishProduction') {
      if (!businessFlow?.workOrder) {
        showFlowToast('缺少正式生产工单，不能执行完工入库', 'error');
        return;
      }
      try {
        const context = { tenantId: currentTenant.id, accessToken: currentUser?.accessToken || '' };
        const report = await productionOperationsApi.submitReport(context, businessFlow.workOrder, businessFlow.workOrder.plannedQty);
        const inspection = await productionOperationsApi.createInspection(context, report.workOrder, report.workOrder.plannedQty);
        const passed = await productionOperationsApi.passInspection(context, inspection);
        const inventoryWarehouseId = report.workOrder.parameterSnapshot?.inventoryWarehouseId;
        if (!inventoryWarehouseId) throw new Error('生产工单缺少发货目标仓库');
        const completion = await productionOperationsApi.createCompletion(context, report.workOrder, passed, inventoryWarehouseId);
        setBusinessFlow(prev => ({ ...prev, completionId: completion.completionId, workOrder: report.workOrder }));
        const posted = await productionOperationsApi.waitForCompletion(context, completion.completionId);
        if (posted.status !== 'POSTED') {
          showFlowToast('完工入库处理中，请在质量与结案页面查看库存确认结果');
          return;
        }
        setBusinessFlow(prev => ({ ...prev, currentStep: 'finishedInbound', completionId: completion.completionId, completed: Array.from(new Set([...prev.completed, 'production'])), ledger: [...prev.ledger, { module: '库存管理', text: `生产完工 ${completion.completionId} 已入库，原销售发货任务进入重新校验` }] }));
        setActiveModule('库存管理', { query: { inventory: 'inbound' } });
        showFlowToast('生产完工已形成成品库存事实，正在重新校验原销售发货任务');
      } catch (error) {
        showFlowToast(error instanceof Error ? `生产完工失败：${error.message}` : '生产完工失败', 'error');
      }
      return;
    }

    if (action === 'formalSalesShipped') {
      setBusinessFlow(prev => ({ ...prev, currentStep: 'delivery', completed: Array.from(new Set([...prev.completed, 'finishedInbound'])), ledger: [...prev.ledger, { module: '库存管理', text: '原销售出库单已正式过账，销售订单更新为已发货' }] }));
      showFlowToast('销售出库已完成，订单履约闭环');
      return;
    }

    if (action === 'confirmReceipt') {
      setBusinessFlow(prev => ({ ...prev, currentStep: 'delivery', completed: Array.from(new Set([...prev.completed, 'finishedInbound'])), ledger: [...prev.ledger, { module: '销售管理', text: '客户已确认收货，等待财务完成结算' }] }));
      return;
    }

    const flowActionConfig = {
      approveOrder: { next: 'approval', module: '销售管理', query: { tab: 'orders' }, msg: '销售订单已提交审批，保留同一业务单号继续流转' },
      checkStock: { next: 'stockCheck', module: '库存管理', query: { inventory: 'stock' }, msg: '订单审批通过，已进入库存自动校验' },
      openProductionDemand: { next: 'productionDemand', module: '生产管理', query: { production: 'mps' }, msg: '已打开持久化生产需求，来源销售订单保持关联' },
      runMrp: { next: 'mpsMrp', module: '生产管理', query: { production: 'mps' }, msg: '可用库存不足，已生成 MPS/MRP 展算任务', type: 'warning' },
      createPr: { next: 'purchaseRequest', module: '采购管理', query: { procurement: 'pr' }, msg: 'MRP 缺料已转采购申请' },
      approvePr: { next: 'purchaseOrder', module: '采购管理', query: { procurement: 'order' }, msg: '采购申请已审批通过，已生成采购订单' },
      receiveMaterial: { next: 'materialInbound', module: '库存管理', query: { inventory: 'inbound' }, msg: '供应商送货已登记，物料采购入库已接收' },
      startProduction: { next: 'production', module: '生产管理', query: { production: 'orders' }, msg: '物料齐套，已下达生产工单' },
      finishProduction: { next: 'finishedInbound', module: '库存管理', query: { inventory: 'inbound' }, msg: '生产质检合格，成品已入库' },
      shipSales: { next: 'delivery', module: '库存管理', query: { inventory: 'outbound' }, msg: '销售出库并确认发货' },
      generateFinanceDocs: { next: 'financeDocs', module: '财务管理', query: {}, msg: '已生成应收单与应付单，财务接收对账' },
      settleFinance: { next: 'settlement', module: '财务管理', query: {}, msg: '收付款、发票、流水与凭证已完成' },
    };

    const config = flowActionConfig[action];
    if (!config) return;

    setBusinessFlow(prev => ({
      ...prev,
      currentStep: config.next,
      completed: Array.from(new Set([...prev.completed, prev.currentStep])),
      ledger: [...prev.ledger, { module: config.module, text: config.msg }]
    }));
    setActiveModule(config.module, { query: config.query });
    showFlowToast(config.msg, config.type || 'success');
  };

  const linkedFlowProps = {
    businessFlow,
    onBusinessFlowAction: handleBusinessFlowAction,
    onNavigateModule: (moduleLabel, options) => {
      if (moduleLabel === '销售管理') setSalesResetSignal(prev => prev + 1);
      setActiveModule(moduleLabel, options);
    }
  };

  const unreadMessages = messages.filter(message => !message.read);
  const recentMessages = messages.slice(0, 4);

  const openMessageFromBell = (messageId) => {
    setFocusedMessageId(messageId);
    setMessageFocusTick(prev => prev + 1);
    setMessages(prev => prev.map(message => message.id === messageId ? { ...message, read: true } : message));
    if (formalContext) { const msg = messages.find((m: any) => m.id === messageId); if (msg?._backend) messagesApi.markAsRead(formalContext, msg._backend).catch(() => {}); }
    setActiveModule('消息管理');
    setIsNotificationsOpen(false);
  };
  const openMessageCenter = () => {
    setFocusedMessageId(prev => prev || messages[0]?.id);
    setMessageFocusTick(prev => prev + 1);
    setActiveModule('消息管理');
    setIsNotificationsOpen(false);
  };

  const markAllMessagesRead = () => {
    setMessages(prev => prev.map(message => ({ ...message, read: true })));
    if (formalContext && currentUser) messagesApi.markAllAsRead(formalContext, currentUser.userId || currentUser.username || 'system').catch(() => {});
  };
  useEffect(() => {
    if (!isGlobalAssistantResizing) return;
    const handleMouseMove = (event) => {
      const nextWidth = Math.min(Math.max(window.innerWidth - event.clientX, 420), Math.min(920, window.innerWidth - 280));
      setGlobalAssistantWidth(nextWidth);
    };
    const handleMouseUp = () => setIsGlobalAssistantResizing(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isGlobalAssistantResizing]);

  const sendGlobalAssistantMessage = (text = globalAssistantInput) => {
    const value = text.trim();
    if (!value) return;
    const asksForAction = /(生成|创建|执行|排产|补货|下单|提交|审批|调拨)/.test(value);
    const asksInventory = /(库存|物料|缺料|补货)/.test(value);
    const assistantReply = asksForAction
      ? {
          role: 'assistant',
          text: asksInventory ? '已完成库存可用量、在途采购和未来 14 天生产需求校验。建议为 3 项短缺物料创建采购申请，预计可把订单延期风险从 38% 降至 12%。' : '我已根据当前业务上下文生成一份可执行方案。提交前请确认影响范围与审批路径。',
          time: '刚刚',
          action: {
            id: `AI-ACT-${Date.now()}`,
            title: asksInventory ? '生成 3 笔采购申请' : '提交业务执行方案',
            scope: asksInventory ? 'RM201 / RM202 / RM305 · 合计 ¥186,400' : `${currentTenant.name} · 当前业务单据`,
            basis: asksInventory ? '现存量 + 已分配量 + 在途量 + MRP 净需求' : '当前页面数据、关联单据与岗位权限',
            approval: asksInventory ? '采购主管 → 财务经理（金额阈值）' : '按单据类型匹配审批规则',
            risk: '中风险',
            status: 'draft',
          }
        }
      : {
          role: 'assistant',
          text: asksInventory
            ? '当前共有 12 项物料低于安全库存，其中 RM201、RM202、RM305 会影响 SO-LINK-20260622-001。数据来自库存台账、在途采购和 MRP 净需求，更新于 2 分钟前。'
            : `已在 ${currentTenant.name} 的授权范围内完成查询。结论会附带指标口径、来源单据和更新时间；你也可以继续要求我预测、对比或生成处理方案。`,
          time: '刚刚'
        };
    setGlobalAssistantMessages(prev => [
      ...prev,
      { role: 'user', text: value, time: '刚刚' },
      assistantReply
    ]);
    setGlobalAssistantInput('');
  };

  const submitAiAction = (messageIndex) => {
    setGlobalAssistantMessages(prev => prev.map((message, index) => index === messageIndex && message.action ? { ...message, action: { ...message.action, status: 'submitted' } } : message));
    setMessages(prev => [{ id: `MSG-AI-${Date.now()}`, title: 'AI 操作等待审批', content: 'AI 生成的采购申请已提交审批，审批通过后才会写入正式业务单据。', time: '刚刚', source: 'AI智能中枢', level: 'warning', read: false }, ...prev]);
    showFlowToast('AI 操作已提交审批；系统已记录模型、依据、操作者和影响范围', 'success');
  };

  const menuItems = getModulesForRole(activeRole);
  const allowedModules = menuItems.map((item) => item.label);
  const productionAvailable = Boolean(currentUser?.accessToken && currentUser?.tenantIds?.includes(currentTenant.id));
  const visibleMenuItems = menuItems.filter(item => allowedModules.includes(item.label) && (item.label !== '生产管理' || productionAvailable));

  useEffect(() => {
    if (!allowedModules.includes(activeModule) || (activeModule === '生产管理' && !productionAvailable)) {
      setActiveModule('工作台', { replace: true });
      if (activeModule === '生产管理' && !productionAvailable) showFlowToast('生产管理已被平台应用开关、账号权限或工厂数据范围阻断', 'warning');
    }
  }, [activeRole, activeModule, productionAvailable]);

  if (!currentUser) {
    if (loginPageView === 'first-login' && firstLoginSession) {
      return <FirstLoginPage account={firstLoginSession.account} tempPassword={firstLoginSession.tempPassword} onComplete={() => { setFirstLoginSession(null); setLoginPageView('login'); showFlowToast('密码设置成功，请使用新密码登录', 'success'); }} onLogout={() => { setFirstLoginSession(null); setLoginPageView('login'); }} />;
    }
    if (loginPageView === 'forgot') {
      return <ForgotPasswordPage onBack={() => setLoginPageView('login')} onSuccess={(token) => { setPasswordResetToken(token); setLoginPageView('reset-password'); }} />;
    }
    if (loginPageView === 'reset-password') {
      return <ResetPasswordPage token={passwordResetToken} onBack={() => setLoginPageView('login')} onSuccess={() => { setLoginPageView('login'); showFlowToast('密码已重置，请使用新密码登录', 'success'); }} />;
    }
    if (loginPageView === 'register') {
      return <RegisterPage onBack={() => setLoginPageView('login')} onRegistered={() => { setLoginPageView('login'); showFlowToast('注册成功，请使用注册的账号和密码登录', 'success'); }} />;
    }
    return <LoginPage onLogin={handleLogin} onForgotPassword={() => setLoginPageView('forgot')} onRegister={() => setLoginPageView('register')} />;
  }

  return (
    <AppShell>
      <CenterToast toast={flowToast} onClose={() => setFlowToast({ show: false, msg: '', type: 'success' })} />
      <BusinessActionModal action={profileModal} onClose={() => setProfileModal(null)} onConfirm={() => setProfileModal(null)} />
      {isGlobalAssistantOpen && (
        <AIAssistantDrawer
          isOpen={isGlobalAssistantOpen}
          onClose={() => setIsGlobalAssistantOpen(false)}
          tenantCode={currentTenant.code}
          roleName={activeRole}
          apiContext={formalContext}
          permissions={currentUser?.permissions ?? []}
          onActionSubmit={() => {
            setMessages(prev => [{ id: `MSG-AI-${Date.now()}`, title: 'AI 操作等待审批', content: 'AI 生成的采购申请已提交审批，审批通过后才会写入正式业务单据。', time: '刚刚', source: 'AI智能中枢', level: 'warning', read: false }, ...prev]);
            showFlowToast('AI 操作已提交审批；系统已记录模型、依据、操作者和影响范围', 'success');
          }}
        />
      )}
      
      {/* Sidebar */}
      <AppShellSidebar expanded={activeModule === '工作台'}>
        <div className="h-[72px] flex items-center px-4 border-b border-slate-100 shrink-0 whitespace-nowrap">
          <div className="w-9 h-9 mr-2 flex items-center justify-center shrink-0">
             <img src="/industrial-ai-logo.png" alt="工业AI平台" className="w-9 h-8 object-contain" />
          </div>
          <span className="text-[18px] font-bold text-slate-800 tracking-wide leading-none whitespace-nowrap shrink-0">工业<span className="text-blue-600">AI</span>平台</span>
          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100 shrink-0">工业版</span>
        </div>
        
        <div className={`flex-1 overflow-y-auto ${activeModule === '工作台' ? 'py-6 px-6' : 'py-6 px-4'} custom-scrollbar`}>
          {visibleMenuItems.map((item) => (
            <SidebarItem 
              key={item.label}
              icon={item.icon} 
              label={item.label} 
              active={activeModule === item.label} 
              onClick={() => {
                if (item.label === '销售管理') {
                  setSalesResetSignal(prev => prev + 1);
                }
                setActiveModule(item.label);
              }}
            />
          ))}
        </div>
        
        <div className="p-4 border-t border-slate-100 shrink-0">
          <div className="relative group">
            <div className="absolute left-0 right-0 bottom-[calc(100%+8px)] bg-white border border-slate-200 rounded-2xl shadow-xl p-2 opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto transition-all z-40">
              <button onClick={openProfileModal} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                <UserCheck size={15} /> 个人信息
              </button>
              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                <Power size={15} /> 退出登录
              </button>
            </div>
            <button type="button" aria-label="打开用户菜单" className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center text-left hover:bg-blue-50 hover:border-blue-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm group-hover:scale-105 transition-transform">
                {(currentUser.name || '操作员').slice(0, 2).toUpperCase()}
              </div>
              <div className="ml-3 min-w-0 flex-1">
                <div className="text-[13px] font-bold text-slate-800 group-hover:text-blue-700 truncate">{currentUser.name}</div>
                <div className="text-[11px] font-medium text-slate-500 truncate">{activeRole} · {roleMeta.title}</div>
              </div>
              <ChevronDown size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
            </button>
          </div>
        </div>
      </AppShellSidebar>

      {/* Main Content */}
      <AppShellMain>
        
        {/* Header */}
        <AppShellHeader>
          <div className="relative lg:hidden">
            <label className="sr-only" htmlFor="mobile-module-switcher">切换业务模块</label>
            <select id="mobile-module-switcher" value={activeModule} onChange={event => setActiveModule(event.target.value)} className="h-10 max-w-[190px] appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-9 text-[13px] font-bold text-slate-700 outline-none focus:border-blue-500">
              {visibleMenuItems.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden xl:flex items-center gap-2">
              <label className="sr-only" htmlFor="tenant-switcher">切换租户</label>
              <select id="tenant-switcher" value={currentTenantId} onChange={event => switchTenant(event.target.value)} className="h-9 max-w-[210px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] font-bold text-slate-700 outline-none hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                {authorizedTenantOptions.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => setIsGlobalAssistantOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-xl text-[13px] font-bold transition-colors shadow-sm"
            >
              <Sparkles size={16} />
              <span className="hidden sm:inline">AI 助手</span>
            </button>
            <div className="relative">
              <button
                className={`relative transition-colors p-2 rounded-full ${isNotificationsOpen ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                onClick={() => setIsNotificationsOpen(prev => !prev)}
                title="消息通知"
              >
                <Bell size={20} />
                {unreadMessages.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white rounded-full border-2 border-white shadow-sm text-[10px] font-bold flex items-center justify-center">
                    {unreadMessages.length > 9 ? '9+' : unreadMessages.length}
                  </span>
                )}
              </button>
              {isNotificationsOpen && (
                <div className="absolute right-0 top-[48px] w-[380px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-[140] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                    <div>
                      <div className="text-[15px] font-bold text-slate-800">消息通知</div>
                      <div className="text-[12px] text-slate-500 mt-0.5">{unreadMessages.length > 0 ? `${unreadMessages.length} 条未读消息` : '暂无未读消息'}</div>
                    </div>
                    <button onClick={markAllMessagesRead} disabled={unreadMessages.length === 0} className="text-[12px] font-bold text-blue-600 hover:text-blue-700 disabled:text-slate-300 disabled:cursor-not-allowed">全部已读</button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                    {recentMessages.map(message => (
                      <button key={message.id} onClick={() => openMessageFromBell(message.id)} className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex gap-3">
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${message.read ? 'bg-slate-200' : message.level === 'critical' ? 'bg-rose-500 animate-pulse' : message.level === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <div className={`text-[13px] font-bold truncate ${message.read ? 'text-slate-600' : 'text-slate-900'}`}>{message.title}</div>
                            <span className="text-[11px] text-slate-400 shrink-0">{message.time}</span>
                          </div>
                          <div className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{message.content}</div>
                          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Server size={11} />{message.source}</div>
                        </div>
                      </button>
                    ))}
                    {recentMessages.length === 0 && (
                      <div className="px-5 py-8 text-center text-[13px] text-slate-400">暂无消息</div>
                    )}
                  </div>
                  <div className="p-3 bg-slate-50 border-t border-slate-100">
                    <button onClick={openMessageCenter} className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold transition-colors flex items-center justify-center gap-2">
                      <Inbox size={14} /> 查看消息中心
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </AppShellHeader>

        {/* 动态内容路由 */}
        <React.Fragment key={`tenant-content:${currentTenant.id}:${moduleNavigationRevision}`}>
        {activeModule === '工作台' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 scroll-smooth custom-scrollbar bg-[#f4f7fb]">
            <div className="max-w-[1420px] mx-auto space-y-4 animate-in fade-in duration-300">
              <section className="min-h-[160px] rounded-[20px] border border-blue-100 shadow-[0_12px_30px_rgba(37,99,235,0.07)] px-8 py-7 overflow-hidden relative bg-[linear-gradient(105deg,#f8fbff_0%,#ffffff_46%,#eef5ff_100%)]">
                <div className="absolute inset-y-0 right-0 w-[36%] bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(219,234,254,0.85))]"></div>
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[12px] font-black shadow-sm">{todayLabel}</span>
                    <span className="px-3 py-1 rounded-full bg-slate-900 text-slate-50 text-[12px] font-black">{activeRole} · {roleMeta.title}</span>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-[12px] font-black shadow-sm ${workbenchError ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${workbenchError ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                    {workbenchError ? '数据读取异常' : workbenchLoading ? '实时取数中' : '实时数据已就绪'}
                  </span>
                  </div>
                  <h1 className="text-[32px] leading-tight font-black text-slate-950 tracking-tight">早上好，{currentUser.name}</h1>
                  <p className="text-[14px] font-bold text-slate-500 mt-3 max-w-[760px]">
                    {roleMeta.summary} 今日共归集 <span className="text-blue-600 font-black">{workbenchDashboard?.todoTotal ?? 0}</span> 项岗位待办与 <span className="text-rose-500 font-black">{workbenchDashboard?.alertTotal ?? 0}</span> 项业务与 AI 风险提醒。
                  </p>
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
                {workbenchError ? (
                  <div className="md:col-span-2 xl:col-span-4 bg-white border border-rose-100 rounded-xl p-8 text-center">
                    <AlertTriangle size={22} className="mx-auto text-rose-500" />
                    <div className="mt-3 text-[15px] font-black text-slate-900">工作台数据读取失败</div>
                    <div className="mt-1 text-[12px] font-bold text-slate-500">{workbenchError}</div>
                  </div>
                ) : workbenchMetrics.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-4 bg-white border border-slate-100 rounded-xl p-8 text-center">
                    <RefreshCcw size={22} className={`mx-auto text-blue-500 ${workbenchLoading ? 'animate-spin' : ''}`} />
                    <div className="mt-3 text-[15px] font-black text-slate-900">{workbenchLoading ? '正在读取岗位指标' : '暂无岗位指标'}</div>
                    <div className="mt-1 text-[12px] font-bold text-slate-500">{workbenchLoading ? '正在聚合业务单据与人员事实' : '当前岗位暂无可统计的业务事实'}</div>
                  </div>
                ) : workbenchMetrics.map(item => {
                  const Icon = item.icon;
                  const iconClass = item.iconTone === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-100' : item.iconTone === 'purple' ? 'bg-purple-50 text-purple-600 border-purple-100' : item.iconTone === 'amber' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100';
                  return (
                    <div key={item.key} title={item.definition} className="bg-white border border-slate-200 rounded-xl shadow-[0_8px_22px_rgba(15,23,42,0.05)] p-4 min-h-[118px] flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)] transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="text-[12px] font-black text-slate-500 leading-snug">{item.title}</div>
                        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconClass}`}><Icon size={18} /></div>
                      </div>
                      <div>
                        <div className="flex items-baseline gap-1.5 mt-3">
                          <span className="text-[27px] leading-none font-black text-slate-900 tracking-tight">{item.value}</span>
                          <span className="text-[13px] font-black text-slate-500">{item.displayUnit}</span>
                        </div>
                        <div className="mt-2.5 text-[12px] font-black text-slate-500 flex items-center gap-1.5">
                          <Activity size={14} className="text-blue-500" />
                          更新 {item.updatedAt}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] gap-4 items-stretch">
                <div className="bg-white border border-slate-200 rounded-[18px] shadow-[0_10px_28px_rgba(15,23,42,0.055)] p-5">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div className="text-[18px] font-black text-slate-900 flex items-center gap-2.5"><Sparkles size={20} className="text-purple-500" /> AI 智能全域预警</div>
                    <button onClick={() => setActiveModule('AI数据分析')} className="px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 text-[12px] font-black flex items-center gap-1 transition-colors">进入决策舱 <ChevronRight size={15}/></button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {(workbenchDashboard?.alerts ?? []).slice(0, 6).map((item, index) => {
                      const iconMap: Record<string, typeof Factory> = {
                        销售管理: BadgeDollarSign, 生产管理: Factory, 库存管理: Box,
                        采购管理: ShoppingCart, 财务管理: Coins, 人员管理: ShieldAlert,
                        产业链管理: Network, AI数据分析: Bot,
                      };
                      const Icon = iconMap[item.module] || Sparkles;
                      const shell = item.severity === 'high' ? 'bg-rose-50/70 border-rose-100 shadow-rose-100/80' : item.severity === 'medium' ? 'bg-amber-50/60 border-amber-100 shadow-amber-100/80' : 'bg-purple-50/60 border-purple-100 shadow-purple-100/80';
                      const iconTone = item.severity === 'high' ? 'text-rose-500' : item.severity === 'medium' ? 'text-amber-500' : 'text-purple-500';
                      const actionTone = item.severity === 'high' ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-100';
                      return (
                        <div key={item.sourceId || item.title} className={`min-h-[238px] rounded-xl border p-5 flex flex-col justify-between shadow-sm ${shell}`}>
                          <div>
                            <div className={`w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center mb-5 ${iconTone}`}><Icon size={19}/></div>
                            <h3 className="text-[15px] font-black text-slate-900 leading-snug">{item.title}</h3>
                            <p className="mt-3 text-[12px] text-slate-500 leading-relaxed font-bold">{item.detail}</p>
                          </div>
                          <button onClick={() => setActiveModule(item.module, { query: { focusId: item.sourceId || '', focusNo: item.sourceNo || '' } })} className={`mt-5 h-10 rounded-lg text-[12px] font-black flex items-center justify-center gap-2 transition-colors ${actionTone}`}><Activity size={14} /> 前往处理</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-[18px] shadow-[0_10px_28px_rgba(15,23,42,0.055)] p-5">
                  <div className="text-[18px] font-black text-slate-900 flex items-center gap-2.5 mb-5"><Layers size={20} className="text-emerald-500" /> 常用快捷功能</div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: '快速开单', icon: Plus, module: '销售管理', tone: 'blue' },
                      { label: '手工入库', icon: ArrowDownToLine, module: '库存管理', tone: 'emerald' },
                      { label: '提报PR', icon: FilePlus, module: '采购管理', tone: 'purple' },
                      { label: '报工', icon: ScanLine, module: '生产管理', tone: 'amber' },
                    ].map(item => {
                      const Icon = item.icon;
                      const tone = item.tone === 'blue' ? 'text-blue-600 bg-blue-50' : item.tone === 'emerald' ? 'text-emerald-600 bg-emerald-50' : item.tone === 'purple' ? 'text-purple-600 bg-purple-50' : 'text-amber-600 bg-amber-50';
                      return (
                        <button key={item.label} onClick={() => setActiveModule(item.module)} className="h-[112px] rounded-xl bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:border-blue-100 transition-all hover:-translate-y-0.5 flex flex-col items-center justify-center gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tone}`}><Icon size={20}/></div>
                          <div className="text-[14px] font-black text-slate-800">{item.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] gap-4 items-start">
                <div className="bg-white border border-slate-200 rounded-[18px] shadow-[0_10px_28px_rgba(15,23,42,0.055)] overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                    <div className="text-[18px] font-black text-slate-900 flex items-center gap-2.5"><ListChecks size={20} className="text-blue-600" /> 我的待办事项</div>
                    <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-500 border border-rose-100 text-[12px] font-black">{(workbenchDashboard?.todos ?? []).filter(item => item.urgent).length} 项高危</span>
                  </div>
                  <div className="p-5 space-y-2">
                    {(workbenchDashboard?.todos ?? []).slice(0, 8).map(item => {
                      const visualMap: Record<string, { icon: typeof Factory; tone: string }> = {
                        销售管理: { icon: BadgeDollarSign, tone: 'bg-blue-50 text-blue-600 border-blue-100' },
                        生产管理: { icon: Factory, tone: 'bg-purple-50 text-purple-600 border-purple-100' },
                        库存管理: { icon: Box, tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
                        采购管理: { icon: ShoppingCart, tone: 'bg-amber-50 text-amber-600 border-amber-100' },
                        财务管理: { icon: Coins, tone: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
                        人员管理: { icon: Users, tone: 'bg-slate-50 text-slate-600 border-slate-100' },
                      };
                      const visual = visualMap[item.module] || { icon: Activity, tone: 'bg-blue-50 text-blue-600 border-blue-100' };
                      const Icon = visual.icon;
                      return (
                        <button key={`${item.sourceType}:${item.sourceId}`} onClick={() => setActiveModule(item.module, { query: { focusId: item.sourceId, focusNo: item.sourceNo || '' } })} className="w-full flex items-center gap-4 text-left group rounded-xl p-2.5 hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${visual.tone}`}><Icon size={19}/></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${visual.tone}`}>{item.module}</span>
                              <div className="text-[14px] font-black text-slate-900 leading-snug group-hover:text-blue-600 transition-colors truncate">{item.title}</div>
                              {item.urgent && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>}
                            </div>
                            <div className="mt-1.5 text-[12px] font-bold text-slate-400 flex items-center gap-2"><Clock size={13}/>{item.sourceNo || item.dueDate || item.sourceType}</div>
                          </div>
                        </button>
                      );
                    })}
                    {(workbenchDashboard?.todos ?? []).length === 0 && (
                      <div className="py-10 text-center text-[13px] font-bold text-slate-400">当前岗位没有待处理业务</div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-[18px] shadow-[0_10px_28px_rgba(15,23,42,0.055)] overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <div className="text-[18px] font-black text-slate-900 flex items-center gap-2.5"><Activity size={20} className="text-blue-600" /> 实时业务流动态</div>
                  </div>
                  <div className="p-6 min-h-[360px]">
                    <div className="relative pl-7 space-y-7 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                      {(workbenchDashboard?.activities ?? []).map(item => {
                        const occurredAt = new Date(item.occurredAt);
                        const time = Number.isNaN(occurredAt.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(occurredAt);
                        const dot = item.module === '生产管理' ? 'border-emerald-500 bg-white' : item.module === 'AI数据分析' ? 'border-purple-500 bg-white' : item.module === '财务管理' ? 'border-amber-500 bg-white' : 'border-blue-500 bg-white';
                        const accent = item.module === '生产管理' ? 'text-emerald-600' : item.module === 'AI数据分析' ? 'text-purple-600' : 'text-slate-500';
                        return (
                          <div key={item.id} className="relative">
                            <span className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border-4 ${dot}`}></span>
                            <div className="text-[14px] font-black text-slate-800 leading-snug">{item.title}</div>
                            <div className={`mt-1.5 text-[12px] font-bold leading-relaxed ${accent}`}>{item.detail}</div>
                            <div className="mt-2 text-[12px] font-bold text-slate-400">{item.sourceNo || item.module}{time ? ` · ${time}` : ''}</div>
                          </div>
                        );
                      })}
                      {(workbenchDashboard?.activities ?? []).length === 0 && (
                        <div className="py-20 text-center text-[13px] font-bold text-slate-400">暂无业务动态</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
        
        {activeModule === '销售管理' && <SalesManagement resetSignal={salesResetSignal} currentTenant={currentTenant} currentUser={currentUser} canAccessInventory={allowedModules.includes('库存管理')} {...linkedFlowProps} />}
        {activeModule === '生产管理' && <LegacyProductionManagement {...linkedFlowProps} currentUser={currentUser} currentTenant={currentTenant} />}
        {activeModule === '库存管理' && <InventoryManagement {...linkedFlowProps} currentTenant={currentTenant} currentUser={currentUser} />}
        {activeModule === '采购管理' && <ProcurementManagement {...linkedFlowProps} currentTenant={currentTenant} currentUser={currentUser} />}
        {activeModule === '财务管理' && <FinancialManagement {...linkedFlowProps} currentUser={currentUser} currentTenant={currentTenant} refreshSignal={financeRefreshTick} />}
        {activeModule === '人员管理' && <PersonnelManagement currentTenant={currentTenant} currentUser={currentUser} />}
        {activeModule === '产业链管理' && <SupplyChainManagement currentTenant={currentTenant} currentUser={currentUser} />}
        {activeModule === 'AI智能中枢' && <AIHubManagementV2 onOpenAssistant={() => setIsGlobalAssistantOpen(true)} />}
        {activeModule === 'AI数据分析' && <AIDataAnalysisManagement />}
        {activeModule === '消息管理' && <MessageManagement onNavigateModule={setActiveModule} msgs={messages} setMsgs={setMessages} focusMsgId={focusedMessageId} focusTick={messageFocusTick} />}
        {activeModule === '平台管理' && <PlatformManagementV2 currentTenant={currentTenant} currentUser={currentUser} onToast={showFlowToast} />}
        {activeModule === '问题反馈' && <FeedbackManagement currentTenant={currentTenant} currentUser={currentUser} onToast={showFlowToast} />}
        
        {/* Placeholder for un-implemented modules */}
        {['未开发模块'].includes(activeModule) && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-white m-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in zoom-in-95">
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-6">
               <Box size={48} className="text-slate-300" />
            </div>
            <p className="text-[16px] font-bold text-slate-500">{activeModule} 模块正在开发中...</p>
          </div>
        )}
        </React.Fragment>

      </AppShellMain>
    </AppShell>
  );
}
