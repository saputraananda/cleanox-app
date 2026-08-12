import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Lock, X } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';

const PHOTO_FIELDS = [
  { key: 'full_body_photo', label: 'Foto Satu Badan' },
  { key: 'side_photo', label: 'Foto Samping' },
  { key: 'back_photo', label: 'Foto Belakang' },
  { key: 'hand_photo', label: 'Foto Tangan' },
];

/** TEMP: buka UI upload tanpa absensi — set false untuk lock kembali */
const TEMP_UNLOCK_GROOMING_UI = false;

function normalizePhotoPath(path) {
  return String(path || '')
    .replace(/^\/api/, '')
    .replace(/^\//, '');
}

function resolveGroomingFieldKey(photo) {
  if (photo?.field && PHOTO_FIELDS.some((f) => f.key === photo.field)) return photo.field;
  if (photo?.photo_type) {
    const key = `${photo.photo_type}_photo`;
    if (PHOTO_FIELDS.some((f) => f.key === key)) return key;
  }
  return null;
}

function revokeBlobUrls(map) {
  Object.values(map || {}).forEach((url) => {
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
  });
}

export default function MobileWorkerGroomingPage() {
  const [attendance, setAttendance] = useState(null);
  const [groomingComplete, setGroomingComplete] = useState(false);
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [photoRequirementAlertOpen, setPhotoRequirementAlertOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [draftPreviewUrls, setDraftPreviewUrls] = useState({});
  const [savedPreviewUrls, setSavedPreviewUrls] = useState({});
  const draftPreviewUrlsRef = useRef({});
  const savedPreviewUrlsRef = useRef({});

  const hasCheckIn = Boolean(attendance?.check_in_at);
  const showGroomingForm = TEMP_UNLOCK_GROOMING_UI || hasCheckIn;

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/mobile-attendance/today-status');
      setAttendance(data.attendance || null);
      setGroomingComplete(Boolean(data.grooming_complete));

      const nextSaved = {};
      await Promise.all(
        (data.grooming_photos || []).map(async (photo) => {
          const key = resolveGroomingFieldKey(photo);
          if (!key || !photo.present || !photo.path) return;
          try {
            const blobRes = await api.get(normalizePhotoPath(photo.path), { responseType: 'blob' });
            nextSaved[key] = URL.createObjectURL(blobRes.data);
          } catch {
            // preview optional
          }
        })
      );

      setSavedPreviewUrls((prev) => {
        revokeBlobUrls(prev);
        return nextSaved;
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat status grooming');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const allPhotosSelected = useMemo(
    () => PHOTO_FIELDS.every((field) => files[field.key]),
    [files]
  );

  const handleFileChange = (key, file) => {
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[key] = file;
      else delete next[key];
      return next;
    });
    setDraftPreviewUrls((prev) => {
      const next = { ...prev };
      if (prev[key]?.startsWith?.('blob:')) URL.revokeObjectURL(prev[key]);
      if (file) next[key] = URL.createObjectURL(file);
      else delete next[key];
      return next;
    });
  };

  useEffect(() => {
    draftPreviewUrlsRef.current = draftPreviewUrls;
  }, [draftPreviewUrls]);

  useEffect(() => {
    savedPreviewUrlsRef.current = savedPreviewUrls;
  }, [savedPreviewUrls]);

  useEffect(() => {
    return () => {
      revokeBlobUrls(draftPreviewUrlsRef.current);
      revokeBlobUrls(savedPreviewUrlsRef.current);
    };
  }, []);

  const handleSubmit = async (e) => {
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

      await api.post('/mobile-attendance/grooming', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Foto grooming berhasil disimpan.');
      setFiles({});
      setDraftPreviewUrls((prev) => {
        revokeBlobUrls(prev);
        return {};
      });
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan foto grooming');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-slate-50 flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div
          className="relative overflow-hidden rounded-b-[28px] flex-shrink-0 pb-4"
          style={{ background: 'linear-gradient(180deg, #163A22 0%, #20492C 58%, #295733 100%)' }}
        >
          <div className="relative z-[1] flex items-center gap-2.5 px-[18px] pt-[14px]">
            <Link
              to="/mobile-worker"
              className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold text-white truncate">Foto Grooming</div>
              <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">4 foto setelah Foto In</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 sm:pt-[14px] pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-2">
            <p className="text-[14px] font-extrabold text-slate-900">Status</p>
            {loading ? (
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : (
              <p className="text-[12.5px] text-slate-600">
                {groomingComplete
                  ? 'Foto grooming hari ini sudah lengkap.'
                  : !hasCheckIn && TEMP_UNLOCK_GROOMING_UI
                    ? 'Lengkapi 4 foto grooming.'
                    : !hasCheckIn
                      ? 'Terkunci'
                      : 'Sudah Foto In. Lengkapi 4 foto grooming.'}
              </p>
            )}
          </section>

          {!loading && !showGroomingForm && (
            <section className="rounded-[18px] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-600 grid place-items-center">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-[14px] font-extrabold text-slate-900">Terkunci</p>
              <p className="text-[12px] text-slate-500 leading-relaxed">
                Silakan lakukan absensi terlebih dahulu untuk mengakses foto grooming.
              </p>
              <Link
                to="/mobile-worker/attendance"
                className="inline-flex h-[40px] items-center justify-center rounded-[12px] bg-[#163A22] px-4 text-[12.5px] font-extrabold text-white"
              >
                Ke Absensi
              </Link>
            </section>
          )}

          {!loading && showGroomingForm && (
            <form onSubmit={handleSubmit} className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-4">
              <div>
                <p className="text-[14px] font-extrabold text-slate-900">4 Foto Grooming</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ambil dari kamera. Boleh diisi sebelum atau sesudah check-out.
                </p>
              </div>

              <div className="space-y-3">
                {PHOTO_FIELDS.map((field) => {
                  const draftFile = files[field.key];
                  const preview = draftPreviewUrls[field.key] || savedPreviewUrls[field.key];
                  const hasSaved = Boolean(savedPreviewUrls[field.key]);

                  return (
                    <div key={field.key} className="rounded-[16px] border border-slate-200 p-3 bg-[#FAFBFC]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[12.5px] font-bold text-slate-800">{field.label}</p>
                          <p className="text-[10.5px] text-slate-500 mt-1">
                            {draftFile
                              ? 'Foto siap'
                              : hasSaved || preview
                                ? 'Sudah ada foto'
                                : 'Belum ada foto'}
                          </p>
                        </div>
                        {draftFile || hasSaved || preview ? (
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
                        {draftFile || hasSaved || preview ? 'Ambil Ulang' : 'Ambil Foto'}
                      </button>

                      {preview && (
                        <div className="relative mt-3">
                          {draftFile && (
                            <button
                              type="button"
                              onClick={() => handleFileChange(field.key, null)}
                              className="absolute right-2 top-2 z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg"
                              aria-label={`Hapus ${field.label}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <img
                            src={preview}
                            alt={field.label}
                            className="h-40 w-full rounded-2xl object-cover"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-[42px] rounded-[12px] bg-[#163A22] px-4 text-[12.5px] font-extrabold text-white hover:bg-[#20492C] disabled:opacity-60"
              >
                {submitting
                  ? 'Menyimpan...'
                  : groomingComplete
                    ? 'Perbarui Foto Grooming'
                    : 'Simpan Foto Grooming'}
              </button>
            </form>
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
          if (key) handleFileChange(key, file);
        }}
      />

      <MobileConfirmDialog
        open={photoRequirementAlertOpen}
        title="Foto Belum Lengkap"
        description="Lengkapi dulu seluruh 4 foto grooming sebelum menyimpan."
        variant="danger"
        confirmLabel="Isi Foto Dulu"
        cancelLabel="Tutup"
        onConfirm={() => setPhotoRequirementAlertOpen(false)}
        onCancel={() => setPhotoRequirementAlertOpen(false)}
        onClose={() => setPhotoRequirementAlertOpen(false)}
      />
    </div>
  );
}
