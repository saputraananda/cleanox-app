import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Trophy, Truck, Waves, Package, Navigation, Calendar,
  RefreshCw, ChevronLeft, X, User, Clock, TrendingUp,
  Medal, Award, Star, BarChart2, List, ArrowLeft,
  ShieldCheck, CheckCircle2, AlertTriangle, Clock3, Minus,
  ChevronDown, Filter, Search, Building2,
} from 'lucide-react';
import api from '../utils/api.js';

/* ── Helpers ────────────────────────────────────────────── */
const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const fmtDateTime = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
const fmtDateShort = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short',
  });
};
const fmtCurrency = (n) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(n || 0));
const fmtHours = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`);

const now = new Date();

const cutoffStart = (year, month) => toISO(new Date(year, month - 2, 26));
const cutoffEnd = (year, month) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-25`;

// Jika hari ini > 25, periode billing sudah berganti ke bulan berikutnya
const _curMonth = now.getMonth() + 1; // 1-based
const _curYear = now.getFullYear();
let periodMonth, periodYear;
if (now.getDate() > 25) {
  if (_curMonth === 12) { periodMonth = 1; periodYear = _curYear + 1; }
  else { periodMonth = _curMonth + 1; periodYear = _curYear; }
} else {
  periodMonth = _curMonth;
  periodYear = _curYear;
}

const DEFAULT_START = cutoffStart(periodYear, periodMonth);
const DEFAULT_END = cutoffEnd(periodYear, periodMonth);
const today = toISO(new Date());

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const buildStaticRanges = () => [
  { label: 'Semua Data', range: () => ({ date_start: '2000-01-01', date_end: '2099-12-31' }) },
  { label: 'Hari Ini', range: () => ({ date_start: today, date_end: today }) },
  {
    label: 'Kemarin',
    range: () => {
      const d = new Date(); d.setDate(d.getDate() - 1); const s = toISO(d);
      return { date_start: s, date_end: s };
    },
  },
];

/* ── Stage config ────────────────────────────────────────── */
const STAGES = [
  { key: 'pickup', label: 'Pickup', icon: Truck, color: 'blue' },
  { key: 'cuci_jemur', label: 'Cuci & Jemur', icon: Waves, color: 'amber' },
  { key: 'packing', label: 'Packing', icon: Package, color: 'purple' },
  { key: 'pengantaran', label: 'Pengantaran', icon: Navigation, color: 'green' },
];

const STAGE_COLORS = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'text-blue-500', bar: 'bg-blue-500' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'text-amber-500', bar: 'bg-amber-500' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', icon: 'text-purple-500', bar: 'bg-purple-500' },
  green: { bg: 'bg-green-100', text: 'text-green-700', icon: 'text-green-500', bar: 'bg-green-500' },
};

const RANK_BADGE = {
  1: { icon: Trophy, cls: 'bg-yellow-400 text-white', label: '#1' },
  2: { icon: Medal, cls: 'bg-gray-300 text-gray-700', label: '#2' },
  3: { icon: Award, cls: 'bg-amber-600 text-white', label: '#3' },
};

const EMPTY_INSIGHTS = {
  daily_stage: [],
  aging_processing_hours: {
    pickup_to_cuci_jemur: { sample_count: 0, avg_hours: null, min_hours: null, max_hours: null },
    cuci_jemur_to_packing: { sample_count: 0, avg_hours: null, min_hours: null, max_hours: null },
    packing_to_delivery: { sample_count: 0, avg_hours: null, min_hours: null, max_hours: null },
    pickup_to_delivery: { sample_count: 0, avg_hours: null, min_hours: null, max_hours: null },
  },
  top_services: [],
  sla: {
    total_with_deadline: 0,
    total_delivered: 0,
    early: 0,
    on_time: 0,
    late: 0,
    pending: 0,
    skipped: 0,
    sla_rate: null,
    avg_delta_hours: null,
    distribution: [],
  },
};

function LoadingBar({ visible }) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="h-full bg-gradient-to-r from-brand-500 via-lime-400 to-brand-500 animate-[loadbar_1.4s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }} />
    </div>
  );
}

