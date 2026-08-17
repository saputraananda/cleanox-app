import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ClipboardList, Sparkles, ArrowRight, Clock3, XCircle, CalendarDays, FileText, UserRound, Lock, Banknote } from 'lucide-react';
import { getUser } from '@shared/utils/auth.js';
import api from '@shared/utils/api.js';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';
import {
  computeMorningWorkUnlock,
  isMobileTasksPath,
} from '@mobile/utils/morningWorkUnlock.js';
import cleanoxLogo from '../../assets/cleanox.png';

const MENU_ITEMS = [
  {
    title: 'Absensi',
    description: 'Masuk & pulang kerja',
    icon: Camera,
    to: '/mobile-worker/attendance',
    requiresMorningUnlock: false,
  },
  {
    title: 'Foto Grooming',
    description: '4 foto setelah Foto In',
    icon: UserRound,
    to: '/mobile-worker/grooming',
    requiresMorningUnlock: false,
  },
  {
    title: 'Tugas',
    description: 'Plot & tugas',
    icon: ClipboardList,
    to: '/mobile-worker/tasks',
    requiresMorningUnlock: true,
  },
  {
    title: 'Kebersihan',
    description: 'Checklist pagi & sore',
    icon: Sparkles,
    to: '/mobile-worker/kebersihan',
    requiresMorningUnlock: false,
  },
  {
    title: 'Jadwal',
    description: 'Kalender saya',
    icon: CalendarDays,
    to: '/mobile-worker/calendar',
    requiresMorningUnlock: false,
  },
  {
    title: 'Izin / Cuti',
    description: 'Ajukan izin & cuti',
    icon: FileText,
    to: '/mobile-worker/leave',
    requiresMorningUnlock: false,
  },
  {
    title: 'Kasbon & Pinjam',
    description: 'Ajukan kasbon & pinjaman',
    icon: Banknote,
    to: '/mobile-worker/kasbon',
    requiresMorningUnlock: false,
  },
];

const ACTIVITY_ICON = {
  absensi: Camera,
  grooming: UserRound,
  task: ClipboardList,
  kebersihan: Sparkles,
  task_reschedule: Clock3,
  task_cancel: XCircle,
};

function getActivityIconClass(type, status) {
  if (status === 'selesai') return 'bg-slate-100 text-slate-500';
  if (type === 'absensi' || type === 'grooming') return 'bg-[#EEF8E3] text-[#163A22]';
  if (type === 'task') return 'bg-[#EEF8E3] text-[#7BC32C]';
  if (type === 'task_reschedule') return 'bg-sky-50 text-sky-700';
  if (type === 'task_cancel') return 'bg-rose-50 text-rose-700';
  return 'bg-[#F7F8E0] text-[#B6BF00]';
}

function isKebersihanDone(payload) {
  return payload?.status === 'Completed';
}

function formatTaskServiceLabel(task) {
  return (
    String(task?.service_label || task?.transaction?.service_label || '').trim() || 'Layanan'
  );
}

function formatTaskCustomer(task) {
  return String(task?.transaction?.customer_name || '').trim() || 'Tanpa nama';
}

function formatTaskTime(serviceDate) {
  if (!serviceDate) return '—';
  const raw = String(serviceDate);
  const date = new Date(raw.includes('T') || raw.includes(' ') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const dateKey = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const timeLabel = date.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (dateKey === todayKey) return timeLabel;

  const dayLabel = date.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
  });
  return `${dayLabel}, ${timeLabel}`;
}

function sortTasksByServiceDate(rows = []) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a?.transaction?.service_date || 0).getTime();
    const tb = new Date(b?.transaction?.service_date || 0).getTime();
    return ta - tb;
  });
}

function mapNoticesToCards(notices = []) {
  return notices.map((notice) => ({
    id: `notice-${notice.id}`,
    noticeId: notice.id,
    type: notice.event_type === 'cancel' ? 'task_cancel' : 'task_reschedule',
    status: notice.event_type === 'cancel' ? 'cancel' : 'reschedule',
    title: notice.title || (notice.event_type === 'cancel' ? 'Tugas dibatalkan' : 'Jadwal dipindah'),
    description: notice.description || '',
    to: notice.to || (notice.event_type === 'cancel' ? '/mobile-worker/riwayat' : '/mobile-worker/tasks'),
  }));
}

