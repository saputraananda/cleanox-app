import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock3 } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

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
  const start = new Date(typeof startAt === 'string' && !/[zZ]|[+-]\d{2}/.test(startAt) ? startAt.replace(' ', 'T') + '+07:00' : startAt);
  const end = new Date(typeof endAt === 'string' && !/[zZ]|[+-]\d{2}/.test(endAt) ? endAt.replace(' ', 'T') + '+07:00' : endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return '—';
  const mins = Math.round((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}j ${m}m`;
}

const TYPE_LABEL = { checkout: 'Checkout', pengajuan: 'Pengajuan' };

export default function MobileWorkerOvertimePage() {
  const defaultCutoff = useMemo(() => getDefaultCutoff(), []);
  const [cutoffMonth, setCutoffMonth] = useState(defaultCutoff.cutoffMonth);
  const [cutoffYear, setCutoffYear] = useState(defaultCutoff.cutoffYear);
  const range = useMemo(() => getCutoffRange(cutoffMonth, cutoffYear), [cutoffMonth, cutoffYear]);

  const [todayStatus, setTodayStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selesaiConfirmOpen, setSelesaiConfirmOpen] = useState(false);

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

  const handlePengajuan = async () => {
    const desc = description.trim();
    if (!desc) {
      setError('Deskripsi lembur wajib diisi');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/mobile-overtime/pengajuan', { description: desc });
      setDescription('');
      setSuccess('Pengajuan lembur dimulai.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengajukan lembur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFromCheckout = async () => {
    const desc = description.trim();
    if (!desc) {
      setError('Deskripsi lembur wajib diisi');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/mobile-overtime/from-checkout', { description: desc });
      setDescription('');
      setSuccess('Lembur checkout berhasil dicatat.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mencatat lembur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelesai = async () => {
    if (!overtime?.id) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/mobile-overtime/${overtime.id}/selesai`);
      setSelesaiConfirmOpen(false);
      setSuccess('Lembur selesai dicatat.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyelesaikan lembur');
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
              <div className="min-w-0 overflow-hidden">
                <div className="text-[14px] font-extrabold text-white truncate">Lembur</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">
                  Pengajuan & riwayat lembur
                </div>
              </div>
            </div>
            <Clock3 className="w-5 h-5 text-white/70 flex-shrink-0" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 sm:pt-[14px] pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {success && <div className="rounded-2xl border border-[#163A22] bg-[#163A22] p-3 text-sm text-white">{success}</div>}

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Status Hari Ini</p>
              <p className="text-[11px] text-slate-500">
                {todayStatus?.overtime_date || toDateOnly(new Date())}
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
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      overtime.status === 'aktif'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {overtime.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {formatDateTime(overtime.start_at)} → {formatDateTime(overtime.end_at)} ·{' '}
                  {formatDuration(overtime.start_at, overtime.end_at)}
                </p>
                <p className="text-[12px] text-slate-700">{overtime.description}</p>
                {overtime.status === 'aktif' && overtime.type === 'pengajuan' ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setSelesaiConfirmOpen(true)}
                    className="w-full h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60"
                  >
                    Selesai Lembur
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {!todayStatus?.attendance?.check_out_at ? (
                  <p className="text-[12px] text-slate-500">
                    Check-out dulu di menu Absensi sebelum mengajukan lembur.
                  </p>
                ) : null}

                {(todayStatus?.can_pengajuan || todayStatus?.can_retry_from_checkout) && (
                  <>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Deskripsi kenapa lembur..."
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#163A22]/20"
                      disabled={submitting}
                    />
                    {todayStatus?.can_pengajuan ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handlePengajuan}
                        className="w-full h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60"
                      >
                        {submitting ? 'Mengajukan...' : 'Ajukan Lembur'}
                      </button>
                    ) : null}
                    {todayStatus?.can_retry_from_checkout ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleRetryFromCheckout}
                        className="w-full h-[40px] rounded-[12px] border-2 border-[#163A22] text-[#163A22] text-[12px] font-extrabold disabled:opacity-60"
                      >
                        Catat Lembur dari Checkout
                      </button>
                    ) : null}
                    {todayStatus?.can_retry_from_checkout && todayStatus?.can_pengajuan ? (
                      <p className="text-[10.5px] text-slate-400">
                        Pilih satu: ajukan mulai sekarang, atau catat dari jam 17:00 sampai jam checkout.
                      </p>
                    ) : null}
                  </>
                )}

                {!todayStatus?.can_pengajuan && !todayStatus?.can_retry_from_checkout && todayStatus?.attendance?.check_out_at ? (
                  <p className="text-[12px] text-slate-500">Tidak ada aksi lembur tersedia untuk hari ini.</p>
                ) : null}
              </div>
            )}
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
                      <span className="text-[10px] font-bold text-slate-500">{item.status}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {formatDateTime(item.start_at)} → {formatDateTime(item.end_at)} ·{' '}
                      {formatDuration(item.start_at, item.end_at)}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-700 line-clamp-2">{item.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileConfirmDialog
        open={selesaiConfirmOpen}
        title="Selesai lembur?"
        description="Jam selesai akan dicatat sekarang."
        confirmLabel="Ya, selesai"
        cancelLabel="Batal"
        busy={submitting}
        onConfirm={handleSelesai}
        onCancel={() => setSelesaiConfirmOpen(false)}
        onClose={() => setSelesaiConfirmOpen(false)}
      />
    </div>
  );
}
