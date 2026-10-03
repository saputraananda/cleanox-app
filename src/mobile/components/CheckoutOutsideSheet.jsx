import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import api from '@shared/utils/api.js';

const OUTSIDE_TYPES = [
  { key: 'layanan', label: 'Karena layanan' },
  { key: 'lainnya', label: 'Alasan lain' },
];

const NOTE_MAX_LENGTH = 1000;

export default function CheckoutOutsideSheet({ open, busy, onClose, onSubmit }) {
  const [type, setType] = useState('');
  const [note, setNote] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    setType('');
    setNote('');
    setSelectedIds([]);
    setServices([]);
    setLoadError('');
    setFormError('');
    setLoading(true);

    api
      .get('/mobile-attendance/today-services')
      .then(({ data }) => {
        if (!cancelled) setServices(Array.isArray(data?.services) ? data.services : []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.data?.message || 'Gagal memuat jadwal layanan');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const layananDisabled = !loading && services.length === 0;

  const toggleService = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = () => {
    setFormError('');
    if (!type) {
      setFormError('Pilih alasan absen di luar HO');
      return;
    }
    if (type === 'layanan' && selectedIds.length === 0) {
      setFormError('Pilih minimal satu layanan');
      return;
    }
    if (!note.trim()) {
      setFormError('Catatan wajib diisi');
      return;
    }
    onSubmit({
      type,
      note: note.trim(),
      transactionIds: type === 'layanan' ? selectedIds : [],
    });
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl max-h-[92dvh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="text-[15px] font-bold text-slate-800">Keterangan Absen</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 grid place-items-center disabled:opacity-60"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="flex gap-2.5 rounded-[14px] border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[12.5px] font-extrabold text-slate-900">Absen pulang terdeteksi di luar HO.</p>
              <p className="text-[11.5px] text-slate-600 mt-0.5">
                Pilih alasan dan isi catatan sebelum mengirim absen.
              </p>
            </div>
          </div>

          <div>
            <p className="text-[12.5px] font-bold text-slate-800 mb-2">
              Alasan absen di luar HO <span className="font-medium text-slate-400">(wajib)</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {OUTSIDE_TYPES.map((opt) => {
                const active = type === opt.key;
                const disabled = opt.key === 'layanan' && layananDisabled;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setType(opt.key)}
                    className={`flex items-center gap-2 rounded-[14px] border-2 px-3 py-3 text-left disabled:opacity-50 ${
                      active ? 'border-[#163A22] bg-[#EEF8E3]' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full border-2 grid place-items-center flex-shrink-0 ${
                        active ? 'border-[#163A22]' : 'border-slate-300'
                      }`}
                    >
                      {active ? <span className="w-2 h-2 rounded-full bg-[#163A22]" /> : null}
                    </span>
                    <span className="text-[12.5px] font-bold text-slate-800">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {layananDisabled && !loadError ? (
              <p className="mt-1.5 text-[11px] text-slate-400">Tidak ada jadwal POS hari ini.</p>
            ) : null}
          </div>

          {type === 'layanan' && (
            <div className="space-y-2">
              <div>
                <p className="text-[12.5px] font-bold text-slate-800">Pilih layanan dari jadwal hari ini</p>
                <p className="text-[11px] text-slate-500">
                  Dari penjadwalan POS · {services.length} jadwal. Bisa pilih lebih dari satu.
                </p>
              </div>
              {loading ? (
                <p className="text-[12px] text-slate-500">Memuat jadwal...</p>
              ) : loadError ? (
                <p className="text-[12px] text-rose-600">{loadError}</p>
              ) : (
                services.map((svc) => {
                  const checked = selectedIds.includes(svc.transaction_id);
                  const meta = [
                    svc.total_people ? `${svc.total_people} orang` : null,
                    svc.team_names?.length ? svc.team_names.join(', ') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <button
                      key={svc.transaction_id}
                      type="button"
                      onClick={() => toggleService(svc.transaction_id)}
                      className={`w-full flex gap-3 rounded-[16px] border p-3 text-left ${
                        checked ? 'border-[#163A22] bg-[#EEF8E3]/60' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 grid place-items-center flex-shrink-0 ${
                          checked ? 'border-[#163A22] bg-[#163A22] text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {checked ? <Check className="w-3.5 h-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-slate-900">{svc.customer_name || '-'}</span>
                        <span className="block font-mono text-[11px] text-slate-500">{svc.transaction_no}</span>
                        {meta ? <span className="block text-[11px] text-slate-500 mt-0.5">{meta}</span> : null}
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">
                            {svc.status_label}
                          </span>
                          {svc.assigned_to_me ? (
                            <span className="rounded-full bg-[#EEF8E3] px-2 py-0.5 text-[10.5px] font-semibold text-[#163A22]">
                              Ditugaskan ke Anda
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {type && (
            <label className="block">
              <span className="text-[12.5px] font-bold text-slate-800">Catatan *</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX_LENGTH}
                rows={3}
                placeholder={type === 'layanan' ? 'Contoh: masih di lokasi customer' : 'Tulis alasan absen di luar HO'}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#163A22]/20"
              />
            </label>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] space-y-2">
          {formError ? <p className="text-[12px] text-rose-600">{formError}</p> : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="w-full h-[46px] rounded-[14px] bg-[#163A22] text-white text-[13px] font-extrabold hover:bg-[#20492C] disabled:opacity-60"
          >
            {busy ? 'Mengirim...' : 'Kirim Absen'}
          </button>
        </div>
      </div>
    </div>
  );
}
