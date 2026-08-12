import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Hash,
  LogOut,
  Mail,
  Shield,
  UserRound,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import { clearAuth, getToken, getUser, setAuth } from '@shared/utils/auth.js';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';
import MobileWorkerBottomNav from '@mobile/components/MobileWorkerBottomNav.jsx';

const initials = (name) => {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
};

export default function MobileWorkerProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getUser());
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        if (cancelled || !data?.user) return;
        const token = getToken();
        if (token) setAuth(token, data.user);
        setUser(data.user);
      } catch {
        // keep local session if refresh fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const name = user?.name || 'Worker';
  const roleLabel = user?.role || 'Karyawan';

  const infoRows = [
    { label: 'Nama Lengkap', value: user?.name, Icon: UserRound },
    { label: 'Kode Karyawan', value: user?.employee_code, Icon: Hash },
    { label: 'Email', value: user?.email, Icon: Mail },
    { label: 'Role', value: user?.role, Icon: Shield },
    {
      label: 'Company',
      value: user?.company_name || null,
      Icon: Building2,
    },
  ].filter((row) => row.value);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await clearAuth();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  };

  return (
    <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-white flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-[calc(110px+env(safe-area-inset-bottom))] bg-[#F7F8F5]">
          {/* Header hijau — gradien bulat bertingkat seperti referensi */}
          <div
            className="relative mx-3 mt-3 overflow-hidden text-white rounded-[28px] pb-9 shadow-[0_14px_32px_rgba(22,58,34,.28)]"
            style={{
              background: `
                radial-gradient(120% 90% at 12% -10%, rgba(123,195,44,.28) 0%, transparent 42%),
                radial-gradient(90% 70% at 88% 108%, rgba(15,40,22,.55) 0%, transparent 48%),
                radial-gradient(70% 55% at 70% 20%, rgba(47,107,56,.45) 0%, transparent 55%),
                radial-gradient(80% 60% at 30% 80%, rgba(32,73,44,.5) 0%, transparent 50%),
                linear-gradient(145deg, #1B4A28 0%, #163A22 42%, #20492C 78%, #295733 100%)
              `,
              paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
            }}
          >
            {/* highlight arc lembut */}
            <div
              className="absolute -top-16 -left-10 w-[240px] h-[240px] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(143,210,70,.22) 0%, transparent 68%)' }}
            />
            <div
              className="absolute -bottom-20 -right-8 w-[220px] h-[220px] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(10,30,16,.4) 0%, transparent 70%)' }}
            />

            <div className="relative z-[1] px-4">
              <div className="grid grid-cols-[40px_1fr_40px] items-center">
                <Link
                  to="/mobile-worker"
                  className="w-10 h-10 grid place-items-center text-white/90 hover:text-white"
                  aria-label="Kembali"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-center text-[17px] font-semibold tracking-[-0.01em]">Profil</h1>
                <div aria-hidden />
              </div>

              <div className="mt-3 flex flex-col items-center">
                <div className="w-[88px] h-[88px] rounded-full bg-white p-[3px] shadow-[0_12px_28px_rgba(0,0,0,.18)]">
                  <div className="w-full h-full rounded-full bg-[#EEF8E3] text-[#163A22] text-[26px] font-extrabold grid place-items-center overflow-hidden">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="foto" className="w-full h-full object-cover" />
                    ) : (
                      initials(name)
                    )}
                  </div>
                </div>

                <h2 className="mt-2.5 text-[18px] font-extrabold tracking-[-0.02em] text-center">
                  {name}
                </h2>
                <p className="mt-0.5 text-[12px] font-medium text-white/70 text-center">{roleLabel}</p>
              </div>
            </div>
          </div>

          <div className="relative mt-4 mx-4 px-4 pt-1 pb-2 bg-white rounded-[20px] shadow-[0_8px_24px_rgba(15,23,42,.06)]">
            {infoRows.length === 0 ? (
              <p className="text-[13px] text-slate-500 py-6 text-center">Data profil belum tersedia.</p>
            ) : (
              <div>
                {infoRows.map((row) => {
                  const Icon = row.Icon;
                  return (
                    <div
                      key={row.label}
                      className="flex items-start gap-3.5 py-4 border-b border-slate-100 last:border-0"
                    >
                      <div className="mt-0.5 w-9 h-9 rounded-full bg-[#F4FAEC] text-[#163A22] grid place-items-center flex-shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-slate-400 tracking-wide">{row.label}</p>
                        <p className="mt-0.5 text-[14px] font-semibold text-slate-800 break-all">{row.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              disabled={loggingOut}
              className="mt-4 mb-2 w-full flex items-center justify-center gap-2 h-[48px] rounded-[14px] bg-[#FCECEC] text-[#C23B3B] text-[14px] font-extrabold hover:bg-[#F8DADA] disabled:opacity-60"
            >
              <LogOut className="w-4 h-4" />
              {loggingOut ? 'Keluar...' : 'Logout'}
            </button>
          </div>
        </div>

        <MobileWorkerBottomNav />
      </div>

      <MobileConfirmDialog
        open={logoutOpen}
        variant="danger"
        title="Keluar dari akun?"
        desc="Sesi Anda akan diakhiri dan Anda perlu login kembali untuk masuk."
        confirmLabel="Logout"
        busy={loggingOut}
        onClose={() => {
          if (!loggingOut) setLogoutOpen(false);
        }}
        onConfirm={handleLogout}
      />
    </div>
  );
}
