import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Building2,
  X,
} from 'lucide-react';
import cleanoxLogo from '../assets/cleanox.png';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Cleanox', icon: Sparkles, to: '/cleanox', soon: true },
  { label: 'Cleanox By Waschen', icon: Building2, to: '/cleanox-by-waschen' },
];

export default function Sidebar({ collapsed, mobileOpen, onMobileClose }) {
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
      {/* Logo row */}
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

        {/* Close btn on mobile */}
        <button
          onClick={onMobileClose}
          className="lg:hidden p-1 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Collapse btn on desktop */}
        <button
          onClick={() => {}} /* handled in Layout via onMenuToggle */
          className="hidden lg:flex p-1 text-white/40 hover:text-white transition-colors"
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onMobileClose}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 relative
              ${isActive
                ? 'bg-white/15 text-white font-semibold'
                : 'text-brand-100/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-lime-400 rounded-r-full" />
                )}
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {!collapsed && (
                  <span className="text-sm whitespace-nowrap flex-1">{item.label}</span>
                )}
                {!collapsed && item.soon && (
                  <span className="text-[10px] bg-yellow-400/20 text-yellow-300 px-1.5 py-0.5 rounded-md font-medium">
                    Soon
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
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