function buildTodayActivityCards({
  attendance,
  assignedTasks,
  todayTasks,
  kebersihanPagi,
  kebersihanSore,
}) {
  const attendanceRow = attendance?.attendance || null;
  let absensiCard = null;
  if (!attendanceRow?.check_in_at) {
    absensiCard = {
      id: 'absensi-belum',
      type: 'absensi',
      status: 'belum',
      title: 'Anda belum melakukan absensi',
      description: 'Lakukan Foto In / absen masuk untuk memulai hari kerja.',
      to: '/mobile-worker/attendance',
    };
  } else if (!attendanceRow?.check_out_at) {
    absensiCard = {
      id: 'absensi-pulang',
      type: 'absensi',
      status: 'pulang',
      title: 'Silahkan absensi pulang ketika jam pulang',
      description: 'Absen masuk sudah tercatat. Lakukan absen pulang saat pekerjaan selesai.',
      to: '/mobile-worker/attendance',
    };
  }

  let groomingCard = null;
  if (!Boolean(attendance?.grooming_complete)) {
    groomingCard = {
      id: 'grooming-belum',
      type: 'grooming',
      status: 'belum',
      title: 'Anda belum melakukan grooming',
      description: !attendanceRow?.check_in_at
        ? 'Lakukan absensi di Absensi terlebih dahulu, lalu lengkapi 4 foto grooming.'
        : 'Lengkapi 4 foto grooming hari ini.',
      to: '/mobile-worker/grooming',
    };
  }

  // Assigned = semua tanggal (perlu accept); In_Schedule / On_Progress = hari ini saja
  const assignedList = sortTasksByServiceDate(
    (Array.isArray(assignedTasks) ? assignedTasks : []).filter(
      (row) => row.assignment_status === 'Assigned'
    )
  );
  const todayList = Array.isArray(todayTasks) ? todayTasks : [];
  const progressList = sortTasksByServiceDate(
    todayList.filter((row) => row.assignment_status === 'On_Progress')
  );
  const scheduleList = sortTasksByServiceDate(
    todayList.filter((row) => row.assignment_status === 'In_Schedule')
  );

  const taskCards = [
    ...assignedList.map((task) => ({
      id: `task-konfirmasi-${task.assignment_id}`,
      type: 'task',
      status: 'konfirmasi',
      title: 'Ada kerjaan yang perlu dikonfirmasi',
      description: `${formatTaskServiceLabel(task)} · ${formatTaskCustomer(task)} · ${formatTaskTime(
        task.transaction?.service_date
      )}`,
      to: '/mobile-worker/tasks',
    })),
    ...progressList.map((task) => ({
      id: `task-progress-${task.assignment_id}`,
      type: 'task',
      status: 'progress',
      title: 'Sedang dikerjakan',
      description: `${formatTaskServiceLabel(task)} · ${formatTaskCustomer(task)}`,
      to: '/mobile-worker/tasks',
    })),
    ...scheduleList.map((task) => ({
      id: `task-schedule-${task.assignment_id}`,
      type: 'task',
      status: 'schedule',
      title: 'Siap dimulai',
      description: `${formatTaskServiceLabel(task)} · ${formatTaskCustomer(task)}`,
      to: '/mobile-worker/tasks',
    })),
  ];

  let kebersihanCard = null;
  if (!isKebersihanDone(kebersihanPagi)) {
    const uploaded = Number(kebersihanPagi?.uploaded_count || 0);
    const required = Number(kebersihanPagi?.required_count || 4);
    kebersihanCard = {
      id: 'kebersihan-pagi',
      type: 'kebersihan',
      status: 'belum',
      title: 'Anda belum melakukan kebersihan pagi',
      description:
        kebersihanPagi?.status === 'In_Progress'
          ? `Progress foto area ${uploaded}/${required}. Lengkapi sampai 4 foto pagi.`
          : 'Lengkapi 4 foto area kebersihan pagi.',
      to: '/mobile-worker/kebersihan?session=pagi',
    };
  } else if (!isKebersihanDone(kebersihanSore)) {
    const uploaded = Number(kebersihanSore?.uploaded_count || 0);
    const required = Number(kebersihanSore?.required_count || 4);
    kebersihanCard = {
      id: 'kebersihan-sore',
      type: 'kebersihan',
      status: 'belum',
      title: 'Anda belum melakukan kebersihan sore',
      description:
        kebersihanSore?.status === 'In_Progress'
          ? `Progress foto area ${uploaded}/${required}. Lengkapi sampai 4 foto sore.`
          : 'Lengkapi 4 foto area kebersihan sore.',
      to: '/mobile-worker/kebersihan?session=sore',
    };
  }

  return [absensiCard, groomingCard, ...taskCards, kebersihanCard].filter(Boolean);
}

