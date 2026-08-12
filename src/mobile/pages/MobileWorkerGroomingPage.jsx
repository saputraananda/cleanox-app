import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Lock, Save, Trash2, X } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';

const PHOTO_FIELDS = [
  { key: 'full_body_photo', photoType: 'full_body', label: 'Foto Satu Badan' },
  { key: 'side_photo', photoType: 'side', label: 'Foto Samping' },
  { key: 'back_photo', photoType: 'back', label: 'Foto Belakang' },
  { key: 'hand_photo', photoType: 'hand', label: 'Foto Tangan' },
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

function LihatFotoButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 w-full h-[30px] rounded-[9px] border border-emerald-200 bg-emerald-50 text-emerald-800 text-[10.5px] font-bold tracking-[.02em] flex items-center justify-center gap-1 transition hover:bg-emerald-100 active:scale-[.98]"
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 10s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5z" />
        <circle cx="10" cy="10" r="2.4" />
      </svg>
      Lihat Foto
    </button>
  );
}

export default function MobileWorkerGroomingPage() {
  const [attendance, setAttendance] = useState(null);
  const [groomingComplete, setGroomingComplete] = useState(false);
  const [groomingPhotos, setGroomingPhotos] = useState([]);
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cameraTarget, setCameraTarget] = useState(null);
  const [draftPreviewUrls, setDraftPreviewUrls] = useState({});
  const [savedPreviewUrls, setSavedPreviewUrls] = useState({});
  const [uploadingKey, setUploadingKey] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const draftPreviewUrlsRef = useRef({});
  const savedPreviewUrlsRef = useRef({});

  const hasCheckIn = Boolean(attendance?.check_in_at);
  const showGroomingForm = TEMP_UNLOCK_GROOMING_UI || hasCheckIn;
  const uploadedCount = groomingPhotos.filter((photo) => photo.present).length;
  const requiredCount = PHOTO_FIELDS.length;

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/mobile-attendance/today-status');
      setAttendance(data.attendance || null);
      setGroomingComplete(Boolean(data.grooming_complete));
      setGroomingPhotos(data.grooming_photos || []);

      const nextSaved = {};
      await Promise.all(
        (data.grooming_photos || []).map(async (photo) => {
          const key = resolveGroomingFieldKey(photo);
          if (!key || !photo.present || !photo.path) return;
          try {
            const blobRes = await api.get(normalizePhotoPath(photo.path), { responseType: 'blob' });
            nextSaved[key] = URL.createObjectURL(blobRes.data);
          } catch {
            // preview optional; present tetap dari API
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

  const closePhotoPreview = () => setPhotoPreview(null);

  const openPhotoPreview = async (field) => {
    const draftUrl = draftPreviewUrls[field.key];
    const savedUrl = savedPreviewUrls[field.key];
    if (draftUrl || savedUrl) {
      setPhotoPreview({ url: draftUrl || savedUrl, title: field.label });
      return;
    }

    const photo = groomingPhotos.find((item) => resolveGroomingFieldKey(item) === field.key);
    if (!photo?.present || !photo.path) {
      setError(`Foto ${field.label} belum bisa ditampilkan.`);
      return;
    }

    try {
      const blobRes = await api.get(normalizePhotoPath(photo.path), { responseType: 'blob' });
      const url = URL.createObjectURL(blobRes.data);
      setSavedPreviewUrls((prev) => {
        const next = { ...prev };
        if (next[field.key]?.startsWith?.('blob:')) URL.revokeObjectURL(next[field.key]);
        next[field.key] = url;
        return next;
      });
      setPhotoPreview({ url, title: field.label });
    } catch {
      setError(`Gagal memuat foto ${field.label}.`);
    }
  };

  const uploadOnePhoto = async (field) => {
    const file = files[field.key];
    if (!file) return;
    setError('');
    setSuccess('');
    setUploadingKey(field.key);
    try {
      const formData = new FormData();
      formData.append(field.key, file);
      formData.append('photo_type', field.photoType);
      const { data } = await api.post('/mobile-attendance/grooming', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      handleFileChange(field.key, null);
      setSuccess(
        data.grooming_complete
          ? 'Semua foto grooming lengkap.'
          : `Foto tersimpan (${data.uploaded_count || 0}/${data.required_count || 4}).`
      );
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan foto grooming');
    } finally {
      setUploadingKey(null);
    }
  };

  const confirmDeleteSavedPhoto = async () => {
    if (!deleteTarget?.photoType) return;
    setError('');
    setSuccess('');
    setDeleting(true);
    try {
      const { data } = await api.delete('/mobile-attendance/grooming/photo', {
        data: { photo_type: deleteTarget.photoType },
      });
      handleFileChange(deleteTarget.key, null);
      setSuccess(
        `Foto ${deleteTarget.label} dihapus (${data.uploaded_count || 0}/${data.required_count || 4}).`
      );
      setDeleteTarget(null);
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus foto grooming');
    } finally {
      setDeleting(false);
    }
  };

  const statusLabel = (() => {
    if (!hasCheckIn && !TEMP_UNLOCK_GROOMING_UI) return 'Terkunci';
    if (groomingComplete) return 'Selesai';
    if (uploadedCount > 0) return `In Progress (${uploadedCount}/${requiredCount})`;
    return `Belum mulai (0/${requiredCount})`;
  })();

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
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-extrabold text-slate-900">Status</p>
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  !hasCheckIn && !TEMP_UNLOCK_GROOMING_UI
                    ? 'bg-amber-50 text-amber-700'
                    : groomingComplete
                      ? 'bg-emerald-50 text-emerald-700'
                      : uploadedCount > 0
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                }`}
              >
                {loading ? 'Memuat' : statusLabel}
              </span>
            </div>
            {loading ? (
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : (
              <p className="text-[12.5px] text-slate-600">
                {groomingComplete
                  ? 'Foto grooming hari ini sudah lengkap.'
                  : !hasCheckIn && TEMP_UNLOCK_GROOMING_UI
                    ? 'Lengkapi 4 foto grooming, simpan satu per satu.'
                    : !hasCheckIn
                      ? 'Terkunci'
                      : 'Sudah Foto In. Simpan satu foto per kartu.'}
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

          {!loading && showGroomingForm && PHOTO_FIELDS.map((field) => {
            const draftFile = files[field.key];
            const preview = draftPreviewUrls[field.key] || savedPreviewUrls[field.key];
            const photoMeta = groomingPhotos.find((item) => resolveGroomingFieldKey(item) === field.key);
            const hasSaved = Boolean(photoMeta?.present);
            const uploading = uploadingKey === field.key;
            const showSavedDelete = hasSaved && !draftFile;

            return (
              <div
                key={field.key}
                className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] font-extrabold text-slate-900">{field.label}</p>
                    <p className="text-[10.5px] text-slate-500 mt-1">
                      {uploading
                        ? 'Mengunggah...'
                        : draftFile
                          ? 'Foto baru siap disimpan'
                          : hasSaved
                            ? 'Sudah ada foto'
                            : 'Belum ada foto'}
                    </p>
                  </div>
                  {draftFile || hasSaved ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Camera className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  )}
                </div>

                <button
                  type="button"
                  disabled={Boolean(uploadingKey) || deleting}
                  onClick={() => setCameraTarget({ key: field.key, label: field.label })}
                  className="mt-3 w-full h-[40px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:border-[#7BC32C] hover:text-[#163A22] hover:bg-[#EEF8E3]/50 transition disabled:opacity-60"
                >
                  <Camera className="w-4 h-4" />
                  {draftFile || hasSaved || preview ? 'Ambil Ulang' : 'Ambil Foto'}
                </button>

                {preview && (
                  <div className="relative mt-3">
                    {draftFile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileChange(field.key, null);
                        }}
                        className="absolute right-2 top-2 z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg"
                        aria-label={`Hapus draft ${field.label}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openPhotoPreview(field)}
                      className="block w-full text-left"
                    >
                      <img
                        src={preview}
                        alt={field.label}
                        className="h-40 w-full rounded-2xl object-cover"
                      />
                    </button>
                  </div>
                )}

                {(preview || hasSaved) ? (
                  <LihatFotoButton onClick={() => openPhotoPreview(field)} />
                ) : null}

                {draftFile && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={uploading || deleting}
                      onClick={() => handleFileChange(field.key, null)}
                      className="inline-flex h-[40px] items-center justify-center gap-1.5 rounded-[12px] border border-rose-200 bg-rose-50 px-3 text-[12px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" />
                      Hapus
                    </button>
                    <button
                      type="button"
                      disabled={uploading || deleting}
                      onClick={() => uploadOnePhoto(field)}
                      className="inline-flex h-[40px] items-center justify-center gap-1.5 rounded-[12px] bg-[#163A22] px-3 text-[12px] font-bold text-white transition hover:bg-[#20492C] disabled:opacity-60"
                    >
                      <Save className="w-4 h-4" />
                      {uploading ? 'Menyimpan...' : 'Simpan Foto'}
                    </button>
                  </div>
                )}

                {showSavedDelete && (
                  <button
                    type="button"
                    disabled={deleting || Boolean(uploadingKey)}
                    onClick={() =>
                      setDeleteTarget({
                        key: field.key,
                        label: field.label,
                        photoType: field.photoType,
                      })
                    }
                    className="mt-3 w-full inline-flex h-[40px] items-center justify-center gap-1.5 rounded-[12px] border border-rose-200 bg-rose-50 px-3 text-[12px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    Hapus Foto
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileCameraCapture
        open={Boolean(cameraTarget)}
        title={cameraTarget ? `Ambil ${cameraTarget.label}` : 'Ambil Foto'}
        variant="ikm"
        initialFacingMode="user"
        confirmLabel="Ambil Foto"
        includeLocation={false}
        onClose={() => setCameraTarget(null)}
        onCapture={(file) => {
          const key = cameraTarget?.key;
          setCameraTarget(null);
          if (key) handleFileChange(key, file);
        }}
      />

      {photoPreview ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/75 px-3 py-4"
          onClick={closePhotoPreview}
        >
          <div
            className="w-full max-w-[430px] max-h-[calc(100dvh-24px)] bg-white rounded-[18px] overflow-hidden shadow-[0_12px_60px_rgba(0,0,0,.35)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-[13px] font-extrabold text-slate-900 truncate pr-3">
                {photoPreview.title || 'Foto Grooming'}
              </div>
              <button
                type="button"
                className="w-9 h-9 rounded-[12px] grid place-items-center border border-slate-200 bg-white text-slate-600"
                onClick={closePhotoPreview}
                aria-label="Tutup"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
            <div className="p-3 sm:p-4 overflow-y-auto">
              <div className="rounded-[16px] overflow-hidden bg-slate-100 border border-slate-200">
                <img
                  src={photoPreview.url}
                  alt={photoPreview.title || 'Foto grooming'}
                  className="w-full h-auto max-h-[72dvh] object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <MobileConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Foto Grooming?"
        description={
          deleteTarget
            ? `Foto ${deleteTarget.label} akan dihapus dari program dan file.`
            : ''
        }
        variant="danger"
        confirmLabel={deleting ? 'Menghapus...' : 'Ya, Hapus'}
        cancelLabel="Batal"
        busy={deleting}
        onConfirm={confirmDeleteSavedPhoto}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
