/**
 * 登录页
 *
 * 深色主题左右分栏布局。
 * 左侧品牌区（Logo + 标题 + 特性列表）。
 * 右侧登录卡片，支持四个视图：
 *   1. 账号登录（账号 + 密码 + 图形验证码）
 *   2. 手机号登录（手机号 + 短信验证码 + 60秒倒计时）
 *   3. 忘记密码（邮箱重置链接）
 *   4. 租户注册（8个必填字段）
 *
 * 调用链路: App -> LoginPage -> 后端 /api/v1/auth/*
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  ArrowLeft, Eye, EyeOff, Phone, User,
  type LucideIcon,
} from 'lucide-react';

type LoginView = 'account' | 'phone' | 'forgot' | 'register';

/* ---- 样式常量 ---- */
const inputCls =
  'w-full h-11 rounded-lg border border-slate-600 bg-slate-700/50 px-3.5 text-[14px] text-white placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors';
const btnPrimary =
  'w-full h-11 rounded-lg bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700 transition-colors disabled:opacity-50';
const linkCls = 'text-blue-400 hover:text-blue-300 text-[13px] cursor-pointer transition-colors';
const labelCls = 'block text-[13px] font-semibold text-slate-300 mb-1.5';
const cardCls =
  'w-full max-w-md bg-slate-800/80 backdrop-blur-lg border border-slate-700 rounded-2xl p-8 shadow-2xl';

/* ---- 图形验证码占位（后端未实现时前端生成简易码） ---- */
function generateCaptchaText(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/* ---- 倒计时 Hook ---- */
function useCountdown(initial: number) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count <= 0) return;
    const timer = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count]);
  return { count, start: () => setCount(initial) };
}

