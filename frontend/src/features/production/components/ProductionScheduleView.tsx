import { CalendarRange, Sparkles } from 'lucide-react';
import { ApiDataState } from '../../../components/ApiDataState';

type Props = { orders: any[]; equipments: any[] };

// Only render explicitly assigned formal orders; never assign machines in the browser.
export function ProductionScheduleView({ orders, equipments }: Props) {
  const scheduled = orders.filter(order => order.assignedMachine && order.scheduledStartAt && order.scheduledEndAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
  const days = Array.from({ length: 5 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return `${day.getMonth() + 1}/${day.getDate()}`;
  });
  return <section className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-6">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800"><CalendarRange size={18} />智能排产甘特图 (APS)</h3>
      <button disabled title="请通过主计划运行正式 APS" className="flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-[12px] text-slate-400"><Sparkles size={14} />执行 AI 优化平衡</button>
    </header>
    <div className="flex-1 overflow-auto p-6">
      <div className="flex min-w-[600px] border-b border-slate-200 pb-3 text-[12px] text-slate-500">
        <span className="w-32 shrink-0">设备资产</span>
        <div className="grid flex-1 grid-cols-5 text-center">{days.map(day => <span key={day}>{day}</span>)}</div>
      </div>
      {equipments.map(machine => <div key={machine.id} className="flex min-w-[600px] items-center border-b border-slate-100 py-4">
        <div className="w-32 shrink-0 text-[13px] font-bold text-slate-700">{machine.name || machine.id}</div>
        <div className="relative grid min-h-16 flex-1 grid-cols-5 rounded-md border border-slate-200">
          {days.map(day => <div key={day} className="border-r border-slate-100 last:border-r-0" />)}
          {scheduled.filter(order => order.assignedMachine === machine.id).map(order => {
            const start = (Date.parse(order.scheduledStartAt) - monday.getTime()) / 86400000;
            const end = (Date.parse(order.scheduledEndAt) - monday.getTime()) / 86400000;
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= 0 || start >= 5) return null;
            return <div key={order.id} title={`${order.id} · ${order.scheduledStartAt} ~ ${order.scheduledEndAt}`}
              className="absolute top-2 h-10 truncate rounded bg-blue-600 px-2 py-3 text-[11px] text-white"
              style={{ left: `${Math.max(0, start) / 5 * 100}%`, width: `${(Math.min(5, end) - Math.max(0, start)) / 5 * 100}%` }}>{order.id}</div>;
          })}
        </div>
      </div>)}
      {!equipments.length && <div className="relative min-h-[260px]">
        <div className="absolute inset-0 ml-32 grid grid-cols-5">{days.map(day => <div key={day} className="border-r border-dashed border-slate-200" />)}</div>
        <div className="relative pt-20"><ApiDataState empty="尚未获取设备资产与正式排程" /></div>
      </div>}
      {equipments.length > 0 && !scheduled.length && <ApiDataState empty="暂无已分配设备的正式排程" />}
    </div>
  </section>;
}
