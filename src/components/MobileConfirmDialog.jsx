import { createPortal } from 'react-dom';
import { CheckCircle2, Play, AlertTriangle } from 'lucide-react';

const VARIANT_UI = {
  accept: {
    icon: CheckCircle2,
    iconWrap: 'bg-emerald-50 text-emerald-600',
    confirmBtn:
      'bg-[#163A22] hover:bg-[#20492C] shadow-md shadow-[#163A22]/20',
  },
  start: {
    icon: Play,
    iconWrap: 'bg-blue-50 text-blue-600',
    confirmBtn:
      'bg-[#163A22] hover:bg-[#20492C] shadow-md shadow-[#163A22]/20',
  },
  complete: {
    icon: CheckCircle2,
    iconWrap: 'bg-emerald-50 text-emerald-600',
    confirmBtn:
      'bg-[#163A22] hover:bg-[#20492C] shadow-md shadow-[#163A22]/20',
  },
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-rose-50 text-rose-600',
    confirmBtn: 'bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20',
  },
};

/**
 * Standar dialog konfirmasi / alert kecil terpusat (centered single-card).
 * Props selaras template ConfirmModal + dukungan variant aksi Cleanox.
 */
export default function MobileConfirmDialog({
  open,
  title,
  description,
  desc,
  confirmLabel = 'Ya',
  cancelLabel = 'Batal',
  variant = 'accept',
  busy = false,
  loading,
  onConfirm,
  onCancel,
  onClose,
}) {
  if (!open || typeof document === 'undefined') return null;

  const isLoading = busy || loading;
  const close = onClose || onCancel;
  const bodyText = desc || description;
  const ui = VARIANT_UI[variant] || VARIANT_UI.accept;
  const Icon = ui.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={() => {
        if (!isLoading) close?.();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-center space-y-4 animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl shadow-inner ${ui.iconWrap}`}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>

        <div className="space-y-2">
          <h3 id="confirm-modal-title" className="text-sm font-bold text-slate-800">
            {title}
          </h3>
          {bodyText ? (
            <p className="text-xs text-slate-400 leading-relaxed">{bodyText}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => close?.()}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 transition active:scale-95 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onConfirm?.()}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60 ${ui.confirmBtn}`}
          >
            {isLoading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
