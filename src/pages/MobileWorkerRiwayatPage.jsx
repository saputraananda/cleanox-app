import { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  History,
  LogOut as OutIcon,
  Play,
  Sparkles,
  XCircle,
} from 'lucide-react';
import api from '../utils/api.js';
import MobileWorkerBottomNav from '../components/MobileWorkerBottomNav.jsx';

const TYPE_META = {
  task_accept: { label: 'Task', Icon: CheckCircle2, tone: 'bg-[#EEF8E3] text-[#163A22]' },
  task_start: { label: 'Task', Icon: Play, tone: 'bg-[#EEF8E3] text-[#2F6B38]' },
  task_complete: { label: 'Task', Icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
  task_reject: { label: 'Task', Icon: XCircle, tone: 'bg-rose-50 text-rose-700' },
  task_reschedule: { label: 'Jadwal', Icon: History, tone: 'bg-sky-50 text-sky-700' },
  task_cancel: { label: 'Task', Icon: XCircle, tone: 'bg-rose-50 text-rose-700' },
  attendance_check_in: { label: 'Absensi', Icon: Camera, tone: 'bg-[#EEF8E3] text-[#163A22]' },
  attendance_check_out: { label: 'Absensi', Icon: OutIcon, tone: 'bg-slate-100 text-slate-600' },
  kebersihan_upload: { label: 'Kebersihan', Icon: Sparkles, tone: 'bg-[#F7F8E0] text-[#8A9200]' },
  kebersihan_complete: { label: 'Kebersihan', Icon: Sparkles, tone: 'bg-emerald-50 text-emerald-700' },
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function MobileWorkerRiwayatPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/mobile-riwayat', { params: { days: 30 } });
        if (!cancelled) setItems(data.items || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Gagal memuat riwayat');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-slate-50 flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div
          className="relative overflow-hidden rounded-b-[28px] flex-shrink-0 pb-[18px]"
          style={{ background: 'linear-gradient(180deg, #163A22 0%, #20492C 58%, #295733 100%)' }}
        >
          <div className="relative z-[1] flex items-center justify-between px-[18px] pt-[14px]">
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold text-white truncate">Riwayat</div>
              <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">
                Aktivitas kerja 30 hari terakhir
              </div>
            </div>
            <div className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center">
              <History className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 px-1 py-6 text-center">Memuat riwayat...</p>
          ) : items.length === 0 ? (
            <div className="rounded-[22px] border border-slate-100 bg-white p-6 text-center shadow-[0_10px_28px_rgba(15,23,42,.05)]">
              <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="mt-3 text-[13px] font-extrabold text-slate-900">Belum ada aktivitas</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Accept, mulai/selesai task, absensi, dan kebersihan akan muncul di sini.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const meta = TYPE_META[item.type] || {
                label: 'Aktivitas',
                Icon: History,
                tone: 'bg-slate-100 text-slate-600',
              };
              const Icon = meta.Icon;
              return (
                <div
                  key={item.id}
                  className="rounded-[18px] border border-slate-100 bg-white p-3.5 shadow-[0_8px_22px_rgba(15,23,42,.04)] flex gap-3"
                >
                  <div className={`w-10 h-10 rounded-full grid place-items-center flex-shrink-0 ${meta.tone}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12.5px] font-extrabold text-slate-900 leading-snug">{item.title}</p>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 flex-shrink-0">
                        {meta.label}
                      </span>
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{item.description}</p>
                    )}
                    <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                      {formatDateTime(item.occurred_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <MobileWorkerBottomNav />
      </div>
    </div>
  );
}
