import { useEffect, useRef } from 'react';
import { ArrowRight, Database, Factory, PackageCheck, X } from 'lucide-react';

type Props = {
  onClose: () => void;
  onViewStock?: () => void;
  onProcurement?: () => void;
  onProduction?: () => void;
};

/** Route to authoritative receipt/completion workflows; availability import is not an inbound command. */
export function ManualInboundModal({ onClose, onViewStock, onProcurement, onProduction }: Props) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const actions = [
    { label: '查看库存台账', icon: Database, onClick: onViewStock },
    { label: '前往采购收货', icon: PackageCheck, onClick: onProcurement },
    { label: '前往生产完工入库', icon: Factory, onClick: onProduction },
  ].filter(action => action.onClick);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="manual-inbound-title"
        aria-describedby="manual-inbound-description"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const buttons = Array.from<HTMLButtonElement>(dialog.current?.querySelectorAll('button') || []);
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 id="manual-inbound-title" className="text-[15px] font-bold text-slate-800">入库办理指引</h3>
          <button type="button" title="关闭入库指引" aria-label="关闭入库指引" onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>
        <div className="space-y-4 p-5 text-[13px] leading-6 text-slate-600">
          <p id="manual-inbound-description">请通过采购收货或生产完工入库办理入库。实际过账成功后，库存台账才会更新。</p>
          <p>若实物已入库但仍未查询到库存记录，请核对来源单据的过账状态，并重新查询库存。</p>
          <div className="flex flex-col gap-2">
            {actions.map(({ label, icon: Icon, onClick }) => (
              <button key={label} type="button" onClick={onClick}
                className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-left font-medium text-blue-700 hover:bg-blue-50">
                <Icon size={16} className="shrink-0" /><span className="min-w-0 flex-1">{label}</span><ArrowRight size={16} className="shrink-0" />
              </button>
            ))}
          </div>
          {!onProcurement && !onProduction && <p>当前账号无可用的入库业务入口，请联系具有相应权限的人员处理。</p>}
        </div>
      </section>
    </div>
  );
}