/* ---- 通用输入框 ---- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

/* ---- 登录页主组件 ---- */
export function LoginPage({ onLogin }: { onLogin: (name: string) => void }) {
  const [view, setView] = useState<LoginView>('account');

  return (
    <div className="h-screen bg-slate-900 font-sans overflow-auto relative">
      {/* 点阵背景纹理 */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center gap-16">

          {/* 左侧品牌区 */}
          <div className="hidden lg:block flex-1 text-white">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <span className="text-white text-[14px] font-bold">WS</span>
              </div>
              <span className="text-[18px] font-bold text-slate-200">万申股份</span>
            </div>
            <h1 className="text-5xl font-black italic mb-4">工业AI平台</h1>
            <p className="text-[16px] font-bold text-blue-400 mb-1">数据赋能、申财有道</p>
            <div className="w-48 h-0.5 bg-blue-500 mb-8" />
            <ul className="space-y-3 text-[14px] text-slate-300">
              {['人性化交互体验设计', 'AI智能系统，全新的使用体验', '新一代技术架构', '当前版本: 2.0.0'].map(item => (
                <li key={item} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-16 text-[12px] text-slate-500">Copyright &copy; 2026 万申股份. All Rights Reserved.</p>
          </div>

          {/* 右侧卡片区域 */}
          <div className="w-full max-w-md">
            {view === 'account' && <AccountLogin onSwitch={setView} onLogin={onLogin} />}
            {view === 'phone' && <PhoneLogin onSwitch={setView} onLogin={onLogin} />}
            {view === 'forgot' && <ForgotPassword onSwitch={setView} />}
            {view === 'register' && <RegisterPage onSwitch={setView} onLogin={onLogin} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Tab 切换条 ---- */
function LoginTabs({ active, onSwitch }: { active: 'account' | 'phone'; onSwitch: (v: LoginView) => void }) {
  return (
    <div className="flex gap-2 mb-6">
      <button
        onClick={() => onSwitch('account')}
        className={`flex-1 h-10 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
          active === 'account' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
        }`}
      >
        <User size={15} /> 账号登录
      </button>
      <button
        onClick={() => onSwitch('phone')}
        className={`flex-1 h-10 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
          active === 'phone' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
        }`}
      >
        <Phone size={15} /> 手机号登录
      </button>
    </div>
  );
}

function BottomLinks({ onSwitch }: { onSwitch: (v: LoginView) => void }) {
  return (
    <div className="flex justify-center gap-2 mt-4 text-[13px]">
      <button onClick={() => onSwitch('forgot')} className={linkCls}>忘记密码?</button>
      <span className="text-slate-600">|</span>
      <button onClick={() => onSwitch('register')} className={linkCls}>注册账号</button>
    </div>
  );
}

function BackLink({ onSwitch }: { onSwitch: (v: LoginView) => void }) {
  return (
    <button onClick={() => onSwitch('account')} className={`${linkCls} flex items-center gap-1 mb-6`}>
      <ArrowLeft size={15} /> 返回登录
    </button>
  );
}

/* ---- 视图1: 账号登录 ---- */
function AccountLogin({ onSwitch, onLogin }: { onSwitch: (v: LoginView) => void; onLogin: (name: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [captchaText, setCaptchaText] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [error, setError] = useState('');

  const refreshCaptcha = useCallback(() => {
    setCaptchaText(generateCaptchaText());
    setCaptchaInput('');
  }, []);

  useEffect(() => { refreshCaptcha(); }, [refreshCaptcha]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError('请输入账号');
    if (!password.trim()) return setError('请输入密码');
    if (captchaInput.toUpperCase() !== captchaText) {
      setError('验证码错误');
      refreshCaptcha();
      return;
    }
    sessionStorage.setItem('token', 'dev-token');
    sessionStorage.setItem('userName', username);
    onLogin(username);
  };

  return (
    <div className={cardCls}>
      <LoginTabs active="account" onSwitch={onSwitch} />
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-[13px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <Field label="账号 (Account)">
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入账号" className={inputCls} />
        </Field>
        <Field label="密码 (Password)">
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300" aria-label="切换密码可见">
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <Field label="验证码 (Captcha)">
          <div className="flex gap-2">
            <input type="text" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} placeholder="请输入验证码" maxLength={4} className={`${inputCls} flex-1`} />
            <button
              type="button"
              onClick={refreshCaptcha}
              className="h-11 px-4 rounded-lg bg-slate-600 text-white text-[14px] font-mono font-bold tracking-widest hover:bg-slate-500 transition-colors select-none"
              aria-label="点击刷新验证码"
            >
              {captchaText}
            </button>
          </div>
        </Field>
        <button type="submit" className={btnPrimary}>立即登录</button>
      </form>
      <BottomLinks onSwitch={onSwitch} />
    </div>
  );
}

/* ---- 视图2: 手机号登录 ---- */
function PhoneLogin({ onSwitch, onLogin }: { onSwitch: (v: LoginView) => void; onLogin: (name: string) => void }) {
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [error, setError] = useState('');
  const { count, start } = useCountdown(60);

  const sendSms = () => {
    if (!/^1\d{10}$/.test(phone)) return setError('请输入正确的手机号');
    setError('');
    start();
    // TODO: 调用 POST /api/v1/auth/sms/send
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^1\d{10}$/.test(phone)) return setError('请输入正确的手机号');
    if (smsCode.length !== 6) return setError('请输入6位短信验证码');
    // TODO: 调用 POST /api/v1/auth/sms-login
    sessionStorage.setItem('token', 'dev-token');
    sessionStorage.setItem('userName', phone);
    onLogin(phone);
  };

  return (
    <div className={cardCls}>
      <LoginTabs active="phone" onSwitch={onSwitch} />
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-[13px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <Field label="手机号 (Phone)">
          <div className="flex">
            <span className="h-11 flex items-center px-3 rounded-l-lg border border-r-0 border-slate-600 bg-slate-700/50 text-slate-400 text-[14px]">+86</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="请输入手机号" maxLength={11} className={`${inputCls} rounded-l-none`} />
          </div>
        </Field>
        <Field label="短信验证码 (SMS Code)">
          <div className="flex gap-2">
            <input type="text" value={smsCode} onChange={e => setSmsCode(e.target.value)} placeholder="请输入短信验证码" maxLength={6} className={`${inputCls} flex-1`} />
            <button
              type="button"
              onClick={sendSms}
              disabled={count > 0}
              className="h-11 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {count > 0 ? `${count}s` : '获取验证码'}
            </button>
          </div>
        </Field>
        <button type="submit" className={btnPrimary}>立即登录</button>
      </form>
      <BottomLinks onSwitch={onSwitch} />
    </div>
  );
}

/* ---- 视图3: 忘记密码 ---- */
function ForgotPassword({ onSwitch }: { onSwitch: (v: LoginView) => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('请输入有效的邮箱地址');
    setError('');
    setSent(true);
    // TODO: 调用 POST /api/v1/auth/forgot-password
  };

  return (
    <div className={cardCls}>
      <BackLink onSwitch={onSwitch} />
      <h2 className="text-xl font-bold text-white text-center mb-1">忘记密码</h2>
      <p className="text-[13px] text-slate-400 text-center mb-6">请输入您注册时填写的邮箱地址</p>
      {sent ? (
        <div className="text-[13px] text-emerald-400 bg-emerald-500/10 rounded-lg px-4 py-3 text-center">
          重置链接已发送至 {email}，请在30分钟内完成重置。
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-[13px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
          <Field label="邮箱 (Email)">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="请输入注册邮箱" className={inputCls} />
          </Field>
          <button type="submit" className={btnPrimary}>发送重置链接</button>
        </form>
      )}
    </div>
  );
}

/* ---- 视图4: 租户注册 ---- */
const INDUSTRIES = [
  '制造业', '电子信息', '新能源', '生物医药', '汽车零部件',
  '装备制造', '化工材料', '纺织服装', '食品加工', '其他',
];

function RegisterPage({ onSwitch, onLogin }: { onSwitch: (v: LoginView) => void; onLogin: (name: string) => void }) {
  const [form, setForm] = useState({
    tenantName: '', industry: '', adminName: '', username: '',
    email: '', phone: '', password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const required: (keyof typeof form)[] = ['tenantName', 'industry', 'adminName', 'username', 'email', 'phone', 'password', 'confirmPassword'];
    for (const key of required) {
      if (!form[key].trim()) return setError('请填写所有必填项');
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('请输入有效的邮箱地址');
    if (!/^1\d{10}$/.test(form.phone)) return setError('请输入正确的手机号');
    if (form.password.length < 8) return setError('密码至少8位');
    if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password))
      return setError('密码需包含大小写字母和数字');
    if (form.password !== form.confirmPassword) return setError('两次密码不一致');

    // TODO: 调用 POST /api/v1/auth/register
    sessionStorage.setItem('token', 'dev-token');
    sessionStorage.setItem('userName', form.username);
    onLogin(form.username);
  };

  return (
    <div className={`${cardCls} max-h-[85vh] overflow-y-auto`}>
      <BackLink onSwitch={onSwitch} />
      <h2 className="text-xl font-bold text-white text-center mb-6">租户注册</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-[13px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <Field label="租户名称 (Name) *"><input type="text" value={form.tenantName} onChange={set('tenantName')} placeholder="请输入公司/租户名称" className={inputCls} /></Field>
        <Field label="所属行业 (Industry) *">
          <select value={form.industry} onChange={set('industry')} className={`${inputCls} appearance-none`}>
            <option value="" className="bg-slate-800">请选择所属行业</option>
            {INDUSTRIES.map(ind => <option key={ind} value={ind} className="bg-slate-800">{ind}</option>)}
          </select>
        </Field>
        <Field label="管理员姓名 *"><input type="text" value={form.adminName} onChange={set('adminName')} placeholder="请输入管理员姓名" className={inputCls} /></Field>
        <Field label="登录账号 *"><input type="text" value={form.username} onChange={set('username')} placeholder="请输入登录账号" className={inputCls} /></Field>
        <Field label="邮箱 (Email) *"><input type="email" value={form.email} onChange={set('email')} placeholder="请输入邮箱" className={inputCls} /></Field>
        <Field label="手机号 (Phone) *">
          <div className="flex">
            <span className="h-11 flex items-center px-3 rounded-l-lg border border-r-0 border-slate-600 bg-slate-700/50 text-slate-400 text-[14px]">+86</span>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="请输入手机号" maxLength={11} className={`${inputCls} rounded-l-none`} />
          </div>
        </Field>
        <Field label="设置密码 *"><input type="password" value={form.password} onChange={set('password')} placeholder="至少8位，含大小写字母和数字" className={inputCls} /></Field>
        <Field label="确认密码 *"><input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="请再次输入密码" className={inputCls} /></Field>
        <button type="submit" className={btnPrimary}>立即注册</button>
      </form>
      <div className="text-center mt-4 text-[13px]">
        <span className="text-slate-400">已有账户? </span>
        <button onClick={() => onSwitch('account')} className={linkCls}>立即登录</button>
      </div>
    </div>
  );
}

