import { NavLink, useLocation } from 'react-router-dom';
import { Home, CalendarDays, User } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/mobile-worker', label: 'Beranda', icon: Home, isActive: (pathname) => pathname === '/mobile-worker' },
  {
    to: '/mobile-worker/riwayat',
    label: 'Riwayat',
    icon: CalendarDays,
    isActive: (pathname) => pathname === '/mobile-worker/riwayat',
  },
  {
    to: '/mobile-worker/profile',
    label: 'Profil',
    icon: User,
    isActive: (pathname) => pathname === '/mobile-worker/profile',
  },
];

export default function MobileWorkerBottomNav() {
  const { pathname } = useLocation();

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-[430px] bg-white border-t border-slate-200 px-4 sm:px-5 pt-1.5 shadow-[0_-4px_24px_rgba(0,0,0,.06)]"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <nav className="grid grid-cols-3 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.isActive(pathname);
            return (
              <NavLink
                key={`${item.label}-${item.to}`}
                to={item.to}
                className={() =>
                  `relative flex flex-col items-center gap-1 px-2 py-2 pb-1.5 rounded-[14px] no-underline text-[10px] font-semibold tracking-[.02em] transition ${
                    active
                      ? 'text-[#163A22]'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {() => (
                  <>
                    {active && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-b-[3px] bg-[#7BC32C]" />
                    )}
                    <Icon className="w-[22px] h-[22px]" strokeWidth={1.9} />
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