/* ── Quick Range Dropdown ─────────────────────────────── */
function QuickRangeDropdown({ ranges, onSelect, currentLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const cepat = ranges.filter((r) => ['Semua Data', 'Hari Ini', 'Kemarin'].includes(r.label));
  const bulan = ranges.filter((r) => !['Semua Data', 'Hari Ini', 'Kemarin'].includes(r.label));
  const byYear = {};
  bulan.forEach((r) => {
    const yr = r.label.split(' ')[1];
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(r);
  });

  const select = (qr) => { setOpen(false); onSelect(qr); };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white
          hover:border-brand-400 hover:text-brand-700 transition-all duration-150"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700">{currentLabel || 'Pilih Periode'}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl w-72 overflow-hidden animate-fade-in">
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Cepat</p>
            <div className="flex gap-1.5">
              {cepat.map((qr) => (
                <button key={qr.label} onClick={() => select(qr)}
                  className="flex-1 py-1.5 text-xs text-gray-700 rounded-lg border border-gray-200
                    hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors">
                  {qr.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100 max-h-64 overflow-y-auto p-3 space-y-3">
            {Object.entries(byYear)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([yr, items]) => (
                <div key={yr}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{yr}</p>
                  <div className="grid grid-cols-3 gap-1">
                    {items.map((qr) => (
                      <button key={qr.label} onClick={() => select(qr)}
                        className={`py-1.5 text-xs rounded-lg border transition-colors px-1 truncate
                          ${currentLabel === qr.label
                            ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                            : 'border-gray-200 text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700'
                          }`}>
                        {qr.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Date Input (native calendar picker) ───────────────── */
function DateInput({ value, onChange, className }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    try {
      if (typeof inputRef.current?.showPicker === 'function') inputRef.current.showPicker();
    } catch { }
  };

  const handleKeyDown = (e) => {
    const allowed = ['Tab', 'Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!allowed.includes(e.key)) e.preventDefault();
  };

  return (
    <input
      ref={inputRef}
      type="date"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={openPicker}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onPaste={(e) => e.preventDefault()}
      className={className}
    />
  );
}

/* ── Employee Card ──────────────────────────────────────── */
function EmployeeCard({ emp, maxTotal, onClick }) {
  const rb = RANK_BADGE[emp.rank];
  const RankIcon = rb?.icon || Star;
  const pct = maxTotal > 0 ? (emp.total / maxTotal) * 100 : 0;

  return (
    <div
      onClick={() => onClick(emp)}
      className={`bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all duration-200 p-4 space-y-3
        ${emp.rank === 1 ? 'border-yellow-300 ring-1 ring-yellow-200 shadow-sm' : 'border-gray-200 hover:border-brand-300'}`}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold shadow-sm
          ${rb ? rb.cls : 'bg-gray-100 text-gray-500'}`}>
          {rb ? <RankIcon className="w-4 h-4" /> : emp.rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{emp.name}</p>
          <p className="text-[11px] text-gray-400">{emp.total} aktivitas total</p>
        </div>
        <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
          #{emp.rank}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>Produktivitas</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-brand-500 to-lime-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Stage breakdown */}
      <div className="grid grid-cols-4 gap-1">
        {STAGES.map(({ key, label, icon: Icon, color }) => {
          const sc = STAGE_COLORS[color];
          return (
            <div key={key} className={`rounded-lg p-1.5 text-center ${sc.bg}`}>
              <Icon className={`w-3 h-3 mx-auto mb-0.5 ${sc.icon}`} />
              <p className={`text-[13px] font-bold leading-none ${sc.text}`}>{emp[key]}</p>
              <p className={`text-[9px] mt-0.5 ${sc.text} opacity-70 truncate`}>{label}</p>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-brand-600 font-medium text-right">Lihat Rincian →</p>
    </div>
  );
}

/* ── Detail Modal ───────────────────────────────────────── */
function DetailModal({ show, onClose, employeeName, dateStart, dateEnd }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState('all');

  useEffect(() => {
    if (!show || !employeeName) return;
    setLoading(true);
    setActiveStage('all');
    api.get('/kpi/detail', { params: { employee_name: employeeName, date_start: dateStart, date_end: dateEnd } })
      .then(({ data }) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [show, employeeName, dateStart, dateEnd]);

  if (!show) return null;

  const stageFiltered = activeStage === 'all'
    ? items
    : items.filter((r) => r[`did_${activeStage}`] !== null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4 text-brand-600" />
              {employeeName}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{items.length} item dikerjakan</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Stage filter tabs */}
        <div className="px-5 pt-3 flex gap-2 flex-wrap border-b border-gray-100 pb-3 flex-shrink-0">
          {[{ key: 'all', label: 'Semua', count: items.length },
          ...STAGES.map((s) => ({ key: s.key, label: s.label, count: items.filter((r) => r[`did_${s.key}`] !== null).length }))
          ].map(({ key, label, count }) => (
            <button key={key} onClick={() => setActiveStage(key)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors
                ${activeStage === key ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : stageFiltered.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Tidak ada data</p>
          ) : (
            <div className="space-y-2">
              {stageFiltered.map((r) => (
                <div key={r.id} className="border border-gray-200 rounded-xl p-3 hover:border-brand-200 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{r.nama_item}</p>
                      <p className="text-xs text-gray-400 font-mono">{r.no_nota} · {r.outlet}</p>
                    </div>
                    <div className="text-right text-xs text-gray-400 flex-shrink-0">
                      <p>Terima: {r.tgl_terima ? new Date(r.tgl_terima).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—'}</p>
                      {r.jumlah && <p className="font-medium text-gray-600">{r.jumlah} {r.satuan_item || ''}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {STAGES.map(({ key, label, icon: Icon, color }) => {
                      const sc = STAGE_COLORS[color];
                      const at = r[`did_${key}`];
                      return (
                        <div key={key} className={`rounded-lg px-2 py-1.5 text-xs ${at ? sc.bg : 'bg-gray-50'}`}>
                          <div className="flex items-center gap-1 mb-0.5">
                            <Icon className={`w-3 h-3 ${at ? sc.icon : 'text-gray-300'}`} />
                            <span className={`font-medium ${at ? sc.text : 'text-gray-300'}`}>{label}</span>
                          </div>
                          {at ? (
                            <p className={`text-[10px] ${sc.text} font-mono leading-tight`}>
                              {fmtDateTime(at)}
                            </p>
                          ) : (
                            <p className="text-[10px] text-gray-300">—</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── SLA Items Modal ────────────────────────────────────── */
const SLA_PAGE_SIZE = 15;

function SlaItemsModal({ show, onClose, category, categoryLabel, dateStart, dateEnd, outlet }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!show || !category) return;
    setLoading(true);
    setPage(1);
    setSearch('');
    const params = { category, date_start: dateStart, date_end: dateEnd };
    if (outlet) params.outlet = outlet;
    api.get('/kpi/sla-items', { params })
      .then(({ data }) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [show, category, dateStart, dateEnd, outlet]);

  /* Lock body scroll while modal is open */
  useEffect(() => {
    if (show) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [show]);

  if (!show) return null;

  const fmtD = (v) => v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const deltaDays = (selesai, deadline) => {
    if (!selesai || !deadline) return null;
    const d = (new Date(selesai) - new Date(deadline)) / 864e5;
    return Math.round(d);
  };

  const sortedItems = (() => {
    const q = search.trim().toLowerCase();
    return q
      ? items.filter((r) =>
        (r.no_nota || '').toLowerCase().includes(q) ||
        (r.outlet || '').toLowerCase().includes(q) ||
        (r.customer_nama || '').toLowerCase().includes(q) ||
        (r.nama_item || '').toLowerCase().includes(q)
      )
      : items;
  })();

  const exportExcel = async () => {
    const params = new URLSearchParams({ category, date_start: dateStart, date_end: dateEnd });
    if (outlet) params.append('outlet', outlet);
    const token = localStorage.getItem('cleanox_token');
    const res = await fetch(`/api/kpi/sla-items/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { alert('Gagal export'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const cd   = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/);
    a.download = match ? match[1] : `SLA_${category}_${dateStart}_${dateEnd}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / SLA_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sortedItems.slice((safePage - 1) * SLA_PAGE_SIZE, safePage * SLA_PAGE_SIZE);

  /* Compact page numbers: always show first, last, current ±1, with ellipsis */
  const pageNums = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const set = new Set([1, totalPages, safePage, safePage - 1, safePage + 1].filter((p) => p >= 1 && p <= totalPages));
    const sorted = [...set].sort((a, b) => a - b);
    const result = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) result.push('…');
      result.push(p);
    });
    return result;
  };

  return (
    /* Backdrop — no onClick so it won't close accidentally */
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col animate-fade-in">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-600" />
              SLA — {categoryLabel}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {search.trim() ? `${sortedItems.length} hasil dari ${items.length} item` : `${items.length} item`}
              {totalPages > 1 && ` · halaman ${safePage} / ${totalPages}`}
            </p>
          </div>
          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nota / outlet / customer…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-52 bg-white"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {/* Export */}
          <button
            onClick={exportExcel}
            disabled={sortedItems.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            title="Export ke Excel (CSV)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Tidak ada data</p>
          ) : sortedItems.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Tidak ada hasil untuk "<span className="font-medium">{search}</span>"</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-center px-2 py-2 font-semibold text-gray-400 w-8">#</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">No Nota</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Outlet</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Customer</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Item</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Terima</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Target</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Pengantaran</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Selisih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((r, idx) => {
                    const rowNum = (safePage - 1) * SLA_PAGE_SIZE + idx + 1;
                    const delta = deltaDays(r.pengantaran_at, r.tgl_selesai);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-2 py-2 text-center text-gray-300 font-mono text-[10px]">{rowNum}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{r.no_nota || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.outlet || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.customer_nama || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.nama_item || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtD(r.tgl_terima)}</td>
                        <td className="px-3 py-2 text-amber-700 whitespace-nowrap font-medium">{fmtD(r.tgl_selesai)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.pengantaran_at
                            ? <span className={delta !== null && delta > 0 ? 'text-red-600 font-semibold' : delta !== null && delta < 0 ? 'text-emerald-600 font-semibold' : 'text-blue-600 font-semibold'}>{fmtD(r.pengantaran_at)}</span>
                            : <span className="text-gray-400">Belum</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {delta === null
                            ? <span className="text-gray-400">—</span>
                            : <span className={`font-bold ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                              {delta > 0 ? `+${delta}` : delta} hari
                            </span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 flex-shrink-0 gap-2">
            <p className="text-[11px] text-gray-400 whitespace-nowrap">
              {(safePage - 1) * SLA_PAGE_SIZE + 1}–{Math.min(safePage * SLA_PAGE_SIZE, items.length)} dari {items.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ‹
              </button>
              {pageNums().map((p, i) =>
                p === '…'
                  ? <span key={`ell-${i}`} className="px-1 text-xs text-gray-300">…</span>
                  : <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[28px] px-2 py-1 text-xs rounded-lg border transition-colors
                      ${safePage === p
                        ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    {p}
                  </button>
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function KpiProduksiPage() {
  const [dateStart, setDateStart] = useState(DEFAULT_START);
  const [dateEnd, setDateEnd] = useState(DEFAULT_END);
  const [outlet, setOutlet] = useState('');
  const [outlets, setOutlets] = useState([]);
  const [quickLabel, setQuickLabel] = useState(`${MONTHS_ID[periodMonth - 1]} ${periodYear}`);
  const [summary, setSummary] = useState([]);
  const [overall, setOverall] = useState(null);
  const [insights, setInsights] = useState(EMPTY_INSIGHTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailEmp, setDetailEmp] = useState(null);
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [slaModal, setSlaModal] = useState({ show: false, category: null });
  const abortRef = useRef(null);

  /* Fetch outlets list once */
  useEffect(() => {
    api.get('/cleanox-by-waschen-production/outlets')
      .then(({ data }) => setOutlets(data.outlets || []))
      .catch(() => { });
  }, []);

  /* Fetch available billing periods from DB */
  useEffect(() => {
    api.get('/kpi/available-periods')
      .then(({ data }) => setAvailablePeriods(data.periods || []))
      .catch(() => { });
  }, []);

  const fetchSummary = useCallback(async (ds = dateStart, de = dateEnd, out = outlet) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    try {
      const params = { date_start: ds, date_end: de };
      if (out) params.outlet = out;
      const { data } = await api.get('/kpi/summary', { params, signal: ctrl.signal });
      setSummary(data.summary || []);
      setOverall(data.overall || null);
      setInsights(data.insights || EMPTY_INSIGHTS);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setError(err.response?.data?.message || 'Gagal memuat data KPI');
        setInsights(EMPTY_INSIGHTS);
      }
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd, outlet]);

  useEffect(() => { fetchSummary(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = () => fetchSummary(dateStart, dateEnd, outlet);

  const applyQuick = (qr) => {
    const r = qr.range();
    setDateStart(r.date_start);
    setDateEnd(r.date_end);
    setQuickLabel(qr.label);
    fetchSummary(r.date_start, r.date_end, outlet);
  };

  const maxTotal = summary.length > 0 ? summary[0].total : 1;

  // Build dynamic quick ranges from available periods in DB
  const dynamicRanges = [
    ...buildStaticRanges(),
    ...availablePeriods.map(({ yr, mo }) => {
      const s = cutoffStart(yr, mo);
      const e = cutoffEnd(yr, mo);
      const label = `${MONTHS_ID[mo - 1]} ${yr}`;
      return { label, range: () => ({ date_start: s, date_end: e }) };
    }),
  ];

  // Overall totals across all stages
  const grandTotal = {
    pickup: summary.reduce((s, e) => s + e.pickup, 0),
    cuci_jemur: summary.reduce((s, e) => s + e.cuci_jemur, 0),
    packing: summary.reduce((s, e) => s + e.packing, 0),
    pengantaran: summary.reduce((s, e) => s + e.pengantaran, 0),
  };

  const dailyMax = Math.max(1, ...(insights.daily_stage || []).map((d) => d.total || 0));
  const agingCards = [
    { key: 'pickup_to_cuci_jemur', label: 'Pickup → Cuci Jemur', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    { key: 'cuci_jemur_to_packing', label: 'Cuci Jemur → Packing', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { key: 'packing_to_delivery', label: 'Packing → Delivery', color: 'text-green-700 bg-green-50 border-green-200' },
    { key: 'pickup_to_delivery', label: 'Pickup → Delivery (End-to-End)', color: 'text-brand-700 bg-brand-50 border-brand-200' },
  ];

  return (
    <>
      <LoadingBar visible={loading} />
      <DetailModal
        show={!!detailEmp}
        onClose={() => setDetailEmp(null)}
        employeeName={detailEmp?.name}
        dateStart={dateStart}
        dateEnd={dateEnd}
      />
      <SlaItemsModal
        show={slaModal.show}
        onClose={() => setSlaModal({ show: false, category: null })}
        category={slaModal.category}
        categoryLabel={slaModal.categoryLabel}
        dateStart={dateStart}
        dateEnd={dateEnd}
        outlet={outlet}
      />

      <div className="p-3 sm:p-5 space-y-5 max-w-[1300px] mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-600" />
              KPI Produksi Cleanox
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Performa karyawan berdasarkan aktivitas produksi</p>
          </div>
          <button
            onClick={() => fetchSummary(dateStart, dateEnd, outlet)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:border-brand-400 hover:text-brand-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Quick Range Dropdown */}
        <QuickRangeDropdown ranges={dynamicRanges} onSelect={applyQuick} currentLabel={quickLabel} />

        {/* Filter Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Filter Data</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Mulai</label>
              <DateInput value={dateStart} onChange={setDateStart}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Akhir</label>
              <DateInput value={dateEnd} onChange={setDateEnd}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Outlet</label>
              <select
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                value={outlet}
                onChange={(e) => setOutlet(e.target.value)}
              >
                <option value="">Semua Outlet</option>
                {outlets.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={applyFilter}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors disabled:opacity-60"
              >
                <Search className="w-3.5 h-3.5" />
                Terapkan Filter
              </button>
            </div>
          </div>

          {/* Active filter tags */}
          {outlet && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
              <span className="text-xs text-gray-400">Filter aktif:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-100 text-brand-700">
                <Building2 className="w-3 h-3" />
                {outlet}
                <button onClick={() => { setOutlet(''); fetchSummary(dateStart, dateEnd, ''); }} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Overall stats cards */}
        {overall && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs font-medium text-gray-400 mb-1">Total Item</p>
              <p className="text-3xl font-bold text-gray-800">{overall.total_items}</p>
            </div>
            {STAGES.map(({ key, label, icon: Icon, color }) => {
              const sc = STAGE_COLORS[color];
              const done = overall[`${key}_done`] ?? grandTotal[key];
              const pct = overall.total_items > 0 ? Math.round((done / overall.total_items) * 100) : 0;
              return (
                <div key={key} className={`rounded-xl border border-gray-200 p-4 ${sc.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${sc.icon}`} />
                    <p className={`text-xs font-medium ${sc.text}`}>{label}</p>
                  </div>
                  <p className={`text-3xl font-bold ${sc.text}`}>{done}</p>
                  <div className="mt-2 w-full h-1 bg-white/60 rounded-full overflow-hidden">
                    <div className={`h-full ${sc.bar} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`text-[10px] mt-1 ${sc.text} opacity-70`}>{pct}% dari total</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Insights: Daily Stage + Aging + Top Services */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
          <div className="bg-white rounded-xl border border-gray-200 p-4 xl:col-span-1 self-start">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-brand-600" />
              Total Item per Stage (Daily)
            </h3>
            {insights.daily_stage?.length ? (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {insights.daily_stage.map((d) => (
                  <div key={d.date} className="rounded-lg border border-gray-100 p-2.5">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-gray-700">{fmtDateShort(d.date)}</span>
                      <span className="text-gray-500">Total: <strong>{d.total}</strong></span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden mb-2">
                      <div className="h-full bg-gradient-to-r from-brand-500 to-lime-400" style={{ width: `${Math.round((d.total / dailyMax) * 100)}%` }} />
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px]">
                      <div className="bg-blue-50 text-blue-700 rounded px-1.5 py-1 text-center">P: {d.pickup}</div>
                      <div className="bg-amber-50 text-amber-700 rounded px-1.5 py-1 text-center">CJ: {d.cuci_jemur}</div>
                      <div className="bg-purple-50 text-purple-700 rounded px-1.5 py-1 text-center">Pk: {d.packing}</div>
                      <div className="bg-green-50 text-green-700 rounded px-1.5 py-1 text-center">Dlv: {d.pengantaran}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Belum ada aktivitas stage harian pada periode ini.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 xl:col-span-1 self-start">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-brand-600" />
              Aging Processing Time (Hours)
            </h3>
            <div className="space-y-2">
              {agingCards.map((c) => {
                const v = insights.aging_processing_hours?.[c.key] || {};
                return (
                  <div key={c.key} className={`rounded-lg border p-2.5 ${c.color}`}>
                    <p className="text-xs font-semibold">{c.label}</p>
                    <div className="grid grid-cols-3 gap-1 mt-1.5 text-[11px]">
                      <div className="bg-white/70 rounded px-1.5 py-1">
                        <p className="opacity-70">Avg</p>
                        <p className="font-semibold">{fmtHours(v.avg_hours)}</p>
                      </div>
                      <div className="bg-white/70 rounded px-1.5 py-1">
                        <p className="opacity-70">Min</p>
                        <p className="font-semibold">{fmtHours(v.min_hours)}</p>
                      </div>
                      <div className="bg-white/70 rounded px-1.5 py-1">
                        <p className="opacity-70">Max</p>
                        <p className="font-semibold">{fmtHours(v.max_hours)}</p>
                      </div>
                    </div>
                    <p className="text-[10px] mt-1 opacity-80">Sampel: {v.sample_count || 0} item</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 xl:col-span-1 self-start">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-brand-600" />
              Top 5 Services (Volume, Revenue, Time)
            </h3>
            {insights.top_services?.length ? (
              <div className="space-y-2">
                {insights.top_services.map((s, idx) => (
                  <div key={`${s.service_name}-${idx}`} className="rounded-lg border border-gray-100 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-800 leading-snug">#{idx + 1} {s.service_name}</p>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">{s.volume} item</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1.5 text-[11px]">
                      <div className="bg-emerald-50 text-emerald-700 rounded px-2 py-1">
                        <p className="opacity-70">Revenue</p>
                        <p className="font-semibold">{fmtCurrency(s.revenue)}</p>
                      </div>
                      <div className="bg-indigo-50 text-indigo-700 rounded px-2 py-1">
                        <p className="opacity-70">Avg Time</p>
                        <p className="font-semibold">{fmtHours(s.avg_cycle_hours)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Belum ada service yang bisa dirangkum pada periode ini.</p>
            )}
          </div>
        </div>

        {/* SLA Ketepatan Selesai Pengantaran */}
        {(() => {
          const sla = insights.sla || EMPTY_INSIGHTS.sla;
          const hasSla = sla.total_with_deadline > 0 || sla.skipped > 0;
          if (!hasSla) return null;

          const slaRate = sla.sla_rate;
          const rateColor =
            slaRate === null ? 'text-gray-400'
              : slaRate >= 90 ? 'text-emerald-600'
                : slaRate >= 75 ? 'text-amber-600'
                  : 'text-red-600';
          const barColor =
            slaRate === null ? 'bg-gray-300'
              : slaRate >= 90 ? 'bg-emerald-500'
                : slaRate >= 75 ? 'bg-amber-500'
                  : 'bg-red-500';

          const cats = [
            {
              key: 'early',
              label: 'Lebih Cepat',
              desc: 'Diantar sebelum tanggal selesai',
              icon: CheckCircle2,
              cls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
              iconCls: 'text-emerald-500',
            },
            {
              key: 'on_time',
              label: 'Tepat Waktu',
              desc: 'Diantar di hari tanggal selesai',
              icon: Minus,
              cls: 'bg-blue-50 border-blue-200 text-blue-700',
              iconCls: 'text-blue-500',
            },
            {
              key: 'late',
              label: 'Terlambat',
              desc: 'Diantar setelah tanggal selesai',
              icon: AlertTriangle,
              cls: 'bg-red-50 border-red-200 text-red-700',
              iconCls: 'text-red-500',
            },
            {
              key: 'pending',
              label: 'Belum Diantar',
              desc: 'Pengantaran belum dilakukan',
              icon: Clock3,
              cls: 'bg-gray-50 border-gray-200 text-gray-600',
              iconCls: 'text-gray-400',
            },
          ];

          const fmtDelta = (h) => {
            if (h === null || h === undefined) return '—';
            const abs = Math.abs(h);
            const sign = h < 0 ? '−' : '+';
            return `${sign}${Number(abs).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`;
          };

          return (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {/* Header */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-brand-600 flex-shrink-0" />
                <h3 className="text-sm font-bold text-gray-800">SLA Ketepatan Pengantaran</h3>
                <span className="text-[11px] text-gray-400 ml-auto">
                  Perbandingan antara tanggal selesai (nota smartlink) dengan tanggal pengantaran.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* Left: SLA Rate */}
                <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">SLA Rate</p>
                  <p className={`text-5xl font-extrabold leading-none ${rateColor}`}>
                    {slaRate !== null ? `${slaRate}%` : '—'}
                  </p>
                  <div className="w-full mt-3">
                    <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                        style={{ width: `${slaRate ?? 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 text-center leading-snug">
                    {sla.total_delivered} item diantar
                    {sla.avg_delta_hours !== null && (
                      <><br />
                        <span className={sla.avg_delta_hours <= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                          rata-rata {fmtDelta(sla.avg_delta_hours)} dari deadline
                        </span>
                      </>
                    )}
                  </p>
                </div>

                {/* Right: Category breakdown — full 2 cols, clickable */}
                <div className="sm:col-span-2 space-y-2 flex flex-col justify-center">
                  {cats.map(({ key, label, desc, icon: Icon, cls, iconCls }) => {
                    const count = sla[key] ?? 0;
                    const pct = sla.total_delivered > 0 && key !== 'pending'
                      ? Math.round((count / sla.total_delivered) * 100)
                      : null;
                    return (
                      <button
                        key={key}
                        onClick={() => setSlaModal({ show: true, category: key, categoryLabel: label })}
                        className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 ${cls} hover:opacity-80 active:scale-[0.99] transition-all cursor-pointer text-left`}
                      >
                        <Icon className={`w-5 h-5 flex-shrink-0 ${iconCls}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-none">{label}</p>
                          <p className="text-[11px] opacity-70 mt-0.5 leading-none">{desc}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-xl font-bold leading-none">{count}</span>
                          {pct !== null && (
                            <span className="text-[11px] opacity-60 ml-1">({pct}%)</span>
                          )}
                        </div>
                        <ChevronDown className="w-4 h-4 opacity-40 -rotate-90 flex-shrink-0" />
                      </button>
                    );
                  })}
                  {sla.skipped > 0 && (
                    <p className="text-[11px] text-gray-400 px-1">
                      *{sla.skipped} item tidak memiliki tgl_selesai
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Employee ranking */}
        {summary.length === 0 && !loading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <BarChart2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Belum ada data produksi pada periode ini</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <List className="w-4 h-4 text-gray-400" />
                Ranking Karyawan — {quickLabel}
                <span className="text-gray-400 font-normal text-xs">({summary.length} karyawan)</span>
              </h2>
            </div>

            {/* Top 3 podium */}
            {summary.length >= 3 && (
              <div className="grid grid-cols-3 gap-3">
                {/* 2nd */}
                <div className="order-1">
                  {summary[1] && (
                    <div onClick={() => setDetailEmp(summary[1])}
                      className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center cursor-pointer hover:shadow-md transition-all">
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Medal className="w-5 h-5 text-gray-500" />
                      </div>
                      <p className="font-bold text-gray-700 text-sm truncate">{summary[1].name}</p>
                      <p className="text-2xl font-bold text-gray-800 mt-1">{summary[1].total}</p>
                      <p className="text-[10px] text-gray-400">aktivitas</p>
                    </div>
                  )}
                </div>
                {/* 1st */}
                <div className="order-first sm:order-2">
                  {summary[0] && (
                    <div onClick={() => setDetailEmp(summary[0])}
                      className="bg-gradient-to-b from-yellow-50 to-white rounded-xl border-2 border-yellow-300 p-4 text-center cursor-pointer hover:shadow-lg transition-all -mt-2">
                      <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2 shadow">
                        <Trophy className="w-6 h-6 text-white" />
                      </div>
                      <p className="font-bold text-gray-800 truncate">{summary[0].name}</p>
                      <p className="text-3xl font-bold text-yellow-600 mt-1">{summary[0].total}</p>
                      <p className="text-[10px] text-gray-400">aktivitas</p>
                    </div>
                  )}
                </div>
                {/* 3rd */}
                <div className="order-3">
                  {summary[2] && (
                    <div onClick={() => setDetailEmp(summary[2])}
                      className="bg-white rounded-xl border-2 border-amber-200 p-4 text-center cursor-pointer hover:shadow-md transition-all">
                      <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Award className="w-5 h-5 text-amber-600" />
                      </div>
                      <p className="font-bold text-gray-700 text-sm truncate">{summary[2].name}</p>
                      <p className="text-2xl font-bold text-gray-800 mt-1">{summary[2].total}</p>
                      <p className="text-[10px] text-gray-400">aktivitas</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Full ranking cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.map((emp) => (
                <EmployeeCard key={emp.name} emp={emp} maxTotal={maxTotal} onClick={setDetailEmp} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
