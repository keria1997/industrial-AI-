import { useEffect, useState } from 'react';
import { Plus, KeyRound, Ban, RotateCcw, Check, X } from 'lucide-react';
import { createEmployeeAccount, listEmployeeAccounts, resetEmployeePassword, updateEmployeeStatus, type EmployeeAccount } from '../api/session';

type Props = {
  accessToken: string;
  onToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
};

const DEPARTMENTS = ['管理层', '销售部', '生产部', '仓储部', '采购部', '财务部', '人事部'];
const POSITIONS = ['老板', '销售经理', '销售员', '生产主管', '车间操作员', '仓库管理员', '采购员', '财务主管', '质量检验员', '复核员'];

export default function EmployeeAccountManagement({ accessToken, onToast }: Props) {
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState<{ account: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', account: '', department: '', position: '', employeeNo: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      setAccounts(await listEmployeeAccounts(accessToken));
    } catch (err) {
      onToast(err instanceof Error ? err.message : '加载员工账号失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const submit = async () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('请输入姓名'); return; }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) { setFormError('请输入有效手机号'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setFormError('请输入有效邮箱'); return; }
    if (form.account.trim().length < 2) { setFormError('账号至少 2 个字符'); return; }
    if (!form.department) { setFormError('请选择部门'); return; }
    if (!form.position) { setFormError('请选择岗位/角色'); return; }
    setSubmitting(true);
    try {
      const result = await createEmployeeAccount(accessToken, {
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
        account: form.account.trim(), department: form.department, position: form.position,
        employeeNo: form.employeeNo.trim() || undefined,
      });
      setShowCreate(false);
      setShowTempPassword({ account: result.account, password: result.temporaryPassword });
      setForm({ name: '', phone: '', email: '', account: '', department: '', position: '', employeeNo: '' });
      fetchAccounts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (item: EmployeeAccount) => {
    const next = item.status === 'active' ? 'disabled' : 'active';
    try {
      await updateEmployeeStatus(accessToken, item.id, next);
      onToast(`已${next === 'active' ? '启用' : '禁用'}账号 ${item.account}`, 'success');
      fetchAccounts();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const resetPassword = async (item: EmployeeAccount) => {
    try {
      const result = await resetEmployeePassword(accessToken, item.id);
      setShowTempPassword({ account: item.account, password: result.temporaryPassword });
      fetchAccounts();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '重置失败', 'error');
    }
  };

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-black text-slate-900">员工登录账号</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">创建后系统生成初始密码，员工首次登录需设置新密码。</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[12px] font-bold text-white hover:bg-blue-700"><Plus size={14} />新建员工账号</button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[12px] text-slate-400">加载中...</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-[12px] text-slate-400">还没有员工账号，点击上方按钮创建。</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
              <tr><th className="px-4 py-3">姓名</th><th className="px-4 py-3">账号</th><th className="px-4 py-3">部门</th><th className="px-4 py-3">岗位</th><th className="px-4 py-3">手机号</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map(item => (
                <tr key={item.id} className="text-[12px] hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-black text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.account}</td>
                  <td className="px-4 py-3 text-slate-600">{item.department || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.position || item.role}</td>
                  <td className="px-4 py-3 text-slate-600">{item.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                      {item.status === 'active' ? <Check size={10}/> : <X size={10}/>}
                      {item.status === 'active' ? '启用' : '禁用'}
                    </span>
                    {item.firstLogin && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">未激活</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button title={item.status === 'active' ? '禁用' : '启用'} onClick={() => toggleStatus(item)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                        {item.status === 'active' ? <Ban size={13}/> : <Check size={13}/>}
                      </button>
                      <button title="重置密码" onClick={() => resetPassword(item)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                        <RotateCcw size={13}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-black text-slate-900">新建员工账号</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { key: 'name', label: '姓名 *', placeholder: '员工姓名' },
                { key: 'account', label: '登录账号 *', placeholder: '登录用账号名' },
                { key: 'phone', label: '手机号 *', placeholder: '13800000000' },
                { key: 'email', label: '邮箱 *', placeholder: 'name@company.com' },
                { key: 'employeeNo', label: '工号', placeholder: '选填' },
              ].map(f => (
                <label key={f.key} className={f.key === 'email' ? 'col-span-2' : ''}>
                  <span className="mb-1 block text-[11px] font-bold text-slate-600">{f.label}</span>
                  <input value={(form as any)[f.key]} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400" />
                </label>
              ))}
              <label>
                <span className="mb-1 block text-[11px] font-bold text-slate-600">部门 *</span>
                <select value={form.department} onChange={e => setField('department', e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400">
                  <option value="">请选择</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-bold text-slate-600">岗位/角色 *</span>
                <select value={form.position} onChange={e => setField('position', e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400">
                  <option value="">请选择</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            {formError && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600">{formError}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-[12px] font-bold text-slate-600 hover:bg-slate-50">取消</button>
              <button onClick={submit} disabled={submitting} className="h-9 rounded-lg bg-blue-600 px-5 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? '创建中...' : '创建账号'}</button>
            </div>
          </div>
        </div>
      )}

      {showTempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50"><KeyRound size={22} className="text-emerald-600"/></div>
            <h3 className="mt-4 text-[15px] font-black text-slate-900">账号已创建</h3>
            <p className="mt-1 text-[11px] text-slate-500">请将以下初始密码告知员工，首次登录后需设置新密码。</p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold text-slate-500">账号</div>
              <div className="text-[13px] font-black text-slate-800">{showTempPassword.account}</div>
              <div className="mt-2 text-[11px] font-bold text-slate-500">初始密码</div>
              <div className="text-[15px] font-black tracking-widest text-blue-600">{showTempPassword.password}</div>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(`账号: ${showTempPassword.account} 初始密码: ${showTempPassword.password}`); onToast('已复制到剪贴板', 'success'); }} className="mt-3 w-full h-9 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-600 hover:bg-slate-50">复制账号密码</button>
            <button onClick={() => setShowTempPassword(null)} className="mt-2 w-full h-9 rounded-lg bg-blue-600 text-[12px] font-bold text-white hover:bg-blue-700">完成</button>
          </div>
        </div>
      )}
    </div>
  );
}
