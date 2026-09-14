import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Play } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';
import { resolvePhotoUploadError } from '@mobile/utils/photoUploadError.js';

const STATUS_LABEL = {
  Assigned: 'Perlu Konfirmasi',
  In_Schedule: 'Terjadwal',
  On_Progress: 'Sedang Dikerjakan',
  Done: 'Selesai',
  Cancelled: 'Dibatalkan',
};

const formatDate = (start, end, time) => {
  if (!start) return '-';
  const startLabel = new Date(`${start}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  if (!end || end === start) return time ? `${startLabel} · ${time}` : startLabel;
  const endLabel = new Date(`${end}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
};

export default function MobileWorkerAgendaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadTask = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/mobile-agenda/${id}`);
      setTask(data.task || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat agenda');
      setTask(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTask();
  }, [id]);

  const runAccept = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/mobile-agenda/${id}/accept`);
      setTask(data.task);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal konfirmasi');
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const runComplete = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/mobile-agenda/${id}/complete`);
      setTask(data.task);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyelesaikan');
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const handleCameraCapture = async (file, meta = {}) => {
    if (!cameraTarget || !file) return;
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('photo', file, 'photo.jpg');
      if (cameraTarget.type === 'start') {
        if (meta?.latitude != null) formData.append('latitude', String(meta.latitude));
        if (meta?.longitude != null) formData.append('longitude', String(meta.longitude));
        const { data } = await api.post(`/mobile-agenda/${id}/start`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setTask(data.task);
      } else {
        const { data } = await api.post(
          `/mobile-agenda/${id}/items/${cameraTarget.itemId}/${cameraTarget.kind}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setTask(data.task);
      }
      setCameraTarget(null);
    } catch (err) {
      setError(resolvePhotoUploadError(err) || err.response?.data?.message || 'Upload gagal');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
        <div className="w-full max-w-[430px] min-h-[100dvh] bg-[#F7F8F5] flex flex-col relative">
          <div className="p-4 text-sm text-slate-500">Memuat agenda...</div>
          <MobileWorkerBottomNav />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
        <div className="w-full max-w-[430px] min-h-[100dvh] bg-[#F7F8F5] flex flex-col relative p-4 space-y-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali
          </button>
          <p className="text-sm text-rose-600">{error || 'Agenda tidak ditemukan'}</p>
          <MobileWorkerBottomNav />
        </div>
      </div>
    );
  }

  const agenda = task.agenda || {};
  const statusLabel = STATUS_LABEL[task.assignment_status] || task.assignment_status;

  return (
    <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-[#F7F8F5] flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div
          className="relative overflow-hidden rounded-b-[28px] flex-shrink-0 pb-[18px]"
          style={{ background: 'linear-gradient(180deg, #5B21B6 0%, #6D28D9 55%, #7C3AED 100%)' }}
        >
          <div className="relative z-[1] flex items-center gap-2.5 px-[18px] pt-[14px]">
            <button
              type="button"
              onClick={() => navigate('/mobile-worker/tasks')}
              className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold text-white truncate">Detail Agenda</div>
              <div className="text-[10.5px] text-white/60 font-medium truncate mt-px">
                {agenda.name || 'Agenda'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] space-y-3">
          {error && (
            <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          <div className="rounded-[22px] border border-violet-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)] space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold text-slate-900 truncate">
                  {agenda.name || 'Agenda'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  AGD-{agenda.id || id} · {formatDate(agenda.start_date, agenda.end_date, agenda.agenda_time)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {statusLabel}
                </span>
                <span className="rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 text-[10px] font-bold">
                  Agenda
                </span>
              </div>
            </div>

            <div className="rounded-[14px] border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11.5px] text-slate-600 space-y-1">
              <div>Lokasi: {agenda.location || '—'}</div>
              <div>Hari: {agenda.day_label || '—'}</div>
              <div>Catatan: {agenda.notes || '—'}</div>
              <div className="pt-1 font-bold text-slate-700">Item layanan</div>
              {(task.items || []).length === 0 ? (
                <div>—</div>
              ) : (
                (task.items || []).map((item) => (
                  <div key={item.id}>
                    {item.service_name} × {item.qty}
                    {item.meter != null ? ` · Meter ${item.meter}` : ''}
                  </div>
                ))
              )}
            </div>

            {task.assignment_status === 'Assigned' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmAction('accept')}
                className="w-full h-[40px] rounded-[12px] bg-[#7C3AED] text-white text-[12px] font-extrabold disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Terima
              </button>
            )}

            {task.assignment_status === 'In_Schedule' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setCameraTarget({ type: 'start' })}
                className="w-full h-[40px] rounded-[12px] bg-[#7C3AED] text-white text-[12px] font-extrabold disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                <Play className="w-4 h-4" />
                Mulai + Foto Kedatangan
              </button>
            )}

            {task.assignment_status === 'On_Progress' && (
              <div className="space-y-3">
                {(task.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[14px] border border-slate-200 bg-[#FAFBFC] p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-extrabold text-slate-900">{item.service_name}</p>
                        <p className="text-[10.5px] text-slate-500">
                          Qty {item.qty}
                          {item.meter != null ? ` · Meter ${item.meter}` : ''}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.evidence?.is_complete
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {item.evidence?.is_complete ? 'Lengkap' : 'Belum lengkap'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setCameraTarget({ type: 'item', itemId: item.id, kind: 'before' })
                        }
                        className="h-[36px] rounded-[10px] border border-violet-200 bg-white text-violet-700 text-[11px] font-bold disabled:opacity-60"
                      >
                        <Camera className="mr-1 inline h-3.5 w-3.5" />
                        Before ({item.evidence?.before_photos?.length || 0})
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setCameraTarget({ type: 'item', itemId: item.id, kind: 'after' })
                        }
                        className="h-[36px] rounded-[10px] border border-violet-200 bg-white text-violet-700 text-[11px] font-bold disabled:opacity-60"
                      >
                        <Camera className="mr-1 inline h-3.5 w-3.5" />
                        After ({item.evidence?.after_photos?.length || 0})
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  disabled={busy || !task.can_complete}
                  onClick={() => setConfirmAction('complete')}
                  className="w-full h-[40px] rounded-[12px] bg-emerald-600 text-white text-[12px] font-extrabold disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Selesaikan
                </button>
              </div>
            )}
          </div>
        </div>

        <MobileConfirmDialog
          open={Boolean(confirmAction)}
          title={confirmAction === 'accept' ? 'Terima agenda?' : 'Selesaikan agenda?'}
          description={
            confirmAction === 'accept'
              ? 'Status menjadi Terjadwal setelah konfirmasi.'
              : 'Pastikan before/after semua item sudah lengkap.'
          }
          confirmLabel={confirmAction === 'accept' ? 'Terima' : 'Selesai'}
          busy={busy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmAction === 'accept' ? runAccept : runComplete}
        />

        <MobileCameraCapture
          open={Boolean(cameraTarget)}
          title={
            cameraTarget?.type === 'start' ? 'Foto kedatangan' : `Foto ${cameraTarget?.kind || ''}`
          }
          includeLocation={cameraTarget?.type === 'start'}
          onClose={() => setCameraTarget(null)}
          onCapture={handleCameraCapture}
        />

        <MobileWorkerBottomNav />
      </div>
    </div>
  );
}
