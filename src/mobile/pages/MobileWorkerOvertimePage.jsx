import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock3 } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const STATUS_LABEL = {
  pengajuan: 'Menunggu approval',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  aktif: 'Aktif (lama)',
  selesai: 'Selesai (lama)',
};

const TYPE_LABEL = { checkout: 'Checkout', pengajuan: 'Pengajuan' };

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

function todayJakartaDateOnly() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function getCutoffRange(month, year) {
  const endDay = 25;
  const startDay = 26;
  const start = new Date(year, month - 2, startDay);
  const end = new Date(year, month - 1, endDay);
  return {
    startDate: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`,
    endDate: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
  };
}

function getDefaultCutoff(now = new Date()) {
  const day = now.getDate();
  let cutoffMonth = now.getMonth() + 1;
  let cutoffYear = now.getFullYear();
  if (day > 25) {
    cutoffMonth += 1;
    if (cutoffMonth > 12) {
      cutoffMonth = 1;
      cutoffYear += 1;
    }
  }
  return { cutoffMonth, cutoffYear };
}

function formatDateTime(value) {
  if (!value) return '—';
  const raw = typeof value === 'string' ? value.trim() : '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]} ${m[4]}.${m[5]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}.${pad2(d.getMinutes())}`;
}

function formatDuration(startAt, endAt) {
  if (!startAt || !endAt) return '—';
  const start = new Date(
    typeof startAt === 'string' && !/[zZ]|[+-]\d{2}/.test(startAt)
      ? `${startAt.replace(' ', 'T')}+07:00`
      : startAt
  );
  const end = new Date(
    typeof endAt === 'string' && !/[zZ]|[+-]\d{2}/.test(endAt)
      ? `${endAt.replace(' ', 'T')}+07:00`
      : endAt
  );
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return '—';
  const mins = Math.round((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}j ${m}m`;
}

function statusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pengajuan' || s === 'aktif') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'disetujui' || s === 'selesai') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'ditolak') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export default function MobileWorkerOvertimePage() {
  const defaultCutoff = useMemo(() => getDefaultCutoff(), []);
  const [cutoffMonth, setCutoffMonth] = useState(defaultCutoff.cutoffMonth);
  const [cutoffYear, setCutoffYear] = useState(defaultCutoff.cutoffYear);
  const range = useMemo(() => getCutoffRange(cutoffMonth, cutoffYear), [cutoffMonth, cutoffYear]);

  const [todayStatus, setTodayStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [overtimeDate, setOvertimeDate] = useState(todayJakartaDateOnly());
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [todayRes, listRes] = await Promise.all([
        api.get('/mobile-overtime/today'),
        api.get('/mobile-overtime/list', {
          params: { startDate: range.startDate, endDate: range.endDate },
        }),
      ]);
      setTodayStatus(todayRes.data || null);
      setItems(listRes.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data lembur');
    } finally {
      setLoading(false);
    }
  }, [range.startDate, range.endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const overtime = todayStatus?.overtime || null;
  const canPengajuan = Boolean(todayStatus?.can_pengajuan);

  const handlePengajuan = async () => {
    const desc = description.trim();
    if (!overtimeDate) {
      setError('Tanggal lembur wajib diisi');
      return;
    }
    if (!startTime || !endTime) {
      setError('Jam mulai dan jam selesai wajib diisi');
      return;
    }
    if (!desc) {
      setError('Deskripsi lembur wajib diisi');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/mobile-overtime/pengajuan', {
        overtime_date: overtimeDate,
        start_time: startTime,
        end_time: endTime,
        description: desc,
      });
      setDescription('');
      setSuccess('Pengajuan lembur dikirim. Menunggu approval admin.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengajukan lembur');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-slate-50 flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div
          className="relative overflow-hidden rounded-b-[28px] flex-shrink-0 pb-[22px]"
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
                <p className="text-[11px] font-semibold text-white/55 tracking-wide">Cleanox Worker</p>
                <h1 className="text-[18px] font-extrabold text-white leading-tight truncate">Lembur</h1>
              </div>
            </div>
            <div className="w-10 h-10 rounded-[12px] bg-white/10 border border-white/12 grid place-items-center text-white">
              <Clock3 className="w-5 h-5" />
            </div>
          </div>
          <p className="relative z-[1] mt-3 px-[18px] text-[12px] text-white/70">
            Ajukan tanggal & jam lembur, lalu menunggu approval admin
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[92px] space-y-3">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
              {success}
            </div>
          ) : null}

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Hari ini</p>
              <p className="text-[11px] text-slate-500">
                {todayStatus?.overtime_date || todayJakartaDateOnly()}
              </p>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : overtime ? (
              <div className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-slate-800">
                    {TYPE_LABEL[overtime.type] || overtime.type}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass(
                      overtime.status
                    )}`}
                  >
                    {STATUS_LABEL[overtime.status] || overtime.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {formatDateTime(overtime.start_at)} → {formatDateTime(overtime.end_at)} ·{' '}
                  {formatDuration(overtime.start_at, overtime.end_at)}
                </p>
                <p className="text-[12px] text-slate-700">{overtime.description}</p>
                {overtime.status === 'pengajuan' ? (
                  <p className="text-[11px] text-amber-700">Menunggu approval admin di SuperApp.</p>
                ) : null}
                {overtime.status === 'ditolak' && overtime.rejection_note ? (
                  <p className="text-[11px] text-rose-700">Alasan tolak: {overtime.rejection_note}</p>
                ) : null}
                {canPengajuan && overtime.status === 'ditolak' ? (
                  <p className="text-[11px] text-slate-500">Bisa ajukan ulang lewat form di bawah.</p>
                ) : null}
              </div>
            ) : (
              <p className="text-[12px] text-slate-500">Belum ada pengajuan lembur untuk hari ini.</p>
            )}
          </section>

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Ajukan lembur</p>
              <p className="text-[11px] text-slate-500">Isi tanggal, jam, dan alasan. Tidak perlu check-out.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <label className="text-[11px] font-semibold text-slate-500">
                Tanggal lembur
                <input
                  type="date"
                  value={overtimeDate}
                  onChange={(e) => setOvertimeDate(e.target.value)}
                  disabled={submitting}
                  className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-xs text-slate-800"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-semibold text-slate-500">
                  Jam mulai
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={submitting}
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-xs text-slate-800"
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-500">
                  Jam selesai
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    disabled={submitting}
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-xs text-slate-800"
                  />
                </label>
              </div>
              <label className="text-[11px] font-semibold text-slate-500">
                Alasan / deskripsi
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Kenapa lembur..."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#163A22]/20"
                  disabled={submitting}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handlePengajuan}
              className="w-full h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60"
            >
              {submitting ? 'Mengajukan...' : 'Ajukan Lembur'}
            </button>
            <p className="text-[10.5px] text-slate-400">
              1 pengajuan per tanggal. Jika ditolak, bisa ajukan ulang tanggal yang sama.
            </p>
          </section>

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Riwayat</p>
              <p className="text-[11px] text-slate-500">Filter cutoff bulanan (26 → 25).</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={cutoffMonth}
                onChange={(e) => setCutoffMonth(Number(e.target.value))}
                className="h-10 rounded-xl border border-slate-200 px-2 text-xs font-semibold"
              >
                {MONTHS_ID.map((label, idx) => (
                  <option key={label} value={idx + 1}>{label}</option>
                ))}
              </select>
              <select
                value={cutoffYear}
                onChange={(e) => setCutoffYear(Number(e.target.value))}
                className="h-10 rounded-xl border border-slate-200 px-2 text-xs font-semibold"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Memuat riwayat...</p>
            ) : items.length === 0 ? (
              <p className="text-[12px] text-slate-400">Belum ada data lembur di periode ini.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-slate-800">
                        {toDateOnly(item.overtime_date)} · {TYPE_LABEL[item.type] || item.type}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass(
                          item.status
                        )}`}
                      >
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {formatDateTime(item.start_at)} → {formatDateTime(item.end_at)} ·{' '}
                      {formatDuration(item.start_at, item.end_at)}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-700 line-clamp-2">{item.description}</p>
                    {item.status === 'ditolak' && item.rejection_note ? (
                      <p className="mt-1 text-[11px] text-rose-600 line-clamp-2">
                        Tolak: {item.rejection_note}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <MobileWorkerBottomNav />
      </div>
    </div>
  );
}
