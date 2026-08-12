import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, ClipboardList, Play, X, XCircle } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';

const MAX_PHOTOS_PER_KIND = 10;

const TABS = [
  { key: 'Assigned', label: 'Perlu Konfirmasi' },
  { key: 'In_Schedule', label: 'Terjadwal' },
  { key: 'On_Progress', label: 'Sedang Dikerjakan' },
  { key: 'Done', label: 'Selesai' },
  { key: 'Rejected', label: 'Ditolak' },
];

const STATUS_LABEL = {
  Assigned: 'Perlu Konfirmasi',
  In_Schedule: 'Terjadwal',
  On_Progress: 'Sedang Dikerjakan',
  Done: 'Selesai',
  Rejected: 'Ditolak',
  Replaced: 'Digantikan',
};

const CONFIRM_COPY = {
  accept: {
    title: 'Terima tugas?',
    description: 'Status menjadi Terjadwal setelah Anda konfirmasi.',
    confirmLabel: 'Terima',
  },
  start: {
    title: 'Mulai pengerjaan?',
    description: 'Ambil foto kedatangan beserta lokasi GPS untuk lanjut ke Sedang Dikerjakan.',
    confirmLabel: 'Lanjut Ambil Foto',
  },
  start_takehome: {
    title: 'Ambil order take-home?',
    description: 'Setelah diambil, isi foto stage: Diambil → Dicuci → Packing → Diantar → Pengantaran.',
    confirmLabel: 'Ambil',
  },
  complete: {
    title: 'Selesaikan tugas?',
    description: 'Pastikan bukti dan survey sudah lengkap.',
    confirmLabel: 'Selesai',
  },
  complete_takehome: {
    title: 'Selesaikan tugas take-home?',
    description: 'Pastikan 5 stage take-home dan survey sudah lengkap.',
    confirmLabel: 'Selesai',
  },
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const evidenceOf = (task) => task?.evidence || {};
const serviceModeOf = (task) =>
  task?.service_mode || task?.transaction?.service_mode || 'home_service';
const isTakeHomeTask = (task) => serviceModeOf(task) === 'take_home';

const collectEvidencePhotos = (taskList = []) => {
  const map = new Map();
  for (const task of taskList) {
    const evidence = evidenceOf(task);
    for (const photo of [...(evidence.before_photos || []), ...(evidence.after_photos || [])]) {
      if (photo?.id && photo?.photo_path) {
        map.set(String(photo.id), photo.photo_path);
      }
    }
    for (const stage of evidence.takehome?.stages || task.takehome?.stages || []) {
      if (stage?.photo_path) {
        map.set(`takehome-${stage.key}`, stage.photo_path);
      }
    }
    for (const photo of task.customer_photos || []) {
      if (photo?.id && photo?.photo_path) {
        map.set(`customer-${photo.id}`, photo.photo_path);
      }
    }
    if (evidence.arrival_photo_path && task.assignment_id) {
      map.set(`arrival-${task.assignment_id}`, evidence.arrival_photo_path);
    }
  }
  return map;
};

function normalizePhotoPath(path) {
  return String(path || '')
    .replace(/^\/api/, '')
    .replace(/^\//, '');
}

function LihatFotoButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1.5 w-full h-[30px] rounded-[9px] border border-[#163A22] bg-[#163A22] text-white text-[10.5px] font-bold tracking-[.02em] flex items-center justify-center gap-1 transition hover:bg-[#20492C] active:scale-[.98]"
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 10s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5z" />
        <circle cx="10" cy="10" r="2.4" />
      </svg>
      Lihat Foto
    </button>
  );
}

export default function MobileWorkerTasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.tab || 'Assigned');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.surveySaved ? 'Survei kepuasan tersimpan.' : '');
  const [expandedId, setExpandedId] = useState(null);
  const [detailMap, setDetailMap] = useState({});
  const [rejectingId, setRejectingId] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [rejectForm, setRejectForm] = useState({ note: '', recommended_employee_id: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [evidenceAlert, setEvidenceAlert] = useState(null);
  const [photoPreviewMap, setPhotoPreviewMap] = useState({});
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoPreviewMapRef = useRef({});

  const refreshPhotoPreviews = async (taskList) => {
    const needed = collectEvidencePhotos(taskList);
    const next = {};
    await Promise.all(
      [...needed.entries()].map(async ([photoId, photoPath]) => {
        try {
          const rawPath = String(photoPath || '')
            .replace(/^\/api/, '')
            .replace(/^\//, '');
          const blobRes = await api.get(rawPath, { responseType: 'blob' });
          next[photoId] = URL.createObjectURL(blobRes.data);
        } catch {
          // preview optional
        }
      })
    );
    setPhotoPreviewMap((prev) => {
      Object.values(prev).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      return next;
    });
  };

  const loadTasks = async (status = tab) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/mobile-tasks', { params: { status } });
      const nextTasks = data.tasks || [];
      setTasks(nextTasks);
      await refreshPhotoPreviews(nextTasks);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat daftar task');
      setTasks([]);
      await refreshPhotoPreviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location.state?.tab || location.state?.surveySaved) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  useEffect(() => {
    photoPreviewMapRef.current = photoPreviewMap;
  }, [photoPreviewMap]);

  useEffect(() => {
    loadTasks(tab);
    return () => {
      Object.values(photoPreviewMapRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [tab]);

  const loadDetail = async (assignmentId, force = false) => {
    if (!force && detailMap[assignmentId]) return;
    try {
      const { data } = await api.get(`/mobile-tasks/${assignmentId}`);
      setDetailMap((prev) => ({
        ...prev,
        [assignmentId]: {
          task: data.task || null,
          items: data.items || [],
        },
      }));
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail task');
    }
  };

  const toggleExpand = async (assignmentId) => {
    const next = expandedId === assignmentId ? null : assignmentId;
    setExpandedId(next);
    if (next) await loadDetail(next);
  };

  const requestAccept = (assignmentId) => {
    setConfirmDialog({ type: 'accept', assignmentId });
  };

  const requestStart = (assignmentId) => {
    const task = tasks.find((item) => item.assignment_id === assignmentId);
    setConfirmDialog({
      type: isTakeHomeTask(task) ? 'start_takehome' : 'start',
      assignmentId,
    });
  };

  const requestComplete = (assignmentId) => {
    const task = tasks.find((item) => item.assignment_id === assignmentId);
    const evidence = evidenceOf(task);
    if (!evidence.can_complete) {
      setEvidenceAlert(
        isTakeHomeTask(task)
          ? 'Lengkapi 5 stage take-home dan survey kepuasan sebelum menandai tugas selesai.'
          : 'Lengkapi foto before, foto after, dan survey kepuasan sebelum menandai tugas selesai.'
      );
      return;
    }
    setConfirmDialog({
      type: isTakeHomeTask(task) ? 'complete_takehome' : 'complete',
      assignmentId,
    });
  };

  const handleAccept = async (assignmentId) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/mobile-tasks/${assignmentId}/accept`);
      setSuccess('Tugas diterima — Terjadwal.');
      setRejectingId(null);
      setConfirmDialog(null);
      await loadTasks(tab);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menerima tugas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (assignmentId) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/mobile-tasks/${assignmentId}/complete`);
      setSuccess('Pengerjaan selesai — Selesai.');
      setConfirmDialog(null);
      await loadTasks(tab);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyelesaikan pengerjaan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTakehome = async (assignmentId) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/mobile-tasks/${assignmentId}/start`);
      setSuccess('Order diambil — Sedang Dikerjakan.');
      setConfirmDialog(null);
      setTab('On_Progress');
      await loadTasks('On_Progress');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengambil order take-home');
    } finally {
      setSubmitting(false);
    }
  };

  const runConfirmAction = async () => {
    if (!confirmDialog || submitting) return;
    const { type, assignmentId } = confirmDialog;
    if (type === 'accept') {
      await handleAccept(assignmentId);
      return;
    }
    if (type === 'start_takehome') {
      await handleStartTakehome(assignmentId);
      return;
    }
    if (type === 'start') {
      setConfirmDialog(null);
      setCameraTarget({
        assignmentId,
        kind: 'arrival',
        label: 'Foto Kedatangan + Lokasi',
        includeLocation: true,
      });
      return;
    }
    if (type === 'complete' || type === 'complete_takehome') await handleComplete(assignmentId);
  };

  const openRejectForm = async (assignmentId) => {
    setRejectingId(assignmentId);
    setRejectForm({ note: '', recommended_employee_id: '' });
    setError('');
    setSuccess('');
    try {
      const { data } = await api.get(`/mobile-tasks/${assignmentId}/replacement-candidates`);
      setCandidates(data.candidates || []);
      await loadDetail(assignmentId);
      setExpandedId(assignmentId);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat kandidat pengganti');
      setCandidates([]);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectingId) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/mobile-tasks/${rejectingId}/reject`, {
        note: rejectForm.note,
        recommended_employee_id: Number(rejectForm.recommended_employee_id),
      });
      setSuccess('Tugas ditolak. Dikembalikan ke admin untuk plotting.');
      setRejectingId(null);
      setRejectForm({ note: '', recommended_employee_id: '' });
      await loadTasks(tab);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menolak tugas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCameraCapture = async (file, meta) => {
    const target = cameraTarget;
    setCameraTarget(null);
    if (!target || !file) return;

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (target.kind === 'arrival') {
        if (!meta?.latitude || !meta?.longitude) {
          setEvidenceAlert('Lokasi GPS wajib ikut bersama foto kedatangan.');
          return;
        }
        const formData = new FormData();
        formData.append('arrival_photo', file);
        formData.append('latitude', String(meta.latitude));
        formData.append('longitude', String(meta.longitude));
        if (meta.locationName) formData.append('location_name', meta.locationName);
        await api.post(`/mobile-tasks/${target.assignmentId}/start`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setSuccess('Pengerjaan dimulai — Sedang Dikerjakan.');
        setTab('On_Progress');
        await loadTasks('On_Progress');
        return;
      }

      if (target.kind === 'before') {
        const formData = new FormData();
        formData.append('before_photo', file);
        await api.post(`/mobile-tasks/${target.assignmentId}/before-photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setSuccess('Foto before tersimpan.');
        await loadTasks(tab);
        await loadDetail(target.assignmentId, true);
        return;
      }

      if (target.kind === 'after') {
        const formData = new FormData();
        formData.append('after_photo', file);
        await api.post(`/mobile-tasks/${target.assignmentId}/after-photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setSuccess('Foto after tersimpan.');
        await loadTasks(tab);
        await loadDetail(target.assignmentId, true);
        return;
      }

      if (target.kind === 'takehome' && target.stage) {
        const formData = new FormData();
        formData.append('photo', file);
        await api.post(
          `/mobile-tasks/${target.assignmentId}/takehome-stages/${target.stage}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setSuccess(`Stage ${target.label || target.stage} tersimpan.`);
        await loadTasks(tab);
        await loadDetail(target.assignmentId, true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan foto evidence');
    } finally {
      setSubmitting(false);
    }
  };

  const openSurveyPage = (assignmentId, evidence, task = null) => {
    if (isTakeHomeTask(task || {})) {
      if (!evidence?.has_takehome_complete) {
        setEvidenceAlert('Lengkapi semua stage take-home terlebih dahulu sebelum mengisi survey.');
        return;
      }
    } else if (!evidence?.has_after) {
      setEvidenceAlert('Lengkapi foto after terlebih dahulu sebelum mengisi survey.');
      return;
    }
    navigate(`/mobile-worker/tasks/${assignmentId}/survey`);
  };

  const handleDeletePhoto = async (assignmentId, photoId) => {
    if (!assignmentId || !photoId) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.delete(`/mobile-tasks/${assignmentId}/photos/${photoId}`);
      setSuccess('Foto dihapus.');
      await loadTasks(tab);
      await loadDetail(assignmentId, true);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus foto');
    } finally {
      setSubmitting(false);
    }
  };

  const closePhotoPreview = () => setPhotoPreview(null);

  const openPhotoPreviewFromMap = async (mapKey, title, photoPath) => {
    const existing = photoPreviewMap[mapKey];
    if (existing) {
      setPhotoPreview({ url: existing, title });
      return;
    }
    if (!photoPath) {
      setError('Foto belum bisa ditampilkan.');
      return;
    }
    try {
      const blobRes = await api.get(normalizePhotoPath(photoPath), { responseType: 'blob' });
      const url = URL.createObjectURL(blobRes.data);
      setPhotoPreviewMap((prev) => {
        const next = { ...prev };
        if (typeof next[mapKey] === 'string' && next[mapKey].startsWith('blob:')) {
          URL.revokeObjectURL(next[mapKey]);
        }
        next[mapKey] = url;
        return next;
      });
      setPhotoPreview({ url, title });
    } catch {
      setError('Gagal memuat foto.');
    }
  };

  const confirmCopy = CONFIRM_COPY[confirmDialog?.type] || CONFIRM_COPY.accept;

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
                <div className="text-[14px] font-extrabold text-white truncate">Tugas</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">
                  Konfirmasi → Terjadwal → Dikerjakan → Selesai
                </div>
              </div>
            </div>
            <div className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          <div className="flex gap-1 overflow-x-auto rounded-[14px] bg-white border border-slate-200 p-1">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setRejectingId(null);
                  setExpandedId(null);
                }}
                className={`flex-shrink-0 rounded-[10px] px-2.5 py-2 text-[10px] font-bold transition whitespace-nowrap ${
                  tab === item.key ? 'bg-[#163A22] text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {success && (
            <div className="rounded-2xl border border-[#163A22] bg-[#163A22] p-3 text-sm text-white">{success}</div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 px-1 py-6 text-center">Memuat tugas...</p>
          ) : tasks.length === 0 ? (
            <div className="rounded-[22px] border border-slate-100 bg-white p-6 text-center shadow-[0_10px_28px_rgba(15,23,42,.05)]">
              <p className="text-[13px] font-extrabold text-slate-900">Tidak ada tugas</p>
              <p className="mt-1 text-[11px] text-slate-500">Belum ada tugas pada filter ini.</p>
            </div>
          ) : (
            tasks.map((task) => {
              const isRejecting = rejectingId === task.assignment_id;
              const detail = detailMap[task.assignment_id];
              const isExpanded = expandedId === task.assignment_id;
              const tx = task.transaction || {};
              const evidence = evidenceOf(task);
              const customerPhotos =
                detail?.task?.customer_photos || task.customer_photos || [];

              return (
                <div
                  key={task.assignment_id}
                  className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)] space-y-3"
                >
                  <button type="button" onClick={() => toggleExpand(task.assignment_id)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-extrabold text-slate-900 truncate">
                          {tx.customer_name || 'Tanpa nama'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {tx.transaction_no || '—'} · {formatDateTime(tx.service_date)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {STATUS_LABEL[task.assignment_status] || task.assignment_status}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isTakeHomeTask(task)
                              ? 'bg-violet-50 text-violet-700 border border-violet-200'
                              : 'bg-[#163A22] text-white border border-[#163A22]'
                          }`}
                        >
                          {isTakeHomeTask(task) ? 'Bawa Pulang' : 'Layanan Ke Rumah'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && detail && (
                    <div className="rounded-[14px] border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11.5px] text-slate-600 space-y-1">
                      <div>Alamat: {detail.task?.transaction?.customer_address || tx.customer_address || '—'}</div>
                      <div>Catatan: {detail.task?.transaction?.notes || '—'}</div>
                      <div className="pt-1 font-bold text-slate-700">Item layanan</div>
                      {(detail.items || []).length === 0 ? (
                        <div>—</div>
                      ) : (
                        detail.items.map((item) => (
                          <div key={item.id}>
                            {item.service_name} × {item.qty}
                          </div>
                        ))
                      )}
                      {task.assignment_status === 'Rejected' && (
                        <>
                          <div className="pt-1">Alasan reject: {task.assignment_note || '—'}</div>
                          <div>Rekomendasi: {task.recommended_employee_name || '—'}</div>
                        </>
                      )}
                    </div>
                  )}

                  {task.assignment_status === 'Assigned' && !isRejecting && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => requestAccept(task.assignment_id)}
                        className="h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Terima
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => openRejectForm(task.assignment_id)}
                        className="h-[40px] rounded-[12px] bg-white border border-rose-200 text-rose-700 text-[12px] font-extrabold disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        Tolak
                      </button>
                    </div>
                  )}

                  {task.assignment_status === 'In_Schedule' && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => requestStart(task.assignment_id)}
                      className="w-full h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-4 h-4" />
                      {isTakeHomeTask(task) ? 'Ambil' : 'Mulai'}
                    </button>
                  )}

                  {task.assignment_status === 'On_Progress' && isTakeHomeTask(task) && (
                    <div className="space-y-3">
                      {(evidence.takehome?.stages || []).map((stage, idx) => {
                        const isNext = evidence.takehome?.next_stage === stage.key;
                        const preview = photoPreviewMap[`takehome-${stage.key}`];
                        return (
                          <div
                            key={stage.key}
                            className="rounded-[14px] border border-slate-200 bg-[#FAFBFC] p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-[12px] font-extrabold text-slate-800">
                                  {idx + 1}. {stage.label}
                                </p>
                                <p className="text-[10.5px] text-slate-500">
                                  {stage.filled
                                    ? 'Foto tersimpan'
                                    : isNext
                                      ? 'Ambil foto untuk lanjut'
                                      : 'Menunggu stage sebelumnya'}
                                </p>
                              </div>
                              {stage.filled ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <Camera className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            {stage.filled && (
                              <>
                                {preview ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openPhotoPreviewFromMap(
                                        `takehome-${stage.key}`,
                                        stage.label,
                                        stage.photo_path
                                      )
                                    }
                                    className="block w-full text-left"
                                  >
                                    <img
                                      src={preview}
                                      alt={stage.label}
                                      className="h-28 w-full rounded-xl object-cover"
                                    />
                                  </button>
                                ) : (
                                  <div className="h-28 w-full rounded-xl bg-slate-200 animate-pulse" />
                                )}
                                <LihatFotoButton
                                  onClick={() =>
                                    openPhotoPreviewFromMap(
                                      `takehome-${stage.key}`,
                                      stage.label,
                                      stage.photo_path
                                    )
                                  }
                                />
                              </>
                            )}
                            {isNext && (
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() =>
                                  setCameraTarget({
                                    assignmentId: task.assignment_id,
                                    kind: 'takehome',
                                    stage: stage.key,
                                    label: stage.label,
                                    includeLocation: false,
                                  })
                                }
                                className="w-full h-[38px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                              >
                                <Camera className="w-4 h-4" />
                                Foto {stage.label}
                              </button>
                            )}
                          </div>
                        );
                      })}

                      <div className="rounded-[14px] border border-slate-200 bg-[#FAFBFC] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[12px] font-extrabold text-slate-800">6. Survei Kepuasan</p>
                            <p className="text-[10.5px] text-slate-500">
                              {evidence.has_survey
                                ? 'Survei tersimpan'
                                : evidence.has_takehome_complete
                                  ? 'Isi setelah pengantaran selesai'
                                  : 'Lengkapi stage Pengantaran dulu'}
                            </p>
                          </div>
                          {evidence.has_survey ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={submitting || !evidence.has_takehome_complete}
                          onClick={() => openSurveyPage(task.assignment_id, evidence, task)}
                          className="w-full h-[38px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60"
                        >
                          {evidence.has_survey ? 'Lihat / Ubah Survei' : 'Isi Survei Kepuasan'}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={submitting || !evidence.can_complete}
                        onClick={() => requestComplete(task.assignment_id)}
                        className="w-full h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Selesai
                      </button>
                      {!evidence.can_complete && (
                        <p className="text-[10.5px] text-slate-500 text-center">
                          Selesai aktif setelah 5 stage dan survey lengkap.
                        </p>
                      )}
                    </div>
                  )}

                  {task.assignment_status === 'On_Progress' && !isTakeHomeTask(task) && (
                    <div className="space-y-3">
                      {(evidence.arrival_photo_path || photoPreviewMap[`arrival-${task.assignment_id}`]) && (
                        <div className="rounded-[14px] border border-slate-200 bg-[#FAFBFC] p-3 space-y-2">
                          <p className="text-[12px] font-extrabold text-slate-800">Foto Kedatangan</p>
                          {photoPreviewMap[`arrival-${task.assignment_id}`] ? (
                            <button
                              type="button"
                              onClick={() =>
                                openPhotoPreviewFromMap(
                                  `arrival-${task.assignment_id}`,
                                  'Foto Kedatangan',
                                  evidence.arrival_photo_path
                                )
                              }
                              className="block w-full text-left"
                            >
                              <img
                                src={photoPreviewMap[`arrival-${task.assignment_id}`]}
                                alt="Foto kedatangan"
                                className="h-28 w-full rounded-xl object-cover"
                              />
                            </button>
                          ) : null}
                          <LihatFotoButton
                            onClick={() =>
                              openPhotoPreviewFromMap(
                                `arrival-${task.assignment_id}`,
                                'Foto Kedatangan',
                                evidence.arrival_photo_path
                              )
                            }
                          />
                        </div>
                      )}

                      {(customerPhotos || []).length > 0 && (
                        <div className="rounded-[14px] border border-sky-200 bg-sky-50/50 p-3 space-y-2">
                          <div>
                            <p className="text-[12px] font-extrabold text-slate-800">Referensi Pelanggan</p>
                            <p className="text-[10.5px] text-slate-500">
                              Foto dari admin — acuan sebelum kerja · {(customerPhotos || []).length} foto
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(customerPhotos || []).map((photo) => {
                              const preview = photoPreviewMap[`customer-${photo.id}`];
                              return (
                                <div key={photo.id}>
                                  {preview ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openPhotoPreviewFromMap(
                                          `customer-${photo.id}`,
                                          'Referensi Pelanggan',
                                          photo.photo_path
                                        )
                                      }
                                      className="block w-full text-left"
                                    >
                                      <img
                                        src={preview}
                                        alt="Referensi customer"
                                        className="h-28 w-full rounded-xl object-cover"
                                      />
                                    </button>
                                  ) : (
                                    <div className="h-28 w-full rounded-xl bg-slate-200 animate-pulse" />
                                  )}
                                  <LihatFotoButton
                                    onClick={() =>
                                      openPhotoPreviewFromMap(
                                        `customer-${photo.id}`,
                                        'Referensi Pelanggan',
                                        photo.photo_path
                                      )
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="rounded-[14px] border border-slate-200 bg-[#FAFBFC] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[12px] font-extrabold text-slate-800">1. Foto Before</p>
                            <p className="text-[10.5px] text-slate-500">
                              {(evidence.before_count || 0) > 0
                                ? `${evidence.before_count} foto tersimpan`
                                : 'Belum ada foto'}
                            </p>
                          </div>
                          {evidence.has_before ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Camera className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        {(evidence.before_photos || []).length > 0 && (
                          <div className="grid grid-cols-2 gap-2">
                            {(evidence.before_photos || []).map((photo) => (
                              <div key={photo.id} className="relative">
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePhoto(task.assignment_id, photo.id);
                                  }}
                                  className="absolute right-1.5 top-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white shadow-lg disabled:opacity-60"
                                  aria-label="Hapus foto before"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                {photoPreviewMap[String(photo.id)] ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openPhotoPreviewFromMap(String(photo.id), 'Foto Before', photo.photo_path)
                                    }
                                    className="block w-full text-left"
                                  >
                                    <img
                                      src={photoPreviewMap[String(photo.id)]}
                                      alt="Foto before"
                                      className="h-28 w-full rounded-xl object-cover"
                                    />
                                  </button>
                                ) : (
                                  <div className="h-28 w-full rounded-xl bg-slate-200 animate-pulse" />
                                )}
                                <LihatFotoButton
                                  onClick={() =>
                                    openPhotoPreviewFromMap(String(photo.id), 'Foto Before', photo.photo_path)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={submitting || (evidence.before_count || 0) >= MAX_PHOTOS_PER_KIND}
                          onClick={() =>
                            setCameraTarget({
                              assignmentId: task.assignment_id,
                              kind: 'before',
                              label: 'Foto Before',
                              includeLocation: false,
                            })
                          }
                          className="w-full h-[38px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          <Camera className="w-4 h-4" />
                          Tambah Foto Before
                        </button>
                      </div>

                      <div className="rounded-[14px] border border-slate-200 bg-[#FAFBFC] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[12px] font-extrabold text-slate-800">2. Foto After</p>
                            <p className="text-[10.5px] text-slate-500">
                              {(evidence.after_count || 0) > 0
                                ? `${evidence.after_count} foto tersimpan`
                                : evidence.has_before
                                  ? 'Belum ada foto'
                                  : 'Isi foto before dulu'}
                            </p>
                          </div>
                          {evidence.has_after ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Camera className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        {(evidence.after_photos || []).length > 0 && (
                          <div className="grid grid-cols-2 gap-2">
                            {(evidence.after_photos || []).map((photo) => (
                              <div key={photo.id} className="relative">
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePhoto(task.assignment_id, photo.id);
                                  }}
                                  className="absolute right-1.5 top-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white shadow-lg disabled:opacity-60"
                                  aria-label="Hapus foto after"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                {photoPreviewMap[String(photo.id)] ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openPhotoPreviewFromMap(String(photo.id), 'Foto After', photo.photo_path)
                                    }
                                    className="block w-full text-left"
                                  >
                                    <img
                                      src={photoPreviewMap[String(photo.id)]}
                                      alt="Foto after"
                                      className="h-28 w-full rounded-xl object-cover"
                                    />
                                  </button>
                                ) : (
                                  <div className="h-28 w-full rounded-xl bg-slate-200 animate-pulse" />
                                )}
                                <LihatFotoButton
                                  onClick={() =>
                                    openPhotoPreviewFromMap(String(photo.id), 'Foto After', photo.photo_path)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={
                            submitting
                            || !evidence.has_before
                            || (evidence.after_count || 0) >= MAX_PHOTOS_PER_KIND
                          }
                          onClick={() =>
                            setCameraTarget({
                              assignmentId: task.assignment_id,
                              kind: 'after',
                              label: 'Foto After',
                              includeLocation: false,
                            })
                          }
                          className="w-full h-[38px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          <Camera className="w-4 h-4" />
                          Tambah Foto After
                        </button>
                      </div>

                      <div className="rounded-[14px] border border-slate-200 bg-[#FAFBFC] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[12px] font-extrabold text-slate-800">3. Survei Kepuasan</p>
                            <p className="text-[10.5px] text-slate-500">
                              {evidence.has_survey
                                ? (() => {
                                    const answers = evidence.survey_answers || {};
                                    const csat =
                                      answers.csat_score
                                      ?? answers.overall
                                      ?? evidence.survey_rating;
                                    const nps = answers.nps_score;
                                    if (csat != null && nps != null) {
                                      return `Survei tersimpan · CSAT ${csat}/5 · NPS ${nps}/10`;
                                    }
                                    if (csat != null) {
                                      return `Survei tersimpan · CSAT ${csat}/5`;
                                    }
                                    return 'Survei tersimpan';
                                  })()
                                : evidence.has_after
                                  ? 'Isi di halaman survey khusus'
                                  : 'Lengkapi foto after dulu'}
                            </p>
                          </div>
                          {evidence.has_survey ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={submitting || !evidence.has_after}
                          onClick={() => openSurveyPage(task.assignment_id, evidence, task)}
                          className="w-full h-[38px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60"
                        >
                          {evidence.has_survey ? 'Lihat / Ubah Survei' : 'Isi Survei Kepuasan'}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={submitting || !evidence.can_complete}
                        onClick={() => requestComplete(task.assignment_id)}
                        className="w-full h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Selesai
                      </button>
                      {!evidence.can_complete && (
                        <p className="text-[10.5px] text-slate-500 text-center">
                          Selesai aktif setelah before, after, dan survey lengkap.
                        </p>
                      )}
                    </div>
                  )}

                  {isRejecting && (
                    <form onSubmit={handleReject} className="space-y-3 rounded-[14px] border border-rose-100 bg-rose-50/40 p-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700">Alasan tidak bisa</label>
                        <textarea
                          required
                          minLength={3}
                          rows={3}
                          value={rejectForm.note}
                          onChange={(e) => setRejectForm((prev) => ({ ...prev, note: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#163A22]"
                          placeholder="Contoh: sedang sakit / bentrok jadwal"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700">Rekomendasi pengganti</label>
                        <select
                          required
                          value={rejectForm.recommended_employee_id}
                          onChange={(e) =>
                            setRejectForm((prev) => ({ ...prev, recommended_employee_id: e.target.value }))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#163A22]"
                        >
                          <option value="">Pilih karyawan bebas di tanggal ini</option>
                          {candidates.map((c) => (
                            <option key={c.employee_id} value={c.employee_id}>
                              {c.full_name}
                              {c.phone_number ? ` • ${c.phone_number}` : ''}
                            </option>
                          ))}
                        </select>
                        {candidates.length === 0 && (
                          <p className="mt-1 text-[10.5px] text-amber-700">
                            Tidak ada kandidat tersedia untuk tanggal layanan ini.
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRejectingId(null)}
                          className="h-[40px] rounded-[12px] border border-slate-200 bg-white text-[12px] font-bold text-slate-600"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={submitting || candidates.length === 0}
                          className="h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-60"
                        >
                          {submitting ? 'Mengirim...' : 'Kirim Reject'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })
          )}
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileConfirmDialog
        open={Boolean(confirmDialog)}
        variant={confirmDialog?.type || 'accept'}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        busy={submitting}
        onCancel={() => {
          if (!submitting) setConfirmDialog(null);
        }}
        onConfirm={runConfirmAction}
      />

      <MobileConfirmDialog
        open={Boolean(evidenceAlert)}
        variant="danger"
        title="Evidence Belum Lengkap"
        description={evidenceAlert || ''}
        confirmLabel="Mengerti"
        cancelLabel="Tutup"
        onConfirm={() => setEvidenceAlert(null)}
        onCancel={() => setEvidenceAlert(null)}
        onClose={() => setEvidenceAlert(null)}
      />

      <MobileCameraCapture
        open={Boolean(cameraTarget)}
        title={cameraTarget ? `Ambil ${cameraTarget.label}` : 'Ambil Foto'}
        variant="ikm"
        initialFacingMode="environment"
        confirmLabel="Ambil Foto"
        includeLocation={Boolean(cameraTarget?.includeLocation)}
        onClose={() => setCameraTarget(null)}
        onCapture={handleCameraCapture}
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
                {photoPreview.title || 'Foto Tugas'}
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
                  alt={photoPreview.title || 'Foto task'}
                  className="w-full h-auto max-h-[72dvh] object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
