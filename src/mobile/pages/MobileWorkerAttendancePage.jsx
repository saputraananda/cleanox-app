import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, X } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import MobileCameraCapture from '@mobile/components/MobileCameraCapture.jsx';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';
import {
  DEFAULT_ABSEN_RADIUS_KM,
  resolveAttendanceLocationLabel,
} from '@mobile/utils/attendanceLocation.js';

const MONTHS_ID_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const pad2 = (n) => String(n).padStart(2, '0');

function normalizePhotoPath(path) {
  return String(path || '')
    .replace(/^\/api/, '')
    .replace(/^\//, '');
}

function revokeBlobUrl(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

async function fetchPhotoBlobUrl(path) {
  const normalized = normalizePhotoPath(path);
  if (!normalized) return '';
  try {
    const blobRes = await api.get(normalized, { responseType: 'blob' });
    return URL.createObjectURL(blobRes.data);
  } catch {
    return '';
  }
}

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

function LihatFotoButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full h-[30px] rounded-[9px] border border-[#163A22] bg-[#163A22] text-white text-[10.5px] font-bold tracking-[.02em] flex items-center justify-center gap-1 transition hover:bg-[#20492C] active:scale-[.98]"
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 10s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5z" />
        <circle cx="10" cy="10" r="2.4" />
      </svg>
      Lihat Foto
    </button>
  );
}

export default function MobileWorkerAttendancePage() {
  const [attendance, setAttendance] = useState(null);
  const [checkInFile, setCheckInFile] = useState(null);
  const [checkoutProofFile, setCheckoutProofFile] = useState(null);
  const [checkInMeta, setCheckInMeta] = useState(null);
  const [checkOutMeta, setCheckOutMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [photoRequirementAlertOpen, setPhotoRequirementAlertOpen] = useState(false);
  const [checkoutPhotoRequirementAlertOpen, setCheckoutPhotoRequirementAlertOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [cameraTarget, setCameraTarget] = useState(null);
  const [checkInPreviewUrl, setCheckInPreviewUrl] = useState('');
  const [checkoutProofPreviewUrl, setCheckoutProofPreviewUrl] = useState('');
  const [savedCheckInPhotoUrl, setSavedCheckInPhotoUrl] = useState('');
  const [savedCheckOutPhotoUrl, setSavedCheckOutPhotoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [activeLeave, setActiveLeave] = useState(null);
  const [activeOffDay, setActiveOffDay] = useState(null);
  const [absenOffice, setAbsenOffice] = useState(null);
  const checkInPreviewUrlRef = useRef('');
  const checkoutProofPreviewUrlRef = useRef('');
  const savedCheckInPhotoUrlRef = useRef('');
  const savedCheckOutPhotoUrlRef = useRef('');

  const leaveLocksAttendance = Boolean(
    activeLeave
    && activeLeave.duration_type === 'full_day'
    && ['pengajuan', 'disetujui'].includes(activeLeave.status)
  );

  const offDayLocksAttendance = Boolean(activeOffDay);
  const blocksCheckIn = leaveLocksAttendance || offDayLocksAttendance;

  const resolveLocationLabel = useCallback(
    (lat, lng) => {
      if (!absenOffice) return null;
      return resolveAttendanceLocationLabel(
        lat,
        lng,
        absenOffice.latitude,
        absenOffice.longitude,
        absenOffice.radius_km ?? DEFAULT_ABSEN_RADIUS_KM
      );
    },
    [absenOffice]
  );

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [{ data: attendanceData }, leaveRes, offDayRes, absenLocRes] = await Promise.all([
        api.get('/mobile-attendance/today-status'),
        api.get('/mobile-leave/today').catch(() => ({ data: { leave: null } })),
        api.get('/mobile-off-day/today').catch(() => ({ data: { off_day: null } })),
        api.get('/mobile-attendance/absen-location').catch(() => ({ data: null })),
      ]);
      const row = attendanceData.attendance || null;
      setAttendance(row);
      setActiveLeave(leaveRes.data?.leave || null);
      setActiveOffDay(offDayRes.data?.off_day || null);

      const office = absenLocRes?.data;
      if (
        office &&
        Number.isFinite(Number(office.latitude)) &&
        Number.isFinite(Number(office.longitude))
      ) {
        setAbsenOffice({
          name: office.name || 'Head Office Alora',
          latitude: Number(office.latitude),
          longitude: Number(office.longitude),
          radius_km: Number(office.radius_km) || DEFAULT_ABSEN_RADIUS_KM,
        });
      } else {
        setAbsenOffice(null);
      }

      const checkInPath =
        attendanceData.check_in_photo?.path || row?.check_in_photo_path || '';
      const checkOutPath =
        attendanceData.check_out_photo?.path || row?.check_out_photo_path || '';

      const [nextInUrl, nextOutUrl] = await Promise.all([
        checkInPath ? fetchPhotoBlobUrl(checkInPath) : Promise.resolve(''),
        checkOutPath ? fetchPhotoBlobUrl(checkOutPath) : Promise.resolve(''),
      ]);

      setSavedCheckInPhotoUrl((prev) => {
        revokeBlobUrl(prev);
        return nextInUrl;
      });
      setSavedCheckOutPhotoUrl((prev) => {
        revokeBlobUrl(prev);
        return nextOutUrl;
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengambil status absensi');
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

  const handleCheckInFileChange = (file) => {
    setCheckInFile(file || null);
    if (!file) setCheckInMeta(null);
    setCheckInPreviewUrl((prev) => {
      if (prev?.startsWith?.('blob:')) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  const handleCheckoutProofChange = (file) => {
    setCheckoutProofFile(file || null);
    if (!file) setCheckOutMeta(null);
    setCheckoutProofPreviewUrl((prev) => {
      if (prev?.startsWith?.('blob:')) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  useEffect(() => {
    checkInPreviewUrlRef.current = checkInPreviewUrl;
  }, [checkInPreviewUrl]);

  useEffect(() => {
    checkoutProofPreviewUrlRef.current = checkoutProofPreviewUrl;
  }, [checkoutProofPreviewUrl]);

  useEffect(() => {
    savedCheckInPhotoUrlRef.current = savedCheckInPhotoUrl;
  }, [savedCheckInPhotoUrl]);

  useEffect(() => {
    savedCheckOutPhotoUrlRef.current = savedCheckOutPhotoUrl;
  }, [savedCheckOutPhotoUrl]);

  useEffect(() => {
    return () => {
      revokeBlobUrl(checkInPreviewUrlRef.current);
      revokeBlobUrl(checkoutProofPreviewUrlRef.current);
      revokeBlobUrl(savedCheckInPhotoUrlRef.current);
      revokeBlobUrl(savedCheckOutPhotoUrlRef.current);
    };
  }, []);

  const openPhotoPreview = (url, title) => {
    if (!url) return;
    setPhotoPreview({ url, title });
  };

  const closePhotoPreview = () => setPhotoPreview(null);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!checkInFile) {
      setPhotoRequirementAlertOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('check_in_photo', checkInFile);
      if (checkInMeta?.latitude != null) formData.append('latitude', String(checkInMeta.latitude));
      if (checkInMeta?.longitude != null) formData.append('longitude', String(checkInMeta.longitude));
      if (checkInMeta?.locationName) formData.append('location_name', checkInMeta.locationName);

      await api.post('/mobile-attendance/check-in', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Absen masuk berhasil. Lanjut isi foto grooming jika belum.');
      handleCheckInFileChange(null);
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan absen masuk');
    } finally {
      setSubmitting(false);
    }
  };

  const submitCheckOut = async () => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('check_out_photo', checkoutProofFile);
      if (checkOutMeta?.latitude != null) formData.append('latitude', String(checkOutMeta.latitude));
      if (checkOutMeta?.longitude != null) formData.append('longitude', String(checkOutMeta.longitude));
      if (checkOutMeta?.locationName) formData.append('location_name', checkOutMeta.locationName);

      await api.post('/mobile-attendance/check-out', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      handleCheckoutProofChange(null);
      setSuccess('Absen pulang berhasil disimpan.');
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan absen pulang');
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

    await submitCheckOut();
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

          <div className="relative z-[1] flex items-center justify-between px-[18px] pt-[14px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link
                to="/mobile-worker"
                className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0 overflow-hidden">
                <div className="text-[14px] font-extrabold text-white truncate">Absensi</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">Foto masuk & foto pulang</div>
              </div>
            </div>
          </div>

          <div className="relative z-[1] flex items-end justify-between px-[18px] pt-[14px]">
            <div>
              <div className="font-mono text-[26px] font-bold text-white tracking-[-1px] leading-none">{liveTime}</div>
              <div className="text-[11.5px] text-white/45 font-medium mt-1">{liveDate}</div>
            </div>
            <div className="text-[10px] font-bold tracking-[.03em] px-2.5 py-[5px] rounded-full bg-white/12 text-white/85 border border-white/10 whitespace-nowrap flex-shrink-0">
              Masuk / Pulang
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 sm:pt-[14px] pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {success && <div className="rounded-2xl border border-[#163A22] bg-[#163A22] p-3 text-sm text-white">{success}</div>}

          {offDayLocksAttendance && (
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
              Hari ini <b>libur</b> — tidak perlu absensi.
              {activeOffDay?.note ? (
                <span className="block mt-1 text-xs text-slate-500">{activeOffDay.note}</span>
              ) : null}
            </div>
          )}

          {leaveLocksAttendance && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Absensi terkunci karena ada izin <b>seharian penuh</b> ({activeLeave.leave_type}, status{' '}
              {activeLeave.status}). Lihat menu Izin / Cuti.
            </div>
          )}

          <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-3">
            <div>
              <p className="text-[14px] font-extrabold text-slate-900">Status Hari Ini</p>
              <p className="text-[11px] text-slate-500">Pantau absen masuk dan absen pulang karyawan.</p>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Memuat status absensi...</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] p-3">
                  <p className="text-[10px] uppercase tracking-[.06em] text-slate-400 font-bold">Masuk</p>
                  <p className="mt-1 text-[14px] font-extrabold text-slate-900">{formatDateTime(attendance?.check_in_at)}</p>
                  <p className="mt-1 text-[10.5px] text-slate-500">
                    {attendance?.check_in_location_name || 'Lokasi belum tercatat'}
                  </p>
                  {attendance?.check_in_at && savedCheckInPhotoUrl ? (
                    <LihatFotoButton onClick={() => openPhotoPreview(savedCheckInPhotoUrl, 'Foto In')} />
                  ) : null}
                </div>
                <div className="rounded-[14px] border border-slate-100 bg-[#FAFBFC] p-3">
                  <p className="text-[10px] uppercase tracking-[.06em] text-slate-400 font-bold">Pulang</p>
                  <p className="mt-1 text-[14px] font-extrabold text-slate-900">{formatDateTime(attendance?.check_out_at)}</p>
                  <p className="mt-1 text-[10.5px] text-slate-500">
                    {attendance?.check_out_location_name || 'Lokasi belum tercatat'}
                  </p>
                  {attendance?.check_out_at && savedCheckOutPhotoUrl ? (
                    <LihatFotoButton onClick={() => openPhotoPreview(savedCheckOutPhotoUrl, 'Foto Out')} />
                  ) : null}
                </div>
              </div>
            )}
          </section>

          {!attendance?.check_in_at && !blocksCheckIn && (
            <form onSubmit={handleCheckIn} className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-4">
              <div>
                <p className="text-[14px] font-extrabold text-slate-900">Foto In</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ambil 1 foto untuk absen masuk. Foto grooming ada di menu terpisah.
                </p>
              </div>

              <div className="rounded-[16px] border border-slate-200 p-3 bg-[#FAFBFC]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] font-bold text-slate-800">Foto Absen Masuk</p>
                    <p className="text-[10.5px] text-slate-500 mt-1">
                      {checkInFile ? 'Foto siap' : 'Belum ada foto'}
                    </p>
                  </div>
                  {checkInFile ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <Camera className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCameraTarget({ key: 'check_in_photo', label: 'Foto In' })}
                  className="mt-3 w-full h-[40px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:border-[#163A22] hover:text-white hover:bg-[#163A22] transition"
                >
                  <Camera className="w-4 h-4" />
                  {checkInFile ? 'Ambil Ulang' : 'Ambil Foto'}
                </button>

                {checkInPreviewUrl && (
                  <div className="relative mt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckInFileChange(null);
                      }}
                      className="absolute right-2 top-2 z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg"
                      aria-label="Hapus foto in"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openPhotoPreview(checkInPreviewUrl, 'Foto In')}
                      className="block w-full text-left"
                    >
                      <img src={checkInPreviewUrl} alt="Foto In" className="h-40 w-full rounded-2xl object-cover" />
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-[42px] rounded-[12px] bg-[#163A22] px-4 text-[12.5px] font-extrabold text-white hover:bg-[#20492C] disabled:opacity-60"
              >
                {submitting ? 'Menyimpan Absen Masuk...' : 'Simpan Absen Masuk'}
              </button>
            </form>
          )}

          {attendance?.check_in_at && !attendance?.check_out_at && (
            <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 space-y-4">
              <div>
                <p className="text-[14px] font-extrabold text-slate-900">Absen Pulang</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Absen masuk sudah tersimpan. Ambil 1 foto bukti absen pulang sebelum pekerjaan ditutup.
                </p>
              </div>
              <div className="rounded-[16px] border border-slate-200 p-3 bg-[#FAFBFC]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] font-bold text-slate-800">Foto Out</p>
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
                  onClick={() => setCameraTarget({ key: 'check_out_photo', label: 'Foto Out' })}
                  className="mt-3 w-full h-[40px] rounded-[12px] border-2 border-dashed border-slate-300 text-slate-600 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:border-[#163A22] hover:text-white hover:bg-[#163A22] transition"
                >
                  <Camera className="w-4 h-4" />
                  {checkoutProofFile ? 'Ambil Ulang' : 'Ambil Foto'}
                </button>

                {checkoutProofPreviewUrl && (
                  <div className="relative mt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckoutProofChange(null);
                      }}
                      className="absolute right-2 top-2 z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg"
                      aria-label="Hapus foto out"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openPhotoPreview(checkoutProofPreviewUrl, 'Foto Out')}
                      className="block w-full text-left"
                    >
                      <img
                        src={checkoutProofPreviewUrl}
                        alt="Foto Out"
                        className="h-40 w-full rounded-2xl object-cover"
                      />
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCheckOut}
                disabled={submitting}
                className="w-full h-[42px] rounded-[12px] bg-[#163A22] px-4 text-[12.5px] font-extrabold text-white hover:bg-[#20492C] disabled:opacity-60"
              >
                {submitting ? 'Menyimpan Check-Out...' : 'Check-Out Attendance'}
              </button>
            </section>
          )}

          {attendance?.check_in_at && (
            <Link
              to="/mobile-worker/grooming"
              className="rounded-[18px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)] border border-slate-200 text-[13px] font-semibold text-[#163A22]"
            >
              Buka menu Foto Grooming →
            </Link>
          )}
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileCameraCapture
        open={Boolean(cameraTarget)}
        title={cameraTarget ? `Ambil ${cameraTarget.label}` : 'Ambil Foto'}
        variant="ikm"
        initialFacingMode="user"
        confirmLabel="Ambil Foto"
        includeLocation
        locationDisplayMode="label"
        resolveLocationLabel={resolveLocationLabel}
        onClose={() => setCameraTarget(null)}
        onCapture={(file, meta) => {
          const key = cameraTarget?.key;
          setCameraTarget(null);
          if (key === 'check_out_photo') {
            setCheckOutMeta(meta || null);
            handleCheckoutProofChange(file);
            return;
          }
          if (key === 'check_in_photo') {
            setCheckInMeta(meta || null);
            handleCheckInFileChange(file);
          }
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
                {photoPreview.title || 'Foto Absensi'}
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
                  alt={photoPreview.title || 'Foto absensi'}
                  className="w-full h-auto max-h-[72dvh] object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <MobileConfirmDialog
        open={photoRequirementAlertOpen}
        title="Check-In Belum Bisa Diproses"
        description="Ambil dulu Foto In sebelum melakukan absen masuk."
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
        description="Ambil dulu Foto Out sebelum melakukan absen pulang."
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
