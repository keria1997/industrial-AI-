/**
 * 收款核销弹窗
 *
 * PRD 7.7.4: 登记收款并核销 AR，核销后 AR 状态推进。
 * 字段: 收款金额（<=AR余额）、付款方式（下拉）、备注。
 */

import { useState, type FormEvent } from 'react';

interface Props {
  open: boolean;
  arNo: string;
  balance: string;
  onClose: () => void;
  onSubmit: (amount: string, method: string, remark: string) => void;
}

export function PaymentAllocationModal({ open, arNo, balance, onClose, onSubmit }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('银行转账');
  const [remark, setRemark] = useState('');

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    onSubmit(amount, method, remark);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-0">
          <h3 className="text-lg font-bold text-slate-800">登记收款</h3>
          <p className="text-[13px] text-slate-500 mt-1">应收单号: {arNo} · 余额: {balance}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">收款金额 *</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={`不超过 ${balance}`}
              min="0"
              step="0.01"
              className="w-full h-10 rounded-lg border border-slate-300 px-3 text-[14px] outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">付款方式 *</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full h-10 rounded-lg border border-slate-300 px-3 text-[14px] outline-none focus:border-blue-500">
              <option>银行转账</option>
              <option>现金</option>
              <option>承兑汇票</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">备注</label>
            <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2} placeholder="可选" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-5 rounded-lg border border-slate-300 text-slate-700 text-[14px] hover:bg-slate-50">取消</button>
            <button type="submit" className="h-10 px-5 rounded-lg bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700">确认核销</button>
          </div>
        </form>
      </div>
    </div>
  );
}
