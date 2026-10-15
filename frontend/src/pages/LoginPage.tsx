/**
 * 登录页
 *
 * 全屏居中卡片，登录成功后 Token 存入 sessionStorage 并跳转工作台。
 */

import { useState, type FormEvent } from 'react';

export function LoginPage({ onLogin }: { onLogin: (name: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入账号和密码');
      return;
    }
    // TODO: 调用 POST /api/v1/auth/login，获取 Token 存入 sessionStorage
    sessionStorage.setItem('token', 'dev-token');
    sessionStorage.setItem('userName', username);
    onLogin(username);
  };

  return (
    <div className="h-screen bg-[#F8FAFC] flex items-center justify-center font-sans">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mr-3">
            <span className="text-white text-[16px] font-bold">AI</span>
          </div>
          <span className="text-xl font-bold text-slate-800">工业AI平台</span>
        </div>
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
          {error && <div className="text-[13px] text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">账号</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="请输入账号"
              className="w-full h-10 rounded-lg border border-slate-300 px-3 text-[14px] outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="请输入密码"
              className="w-full h-10 rounded-lg border border-slate-300 px-3 text-[14px] outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="w-full h-10 rounded-lg bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700"
          >
            登 录
          </button>
        </form>
      </div>
    </div>
  );
}
