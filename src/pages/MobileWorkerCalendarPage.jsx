import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock3,
  Users,
} from 'lucide-react';
import api from '../utils/api.js';
import MobileWorkerBottomNav from '../components/MobileWorkerBottomNav.jsx';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const TEAM_DOT_COLOR = '#94A3B8';

const STATUS_META = {
  Assigned: { label: 'On Review', color: '#64748B' },
  In_Schedule: { label: 'In Schedule', color: '#3B82F6' },
  On_Progress: { label: 'On Progress', color: '#7BC32C' },
  Done: { label: 'Selesai', color: '#059669' },
};

const toMonthKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const toDateKeyJakarta = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const shiftMonth = (monthKey, delta) => {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return toMonthKey(date);
};

const monthLabelId = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
};

const formatFullDateId = (dateKey) => {
  if (!dateKey) return '-';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatTimeJakarta = (value) => {
  if (!value) return '--.--';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/[ T](\d{2}):(\d{2})/);
    return match ? `${match[1]}.${match[2]}` : '--.--';
  }
  return date.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function buildCalendarCells(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
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

function jobDotColor(job) {
  if (job?.is_mine) {
    return STATUS_META[job.my_assignment_status]?.color || TEAM_DOT_COLOR;
  }
  return TEAM_DOT_COLOR;
}

export default function MobileWorkerCalendarPage() {
  const navigate = useNavigate();
  const todayKey = toDateKeyJakarta();
  const [month, setMonth] = useState(() => todayKey.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cells = useMemo(() => buildCalendarCells(month), [month]);

  useEffect(() => {
    if (!selectedDate.startsWith(month)) {
      setSelectedDate(todayKey.startsWith(month) ? todayKey : `${month}-01`);
    }
  }, [month, selectedDate, todayKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/mobile-tasks/calendar', { params: { month } });
        if (!cancelled) setDays(data.days || {});
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Gagal memuat jadwal');
          setDays({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const selectedJobs = days[selectedDate]?.jobs || [];

  return (
    <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-slate-50 flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div
          className="relative overflow-hidden rounded-b-[28px] flex-shrink-0 pb-[18px]"
          style={{ background: 'linear-gradient(180deg, #163A22 0%, #20492C 58%, #295733 100%)' }}
        >
          <div className="relative z-[1] flex items-center justify-between px-[18px] pt-[14px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link
                to="/mobile-worker"
                className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <div className="text-[14px] font-extrabold text-white truncate">Jadwal Tim</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">
                  Kalender tugas Cleanox
                </div>
              </div>
            </div>
            <div className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-3">
          {error && (
            <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(0,0,0,.04)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMonth((prev) => shiftMonth(prev, -1))}
                className="w-9 h-9 rounded-[11px] border border-slate-200 text-slate-600 grid place-items-center"
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-[13px] font-extrabold text-slate-900 capitalize">
                {monthLabelId(month)}
              </div>
              <button
                type="button"
                onClick={() => setMonth((prev) => shiftMonth(prev, 1))}
                className="w-9 h-9 rounded-[11px] border border-slate-200 text-slate-600 grid place-items-center"
                aria-label="Bulan berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400"
                >
                  {label}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="py-10 text-center text-[12px] text-slate-500">Memuat kalender...</div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell) => {
                  if (cell.type === 'pad') {
                    return <div key={cell.key} className="min-h-[44px] rounded-[10px]" />;
                  }
                  const dayJobs = days[cell.dateKey]?.jobs || [];
                  const isSelected = selectedDate === cell.dateKey;
                  const isToday = todayKey === cell.dateKey;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(cell.dateKey)}
                      className={`min-h-[44px] rounded-[10px] border px-1 py-1.5 text-left transition ${
                        isSelected
                          ? 'border-[#7BC32C] bg-[#EEF8E3]'
                          : 'border-slate-100 bg-slate-50/80'
                      }`}
                    >
                      <div
                        className={`text-[11px] font-bold ${
                          isToday ? 'text-[#163A22]' : 'text-slate-700'
                        }`}
                      >
                        {cell.day}
                      </div>
                      {dayJobs.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-0.5">
                          {dayJobs.slice(0, 3).map((job) => (
                            <span
                              key={job.transaction_id}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: jobDotColor(job) }}
                            />
                          ))}
                          {dayJobs.length > 3 && (
                            <span className="text-[8px] font-bold text-slate-400">
                              +{dayJobs.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[18px] border border-slate-200 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,.04)] space-y-2.5">
            <div>
              <p className="text-[12.5px] font-extrabold text-slate-900">Keterangan</p>
              <p className="mt-0.5 text-[10.5px] text-slate-500">
                Titik berwarna = tugas Anda. Titik abu = jadwal rekan (info saja).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-[12px] bg-slate-50 px-2.5 py-2"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ background: meta.color }}
                  />
                  <span className="text-[11px] font-semibold text-slate-700">{meta.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-[12px] bg-slate-50 px-2.5 py-2 col-span-2">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: TEAM_DOT_COLOR }}
                />
                <span className="text-[11px] font-semibold text-slate-700">Jadwal tim (rekan)</span>
              </div>
            </div>
          </section>

          <section className="space-y-2.5">
            <div>
              <p className="text-[12.5px] font-extrabold text-slate-900">Jadwal</p>
              <p className="text-[10.5px] text-slate-500 mt-0.5">{formatFullDateId(selectedDate)}</p>
            </div>

            {loading ? (
              <p className="text-[12px] text-slate-500 px-1 py-4">Memuat jadwal...</p>
            ) : selectedJobs.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-slate-200 bg-white px-4 py-6 text-center">
                <p className="text-[12.5px] font-bold text-slate-700">Tidak ada jadwal</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Tidak ada jadwal tim di tanggal ini.
                </p>
              </div>
            ) : (
              selectedJobs.map((job) => {
                const isMine = Boolean(job.is_mine);
                const meta = isMine
                  ? STATUS_META[job.my_assignment_status] || STATUS_META.Assigned
                  : null;
                const workers = Array.isArray(job.workers) ? job.workers : [];

                return (
                  <button
                    key={job.transaction_id}
                    type="button"
                    onClick={() => {
                      if (isMine) navigate('/mobile-worker/tasks');
                    }}
                    disabled={!isMine}
                    aria-disabled={!isMine}
                    className={`w-full text-left rounded-[16px] border bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,.04)] transition ${
                      isMine
                        ? 'border-[#7BC32C]/40 active:scale-[.99] cursor-pointer'
                        : 'border-slate-200 cursor-default opacity-95'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-extrabold text-slate-900 truncate">
                          {job.customer_name || 'Customer'}
                        </p>
                        <p className="text-[10.5px] text-slate-400 mt-0.5">
                          {job.transaction_no || '—'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                            isMine
                              ? 'bg-[#EEF8E3] text-[#163A22]'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isMine ? 'Tugas saya' : 'Jadwal tim'}
                        </span>
                        {isMine && meta && (
                          <span
                            className="text-[10px] font-bold px-2 py-1 rounded-full"
                            style={{ background: `${meta.color}18`, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                      <Clock3 className="w-3.5 h-3.5 text-slate-400" />
                      {formatTimeJakarta(job.service_date)}
                    </div>
                    <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">
                        {job.customer_address || 'Alamat belum tersedia'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-600">
                      <Users className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">
                        <span className="text-slate-400">Ditugaskan: </span>
                        {workers.length === 0
                          ? '—'
                          : workers.map((w, idx) => {
                              const name = w.employee_name || `Pekerja #${w.employee_id}`;
                              const isSelf =
                                isMine &&
                                Number(w.assignment_id) === Number(job.my_assignment_id);
                              return (
                                <span key={w.assignment_id || `${w.employee_id}-${idx}`}>
                                  {idx > 0 ? ', ' : ''}
                                  <span className={isSelf ? 'font-bold text-slate-800' : undefined}>
                                    {name}
                                  </span>
                                </span>
                              );
                            })}
                      </span>
                    </div>
                    {!isMine && (
                      <p className="mt-2 text-[10px] font-medium text-slate-400">
                        Hanya info — tidak bisa dibuka detail
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </section>
        </div>

        <MobileWorkerBottomNav />
      </div>
    </div>
  );
}