export default function MobileWorkerHomePage() {
  const user = getUser();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [activityCards, setActivityCards] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');
  const [dismissingNoticeId, setDismissingNoticeId] = useState(null);
  const [morningUnlocked, setMorningUnlocked] = useState(false);
  const [requireKebersihanForUnlock, setRequireKebersihanForUnlock] = useState(true);

  const handleNoticeOpen = async (item) => {
    if (!item?.noticeId || !item?.to) return;
    if (dismissingNoticeId) return;
    if (isMobileTasksPath(item.to) && !morningUnlocked) return;
    setDismissingNoticeId(item.noticeId);
    // Hilangkan dari UI segera
    setActivityCards((prev) => prev.filter((card) => card.noticeId !== item.noticeId));
    try {
      await api.post(`/mobile-tasks/notices/${item.noticeId}/dismiss`);
    } catch {
      // tetap lanjut navigasi meski dismiss gagal transient
    } finally {
      setDismissingNoticeId(null);
      navigate(item.to);
    }
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchActivityOnce = () =>
      Promise.allSettled([
        api.get('/mobile-attendance/today-status'),
        api.get('/mobile-tasks', { params: { status: 'Assigned' } }),
        api.get('/mobile-tasks', { params: { status: 'all', on_date: 'today' } }),
        api.get('/mobile-kebersihan/today-status?session=pagi'),
        api.get('/mobile-kebersihan/today-status?session=sore'),
        api.get('/mobile-tasks/notices'),
      ]);

    const isConnectionError = (reason) => {
      const code = reason?.code;
      const message = String(reason?.message || '');
      return (
        code === 'ERR_NETWORK' ||
        code === 'ECONNREFUSED' ||
        message.includes('Network Error') ||
        message.includes('ECONNREFUSED')
      );
    };

    const loadActivity = async () => {
      setActivityLoading(true);
      setActivityError('');
      try {
        let results = await fetchActivityOnce();
        const allConnectionFailed = results.every(
          (item) => item.status === 'rejected' && isConnectionError(item.reason)
        );

        // Retry sekali jika server masih restart (proxy ECONNREFUSED)
        if (allConnectionFailed) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          if (cancelled) return;
          results = await fetchActivityOnce();
        }

        if (cancelled) return;

        const [
          attendanceSettled,
          assignedTasksSettled,
          todayTasksSettled,
          kebersihanPagiSettled,
          kebersihanSoreSettled,
          noticesSettled,
        ] = results;
        const errors = [];
        const attendance =
          attendanceSettled.status === 'fulfilled' ? attendanceSettled.value.data : null;
        const assignedTasks =
          assignedTasksSettled.status === 'fulfilled'
            ? assignedTasksSettled.value.data?.tasks || []
            : [];
        const todayTasks =
          todayTasksSettled.status === 'fulfilled'
            ? todayTasksSettled.value.data?.tasks || []
            : [];
        const kebersihanPagi =
          kebersihanPagiSettled.status === 'fulfilled' ? kebersihanPagiSettled.value.data : null;
        const kebersihanSore =
          kebersihanSoreSettled.status === 'fulfilled' ? kebersihanSoreSettled.value.data : null;
        const notices =
          noticesSettled.status === 'fulfilled' ? noticesSettled.value.data?.notices || [] : [];

        if (attendanceSettled.status === 'rejected') {
          errors.push(attendanceSettled.reason?.response?.data?.message || 'Gagal memuat absensi');
        }
        if (
          assignedTasksSettled.status === 'rejected' &&
          todayTasksSettled.status === 'rejected'
        ) {
          errors.push(
            assignedTasksSettled.reason?.response?.data?.message ||
              todayTasksSettled.reason?.response?.data?.message ||
              'Gagal memuat task'
          );
        }
        if (
          kebersihanPagiSettled.status === 'rejected' &&
          kebersihanSoreSettled.status === 'rejected'
        ) {
          errors.push(
            kebersihanPagiSettled.reason?.response?.data?.message ||
              kebersihanSoreSettled.reason?.response?.data?.message ||
              'Gagal memuat kebersihan'
          );
        } else if (
          kebersihanPagiSettled.status === 'rejected' ||
          kebersihanSoreSettled.status === 'rejected'
        ) {
          errors.push('Sebagian status kebersihan gagal dimuat');
        }

        const unlock = computeMorningWorkUnlock({
          attendancePayload: attendance,
          kebersihanPagiPayload: kebersihanPagi,
          tasks: todayTasks,
        });
        setMorningUnlocked(unlock.unlocked);
        setRequireKebersihanForUnlock(Boolean(unlock.requireKebersihan));

        setActivityCards([
          ...mapNoticesToCards(notices),
          ...buildTodayActivityCards({
            attendance,
            assignedTasks,
            todayTasks,
            kebersihanPagi,
            kebersihanSore,
          }),
        ]);
        setActivityError(errors.length ? errors.join(' · ') : '');
      } catch (err) {
        if (!cancelled) {
          setMorningUnlocked(false);
          setRequireKebersihanForUnlock(true);
          setActivityError(err.response?.data?.message || 'Gagal memuat aksi hari ini');
          setActivityCards(
            buildTodayActivityCards({
              attendance: null,
              assignedTasks: [],
              todayTasks: [],
              kebersihanPagi: null,
              kebersihanSore: null,
            })
          );
        }
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    };

    loadActivity();
    return () => {
      cancelled = true;
    };
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
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [now]
  );

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-white flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-[calc(110px+env(safe-area-inset-bottom))] flex flex-col gap-4 bg-[radial-gradient(circle_at_top_right,rgba(123,195,44,0.10),transparent_26%),linear-gradient(180deg,#ffffff_0%,#fafbff_100%)]">
          <section
            className="relative overflow-hidden rounded-[28px] px-4 pt-4 pb-5 text-white shadow-[0_18px_38px_rgba(22,58,34,.26)]"
            style={{ background: 'linear-gradient(180deg, #163A22 0%, #20492C 58%, #295733 100%)' }}
          >
            <div
              className="absolute -top-[48px] -right-[20px] w-[140px] h-[140px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(123,195,44,.14) 0%, transparent 70%)' }}
            />
            <div
              className="absolute bottom-[-50px] left-[-24px] w-[120px] h-[120px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(22,58,34,.22) 0%, transparent 70%)' }}
            />

            <div className="relative z-[1] flex items-center">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-[12px] bg-white/15 border border-white/15 grid place-items-center text-[11px] font-bold text-white flex-shrink-0 backdrop-blur-xl">
                  foto
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-extrabold text-white truncate">{user?.name || 'Karyawan'}</div>
                  <div className="text-[10px] text-white/55 font-medium truncate mt-px">
                    {user?.employee_code
                      ? `Karyawan · ${user.employee_code}`
                      : 'Karyawan'}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-[1] mt-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-white/80">Selamat Datang</p>
                <div className="mt-1 flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-white/80" />
                  <span className="text-[30px] font-extrabold tracking-[-0.03em] leading-none">{liveTime}</span>
                </div>
                <div className="mt-1 text-[10.5px] text-white/55">{liveDate}</div>
              </div>
              <img src={cleanoxLogo} alt="Cleanox" className="h-16 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.18)]" />
            </div>
          </section>

          <section className="rounded-[24px] bg-white border border-slate-100 shadow-[0_10px_28px_rgba(15,23,42,.06)] px-4 pt-5 pb-4">
            <div className="grid grid-cols-2 gap-y-4 gap-x-2">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = !item.requiresMorningUnlock || morningUnlocked;
                const content = (
                  <div className={`flex flex-col items-center text-center ${active ? '' : 'opacity-40'}`}>
                    <div
                      className={`relative w-[58px] h-[58px] rounded-[18px] grid place-items-center shadow-[0_10px_20px_rgba(15,23,42,.08)] border border-slate-100 ${
                        item.title === 'Absensi'
                          ? 'bg-white text-[#163A22]'
                          : item.title === 'Tugas'
                            ? 'bg-white text-[#163A22]'
                            : 'bg-white text-[#B6BF00]'
                      }`}
                    >
                      <Icon className="w-[24px] h-[24px]" strokeWidth={2.1} />
                      {!active && (
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-200 text-slate-600 grid place-items-center border border-white">
                          <Lock className="w-3 h-3" strokeWidth={2.4} />
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-[11px] font-medium text-slate-700 leading-4">{item.title}</div>
                  </div>
                );

                return active ? (
                  <Link key={item.title} to={item.to}>
                    {content}
                  </Link>
                ) : (
                  <div key={item.title} aria-disabled="true">
                    {content}
                  </div>
                );
              })}
            </div>
            {!morningUnlocked && !activityLoading && (
              <p className="mt-4 text-[10.5px] text-slate-500 leading-4 text-center px-1">
                {requireKebersihanForUnlock
                  ? 'Menu tugas terbuka setelah absensi (masuk), foto grooming, dan kebersihan pagi selesai.'
                  : 'Menu tugas terbuka setelah absensi (masuk) dan foto grooming selesai (ada tugas pagi sebelum jam 09:00).'}
              </p>
            )}
          </section>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[12px] font-extrabold text-slate-900">Aksi Hari Ini</div>
            <div className="text-[10px] font-semibold text-[#163A22]">Lihat Semua</div>
          </div>

          {activityError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
              {activityError}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {activityLoading ? (
              <p className="text-sm text-slate-500 px-1 py-4">Memuat aksi hari ini...</p>
            ) : (
              activityCards.map((item) => {
                const Icon = ACTIVITY_ICON[item.type] || Camera;
                const isDone = item.status === 'selesai';
                const isNotice = item.type === 'task_reschedule' || item.type === 'task_cancel';
                const tasksLocked = isMobileTasksPath(item.to) && !morningUnlocked;
                const noticeOpenable = isNotice && !tasksLocked;

                return (
                  <div
                    key={item.id}
                    role={noticeOpenable ? 'button' : undefined}
                    tabIndex={noticeOpenable ? 0 : undefined}
                    onClick={noticeOpenable ? () => handleNoticeOpen(item) : undefined}
                    onKeyDown={
                      noticeOpenable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleNoticeOpen(item);
                            }
                          }
                        : undefined
                    }
                    className={`rounded-[22px] border border-slate-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)] ${
                      noticeOpenable ? 'cursor-pointer active:scale-[.99] transition' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-[12px] grid place-items-center flex-shrink-0 ${getActivityIconClass(
                            item.type,
                            item.status
                          )}`}
                        >
                          <Icon className="w-4 h-4" strokeWidth={2.1} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-[12.5px] font-extrabold text-slate-900">{item.title}</div>
                            {isDone && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                Selesai
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500 leading-5">{item.description}</div>
                        </div>
                      </div>
                      {item.to && !tasksLocked ? (
                        isNotice ? (
                          <button
                            type="button"
                            disabled={dismissingNoticeId === item.noticeId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNoticeOpen(item);
                            }}
                            className="w-9 h-9 rounded-full bg-[#EEF8E3] text-[#163A22] grid place-items-center flex-shrink-0 disabled:opacity-60"
                            aria-label="Buka notifikasi"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        ) : (
                          <Link
                            to={item.to}
                            className="w-9 h-9 rounded-full bg-[#EEF8E3] text-[#163A22] grid place-items-center flex-shrink-0"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <MobileWorkerBottomNav />
      </div>
    </div>
  );
}
