import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Plus } from 'lucide-react';
import api from '@shared/utils/api.js';
import { getToken } from '@shared/utils/auth.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';

const LEAVE_TYPES = [
  {
    key: 'izin',
    label: 'Izin',
    desc: 'Kepentingan pribadi / keluarga',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
  {
    key: 'sakit',
    label: 'Sakit',
    desc: 'Wajib sertakan surat dokter',
    color: '#EF4444',
    bg: '#FEF2F2',
  },
  {
    key: 'cuti',
    label: 'Cuti',
    desc: 'Cuti tahunan (bisa multi-hari)',
    color: '#059669',
    bg: '#ECFDF5',
  },
];

const DURATION_TYPES = [
  {
    key: 'full_day',
    label: 'Seharian Penuh',
    desc: 'Tidak masuk seharian — absensi terkunci',
  },
  {
    key: 'half_day_morning',
    label: 'Setengah Hari (Pagi)',
    desc: 'Izin pagi; dicatat untuk administrasi',
  },
  {
    key: 'half_day_afternoon',
    label: 'Setengah Hari (Siang)',
    desc: 'Izin siang; dicatat untuk administrasi',
  },
];

const STATUS_META = {
  pengajuan: { label: 'Menunggu Persetujuan', color: '#F59E0B', bg: '#FFFBEB' },
  disetujui: { label: 'Disetujui', color: '#059669', bg: '#ECFDF5' },
  ditolak: { label: 'Ditolak', color: '#EF4444', bg: '#FEF2F2' },
};

const LEAVE_TYPE_LABEL = { izin: 'Izin', sakit: 'Sakit', cuti: 'Cuti' };
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const DURATION_LABEL = {
  full_day: 'Seharian Penuh',
  half_day_morning: 'Setengah Hari – Pagi',
  half_day_afternoon: 'Setengah Hari – Siang',
};

const fmt2 = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
};
const formatDateID = (str) => {
  if (!str) return '-';
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const formatDateTimeID = (str) => {
  if (!str) return '-';
  const d = new Date(str);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pengajuan;
  return (
    <span
      style={{ background: m.bg, color: m.color }}
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
    >
      {m.label}
    </span>
  );
}

function LeaveCard({ item, onCancel, onEdit, onViewDoctorNote }) {
  const lt = LEAVE_TYPES.find((t) => t.key === item.leave_type) || LEAVE_TYPES[0];
  const sameDay =
    item.start_date === item.end_date
    || item.start_date?.slice(0, 10) === item.end_date?.slice(0, 10);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,.06)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100" style={{ background: lt.bg }}>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold" style={{ color: lt.color }}>{lt.label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{DURATION_LABEL[item.duration_type]}</div>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <div className="text-[12.5px] text-slate-600">
          {sameDay
            ? formatDateID(item.start_date)
            : `${formatDateID(item.start_date)} – ${formatDateID(item.end_date)}`}
        </div>
        <div className="text-[12.5px] text-slate-600 line-clamp-2">{item.reason}</div>
        {item.doctor_note_file && (
          <button
            type="button"
            onClick={() => onViewDoctorNote(item)}
            className="flex items-center gap-2 mt-1 px-3 py-1.5 rounded-xl bg-[#EEF8E3] border border-[#7BC32C]/40 text-[#163A22] text-[12px] font-semibold"
          >
            <FileText className="w-3.5 h-3.5" />
            Lihat Surat Dokter
          </button>
        )}
        {item.rejection_note && (
          <div className="mt-1 text-[11.5px] text-red-600 bg-red-50 rounded-xl px-3 py-2">
            <span className="font-semibold">Catatan penolakan: </span>
            {item.rejection_note}
          </div>
        )}
        <div className="text-[11px] text-slate-400 pt-0.5">
          Diajukan: {formatDateTimeID(item.created_at)}
        </div>
      </div>
      {item.status === 'pengajuan' && (
        <div className="flex gap-2 px-4 pb-3">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex-1 py-1.5 rounded-xl border border-[#7BC32C]/40 text-[#163A22] text-[12px] font-medium bg-[#EEF8E3]"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onCancel(item)}
            className="flex-1 py-1.5 rounded-xl border border-red-200 text-red-500 text-[12px] font-medium bg-red-50"
          >
            Batalkan
          </button>
        </div>
      )}
    </div>
  );
}

async function fetchDoctorNoteBlobUrl(fileName) {
  const token = getToken();
  const res = await api.get(`/mobile-leave/doctor-notes/${encodeURIComponent(fileName)}`, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return URL.createObjectURL(res.data);
}

export default function MobileWorkerLeavePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const _now = new Date();
  const [filterMonth, setFilterMonth] = useState(_now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(_now.getFullYear());
  const [yearOptions, setYearOptions] = useState([_now.getFullYear()]);
  const [stats, setStats] = useState({ izin: 0, sakit: 0, cuti: 0 });

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [leaveType, setLeaveType] = useState('izin');
  const [durationType, setDurationType] = useState('full_day');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [doctorFile, setDoctorFile] = useState(null);
  const [doctorPreview, setDoctorPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const [doctorNoteItem, setDoctorNoteItem] = useState(null);
  const [doctorNoteUrl, setDoctorNoteUrl] = useState('');

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const { data } = await api.get(
        `/mobile-leave/list?limit=50&month=${filterMonth}&year=${filterYear}`
      );
      setItems(data.items || []);
    } catch {
      setListError('Gagal memuat riwayat pengajuan.');
    } finally {
      setLoadingList(false);
    }
  }, [filterMonth, filterYear]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get(
        `/mobile-leave/stats?month=${filterMonth}&year=${filterYear}`
      );
      setStats(data.stats || { izin: 0, sakit: 0, cuti: 0 });
    } catch {
      setStats({ izin: 0, sakit: 0, cuti: 0 });
    }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    fetchList();
    fetchStats();
  }, [fetchList, fetchStats]);

  useEffect(() => {
    api.get('/mobile-leave/years')
      .then(({ data }) => setYearOptions(data.years || [new Date().getFullYear()]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (leaveType !== 'cuti') setEndDate(startDate);
  }, [leaveType, startDate]);

  useEffect(() => {
    if (durationType !== 'full_day') setEndDate(startDate);
  }, [durationType, startDate]);

  useEffect(() => {
    let revoked = false;
    let url = '';
    if (!doctorNoteItem?.doctor_note_file) {
      setDoctorNoteUrl('');
      return undefined;
    }
    fetchDoctorNoteBlobUrl(doctorNoteItem.doctor_note_file)
      .then((blobUrl) => {
        if (revoked) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        url = blobUrl;
        setDoctorNoteUrl(blobUrl);
      })
      .catch(() => setDoctorNoteUrl(''));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
      setDoctorNoteUrl('');
    };
  }, [doctorNoteItem]);

  const openNew = () => {
    setEditTarget(null);
    setLeaveType('izin');
    setDurationType('full_day');
    setStartDate(todayStr());
    setEndDate(todayStr());
    setReason('');
    setDoctorFile(null);
    setDoctorPreview(null);
    setSubmitError(null);
    setFormOpen(true);
  };

  const openEdit = async (item) => {
    setEditTarget(item);
    setLeaveType(item.leave_type);
    setDurationType(item.duration_type);
    setStartDate(item.start_date?.slice(0, 10) || todayStr());
    setEndDate(item.end_date?.slice(0, 10) || todayStr());
    setReason(item.reason || '');
    setDoctorFile(null);
    setSubmitError(null);
    setFormOpen(true);
    if (item.doctor_note_file) {
      try {
        const url = await fetchDoctorNoteBlobUrl(item.doctor_note_file);
        setDoctorPreview(url);
      } catch {
        setDoctorPreview(null);
      }
    } else {
      setDoctorPreview(null);
    }
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDoctorFile(file);
    const url = URL.createObjectURL(file);
    setDoctorPreview((prev) => {
      if (prev?.startsWith?.('blob:')) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!reason.trim() || reason.trim().length < 5) {
      setSubmitError('Keterangan wajib diisi minimal 5 karakter.');
      return;
    }
    if (leaveType === 'sakit' && !doctorFile && !editTarget?.doctor_note_file) {
      setSubmitError('Foto surat dokter wajib dilampirkan untuk izin sakit.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('leave_type', leaveType);
      formData.append('duration_type', durationType);
      formData.append('start_date', startDate);
      formData.append('end_date', endDate);
      formData.append('reason', reason.trim());
      if (doctorFile) formData.append('doctor_note', doctorFile);

      if (editTarget) {
        await api.put(`/mobile-leave/${editTarget.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/mobile-leave', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      setFormOpen(false);
      fetchList();
      fetchStats();
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Terjadi kesalahan, coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.delete(`/mobile-leave/${cancelTarget.id}`);
      setCancelTarget(null);
      fetchList();
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal membatalkan pengajuan.');
    } finally {
      setCancelling(false);
    }
  };

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
              onClick={() => navigate(-1)}
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold tracking-[.12em] uppercase text-white/80">
                Karyawan Cleanox
              </div>
              <div className="text-[15px] font-extrabold text-white tracking-[-0.01em] truncate">
                Izin / Cuti
              </div>
            </div>
            <button
              type="button"
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#7BC32C] text-[#163A22] text-[12px] font-bold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajukan
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 sm:pt-[14px] pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Periode</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Filter riwayat pengajuan cutoff bulanan.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(Number(e.target.value))}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-700 bg-[#FAFBFC]"
              >
                {MONTHS_ID.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value))}
                className="w-[96px] border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-700 bg-[#FAFBFC]"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="rounded-[12px] border border-slate-100 bg-[#FAFBFC] px-3 py-2 text-[11px] text-slate-500 text-center">
              {(() => {
                const pm = filterMonth === 1 ? 12 : filterMonth - 1;
                const py = filterMonth === 1 ? filterYear - 1 : filterYear;
                return `Periode: 26 ${MONTHS_ID[pm - 1].slice(0, 3)} ${py} – 25 ${MONTHS_ID[filterMonth - 1].slice(0, 3)} ${filterYear}`;
              })()}
            </div>
          </section>

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Ringkasan</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Total pengajuan di periode terpilih.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'izin', label: 'Total Izin', count: stats.izin, color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
                { key: 'sakit', label: 'Total Sakit', count: stats.sakit, color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
                { key: 'cuti', label: 'Total Cuti', count: stats.cuti, color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
              ].map((s) => (
                <div
                  key={s.key}
                  className="rounded-[14px] border p-3 flex flex-col items-center gap-0.5 text-center"
                  style={{ background: s.bg, borderColor: s.border }}
                >
                  <div className="text-[24px] font-extrabold leading-none" style={{ color: s.color }}>{s.count}</div>
                  <div className="text-[10px] font-semibold text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200">
            <div className="rounded-[14px] bg-[#EEF8E3] border border-[#7BC32C]/30 px-3.5 py-3 text-[12px] text-[#163A22] space-y-1">
              <div className="font-bold">Info izin</div>
              <div className="leading-relaxed">
                Izin <b>seharian penuh</b> (pengajuan/disetujui) mengunci absensi hari itu.
                Setengah hari dicatat untuk administrasi.
              </div>
            </div>
          </section>

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Riwayat Pengajuan</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Daftar izin, sakit, dan cuti Anda.</p>
            </div>

            {loadingList ? (
              <div className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] py-10 text-center text-[13px] text-slate-400">
                Memuat riwayat…
              </div>
            ) : listError ? (
              <div className="rounded-[14px] border border-red-100 bg-red-50 p-4 text-[13px] text-red-600 text-center">
                {listError}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-slate-200 bg-[#FAFBFC] flex flex-col items-center gap-2 py-10 px-4 text-slate-400">
                <FileText className="w-8 h-8 text-slate-300" />
                <div className="text-[13px] font-semibold text-slate-500">Tidak ada pengajuan</div>
                <div className="text-[12px] text-center leading-relaxed">
                  Tidak ada data pada periode <b className="text-slate-600">{MONTHS_ID[filterMonth - 1]} {filterYear}</b>.
                  <br />
                  Ketuk <b className="text-slate-600">Ajukan</b> untuk membuat pengajuan baru.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <LeaveCard
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onCancel={setCancelTarget}
                    onViewDoctorNote={setDoctorNoteItem}
                  />
                ))}
              </div>
            )}
          </section>
        </main>

        {formOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
            onClick={(e) => { if (e.target === e.currentTarget) setFormOpen(false); }}
          >
            <div className="w-full max-w-[430px] bg-white rounded-t-3xl max-h-[92dvh] flex flex-col">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <div className="text-[15px] font-bold text-slate-800">
                  {editTarget ? 'Edit Pengajuan' : 'Buat Pengajuan Izin'}
                </div>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 grid place-items-center"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-600 mb-2">Jenis Izin</label>
                  <div className="grid grid-cols-3 gap-2">
                    {LEAVE_TYPES.map((lt) => (
                      <button
                        key={lt.key}
                        type="button"
                        onClick={() => setLeaveType(lt.key)}
                        className={`rounded-xl border-2 p-2.5 flex flex-col items-center gap-1.5 ${
                          leaveType === lt.key ? 'shadow-sm' : 'border-slate-200 bg-white'
                        }`}
                        style={leaveType === lt.key ? { background: lt.bg, borderColor: lt.color } : {}}
                      >
                        <span
                          className="text-[11.5px] font-semibold"
                          style={{ color: leaveType === lt.key ? lt.color : '#64748b' }}
                        >
                          {lt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-slate-600 mb-2">Durasi</label>
                  <div className="space-y-2">
                    {DURATION_TYPES.map((dt) => (
                      <button
                        key={dt.key}
                        type="button"
                        onClick={() => setDurationType(dt.key)}
                        className={`w-full rounded-xl border-2 px-3 py-2.5 text-left ${
                          durationType === dt.key
                            ? 'border-[#163A22] bg-[#EEF8E3]'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className={`text-[12.5px] font-semibold ${durationType === dt.key ? 'text-[#163A22]' : 'text-slate-700'}`}>
                          {dt.label}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{dt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                      {leaveType === 'cuti' ? 'Tanggal Mulai' : 'Tanggal'}
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      min={todayStr()}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] bg-slate-50"
                    />
                  </div>
                  {leaveType === 'cuti' && (
                    <div>
                      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                        Tanggal Selesai
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] bg-slate-50"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                    Keterangan / Alasan
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Tuliskan alasan pengajuan secara singkat dan jelas..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] bg-slate-50 resize-none"
                  />
                </div>

                {leaveType === 'sakit' && (
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                      Foto Surat Dokter <span className="text-red-500">*</span>
                    </label>
                    {doctorPreview && (
                      <div className="mb-2 rounded-xl overflow-hidden border border-slate-200">
                        <img src={doctorPreview} alt="Surat dokter" className="w-full max-h-40 object-contain bg-slate-100" />
                      </div>
                    )}
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={handleFilePick}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-3 text-[12.5px] text-slate-500"
                    >
                      {doctorFile ? 'Ganti Foto Surat Dokter' : 'Unggah Foto Surat Dokter'}
                    </button>
                  </div>
                )}

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
                  {submitting ? 'Mengirim…' : editTarget ? 'Simpan Perubahan' : 'Kirim Pengajuan'}
                </button>
              </form>
            </div>
          </div>
        )}

        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
            <div className="w-full max-w-[360px] bg-white rounded-3xl p-6 shadow-2xl">
              <div className="text-center mb-4">
                <div className="text-[15px] font-bold text-slate-800">Batalkan Pengajuan?</div>
                <div className="text-[12.5px] text-slate-500 mt-1.5 leading-relaxed">
                  Pengajuan <b>{LEAVE_TYPE_LABEL[cancelTarget.leave_type]}</b> pada{' '}
                  <b>{formatDateID(cancelTarget.start_date)}</b> akan dihapus.
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[13px] font-semibold"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={handleCancelConfirm}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-bold disabled:opacity-60"
                >
                  {cancelling ? 'Membatalkan…' : 'Ya, Batalkan'}
                </button>
              </div>
            </div>
          </div>
        )}

        {doctorNoteItem && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75">
            <div className="w-full max-w-[430px] bg-white rounded-t-3xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <div className="text-[15px] font-bold text-slate-800">Surat Dokter</div>
                  <div className="text-[11.5px] text-slate-400 mt-0.5">
                    {LEAVE_TYPE_LABEL[doctorNoteItem.leave_type]} · {formatDateID(doctorNoteItem.start_date)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDoctorNoteItem(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100"
                >
                  ✕
                </button>
              </div>
              <div className="px-4 py-3 bg-slate-50 flex items-center justify-center min-h-[240px] max-h-[55vh]">
                {doctorNoteUrl ? (
                  <img
                    src={doctorNoteUrl}
                    alt="Surat Dokter"
                    className="max-w-full max-h-[52vh] object-contain rounded-xl shadow"
                  />
                ) : (
                  <span className="text-sm text-slate-400">Memuat gambar…</span>
                )}
              </div>
            </div>
          </div>
        )}

        <MobileWorkerBottomNav />
      </div>
    </div>
  );
}
