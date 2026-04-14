import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Trophy, Truck, Waves, Package, Navigation, Calendar,
  RefreshCw, ChevronLeft, X, User, Clock, TrendingUp,
  Medal, Award, Star, BarChart2, List, ArrowLeft,
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
const cutoffEnd   = (year, month) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-25`;

const DEFAULT_START = cutoffStart(now.getFullYear(), now.getMonth() + 1);
const DEFAULT_END   = cutoffEnd(now.getFullYear(), now.getMonth() + 1);

const MONTHS_ID = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
];

/* ── Stage config ────────────────────────────────────────── */
const STAGES = [
  { key: 'pickup',      label: 'Pickup',       icon: Truck,       color: 'blue'   },
  { key: 'cuci_jemur',  label: 'Cuci & Jemur', icon: Waves,       color: 'amber'  },
  { key: 'packing',     label: 'Packing',       icon: Package,     color: 'purple' },
  { key: 'pengantaran', label: 'Pengantaran',   icon: Navigation,  color: 'green'  },
];

const STAGE_COLORS = {
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: 'text-blue-500',   bar: 'bg-blue-500'   },
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-700',  icon: 'text-amber-500',  bar: 'bg-amber-500'  },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', icon: 'text-purple-500', bar: 'bg-purple-500' },
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  icon: 'text-green-500',  bar: 'bg-green-500'  },
};

const RANK_BADGE = {
  1: { icon: Trophy, cls: 'bg-yellow-400 text-white', label: '#1' },
  2: { icon: Medal,  cls: 'bg-gray-300 text-gray-700', label: '#2' },
  3: { icon: Award,  cls: 'bg-amber-600 text-white',  label: '#3' },
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
};

function LoadingBar({ visible }) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="h-full bg-gradient-to-r from-brand-500 via-lime-400 to-brand-500 animate-[loadbar_1.4s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }} />
    </div>
  );
}

/* ── Quick Month Picker ─────────────────────────────────── */
function MonthPicker({ onSelect, currentLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const n = new Date();

  const months = [];
  for (let i = 0; i < 12; i++) {
    const mo = n.getMonth() - i;
    const yr = mo < 0 ? n.getFullYear() - 1 : n.getFullYear();
    const realMo = mo < 0 ? mo + 12 : mo; // 0-indexed
    // Periode: 26 bulan sebelumnya → 25 bulan ini (cutoff sama seperti halaman produksi)
    const start = cutoffStart(yr, realMo + 1);
    const end   = cutoffEnd(yr, realMo + 1);
    months.push({ label: `${MONTHS_ID[realMo]} ${yr}`, start, end });
  }

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:border-brand-400 hover:text-brand-700 transition-colors">
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700">{currentLabel || 'Pilih Bulan'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-52 overflow-hidden">
          <div className="max-h-60 overflow-y-auto p-2 space-y-0.5">
            {months.map((m) => (
              <button key={m.label} onClick={() => { onSelect(m); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors
                  ${currentLabel === m.label ? 'bg-brand-700 text-white font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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

/* ── Main Page ──────────────────────────────────────────── */
export default function KpiProduksiPage() {
  const [dateStart,  setDateStart]  = useState(DEFAULT_START);
  const [dateEnd,    setDateEnd]    = useState(DEFAULT_END);
  const [monthLabel, setMonthLabel] = useState(`${MONTHS_ID[now.getMonth()]} ${now.getFullYear()}`);
  const [summary,    setSummary]    = useState([]);
  const [overall,    setOverall]    = useState(null);
  const [insights,   setInsights]   = useState(EMPTY_INSIGHTS);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [detailEmp,  setDetailEmp]  = useState(null);
  const abortRef = useRef(null);

  const fetchSummary = useCallback(async (ds = dateStart, de = dateEnd) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/kpi/summary', {
        params: { date_start: ds, date_end: de },
        signal: ctrl.signal,
      });
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
  }, [dateStart, dateEnd]);

  useEffect(() => { fetchSummary(); }, []);

  const handleMonthSelect = ({ start, end, label }) => {
    setDateStart(start);
    setDateEnd(end);
    setMonthLabel(label);
    fetchSummary(start, end);
  };

  const maxTotal = summary.length > 0 ? summary[0].total : 1;

  // Overall totals across all stages
  const grandTotal = {
    pickup:      summary.reduce((s, e) => s + e.pickup, 0),
    cuci_jemur:  summary.reduce((s, e) => s + e.cuci_jemur, 0),
    packing:     summary.reduce((s, e) => s + e.packing, 0),
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
          <div className="flex items-center gap-2 flex-wrap">
            <MonthPicker onSelect={handleMonthSelect} currentLabel={monthLabel} />
            <div className="flex gap-2">
              <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <span className="text-gray-400 self-center text-xs">s/d</span>
              <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <button onClick={() => fetchSummary(dateStart, dateEnd)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Tampilkan
              </button>
            </div>
          </div>
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
                Ranking Karyawan — {monthLabel}
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
