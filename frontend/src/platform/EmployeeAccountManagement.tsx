import { useEffect, useRef, useState } from 'react';
import { Plus, KeyRound, Ban, RotateCcw, Check, X } from 'lucide-react';
import { createEmployeeAccount, listEmployeeAccounts, resetEmployeePassword, updateEmployeeStatus, type EmployeeAccount } from '../api/session';
import type { ApiContext } from '../api/client';
import type { OrgUnitDto, PositionDto } from '../api/platform/client';
import { ApiDataState } from '../components/ApiDataState';
import { useApiResource } from '../hooks/useApiResource';

type Props = {
  key?: string;
  apiContext: ApiContext;
  orgUnits: Pick<OrgUnitDto, 'id' | 'name' | 'status'>[];
  positions: Pick<PositionDto, 'id' | 'name' | 'orgId' | 'status'>[];
  onToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
};

export default function EmployeeAccountManagement({ apiContext, orgUnits, positions, onToast }: Props) {
  const records = useApiResource(apiContext, listEmployeeAccounts);
  const accounts = records.data ?? [];
  const loading = records.loading;
  const [showCreate, setShowCreate] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState<{ account: string; password: string; reset?: boolean } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', account: '', department: '', position: '', employeeNo: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const departments = orgUnits.filter(item => item.status === 'enabled');
  const availablePositions = positions.filter(item => item.status === 'enabled' && item.orgId === form.department);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const submit = async () => {
    if (busy.current) return;
    setFormError('');
    if (!form.name.trim()) { setFormError('请输入姓名'); return; }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) { setFormError('请输入有效手机号'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setFormError('请输入有效邮箱'); return; }
    if (form.account.trim().length < 2) { setFormError('账号至少 2 个字符'); return; }
    const department = departments.find(item => item.id === form.department);
    const position = availablePositions.find(item => item.id === form.position);
    if (!department) { setFormError('请选择当前企业的有效部门'); return; }
    if (!position) { setFormError('请选择该部门的有效岗位'); return; }
    busy.current = true;
    setSubmitting(true);
    try {
      const result = await createEmployeeAccount(apiContext, {
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
        account: form.account.trim(), department: department.name, position: position.name,
        employeeNo: form.employeeNo.trim() || undefined,
      });
      if (!active.current) return;
      setShowCreate(false);
      setShowTempPassword({ account: result.account, password: result.temporaryPassword });
      setForm({ name: '', phone: '', email: '', account: '', department: '', position: '', employeeNo: '' });
      records.reload();
    } catch (err) {
      if (active.current) setFormError(err instanceof Error ? err.message : '创建失败');
    } finally {
      busy.current = false;
      if (active.current) setSubmitting(false);
    }
  };

  const toggleStatus = async (item: EmployeeAccount) => {
    if (busy.current) return;
    busy.current = true; setSubmitting(true);
    const next = item.status === 'active' ? 'disabled' : 'active';
    try {
      await updateEmployeeStatus(apiContext, item.id, next);
      if (!active.current) return;
      onToast(`已${next === 'active' ? '启用' : '禁用'}账号 ${item.account}`, 'success');
      records.reload();
    } catch (err) {
      if (active.current) onToast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally { busy.current = false; if (active.current) setSubmitting(false); }
  };

  const resetPassword = async (item: EmployeeAccount) => {
    if (busy.current) return;
    busy.current = true; setSubmitting(true);
    try {
      const result = await resetEmployeePassword(apiContext, item.id);
      if (!active.current) return;
      setShowTempPassword({ account: item.account, password: result.temporaryPassword, reset: true });
      records.reload();
    } catch (err) {
      if (active.current) onToast(err instanceof Error ? err.message : '重置失败', 'error');
    } finally { busy.current = false; if (active.current) setSubmitting(false); }
  };

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-black text-slate-900">员工登录账号</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">创建后系统生成初始密码，员工首次登录需设置新密码。</p>
        </div>
        <button disabled={submitting || loading} onClick={() => setShowCreate(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Plus size={14} />新建员工账号</button>
      </div>

      {records.error ? <ApiDataState error={records.error} onRetry={records.reload} /> : loading ? (
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
                  <td className="px-4 py-3 text-slate-600">{item.position || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                      {item.status === 'active' ? <Check size={10}/> : <X size={10}/>}
                      {item.status === 'active' ? '启用' : item.status === 'disabled' ? '禁用' : '状态待核实'}
                    </span>
                    {item.firstLogin && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">未激活</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button disabled={submitting || !['active', 'disabled'].includes(item.status)} title={item.status === 'active' ? '禁用' : '启用'} onClick={() => toggleStatus(item)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
                        {item.status === 'active' ? <Ban size={13}/> : <Check size={13}/>}
                      </button>
                      <button disabled={submitting} title="重置密码" onClick={() => resetPassword(item)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!submitting) setShowCreate(false); }}>
          <div role="dialog" aria-modal="true" aria-label="新建员工账号" className="w-full max-w-[480px] rounded-lg bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-black text-slate-900">新建员工账号</h3>
            <fieldset disabled={submitting} className="mt-4 grid grid-cols-2 gap-3">
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
                <select value={form.department} onChange={e => setForm(previous => ({ ...previous, department: e.target.value, position: '' }))} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400">
                  <option value="">请选择</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-bold text-slate-600">岗位 *</span>
                <select value={form.position} onChange={e => setField('position', e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400">
                  <option value="">请选择</option>
                  {availablePositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </fieldset>
            {!departments.length && <p role="status" className="mt-3 text-sm text-amber-700">暂无授权部门，请先维护组织与岗位。</p>}
            {formError && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600">{formError}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button disabled={submitting} onClick={() => setShowCreate(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-[12px] font-bold text-slate-600 hover:bg-slate-50">取消</button>
              <button onClick={submit} disabled={submitting} className="h-9 rounded-lg bg-blue-600 px-5 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? '创建中...' : '创建账号'}</button>
            </div>
          </div>
        </div>
      )}

      {showTempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50"><KeyRound size={22} className="text-emerald-600"/></div>
            <h3 className="mt-4 text-[15px] font-black text-slate-900">{showTempPassword.reset ? '密码已重置' : '账号已创建'}</h3>
            <p className="mt-1 text-[11px] text-slate-500">请将以下初始密码告知员工，首次登录后需设置新密码。</p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold text-slate-500">账号</div>
              <div className="text-[13px] font-black text-slate-800">{showTempPassword.account}</div>
              <div className="mt-2 text-[11px] font-bold text-slate-500">初始密码</div>
              <div className="text-[15px] font-black tracking-widest text-blue-600">{showTempPassword.password}</div>
            </div>
            <button onClick={async () => {
              try { await navigator.clipboard.writeText(`账号: ${showTempPassword.account} 初始密码: ${showTempPassword.password}`); if (active.current) onToast('已复制到剪贴板', 'success'); }
              catch { if (active.current) onToast('复制失败，请手动记录本次显示的初始密码', 'error'); }
            }} className="mt-3 w-full h-9 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-600 hover:bg-slate-50">复制账号密码</button>
            <button onClick={() => setShowTempPassword(null)} className="mt-2 w-full h-9 rounded-lg bg-blue-600 text-[12px] font-bold text-white hover:bg-blue-700">完成</button>
          </div>
        </div>
      )}
    </div>
  );
}
