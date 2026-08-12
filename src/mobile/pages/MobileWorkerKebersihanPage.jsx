import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Lock, Save, Sparkles, Trash2, X } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';

const SESSIONS = [
  { key: 'pagi', label: 'Pagi', hint: '07:00 – 09:00 WIB' },
  { key: 'sore', label: 'Sore', hint: '09:01 – 19:00 WIB' },
];

/** TEMP: bypass jam/grooming lock sesi pagi di UI — set false untuk lock kembali */
const TEMP_BYPASS_KEBERSIHAN_PAGI_LOCK = true;

function initialSessionFromSearch(searchParams) {
  const raw = String(searchParams.get('session') || '').toLowerCase();
  return raw === 'sore' || raw === 'pagi' ? raw : 'pagi';
}

export default function MobileWorkerKebersihanPage() {
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(() => initialSessionFromSearch(searchParams));
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadingAreaId, setUploadingAreaId] = useState(null);
  const [previewMap, setPreviewMap] = useState({});
  const [draftFilesMap, setDraftFilesMap] = useState({});
  const [draftPreviewMap, setDraftPreviewMap] = useState({});
  const [cameraTarget, setCameraTarget] = useState(null);
  const previewMapRef = useRef({});
  const draftPreviewMapRef = useRef({});

  const windowAllowed =
    Boolean(status?.window?.allowed) ||
    (TEMP_BYPASS_KEBERSIHAN_PAGI_LOCK && session === 'pagi');
  const groomingLocked =
    session === 'pagi' &&
    Boolean(status?.grooming_lock?.locked) &&
    !TEMP_BYPASS_KEBERSIHAN_PAGI_LOCK;
  const canCapture = windowAllowed && !groomingLocked;

  const clearDraftForArea = (areaId) => {
    setDraftFilesMap((prev) => {
      if (!(areaId in prev)) return prev;
      const next = { ...prev };
      delete next[areaId];
      return next;
    });
    setDraftPreviewMap((prev) => {
      const next = { ...prev };
      const existing = next[areaId];
      if (typeof existing === 'string' && existing.startsWith('blob:')) URL.revokeObjectURL(existing);
      delete next[areaId];
      return next;
    });
  };

  const clearAllDrafts = () => {
    setDraftFilesMap({});
    setDraftPreviewMap((prev) => {
      Object.values(prev).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      return {};
    });
  };

  const loadStatus = useCallback(async (sessionKey) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/mobile-kebersihan/today-status?session=${sessionKey}`);
      setStatus(data);

      const nextPreviews = {};
      await Promise.all(
        (data.areas || []).map(async (area) => {
          if (!area.photo?.photo_path) return;
          try {
            const rawPath = String(area.photo.photo_path || '')
              .replace(/^\/api/, '')
              .replace(/^\//, '');
            const blobRes = await api.get(rawPath, { responseType: 'blob' });
            nextPreviews[area.area_id] = URL.createObjectURL(blobRes.data);
          } catch {
            // preview optional
          }
        })
      );
      setPreviewMap((prev) => {
        Object.values(prev).forEach((url) => {
          if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        return nextPreviews;
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat status kebersihan');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    previewMapRef.current = previewMap;
  }, [previewMap]);

  useEffect(() => {
    draftPreviewMapRef.current = draftPreviewMap;
  }, [draftPreviewMap]);

  useEffect(() => {
    clearAllDrafts();
    setSuccess('');
    loadStatus(session);
  }, [session, loadStatus]);

  useEffect(() => {
    return () => {
      Object.values(previewMapRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      Object.values(draftPreviewMapRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const statusLabel = (() => {
    if (!status) return '—';
    if (status.status === 'Completed') return 'Selesai';
    if (status.status === 'In_Progress') {
      return `In Progress (${status.uploaded_count}/${status.required_count})`;
    }
    return 'Belum mulai';
  })();

  const uploadAreaPhoto = async (areaId, file) => {
    if (!file) return;
    setError('');
    setSuccess('');
    setUploadingAreaId(areaId);

    try {
      const formData = new FormData();
      formData.append('area_id', String(areaId));
      formData.append('session', session);
      formData.append('photo', file);
      const { data } = await api.post('/mobile-kebersihan/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess(
        data.status === 'Completed'
          ? `Semua area lengkap. Kebersihan ${session} selesai.`
          : `Foto tersimpan (${data.uploaded_count}/4).`
      );
      clearDraftForArea(areaId);
      await loadStatus(session);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunggah foto kebersihan');
    } finally {
      setUploadingAreaId(null);
    }
  };

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
                <div className="text-[14px] font-extrabold text-white truncate">Kebersihan</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">
                  Pagi & sore · 4 area
                </div>
              </div>
            </div>
            <div className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>
          )}

          <section className="rounded-[18px] bg-white p-3 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200">
            <div className="grid grid-cols-2 gap-2">
              {SESSIONS.map((item) => {
                const active = session === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSession(item.key)}
                    className={`rounded-[14px] border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-[#163A22] bg-[#EEF8E3]'
                        : 'border-slate-200 bg-[#FAFBFC]'
                    }`}
                  >
                    <div className={`text-[13px] font-extrabold ${active ? 'text-[#163A22]' : 'text-slate-700'}`}>
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.hint}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-extrabold text-slate-900">
                  Status {session === 'pagi' ? 'Pagi' : 'Sore'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">{status?.report_date || '—'}</p>
              </div>
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  groomingLocked
                    ? 'bg-amber-50 text-amber-700'
                    : status?.status === 'Completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : status?.status === 'In_Progress'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                }`}
              >
                {groomingLocked ? 'Terkunci' : statusLabel}
              </span>
            </div>
            {groomingLocked ? (
              <p className="text-[12.5px] text-slate-600">Terkunci</p>
            ) : (
              <>
                <p className="text-[11px] text-slate-500">
                  Jam sesi: <b className="text-slate-700">{status?.window?.label || '—'}</b>
                </p>
                {status?.submitted_by?.full_name && (
                  <p className="text-[11px] text-slate-500">
                    Pengirim terakhir:{' '}
                    <b className="text-slate-700">{status.submitted_by.full_name}</b>
                  </p>
                )}
              </>
            )}
            {!groomingLocked && !windowAllowed && status?.window?.reason && (
              <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex gap-2">
                <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{status.window.reason}. Foto yang sudah diambil tetap bisa dilihat.</span>
              </div>
            )}
          </section>

          {!loading && groomingLocked && (
            <section className="rounded-[18px] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-600 grid place-items-center">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-[14px] font-extrabold text-slate-900">Terkunci</p>
              <p className="text-[12px] text-slate-500 leading-relaxed">
                {status?.grooming_lock?.reason ||
                  'Silakan lengkapi foto grooming terlebih dahulu untuk mengakses kebersihan pagi.'}
              </p>
              <Link
                to="/mobile-worker/grooming"
                className="inline-flex h-[40px] items-center justify-center rounded-[12px] bg-[#163A22] px-4 text-[12.5px] font-extrabold text-white"
              >
                Ke Foto Grooming
              </Link>
            </section>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 px-1 py-6 text-center">Memuat area kebersihan...</p>
          ) : groomingLocked ? null : (
            (status?.areas || []).map((area) => {
              const savedPreview = previewMap[area.area_id];
              const draftPreview = draftPreviewMap[area.area_id];
              const preview = draftPreview || savedPreview;
              const draftFile = draftFilesMap[area.area_id];
              const done = Boolean(area.photo);
              const uploading = uploadingAreaId === area.area_id;

              return (
                <div
                  key={`${session}-${area.area_id}`}
                  className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12.5px] font-extrabold text-slate-900">{area.name}</p>
                      <p className="text-[10.5px] text-slate-500 mt-1">
                        {uploading
                          ? 'Mengunggah...'
                          : draftFile
                            ? 'Foto baru siap disimpan'
                            : done
                              ? 'Sudah ada foto'
                              : 'Belum ada foto'}
                      </p>
                    </div>
                    {draftFile || done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    )}
                  </div>

                  {canCapture && (
                    <button
                      type="button"
                      disabled={Boolean(uploadingAreaId)}
                      onClick={() =>
                        setCameraTarget({ areaId: area.area_id, areaName: area.name || 'Area' })
                      }
                      className="mt-3 w-full h-[40px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:border-[#7BC32C] hover:text-[#163A22] hover:bg-[#EEF8E3]/50 transition disabled:opacity-60"
                    >
                      <Camera className="w-4 h-4" />
                      {draftFile || done || savedPreview ? 'Ambil Ulang' : 'Ambil Foto'}
                    </button>
                  )}

                  {preview && (
                    <div className="relative mt-3">
                      {draftFile && canCapture && (
                        <button
                          type="button"
                          onClick={() => clearDraftForArea(area.area_id)}
                          className="absolute right-2 top-2 z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition hover:bg-black/80"
                          aria-label={`Hapus draft foto ${area.name}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <img
                        src={preview}
                        alt={area.name}
                        className="h-40 w-full rounded-2xl object-cover"
                      />
                    </div>
                  )}

                  {draftFile && canCapture && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => clearDraftForArea(area.area_id)}
                        className="inline-flex h-[40px] items-center justify-center gap-1.5 rounded-[12px] border border-rose-200 bg-rose-50 px-3 text-[12px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        <Trash2 className="w-4 h-4" />
                        Hapus
                      </button>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => uploadAreaPhoto(area.area_id, draftFile)}
                        className="inline-flex h-[40px] items-center justify-center gap-1.5 rounded-[12px] bg-[#163A22] px-3 text-[12px] font-bold text-white transition hover:bg-[#20492C] disabled:opacity-60"
                      >
                        <Save className="w-4 h-4" />
                        {uploading ? 'Menyimpan...' : 'Simpan Foto'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileCameraCapture
        open={Boolean(cameraTarget)}
        title={cameraTarget ? `Ambil Foto ${cameraTarget.areaName}` : 'Ambil Foto'}
        onClose={() => setCameraTarget(null)}
        onCapture={async (file) => {
          const areaId = cameraTarget?.areaId;
          setCameraTarget(null);
          if (!areaId || !file || !canCapture) return;
          setDraftFilesMap((prev) => ({ ...prev, [areaId]: file }));
          setDraftPreviewMap((prev) => {
            const next = { ...prev };
            const prevUrl = next[areaId];
            if (typeof prevUrl === 'string' && prevUrl.startsWith('blob:')) URL.revokeObjectURL(prevUrl);
            next[areaId] = URL.createObjectURL(file);
            return next;
          });
        }}
      />
    </div>
  );
}
