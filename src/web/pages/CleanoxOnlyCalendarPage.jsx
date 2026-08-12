import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  RefreshCw,
  Users,
  Package,
  ExternalLink,
  PlusCircle,
  Clock3,
} from 'lucide-react';
import api from '@shared/utils/api.js';

const STATUS_STYLE = {
  Draft: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: '#64748B' },
  Assigned: { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', dot: '#0284C7' },
  Waiting_Confirmation: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: '#D97706',
    label: 'Waiting Confirmation',
  },
  Scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: '#3B82F6' },
  In_Progress: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: '#4F46E5',
    label: 'In Progress',
  },
  Completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: '#059669' },
  Cancelled: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', dot: '#E11D48' },
};

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function statusLabel(status) {
  return STATUS_STYLE[status]?.label || String(status || '—').replaceAll('_', ' ');
}

function toMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseMonthKey(month) {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function shiftMonth(month, delta) {
  const base = parseMonthKey(month);
  base.setMonth(base.getMonth() + delta);
  return toMonthKey(base);
}

function formatMonthLabel(month) {
  return parseMonthKey(month).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function formatFullDate(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildCalendarCells(month) {
  const first = parseMonthKey(month);
  const year = first.getFullYear();
  const monthIndex = first.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < mondayOffset; i += 1) {
    cells.push({ type: 'pad', key: `pad-start-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ type: 'day', key: dateKey, day, dateKey });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ type: 'pad', key: `pad-end-${cells.length}` });
  }
  return cells;
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text} ${style.border}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export default function CleanoxOnlyCalendarPage() {
  const navigate = useNavigate();
  const todayKey = toDateKey(new Date());
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calendarData, setCalendarData] = useState({ days: {}, workers_legend: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cells = useMemo(() => buildCalendarCells(month), [month]);

  const loadCalendar = async (targetMonth = month) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/pos-transactions/calendar', {
        params: { month: targetMonth },
      });
      setCalendarData({
        days: data.days || {},
        workers_legend: data.workers_legend || [],
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat kalender');
      setCalendarData({ days: {}, workers_legend: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    if (!selectedDate.startsWith(month)) {
      setSelectedDate(`${month}-01`);
    }
  }, [month, selectedDate]);

  const selectedDay = calendarData.days[selectedDate] || { jobs: [], workers: [] };

  const goToday = () => {
    const now = new Date();
    setMonth(toMonthKey(now));
    setSelectedDate(toDateKey(now));
  };

  return (
    <div className="p-3 sm:p-5 space-y-5 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
      <section
        className="relative overflow-hidden rounded-[20px] px-5 py-[18px] text-white"
        style={{
          background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 35%, #1D4ED8 70%, #3B82F6 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-100/80">
              Cleanox Only
            </p>
            <h1 className="mt-2 text-[22px] font-extrabold tracking-[-0.01em]">Calendar</h1>
            <p className="mt-2 max-w-xl text-[13px] text-blue-100/90">
              Jadwal transaksi POS per tanggal layanan. Titik warna menandai status; chip warna menandai
              pekerja.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadCalendar(month)}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white backdrop-blur-xl transition duration-150 hover:-translate-y-0.5 active:scale-[.98] lg:self-auto"
          >
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <section className="rounded-[20px] border border-slate-200 bg-white px-[14px] pt-5 pb-4 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-blue-700"
                style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
              >
                <CalendarDays className="h-[18px] w-[18px]" />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMonth((prev) => shiftMonth(prev, -1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.95]"
                  aria-label="Bulan sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="min-w-[148px] text-center text-[14px] font-bold tracking-[-0.01em] text-slate-900 capitalize">
                  {formatMonthLabel(month)}
                </h2>
                <button
                  type="button"
                  onClick={() => setMonth((prev) => shiftMonth(prev, 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.95]"
                  aria-label="Bulan berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] font-semibold text-blue-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
            >
              <Clock3 className="h-4 w-4" />
              Hari Ini
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((label) => (
              <div
                key={label}
                className="px-1 py-1 text-center text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400"
              >
                {label}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex min-h-[340px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((cell) => {
                if (cell.type === 'pad') {
                  return <div key={cell.key} className="min-h-[84px] rounded-[12px] bg-slate-50/60" />;
                }

                const dayData = calendarData.days[cell.dateKey] || { jobs: [], workers: [] };
                const isSelected = selectedDate === cell.dateKey;
                const isToday = todayKey === cell.dateKey;
                const jobs = dayData.jobs || [];
                const workers = dayData.workers || [];
                const visibleDots = jobs.slice(0, 4);
                const extraJobs = Math.max(0, jobs.length - visibleDots.length);
                const visibleWorkers = workers.slice(0, 3);
                const extraWorkers = Math.max(0, workers.length - visibleWorkers.length);

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateKey)}
                    className={`min-h-[84px] rounded-[12px] border p-2 text-left transition duration-150 hover:-translate-y-0.5 active:scale-[.98] ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50 shadow-[0_0_0_3px_rgba(59,130,246,.12)]'
                        : 'border-slate-200 bg-slate-50/80 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono text-[13px] font-bold ${
                          isToday ? 'text-blue-700' : 'text-slate-800'
                        }`}
                      >
                        {cell.day}
                      </span>
                      {isToday && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                          Hari ini
                        </span>
                      )}
                    </div>

                    {jobs.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {visibleDots.map((job) => (
                          <span
                            key={job.id}
                            className="h-2 w-2 rounded-full"
                            style={{ background: STATUS_STYLE[job.status]?.dot || '#94A3B8' }}
                            title={statusLabel(job.status)}
                          />
                        ))}
                        {extraJobs > 0 && (
                          <span className="text-[10px] font-semibold text-slate-500">+{extraJobs}</span>
                        )}
                      </div>
                    )}

                    {workers.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1">
                        {visibleWorkers.map((worker) => (
                          <span
                            key={`${worker.employee_id || worker.name}`}
                            className="h-2.5 w-2.5 rounded-full border border-white"
                            style={{ background: worker.color }}
                            title={worker.name}
                          />
                        ))}
                        {extraWorkers > 0 && (
                          <span className="text-[10px] font-semibold text-slate-400">+{extraWorkers}</span>
                        )}
                      </div>
                    )}

                    {jobs.length > 0 && (
                      <p className="mt-1.5 text-[10px] font-medium text-slate-500">
                        {jobs.length} transaksi
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {Object.entries(STATUS_STYLE).map(([status, style]) => (
              <span
                key={status}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: style.dot }} />
                {statusLabel(status)}
              </span>
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-[20px] border border-slate-200 bg-white px-[14px] pt-5 pb-4 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-blue-700"
                style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
              >
                <Package className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0">
                <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                  Detail Hari
                </p>
                <h2 className="mt-1 text-[14px] font-bold tracking-[-0.01em] text-slate-900">
                  {formatFullDate(selectedDate)}
                </h2>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                <Users className="h-4 w-4 text-slate-500" />
                Pekerja ditugaskan
              </div>
              {selectedDay.workers.length === 0 ? (
                <p className="text-[11.5px] text-slate-500">Belum ada pekerja pada tanggal ini.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedDay.workers.map((worker) => (
                    <span
                      key={`${worker.employee_id || worker.name}`}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-700"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: worker.color }} />
                      {worker.name}
                      <span className="font-mono text-[10px] text-slate-400">{worker.job_count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                <Package className="h-4 w-4 text-slate-500" />
                Transaksi
                <span className="ml-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {selectedDay.jobs.length}
                </span>
              </div>

              {selectedDay.jobs.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-[13px] font-semibold text-slate-700">Tidak ada transaksi</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    Tidak ada jadwal layanan pada tanggal ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/cleanox-only/transactions/new')}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                    style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' }}
                  >
                    <PlusCircle className="h-4 w-4" />
                    Tambah Transaksi
                  </button>
                </div>
              ) : (
                <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                  {selectedDay.jobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => navigate(`/cleanox-only/transactions/${job.id}`)}
                      className="w-full rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white active:scale-[.98]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-semibold text-slate-500">
                            {job.transaction_no || '—'}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] font-bold tracking-[-0.01em] text-slate-900">
                            {job.customer_name || 'Tanpa nama'}
                          </p>
                          <p className="mt-1 text-[11.5px] text-slate-500">
                            {job.total_people || 0} orang · Rp{' '}
                            {Number(job.final_amount || 0).toLocaleString('id-ID')}
                          </p>
                        </div>
                        <ExternalLink className="mt-0.5 h-[14px] w-[14px] shrink-0 text-slate-400" />
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={job.status} />
                        {job.workers.map((worker) => (
                          <span
                            key={`${job.id}-${worker.employee_id || worker.name}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: worker.color }}
                            />
                            {worker.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white px-[14px] pt-5 pb-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-blue-700"
                style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
              >
                <Users className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                  Aktivitas Pekerja
                </p>
                <h3 className="mt-1 text-[14px] font-bold tracking-[-0.01em] text-slate-900">
                  {selectedDate === todayKey ? 'Hari ini' : formatFullDate(selectedDate)}
                </h3>
              </div>
            </div>
            {selectedDay.workers.length === 0 ? (
              <p className="mt-3 text-[11.5px] text-slate-500">Belum ada aktivitas pekerja pada tanggal ini.</p>
            ) : (
              <div className="mt-3 max-h-[220px] space-y-1.5 overflow-y-auto">
                {selectedDay.workers.map((worker) => (
                  <div
                    key={`${worker.employee_id || worker.name}`}
                    className="flex items-center justify-between gap-3 rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: worker.color }} />
                      <span className="truncate font-medium">{worker.name}</span>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {worker.job_count || 0} tugas
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
