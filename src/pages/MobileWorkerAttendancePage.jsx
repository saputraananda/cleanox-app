import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, X } from 'lucide-react';
import api from '../utils/api.js';
import MobileWorkerBottomNav from '../components/MobileWorkerBottomNav.jsx';
import MobileCameraCapture from '../components/MobileCameraCapture.jsx';
import MobileConfirmDialog from '../components/MobileConfirmDialog.jsx';

const PHOTO_FIELDS = [
  { key: 'full_body_photo', label: 'Foto Satu Badan' },
  { key: 'side_photo', label: 'Foto Samping' },
  { key: 'back_photo', label: 'Foto Belakang' },
  { key: 'hand_photo', label: 'Foto Tangan' },
];

const MONTHS_ID_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Format attendance datetime selaras jam header (browser lokal).
 * - String naif tanpa timezone: tampilkan digit apa adanya.
 * - ISO bertimezone / Date: pakai komponen lokal (bukan UTC).
 */
const formatDateTime = (value) => {
  if (!value) return '-';

  const raw = typeof value === 'string' ? value.trim() : '';
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);

  if (typeof value === 'string' && !hasTimezone) {
    const localMatch = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (localMatch) {
      const [, year, month, day, hour, minute] = localMatch;
      return `${day} ${MONTHS_ID_SHORT[Number(month) - 1]} ${year}, ${hour}.${minute}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return `${pad2(date.getDate())} ${MONTHS_ID_SHORT[date.getMonth()]} ${date.getFullYear()}, ${pad2(date.getHours())}.${pad2(date.getMinutes())}`;
};

export default function MobileWorkerAttendancePage() {
  const [attendance, setAttendance] = useState(null);
  const [files, setFiles] = useState({});
  const [checkoutProofFile, setCheckoutProofFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [photoRequirementAlertOpen, setPhotoRequirementAlertOpen] = useState(false);
  const [checkoutPhotoRequirementAlertOpen, setCheckoutPhotoRequirementAlertOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [cameraTarget, setCameraTarget] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const [checkoutProofPreviewUrl, setCheckoutProofPreviewUrl] = useState('');
  const previewUrlsRef = useRef({});
  const checkoutProofPreviewUrlRef = useRef('');

  const loadStatus = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/mobile-attendance/today-status');
      setAttendance(data.attendance || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengambil status attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const allPhotosSelected = useMemo(
    () => PHOTO_FIELDS.every((field) => files[field.key]),
    [files]
  );

  const liveTime = useMemo(
    () =>
      now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [now]
  );

  const liveDate = useMemo(
    () =>
      now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [now]
  );

  const handleFileChange = (key, file) => {
    setFiles((prev) => ({ ...prev, [key]: file || null }));
    setPreviewUrls((prev) => {
      const next = { ...prev };
      if (prev[key]?.startsWith?.('blob:')) URL.revokeObjectURL(prev[key]);
      if (file) next[key] = URL.createObjectURL(file);
      else delete next[key];
      return next;
    });
  };

  const handleCheckoutProofChange = (file) => {
    setCheckoutProofFile(file || null);
    setCheckoutProofPreviewUrl((prev) => {
      if (prev?.startsWith?.('blob:')) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    checkoutProofPreviewUrlRef.current = checkoutProofPreviewUrl;
  }, [checkoutProofPreviewUrl]);

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      if (
        typeof checkoutProofPreviewUrlRef.current === 'string'
        && checkoutProofPreviewUrlRef.current.startsWith('blob:')
      ) {
        URL.revokeObjectURL(checkoutProofPreviewUrlRef.current);
      }
    };
  }, []);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!allPhotosSelected) {
      setPhotoRequirementAlertOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      PHOTO_FIELDS.forEach((field) => formData.append(field.key, files[field.key]));

      await api.post('/mobile-attendance/check-in', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Check-in attendance berhasil disimpan.');
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan check-in attendance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    setError('');
    setSuccess('');

    if (!checkoutProofFile) {
      setCheckoutPhotoRequirementAlertOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('check_out_photo', checkoutProofFile);

      await api.post('/mobile-attendance/check-out', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Check-out attendance berhasil disimpan.');
      handleCheckoutProofChange(null);
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan check-out attendance');
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
          <div
            className="absolute -top-[70px] -right-[40px] w-[200px] h-[200px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(123,195,44,.16) 0%, transparent 70%)' }}
          />
          <div
            className="absolute -bottom-[30px] -left-[30px] w-[140px] h-[140px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(235,247,8,.12) 0%, transparent 70%)' }}
          />

          <div className="relative z-[1] flex items-center justify-between px-[18px] pt-[14px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link
                to="/mobile-worker"
                className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center flex-shrink-0 backdrop-blur-xl"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0 overflow-hidden">
                <div className="text-[14px] font-extrabold text-white truncate">Attendance QC</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">Fase 1 · Company ID 3</div>
              </div>
            </div>
          </div>

          <div className="relative z-[1] flex items-end justify-between px-[18px] pt-[14px]">
            <div>
              <div className="font-mono text-[26px] font-bold text-white tracking-[-1px] leading-none">{liveTime}</div>
              <div className="text-[11.5px] text-white/45 font-medium mt-1">{liveDate}</div>
            </div>
            <div className="text-[10px] font-bold tracking-[.03em] px-2.5 py-[5px] rounded-full bg-white/12 text-white/85 border border-white/10 whitespace-nowrap flex-shrink-0 backdrop-blur-md">
              QC 4 Foto
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 sm:pt-[14px] pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}

        <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
          <div>
            <p className="text-[14px] font-extrabold text-slate-900">Status Hari Ini</p>
            <p className="text-[11px] text-slate-500">Pantau check-in dan check-out worker.</p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Memuat status attendance...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] p-3">
                <p className="text-[10px] uppercase tracking-[.06em] text-slate-400 font-bold">Check In</p>
                <p className="mt-1 text-[14px] font-extrabold text-slate-900">{formatDateTime(attendance?.check_in_at)}</p>
              </div>
              <div className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] p-3">
                <p className="text-[10px] uppercase tracking-[.06em] text-slate-400 font-bold">Check Out</p>
                <p className="mt-1 text-[14px] font-extrabold text-slate-900">{formatDateTime(attendance?.check_out_at)}</p>
              </div>
            </div>
          )}
        </section>

        {!attendance?.check_in_at && (
          <form onSubmit={handleCheckIn} className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-4">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Foto QC Wajib</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Ambil 4 foto dari kamera sebelum check-in. Jam pengambilan otomatis tertanam di foto.
              </p>
            </div>

            <div className="space-y-3">
              {PHOTO_FIELDS.map((field) => (
                <div key={field.key} className="rounded-[16px] border border-slate-200 p-3 bg-[#FAFBFC]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12.5px] font-bold text-slate-800">{field.label}</p>
                      <p className="text-[10.5px] text-slate-500 mt-1">
                        {files[field.key] ? 'Foto siap' : 'Belum ada foto'}
                      </p>
                    </div>
                    {files[field.key] ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-400" />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCameraTarget({ key: field.key, label: field.label })}
                    className="mt-3 w-full h-[40px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:border-[#7BC32C] hover:text-[#163A22] hover:bg-[#EEF8E3]/50 transition"
                  >
                    <Camera className="w-4 h-4" />
                    {files[field.key] ? 'Ambil Ulang' : 'Ambil Foto'}
                  </button>

                  {previewUrls[field.key] && (
                    <div className="relative mt-3">
                      <button
                        type="button"
                        onClick={() => handleFileChange(field.key, null)}
                        className="absolute right-2 top-2 z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition hover:bg-black/80"
                        aria-label={`Hapus foto ${field.label}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <img
                        src={previewUrls[field.key]}
                        alt={field.label}
                        className="h-40 w-full rounded-2xl object-cover"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-[42px] rounded-[12px] bg-[#163A22] px-4 text-[12.5px] font-extrabold text-white hover:bg-[#20492C] disabled:opacity-60"
            >
              {submitting ? 'Menyimpan Check-In...' : 'Check-In Attendance'}
            </button>
          </form>
        )}

        {attendance?.check_in_at && !attendance?.check_out_at && (
          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-4">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Check-Out Attendance</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Check-in sudah tersimpan. Ambil 1 foto bukti checkout sebelum pekerjaan ditutup.
              </p>
            </div>
            <div className="rounded-[16px] border border-slate-200 p-3 bg-[#FAFBFC]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12.5px] font-bold text-slate-800">Foto Bukti Checkout</p>
                  <p className="text-[10.5px] text-slate-500 mt-1">
                    {checkoutProofFile ? 'Foto siap' : 'Belum ada foto'}
                  </p>
                </div>
                {checkoutProofFile ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Camera className="w-5 h-5 text-slate-400" />
                )}
              </div>

              <button
                type="button"
                onClick={() => setCameraTarget({ key: 'check_out_photo', label: 'Foto Bukti Checkout' })}
                className="mt-3 w-full h-[40px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:border-[#7BC32C] hover:text-[#163A22] hover:bg-[#EEF8E3]/50 transition"
              >
                <Camera className="w-4 h-4" />
                {checkoutProofFile ? 'Ambil Ulang' : 'Ambil Foto'}
              </button>

              {checkoutProofPreviewUrl && (
                <div className="relative mt-3">
                  <button
                    type="button"
                    onClick={() => handleCheckoutProofChange(null)}
                    className="absolute right-2 top-2 z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition hover:bg-black/80"
                    aria-label="Hapus foto bukti checkout"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <img
                    src={checkoutProofPreviewUrl}
                    alt="Foto bukti checkout"
                    className="h-40 w-full rounded-2xl object-cover"
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleCheckOut}
              disabled={submitting}
              className="w-full h-[42px] rounded-[12px] bg-[#7BC32C] px-4 text-[12.5px] font-extrabold text-[#163A22] hover:bg-[#8CD145] disabled:opacity-60"
            >
              {submitting ? 'Menyimpan Check-Out...' : 'Check-Out Attendance'}
            </button>
          </section>
        )}
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileCameraCapture
        open={Boolean(cameraTarget)}
        title={cameraTarget ? `Ambil ${cameraTarget.label}` : 'Ambil Foto'}
        onClose={() => setCameraTarget(null)}
        onCapture={(file) => {
          const key = cameraTarget?.key;
          setCameraTarget(null);
          if (key === 'check_out_photo') {
            handleCheckoutProofChange(file);
            return;
          }
          if (key) handleFileChange(key, file);
        }}
      />

      <MobileConfirmDialog
        open={photoRequirementAlertOpen}
        title="Check-In Belum Bisa Diproses"
        description="Lengkapi dulu seluruh 4 foto QC yang wajib diisi sebelum melakukan check-in attendance."
        variant="danger"
        confirmLabel="Isi Foto Dulu"
        cancelLabel="Tutup"
        onConfirm={() => setPhotoRequirementAlertOpen(false)}
        onCancel={() => setPhotoRequirementAlertOpen(false)}
        onClose={() => setPhotoRequirementAlertOpen(false)}
      />

      <MobileConfirmDialog
        open={checkoutPhotoRequirementAlertOpen}
        title="Check-Out Belum Bisa Diproses"
        description="Ambil dulu foto bukti checkout sebelum melakukan check-out attendance."
        variant="danger"
        confirmLabel="Isi Foto Dulu"
        cancelLabel="Tutup"
        onConfirm={() => setCheckoutPhotoRequirementAlertOpen(false)}
        onCancel={() => setCheckoutPhotoRequirementAlertOpen(false)}
        onClose={() => setCheckoutPhotoRequirementAlertOpen(false)}
      />
    </div>
  );
}
