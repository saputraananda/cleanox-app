import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Banknote, Camera, ImagePlus, Trash2 } from 'lucide-react';
import api from '@shared/utils/api.js';
import { getToken, getUser } from '@shared/utils/auth.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getCutoffRange = () => {
  const today = new Date();
  const day = today.getDate();
  let start;
  let end;
  if (day <= 25) {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 26);
    end = new Date(today.getFullYear(), today.getMonth(), 25);
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 26);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 25);
  }
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
};

const fmtDate = (iso) => {
  if (!iso) return '-';
  const parts = String(iso).split('T')[0].split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const fmtDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtRupiah = (n) => {
  const num = Number(n);
  if (!num || Number.isNaN(num)) return 'Rp 0';
  return `Rp ${num.toLocaleString('id-ID')}`;
};

const STATUS_META = {
  pengajuan: { label: 'Pengajuan', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  proses: { label: 'Diproses', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  disetujui: { label: 'Disetujui', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  ditolak: { label: 'Ditolak', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
};

const TYPE_META = {
  kasbon: { label: 'Kasbon', color: '#163A22', bg: '#EEF8E3', border: '#7BC32C' },
  pinjaman: { label: 'Pinjaman', color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pengajuan;
  return (
    <span
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
      className="inline-flex items-center text-[10.5px] font-bold px-2.5 py-1 rounded-full border"
    >
      {m.label}
    </span>
  );
}

async function fetchProofBlobUrl(proofPathOrFile) {
  if (!proofPathOrFile) return '';
  const fileName = String(proofPathOrFile).split('/').pop();
  const token = getToken();
  const res = await api.get(`/mobile-kasbon/proofs/${encodeURIComponent(fileName)}`, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return URL.createObjectURL(res.data);
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-[18px] border border-slate-200 px-4 py-[16px] shadow-[0_1px_4px_rgba(0,0,0,.04)]">
      <div className="flex items-center gap-2 text-[13px] font-bold text-slate-900 mb-3 pb-2.5 border-b border-slate-100">
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#7BC32C]" />
        {title}
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
    </div>
  );
}

function KasbonCard({
  submission,
  employeeName,
  onEdit,
  onDelete,
  expandedDetail,
  loadingDetail,
  onTogglePayments,
}) {
  const typeMeta = TYPE_META[submission.type] || TYPE_META.kasbon;
  const isEditable = submission.status === 'pengajuan';
  const isPinjaman = submission.type === 'pinjaman';
  const isApproved = submission.status === 'disetujui';
  const amtApproved = Number(submission.amount_approved) || 0;
  const [proofUrl, setProofUrl] = useState('');

  useEffect(() => {
    let revoked = false;
    let url = '';
    if (!submission.proof_path && !submission.proof_file) {
      setProofUrl('');
      return undefined;
    }
    fetchProofBlobUrl(submission.proof_path || submission.proof_file)
      .then((blobUrl) => {
        if (revoked) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        url = blobUrl;
        setProofUrl(blobUrl);
      })
      .catch(() => setProofUrl(''));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
      setProofUrl('');
    };
  }, [submission.proof_path, submission.proof_file]);

  const totalPaid = expandedDetail ? Number(expandedDetail.total_paid) || 0 : 0;
  const remaining =
    expandedDetail?.remaining != null
      ? Number(expandedDetail.remaining)
      : amtApproved > 0
        ? amtApproved - totalPaid
        : 0;
  const payments = expandedDetail?.payments || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,.06)]">
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <div className="text-[11px] text-slate-400 font-medium mb-0.5">
            {fmtDate(submission.submission_date)}
          </div>
          <div className="text-[13.5px] font-bold text-slate-900 truncate">{employeeName}</div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <StatusBadge status={submission.status} />
          <span
            style={{ background: typeMeta.bg, color: typeMeta.color, borderColor: typeMeta.border }}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
          >
            {typeMeta.label}
          </span>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="bg-[#FAFBFC] rounded-[12px] p-3 border border-slate-100">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">
            Jumlah Diajukan
          </div>
          <div className="text-[18px] font-bold text-slate-900">
            {fmtRupiah(submission.amount_requested)}
          </div>
          {isApproved && amtApproved > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200">
              <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-0.5">
                Jumlah Disetujui
              </div>
              <div className="text-[15px] font-bold text-emerald-700">{fmtRupiah(amtApproved)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-1">Keperluan</div>
        <div className="text-[12.5px] text-slate-700 leading-relaxed">{submission.purpose}</div>
        {submission.notes && (
          <div className="mt-1.5 text-[11.5px] text-slate-500 italic">&ldquo;{submission.notes}&rdquo;</div>
        )}
      </div>

      {submission.status === 'proses' && submission.process_note && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-[10px] bg-amber-50 border border-amber-100">
          <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">
            Catatan Proses
          </div>
          <div className="text-[11.5px] text-amber-800 leading-relaxed">{submission.process_note}</div>
        </div>
      )}
      {submission.status === 'disetujui' && submission.approved_note && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-[10px] bg-emerald-50 border border-emerald-100">
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-0.5">
            Catatan Persetujuan
          </div>
          <div className="text-[11.5px] text-emerald-800 leading-relaxed">{submission.approved_note}</div>
        </div>
      )}
      {submission.status === 'ditolak' && submission.rejection_note && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-[10px] bg-red-50 border border-red-100">
          <div className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-0.5">
            Alasan Penolakan
          </div>
          <div className="text-[11.5px] text-red-700 leading-relaxed">{submission.rejection_note}</div>
        </div>
      )}

      {isPinjaman && isApproved && amtApproved > 0 && (
        <div className="mx-4 mb-3">
          <div className="bg-[#EEF8E3] border border-[#7BC32C]/30 rounded-[12px] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold text-[#163A22]">Pembayaran Pinjaman</div>
              {expandedDetail && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    remaining <= 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {remaining <= 0 ? 'LUNAS' : `Sisa ${fmtRupiah(remaining)}`}
                </span>
              )}
            </div>
            {expandedDetail && (
              <div className="flex gap-4 mb-2">
                <div>
                  <div className="text-[10px] text-slate-400">Sudah Dibayar</div>
                  <div className="text-[12px] font-bold text-slate-700">{fmtRupiah(totalPaid)}</div>
                </div>
                <div className="w-px bg-[#7BC32C]/40" />
                <div>
                  <div className="text-[10px] text-slate-400">Sisa</div>
                  <div className="text-[12px] font-bold text-slate-700">{fmtRupiah(remaining)}</div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onTogglePayments}
              className="w-full text-[11.5px] font-bold text-[#163A22] flex items-center justify-center gap-1.5 py-1"
            >
              {loadingDetail
                ? 'Memuat…'
                : expandedDetail
                  ? '▲ Sembunyikan Detail'
                  : '▼ Lihat Detail Pembayaran'}
            </button>
            {expandedDetail && (
              <div className="mt-2 flex flex-col gap-1.5">
                {payments.length === 0 ? (
                  <div className="text-[11.5px] text-slate-400 text-center py-2">
                    Belum ada pembayaran tercatat.
                  </div>
                ) : (
                  payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start justify-between bg-white rounded-[8px] px-3 py-2 border border-[#7BC32C]/25"
                    >
                      <div className="min-w-0">
                        <div className="text-[11.5px] font-bold text-slate-800">
                          {fmtRupiah(p.amount)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {fmtDate(p.payment_date)} ·{' '}
                          {String(p.payment_method || '').replace(/_/g, ' ')}
                        </div>
                        {p.recorded_by_name && (
                          <div className="text-[10px] text-slate-400">oleh {p.recorded_by_name}</div>
                        )}
                      </div>
                      {p.notes && (
                        <div className="text-[10.5px] text-slate-500 text-right max-w-[110px] truncate ml-2 flex-shrink-0">
                          {p.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {proofUrl && (
        <div className="mx-4 mb-3">
          <img
            src={proofUrl}
            alt="Foto Bukti"
            className="w-full max-h-32 object-cover rounded-[10px] border border-slate-200"
          />
        </div>
      )}

      <div className="px-4 pb-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-[10.5px] text-slate-400">{fmtDateTime(submission.created_at)}</span>
        <div className="flex gap-2 items-center">
          {isEditable ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="h-[32px] px-3 rounded-[10px] border border-[#7BC32C]/40 text-[#163A22] text-[11.5px] font-bold bg-[#EEF8E3]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="h-[32px] px-3 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-[11.5px] font-bold"
              >
                Hapus
              </button>
            </>
          ) : (
            <span className="text-[10.5px] text-slate-400 italic">Tidak dapat diubah</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MobileWorkerKasbonPage() {
  const navigate = useNavigate();
  const galleryRef = useRef(null);
  const user = getUser();
  const employeeName = user?.name || user?.full_name || '';

  const [activeTab, setActiveTab] = useState('form');
  const [editingId, setEditingId] = useState(null);

  const [type, setType] = useState('kasbon');
  const [submissionDate, setSubmissionDate] = useState(todayStr());
  const [purpose, setPurpose] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [notes, setNotes] = useState('');

  const [proofDoc, setProofDoc] = useState(null);
  const [proofDocPreview, setProofDocPreview] = useState(null);
  const [existingProofPath, setExistingProofPath] = useState(null);
  const [removeProofDoc, setRemoveProofDoc] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(false);

  const defaultRange = getCutoffRange();
  const [submissions, setSubmissions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyStart, setHistoryStart] = useState(defaultRange.start);
  const [historyEnd, setHistoryEnd] = useState(defaultRange.end);
  const [typeFilter, setTypeFilter] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedDetail, setExpandedDetail] = useState({});
  const [loadingDetail, setLoadingDetail] = useState({});

  useEffect(() => {
    document.title = 'Kasbon & Pinjaman';
  }, []);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, historyStart, historyEnd]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = {};
      if (historyStart) params.startDate = historyStart;
      if (historyEnd) params.endDate = historyEnd;
      const res = await api.get('/mobile-kasbon/my-submissions', { params });
      setSubmissions(res.data?.data || []);
    } catch {
      setHistoryError('Gagal memuat riwayat pengajuan.');
      setSubmissions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofDoc(file);
    setRemoveProofDoc(false);
    if (proofDocPreview && !existingProofPath) URL.revokeObjectURL(proofDocPreview);
    setProofDocPreview(URL.createObjectURL(file));
    setExistingProofPath(null);
    e.target.value = '';
  };

  const removeDoc = () => {
    if (existingProofPath) setRemoveProofDoc(true);
    setProofDoc(null);
    if (proofDocPreview && !existingProofPath) URL.revokeObjectURL(proofDocPreview);
    setProofDocPreview(null);
    setExistingProofPath(null);
  };

  const handleCameraCapture = (file) => {
    setProofDoc(file);
    setRemoveProofDoc(false);
    if (proofDocPreview && !existingProofPath) URL.revokeObjectURL(proofDocPreview);
    setProofDocPreview(URL.createObjectURL(file));
    setExistingProofPath(null);
    setShowCamera(false);
  };

  const startEdit = async (submission) => {
    if (submission.status !== 'pengajuan') return;
    setEditingId(submission.id);
    setType(submission.type);
    setSubmissionDate(String(submission.submission_date).split('T')[0]);
    setPurpose(submission.purpose || '');
    setAmountStr(String(Math.round(Number(submission.amount_requested))));
    setNotes(submission.notes || '');
    setProofDoc(null);
    setRemoveProofDoc(false);
    setSubmitError(null);
    setActiveTab('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (submission.proof_path || submission.proof_file) {
      setExistingProofPath(submission.proof_path || submission.proof_file);
      try {
        const url = await fetchProofBlobUrl(submission.proof_path || submission.proof_file);
        setProofDocPreview(url);
      } catch {
        setProofDocPreview(null);
      }
    } else {
      setExistingProofPath(null);
      setProofDocPreview(null);
    }
  };

  const resetForm = () => {
    setType('kasbon');
    setSubmissionDate(todayStr());
    setPurpose('');
    setAmountStr('');
    setNotes('');
    setProofDoc(null);
    if (proofDocPreview && !existingProofPath) URL.revokeObjectURL(proofDocPreview);
    setProofDocPreview(null);
    setExistingProofPath(null);
    setRemoveProofDoc(false);
    setEditingId(null);
    setSubmitError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (!purpose.trim()) {
      setSubmitError('Keperluan/tujuan wajib diisi.');
      return;
    }
    const amount = Number(amountStr);
    if (!amount || amount <= 0) {
      setSubmitError('Jumlah pengajuan harus lebih dari 0.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('submission_date', submissionDate);
      fd.append('purpose', purpose.trim());
      fd.append('amount_requested', String(amount));
      fd.append('notes', notes.trim());
      if (proofDoc) fd.append('proof_doc', proofDoc);
      if (editingId && removeProofDoc && !proofDoc) fd.append('remove_proof', '1');

      if (editingId) {
        await api.put(`/mobile-kasbon/${editingId}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/mobile-kasbon', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setSuccess(true);
    } catch (err) {
      setSubmitError(err?.response?.data?.message || 'Gagal mengirim pengajuan, coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await api.delete(`/mobile-kasbon/${id}`);
      setDeleteConfirmId(null);
      fetchHistory();
    } catch (err) {
      alert(err?.response?.data?.message || 'Gagal menghapus pengajuan.');
      setDeleteConfirmId(null);
    } finally {
      setDeleting(false);
    }
  };

  const togglePayments = async (id) => {
    if (expandedDetail[id] !== undefined) {
      setExpandedDetail((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      return;
    }
    setLoadingDetail((p) => ({ ...p, [id]: true }));
    try {
      const res = await api.get(`/mobile-kasbon/${id}`);
      setExpandedDetail((p) => ({
        ...p,
        [id]: {
          payments: res.data?.data?.payments || [],
          total_paid: res.data?.data?.total_paid ?? 0,
          remaining: res.data?.data?.remaining ?? null,
        },
      }));
    } catch {
      alert('Gagal memuat detail pembayaran.');
    } finally {
      setLoadingDetail((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  };

  const inputCls =
    'w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-[inherit] text-[13px] text-slate-900 outline-none focus:border-[#7BC32C] focus:bg-white placeholder:text-slate-400';

  const filtered = submissions.filter((s) => {
    if (typeFilter && s.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-slate-50 flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <header
          className="relative overflow-hidden rounded-b-[28px] flex-shrink-0 pb-4"
          style={{ background: 'linear-gradient(180deg, #163A22 0%, #20492C 58%, #295733 100%)' }}
        >
          <div
            className="absolute -top-[70px] -right-[40px] w-[200px] h-[200px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(123,195,44,.16) 0%, transparent 70%)' }}
          />
          <div className="relative z-[1] flex items-center gap-3 px-[18px] pt-[14px]">
            <button
              type="button"
              className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center flex-shrink-0"
              onClick={() => navigate('/mobile-worker')}
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold tracking-[.12em] uppercase text-white/80">
                Karyawan Cleanox
              </div>
              <div className="text-[15px] font-extrabold text-white tracking-[-0.01em] truncate">
                Kasbon &amp; Pinjaman
              </div>
            </div>
            <div className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-[#7BC32C] grid place-items-center flex-shrink-0">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
        </header>

        <div className="px-3 sm:px-[14px] pt-3 flex-shrink-0">
          <div className="flex rounded-[14px] bg-white border border-slate-200 p-1 shadow-[0_1px_4px_rgba(0,0,0,.04)]">
            <button
              type="button"
              className={`flex-1 h-[38px] rounded-[10px] text-[12.5px] font-bold transition ${
                activeTab === 'form'
                  ? 'bg-[#163A22] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setActiveTab('form')}
            >
              Form
            </button>
            <button
              type="button"
              className={`flex-1 h-[38px] rounded-[10px] text-[12.5px] font-bold transition ${
                activeTab === 'history'
                  ? 'bg-[#163A22] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setActiveTab('history')}
            >
              Riwayat
            </button>
          </div>
        </div>

        {activeTab === 'form' && (
          <main className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div
                className="relative overflow-hidden rounded-[18px] px-5 py-[16px] text-white"
                style={{ background: 'linear-gradient(135deg, #163A22 0%, #295733 100%)' }}
              >
                <div className="absolute -top-8 -right-8 w-[110px] h-[110px] rounded-full bg-white/[.07] pointer-events-none" />
                <div className="text-[15px] font-bold mb-0.5">
                  {editingId ? 'Edit Pengajuan' : 'Kasbon & Pinjaman'}
                </div>
                <p className="text-[11.5px] opacity-70 leading-relaxed">
                  {editingId
                    ? 'Perbarui data pengajuan kasbon atau pinjaman Anda.'
                    : 'Ajukan kasbon atau pinjaman dana. Persetujuan dilakukan oleh manajemen.'}
                </p>
              </div>

              {editingId && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <span className="text-[12px] font-semibold text-amber-700">
                    Mode Edit – Pengajuan #{editingId}
                  </span>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="ml-auto text-[11px] font-bold text-amber-600 underline"
                  >
                    Batal
                  </button>
                </div>
              )}

              <Section title="Jenis Pengajuan">
                <div className="flex gap-2">
                  {[
                    { val: 'kasbon', label: 'Kasbon', desc: 'Dana cepat / darurat' },
                    { val: 'pinjaman', label: 'Pinjaman', desc: 'Bayar cicil / lunas' },
                  ].map(({ val, label, desc }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setType(val)}
                      className={`flex-1 text-left px-3 py-2.5 rounded-xl border-2 transition ${
                        type === val
                          ? 'border-[#163A22] bg-[#EEF8E3]'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div
                        className={`text-[12.5px] font-bold leading-tight ${
                          type === val ? 'text-[#163A22]' : 'text-slate-700'
                        }`}
                      >
                        {label}
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
                {type === 'pinjaman' && (
                  <div className="bg-[#EEF8E3] border border-[#7BC32C]/30 rounded-[10px] px-3 py-2 text-[11.5px] text-[#163A22] leading-relaxed">
                    <span className="font-bold">Pinjaman</span> — pembayaran dapat dilakukan secara
                    cicilan atau lunas.
                  </div>
                )}
              </Section>

              <Section title="Informasi Pengajuan">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-slate-600">Nama Pemohon</label>
                  <div className={`${inputCls} bg-slate-100 text-slate-500 cursor-not-allowed select-none`}>
                    {employeeName || '–'}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-slate-600">
                    Tanggal Pengajuan <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputCls}
                    type="date"
                    value={submissionDate}
                    onChange={(e) => setSubmissionDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-slate-600">
                    Keperluan / Tujuan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none min-h-[80px]`}
                    placeholder="Jelaskan keperluan atau tujuan pengajuan secara singkat…"
                    rows={3}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-slate-600">
                    Jumlah Yang Diajukan (Rp) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-500 font-semibold select-none">
                      Rp
                    </span>
                    <input
                      className={`${inputCls} pl-9`}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="0"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                    />
                  </div>
                  {amountStr && Number(amountStr) > 0 && (
                    <div className="text-[11px] text-slate-500 font-semibold px-1">
                      {fmtRupiah(amountStr)}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Catatan Tambahan">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-slate-600">
                    Catatan <span className="text-slate-400 font-normal">(opsional)</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none min-h-[70px]`}
                    placeholder="Catatan tambahan jika ada…"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </Section>

              <Section title="Foto Bukti">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-slate-600">
                    Foto Pendukung <span className="text-slate-400 font-normal">(opsional)</span>
                  </label>
                  <input
                    type="file"
                    ref={galleryRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {proofDocPreview && (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 mb-1">
                      <img
                        src={proofDocPreview}
                        alt="Foto Bukti"
                        className="w-full max-h-48 object-contain bg-slate-100"
                      />
                      <button
                        type="button"
                        onClick={removeDoc}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white grid place-items-center"
                        aria-label="Hapus foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="flex-1 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-[12px] font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {proofDocPreview ? 'Ambil Ulang' : 'Ambil Foto'}
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryRef.current?.click()}
                      className="flex-1 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-[12px] font-semibold flex items-center justify-center gap-1.5"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      {proofDocPreview ? 'Ganti dari Galeri' : 'Dari Galeri'}
                    </button>
                  </div>
                </div>
              </Section>

              {submitError && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-[12.5px] text-red-600 font-medium">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#163A22] text-white text-[13.5px] font-bold disabled:opacity-60"
              >
                {submitting
                  ? editingId
                    ? 'Memperbarui…'
                    : 'Mengirim…'
                  : editingId
                    ? 'Simpan Perubahan'
                    : 'Kirim Pengajuan'}
              </button>
            </form>
          </main>
        )}

        {activeTab === 'history' && (
          <main className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
            <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
              <div>
                <p className="text-[14px] font-extrabold text-slate-900">Filter Riwayat</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Default periode cutoff 26 → 25.
                </p>
              </div>
              <div className="flex gap-1.5">
                {[
                  { val: '', label: 'Semua' },
                  { val: 'kasbon', label: 'Kasbon' },
                  { val: 'pinjaman', label: 'Pinjaman' },
                ].map(({ val, label }) => (
                  <button
                    key={val || 'all'}
                    type="button"
                    onClick={() => setTypeFilter(val)}
                    className={`flex-1 h-[32px] rounded-[8px] text-[11.5px] font-bold border ${
                      typeFilter === val
                        ? 'bg-[#163A22] text-white border-transparent'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">Dari</label>
                  <input
                    className={inputCls}
                    type="date"
                    value={historyStart}
                    onChange={(e) => setHistoryStart(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">
                    Sampai
                  </label>
                  <input
                    className={inputCls}
                    type="date"
                    value={historyEnd}
                    onChange={(e) => setHistoryEnd(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={fetchHistory}
                className="w-full h-[36px] rounded-[10px] bg-[#163A22] text-white text-[11.5px] font-bold"
              >
                Terapkan Filter
              </button>
            </section>

            {historyLoading ? (
              <div className="rounded-[14px] border border-slate-100 bg-white py-10 text-center text-[13px] text-slate-400">
                Memuat riwayat…
              </div>
            ) : historyError ? (
              <div className="rounded-[14px] border border-red-100 bg-red-50 p-4 text-[13px] text-red-600 text-center">
                {historyError}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-slate-200 bg-white flex flex-col items-center gap-2 py-10 px-4 text-slate-400">
                <Banknote className="w-8 h-8 text-slate-300" />
                <div className="text-[13px] font-semibold text-slate-500">Belum ada pengajuan</div>
                <div className="text-[12px] text-center leading-relaxed">
                  Pengajuan kasbon atau pinjaman akan tampil di sini.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((s) => (
                  <KasbonCard
                    key={s.id}
                    submission={s}
                    employeeName={employeeName || '–'}
                    onEdit={() => startEdit(s)}
                    onDelete={() => setDeleteConfirmId(s.id)}
                    expandedDetail={expandedDetail[s.id]}
                    loadingDetail={!!loadingDetail[s.id]}
                    onTogglePayments={() => togglePayments(s.id)}
                  />
                ))}
              </div>
            )}
          </main>
        )}

        <MobileCameraCapture
          open={showCamera}
          title="Ambil Foto Bukti"
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />

        {success && (
          <div
            className="fixed inset-0 z-[100] bg-black/50 grid place-items-center px-6"
            onClick={resetForm}
          >
            <div
              className="bg-white rounded-3xl p-7 text-center max-w-[300px] w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-full bg-[#EEF8E3] border border-[#7BC32C]/40 grid place-items-center mx-auto mb-4">
                <Banknote className="w-7 h-7 text-[#163A22]" />
              </div>
              <div className="text-[16px] font-bold text-slate-900 mb-1.5">
                {editingId ? 'Pengajuan Diperbarui!' : 'Pengajuan Terkirim!'}
              </div>
              <div className="text-[12.5px] text-slate-500 leading-relaxed mb-5">
                {editingId
                  ? 'Perubahan berhasil disimpan.'
                  : `Pengajuan ${type === 'kasbon' ? 'kasbon' : 'pinjaman'} berhasil dikirim dan menunggu persetujuan.`}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setActiveTab('history');
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#163A22] text-white text-[13px] font-bold"
                >
                  Lihat Riwayat
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[13px] font-semibold"
                >
                  {editingId ? 'Tutup' : 'Buat Pengajuan Baru'}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirmId && (
          <div className="fixed inset-0 z-[150] bg-black/50 grid place-items-center px-6">
            <div className="bg-white rounded-3xl p-6 text-center max-w-[300px] w-full shadow-2xl">
              <div className="text-[15px] font-bold text-slate-900 mb-2">Batalkan Pengajuan?</div>
              <p className="text-[12.5px] text-slate-500 leading-relaxed mb-5">
                Pengajuan ini akan dihapus secara permanen.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[13px] font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirmId)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-bold disabled:opacity-60"
                >
                  {deleting ? 'Menghapus…' : 'Ya, Hapus'}
                </button>
              </div>
            </div>
          </div>
        )}

        <MobileWorkerBottomNav />
      </div>
    </div>
  );
}
