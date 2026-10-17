import { useEffect, useRef, useState } from 'react';
import { Plus, KeyRound, Ban, RotateCcw, Check, X, Pencil } from 'lucide-react';
import { createEmployeeAccount, listEmployeeAccounts, resetEmployeePassword, updateEmployeeStatus, type EmployeeAccount } from '../api/session';
import type { ApiContext } from '../api/client';
import type { OrgUnitDto } from '../api/platform/client';
import type { Account, Employee, Role } from './platformSeed';
import { accountRoleLabel } from './accountRole';
import { ApiDataState } from '../components/ApiDataState';
import { useApiResource } from '../hooks/useApiResource';

type Props = {
  key?: string;
  apiContext: ApiContext;
  orgUnits: Pick<OrgUnitDto, 'id' | 'name' | 'status'>[];
  roles: Role[];
  employees: Employee[];
  platformAccounts: Account[];
  onChanged: () => Promise<void>;
  onEditRole: (account: Account) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
};

export default function EmployeeAccountManagement({ apiContext, orgUnits, roles, employees, platformAccounts, onChanged, onEditRole, onToast }: Props) {
  const records = useApiResource(apiContext, listEmployeeAccounts);
  const accounts = records.data ?? [];
  const loading = records.loading;
  const [showCreate, setShowCreate] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState<{ account: string; password: string; reset?: boolean; warning?: string } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', account: '', department: '', roleId: '', employeeNo: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const departments = orgUnits.filter(item => item.status === 'enabled');
  const availableRoles = roles.filter(item => item.status === 'enabled');
  const canonicalAccount = (item: EmployeeAccount) => {
    const matching = platformAccounts.filter(account => account.loginName === item.account);
    return matching.length === 1 ? matching[0] : undefined;
  };

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
    const role = availableRoles.find(item => item.id === form.roleId);
    if (!department) { setFormError('请选择当前企业的有效部门'); return; }
    if (!role) { setFormError('请选择一个启用角色'); return; }
    if (!form.employeeNo.trim()) { setFormError('请输入员工编号'); return; }
    if (employees.some(employee => employee.employeeNo.toLowerCase() === form.employeeNo.trim().toLowerCase())) {
      setFormError('员工编号已存在，请到员工与账号维护已有员工，不能重复建档开户'); return;
    }
    if (accounts.some(account => account.employeeNo?.toLowerCase() === form.employeeNo.trim().toLowerCase()
      || account.account.toLowerCase() === form.account.trim().toLowerCase())
      || platformAccounts.some(account => account.loginName.toLowerCase() === form.account.trim().toLowerCase())) {
      setFormError('该员工或登录账号已存在，停用账号仍保留绑定，请维护已有账号'); return;
    }
    busy.current = true;
    setSubmitting(true);
    try {
      const result = await createEmployeeAccount(apiContext, {
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
        account: form.account.trim(), department: department.name, roleId: role.id,
        employeeNo: form.employeeNo.trim(),
      });
      if (!active.current) return;
      setShowCreate(false);
      // Preserve the one-time credential even if the API has not confirmed the role binding.
      const warning = result.roleId !== role.id ? '账号已创建，但角色绑定未确认，请刷新核对并维护已有账号，勿重复创建。' : undefined;
      setShowTempPassword({ account: result.account, password: result.temporaryPassword, warning });
      setForm({ name: '', phone: '', email: '', account: '', department: '', roleId: '', employeeNo: '' });
      records.reload();
      try { await onChanged(); }
      catch { if (active.current) onToast('账号已创建，平台数据刷新失败，请重新查询确认，勿重复创建', 'warning'); }
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
      try { await onChanged(); }
      catch { if (active.current) onToast('状态已保存，平台数据刷新失败，请重新查询确认', 'warning'); }
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
              <tr><th className="px-4 py-3">姓名</th><th className="px-4 py-3">账号</th><th className="px-4 py-3">部门</th><th className="px-4 py-3">账号角色</th><th className="px-4 py-3">手机号</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map(item => (
                <tr key={item.id} className="text-[12px] hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-black text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.account}</td>
                  <td className="px-4 py-3 text-slate-600">{item.department || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{canonicalAccount(item)
                    ? accountRoleLabel(canonicalAccount(item)!, roles)
                    : item.roleId ? roles.find(role => role.id === item.roleId)?.name || '角色信息未提供'
                    : <>{item.role || '角色信息未提供'}<div className="text-[10px] text-amber-700">账号角色绑定待核实</div></>}</td>
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
                      <button disabled={submitting || !canonicalAccount(item) || employees.find(employee => employee.id === canonicalAccount(item)?.employeeId)?.status !== 'active'
                        || platformAccounts.filter(account => account.employeeId === canonicalAccount(item)?.employeeId).length !== 1}
                        title="修改角色" aria-label={`修改 ${item.account} 的角色`} onClick={() => { const account = canonicalAccount(item); if (account) onEditRole(account); }}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><Pencil size={13} /></button>
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
                { key: 'employeeNo', label: '员工编号 *', placeholder: '企业内唯一员工编号' },
              ].map(f => (
                <label key={f.key} className={f.key === 'email' ? 'col-span-2' : ''}>
                  <span className="mb-1 block text-[11px] font-bold text-slate-600">{f.label}</span>
                  <input value={(form as any)[f.key]} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400" />
                </label>
              ))}
              <label>
                <span className="mb-1 block text-[11px] font-bold text-slate-600">部门 *</span>
                <select aria-label="部门 *" value={form.department} onChange={e => setField('department', e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400">
                  <option value="">请选择</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-bold text-slate-600">账号角色 *</span>
                <select aria-label="账号角色 *" value={form.roleId} onChange={e => setField('roleId', e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] outline-none focus:border-blue-400">
                  <option value="">请选择</option>
                  {availableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
            </fieldset>
            {!departments.length && <p role="status" className="mt-3 text-sm text-amber-700">暂无授权部门，请先维护组织与员工。</p>}
            {!availableRoles.length && <p role="status" className="mt-3 text-sm text-amber-700">暂无启用角色，请先维护角色与权限。</p>}
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
            {showTempPassword.warning && <p role="alert" className="mt-3 text-[12px] text-amber-800">{showTempPassword.warning}</p>}
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
