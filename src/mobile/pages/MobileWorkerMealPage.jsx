import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';
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

function todayWib() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function getCutoffRange(month, year) {
  const start = new Date(year, month - 2, 26);
  const end = new Date(year, month - 1, 25);
  return {
    startDate: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`,
    endDate: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
  };
}

function getDefaultCutoff(now = new Date()) {
  let cutoffMonth = now.getMonth() + 1;
  let cutoffYear = now.getFullYear();
  if (now.getDate() > 25) {
    cutoffMonth += 1;
    if (cutoffMonth > 12) {
      cutoffMonth = 1;
      cutoffYear += 1;
    }
  }
  return { cutoffMonth, cutoffYear };
}

const TYPE_LABEL = { half_day: 'Half Day', full_day: 'Full Day' };
const STATUS_META = {
  menunggu_tf: { label: 'Menunggu TF', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  selesai: { label: 'Selesai', bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
};

export default function MobileWorkerMealPage() {
  const defaultCutoff = useMemo(() => getDefaultCutoff(), []);
  const [cutoffMonth, setCutoffMonth] = useState(defaultCutoff.cutoffMonth);
  const [cutoffYear, setCutoffYear] = useState(defaultCutoff.cutoffYear);
  const range = useMemo(() => getCutoffRange(cutoffMonth, cutoffYear), [cutoffMonth, cutoffYear]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [mealDate, setMealDate] = useState(todayWib());
  const [type, setType] = useState('half_day');
  const [notes, setNotes] = useState('');
  const [editId, setEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const listRes = await api.get('/mobile-meal/my-submissions', {
        params: { startDate: range.startDate, endDate: range.endDate },
      });
      setItems(listRes.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data makan siang');
    } finally {
      setLoading(false);
    }
  }, [range.startDate, range.endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditId(null);
    setMealDate(todayWib());
    setType('half_day');
    setNotes('');
  };

  const startEdit = (item) => {
    if (item.status !== 'menunggu_tf') return;
    setEditId(item.id);
    setMealDate(toDateOnly(item.meal_date));
    setType(item.type);
    setNotes(item.notes || '');
    setSuccess('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!mealDate) {
      setError('Tanggal wajib diisi');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const body = { meal_date: mealDate, type, notes: notes.trim() || undefined };
      if (editId) {
        await api.put(`/mobile-meal/${editId}`, body);
        setSuccess('Pengajuan diperbarui.');
      } else {
        await api.post('/mobile-meal', body);
        setSuccess('Pengajuan makan siang berhasil.');
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan pengajuan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setSubmitting(true);
    setError('');
    try {
      await api.delete(`/mobile-meal/${deleteTarget.id}`);
      setDeleteTarget(null);
      if (editId === deleteTarget.id) resetForm();
      setSuccess('Pengajuan dihapus.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus pengajuan');
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
                <div className="text-[14px] font-extrabold text-white truncate">Makan Siang</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">
                  Pengajuan half / full day
                </div>
              </div>
            </div>
            <UtensilsCrossed className="w-5 h-5 text-white/70 flex-shrink-0" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 sm:pt-[14px] pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {success && <div className="rounded-2xl border border-[#163A22] bg-[#163A22] p-3 text-sm text-white">{success}</div>}

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] font-extrabold text-slate-900">
                {editId ? 'Edit Pengajuan' : 'Ajukan Makan Siang'}
              </p>
              {editId ? (
                <button type="button" onClick={resetForm} className="text-[11px] font-bold text-slate-500">
                  Batal edit
                </button>
              ) : null}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500">Tanggal</label>
              <input
                type="date"
                value={mealDate}
                max={todayWib()}
                onChange={(e) => setMealDate(e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['half_day', 'full_day'].map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={submitting}
                  onClick={() => setType(key)}
                  className={`rounded-xl border px-3 py-3 text-center transition ${
                    type === key ? 'border-[#163A22] bg-[#EEF8E3]' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-[12px] font-extrabold text-slate-800">{TYPE_LABEL[key]}</p>
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500">Catatan (opsional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={1000}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                disabled={submitting}
                placeholder="Opsional..."
              />
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full h-[42px] rounded-[12px] bg-[#163A22] text-white text-[12.5px] font-extrabold disabled:opacity-60"
            >
              {submitting ? 'Menyimpan...' : editId ? 'Simpan Perubahan' : 'Ajukan'}
            </button>
          </section>

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Riwayat</p>
              <p className="text-[11px] text-slate-500">Filter cutoff 26 → 25.</p>
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
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : items.length === 0 ? (
              <p className="text-[12px] text-slate-400">Belum ada pengajuan di periode ini.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const st = STATUS_META[item.status] || STATUS_META.menunggu_tf;
                  return (
                    <div key={item.id} className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[12px] font-bold text-slate-800">
                            {toDateOnly(item.meal_date)} · {TYPE_LABEL[item.type] || item.type}
                          </p>
                          {item.notes ? (
                            <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{item.notes}</p>
                          ) : null}
                        </div>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
                          style={{ background: st.bg, color: st.color, borderColor: st.border }}
                        >
                          {st.label}
                        </span>
                      </div>
                      {item.status === 'menunggu_tf' ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="flex-1 h-8 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="flex-1 h-8 rounded-lg border border-rose-200 text-[11px] font-bold text-rose-600"
                          >
                            Hapus
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus pengajuan?"
        description={`Hapus pengajuan ${TYPE_LABEL[deleteTarget?.type] || ''} tanggal ${toDateOnly(deleteTarget?.meal_date) || ''}?`}
        variant="danger"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        busy={submitting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
