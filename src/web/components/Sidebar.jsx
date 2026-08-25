import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Factory,
  ClipboardList,
  Users,
  History,
  PlusCircle,
  ClipboardPen,
  ChevronDown,
  CalendarDays,
  Tag,
  BadgePercent,
  Handshake,
  X,
} from 'lucide-react';
import cleanoxLogo from '../../assets/cleanox.png';
import { getUser } from '@shared/utils/auth.js';

const NAV_TREE = [
  {
    type: 'link',
    label: 'Beranda',
    icon: LayoutDashboard,
    to: '/dashboard',
    roles: ['admin', 'management', 'produksi', 'frontliner'],
  },
  {
    type: 'group',
    id: 'cleanox-only',
    label: 'Cleanox Only',
    icon: Sparkles,
    roles: ['admin', 'management'],
    children: [
      { label: 'Dashboard', icon: LayoutDashboard, to: '/cleanox-only/dashboard' },
      { label: 'Tambah Transaksi', icon: PlusCircle, to: '/cleanox-only/transactions/new' },
      { label: 'Input Transaksi History', icon: ClipboardPen, to: '/cleanox-only/transactions/history/new' },
      { label: 'Riwayat Transaksi', icon: History, to: '/cleanox-only/transactions' },
      { label: 'Calendar', icon: CalendarDays, to: '/cleanox-only/calendar' },
      { label: 'Customer', icon: Users, to: '/cleanox-only/customers' },
      { label: 'Referral Waschen', icon: Handshake, to: '/cleanox-only/waschen-referral' },
      { label: 'Prices', icon: Tag, to: '/cleanox-only/prices' },
      { label: 'Promo', icon: BadgePercent, to: '/cleanox-only/promos' },
    ],
  },
  {
    type: 'group',
    id: 'cleanox-by-waschen',
    label: 'Cleanox By Waschen',
    icon: Factory,
    roles: ['admin', 'management', 'produksi', 'frontliner'],
    children: [
      { label: 'Dashboard', icon: ClipboardList, to: '/cleanox-by-waschen/dashboard' },
    ],
  },
];

function canSee(roles, user) {
  if (!roles) return true;
  return roles.includes(user?.role) || (roles.includes('management') && user?.isManagement);
}

export default function Sidebar({ collapsed, mobileOpen, onMobileClose }) {
  const user = getUser();
  const location = useLocation();
  const [expanded, setExpanded] = useState({});

  const visibleTree = NAV_TREE.filter((item) => canSee(item.roles, user));

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      NAV_TREE.forEach((item) => {
        if (item.type !== 'group') return;
        const childActive = item.children.some(
          (child) =>
            location.pathname === child.to || location.pathname.startsWith(`${child.to}/`)
        );
        if (childActive) next[item.id] = true;
      });
      return next;
    });
  }, [location.pathname]);

  const toggleGroup = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const linkClass = ({ isActive }) =>
    `group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 relative
    ${isActive
      ? 'bg-white/15 text-white font-semibold'
      : 'text-brand-100/70 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <aside
      className={`
        fixed lg:relative z-30 h-full flex flex-col
        bg-gradient-to-b from-brand-900 to-brand-700
        transition-all duration-300 ease-in-out
        ${collapsed ? 'lg:w-16' : 'lg:w-64'}
        ${mobileOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0'}
      `}
    >
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          {collapsed ? (
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          ) : (
            <img src={cleanoxLogo} alt="Cleanox" className="h-12 object-contain drop-shadow" />
          )}
        </div>

        <button
          onClick={onMobileClose}
          className="lg:hidden p-1 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={() => {}}
          className="hidden lg:flex p-1 text-white/40 hover:text-white transition-colors"
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {visibleTree.map((item) => {
          if (item.type === 'link') {
            return (
              <NavLink key={item.to} to={item.to} onClick={onMobileClose} className={linkClass}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-lime-400 rounded-r-full" />
                    )}
                    <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                    {!collapsed && <span className="text-sm whitespace-nowrap flex-1">{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          }

          const isOpen = !!expanded[item.id];
          const groupActive = item.children.some(
            (child) =>
              location.pathname === child.to || location.pathname.startsWith(`${child.to}/`)
          );

          return (
            <div key={item.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(item.id)}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 relative
                  ${groupActive
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-brand-100/70 hover:bg-white/10 hover:text-white'
                  }`}
              >
                {groupActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-lime-400/70 rounded-r-full" />
                )}
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-sm whitespace-nowrap flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </>
                )}
              </button>

              {(!collapsed && isOpen) && (
                <div className="ml-3 pl-2 border-l border-dashed border-lime-400/80 space-y-0.5">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end={child.to === '/cleanox-only/transactions'}
                      onClick={onMobileClose}
                      className={linkClass}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-lime-400 rounded-r-full" />
                          )}
                          <child.icon className="w-[16px] h-[16px] flex-shrink-0" />
                          <span className="text-[13px] whitespace-nowrap flex-1">{child.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}

              {collapsed &&
                item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    end={child.to === '/cleanox-only/transactions'}
                    onClick={onMobileClose}
                    title={child.label}
                    className={linkClass}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-lime-400 rounded-r-full" />
                        )}
                        <child.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      </>
                    )}
                  </NavLink>
                ))}
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-white/10 flex-shrink-0">
          <p className="text-[11px] text-brand-300/50 text-center leading-relaxed">
            PT Waschen Alora Indonesia
          </p>
        </div>
      )}
    </aside>
  );
}
