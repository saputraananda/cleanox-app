import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Play } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';
import { resolvePhotoUploadError } from '@mobile/utils/photoUploadError.js';

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
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="p-4 text-sm text-slate-500">Memuat agenda...</div>
        <MobileWorkerBottomNav />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24 p-4 space-y-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        <p className="text-sm text-rose-600">{error || 'Agenda tidak ditemukan'}</p>
        <MobileWorkerBottomNav />
      </div>
    );
  }

  const agenda = task.agenda || {};

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/mobile-worker/tasks')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Agenda
        </button>
      </div>

      <div className="space-y-3 p-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Agenda</p>
          <h1 className="mt-1 text-lg font-extrabold text-slate-900">{agenda.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{agenda.location}</p>
          <p className="mt-1 text-xs text-slate-500">
            {agenda.day_label} · {formatDate(agenda.start_date, agenda.end_date, agenda.agenda_time)}
          </p>
          <p className="mt-2 text-xs font-semibold text-violet-700">Status: {task.assignment_status}</p>
        </div>

        {agenda.notes && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">Catatan</p>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{agenda.notes}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">Item Service</p>
          {(task.items || []).map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.service_name}</p>
                  <p className="text-xs text-slate-500">
                    Qty {item.qty}
                    {item.meter != null ? ` · Meter ${item.meter}` : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    item.evidence?.is_complete
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {item.evidence?.is_complete ? 'Lengkap' : 'Belum lengkap'}
                </span>
              </div>
              {task.assignment_status === 'On_Progress' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCameraTarget({ type: 'item', itemId: item.id, kind: 'before' })}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    <Camera className="mr-1 inline h-3.5 w-3.5" />
                    Before ({item.evidence?.before_photos?.length || 0})
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCameraTarget({ type: 'item', itemId: item.id, kind: 'after' })}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    <Camera className="mr-1 inline h-3.5 w-3.5" />
                    After ({item.evidence?.after_photos?.length || 0})
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {task.assignment_status === 'Assigned' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmAction('accept')}
              className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white"
            >
              Terima Agenda
            </button>
          )}
          {task.assignment_status === 'In_Schedule' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setCameraTarget({ type: 'start' })}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              <Play className="h-4 w-4" /> Mulai + Foto Kedatangan
            </button>
          )}
          {task.assignment_status === 'On_Progress' && (
            <button
              type="button"
              disabled={busy || !task.can_complete}
              onClick={() => setConfirmAction('complete')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Selesaikan Agenda
            </button>
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
  );
}
