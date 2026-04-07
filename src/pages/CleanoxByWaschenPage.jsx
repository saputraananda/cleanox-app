import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  Building2,
  FileText,
  Banknote,
  X,
  ChevronDown,
  CheckSquare,
  Square,
  AlertCircle,
  Inbox,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import api from '../utils/api.js';

/* ── Helpers ───────────────────────────────────────────── */
const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
});
const fmtCurrency = (v) => fmt.format(v || 0);
const fmtDate = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};
const fmtDateTime = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
const toISO = (d) => { const s = d.toISOString().split('T')[0]; return s; };
const today = toISO(new Date());

/* Cutoff period: 26 prev month → 25 current month */
const cutoffStart = (year, month) => {
  // month is 1-based. Returns 26th of previous month
  const d = new Date(year, month - 2, 26); // month-2 because Date month is 0-based
  return toISO(d);
};
const cutoffEnd = (year, month) => {
  // Returns 25th of current month
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-25`;
};
const now = new Date();
const DEFAULT_START = cutoffStart(now.getFullYear(), now.getMonth() + 1);
const DEFAULT_END   = cutoffEnd(now.getFullYear(), now.getMonth() + 1);

const MONTHS_ID = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
];

/* Generate quick range items for past 12 months + custom */
const buildQuickRanges = () => {
  const ranges = [];
  const n = new Date();

  // Hari ini
  ranges.push({ label: 'Hari Ini', range: () => ({ date_start: today, date_end: today }) });
  // Kemarin
  ranges.push({
    label: 'Kemarin',
    range: () => {
      const d = new Date(); d.setDate(d.getDate() - 1); const s = toISO(d);
      return { date_start: s, date_end: s };
    },
  });

  // Cutoff months: current + past 11
  for (let i = 0; i < 12; i++) {
    const yr = n.getFullYear();
    const mo = n.getMonth() + 1 - i; // 1-based
    const realYear = mo <= 0 ? yr - 1 : yr;
    const realMonth = mo <= 0 ? mo + 12 : mo;
    const y2 = realMonth === 12 ? realYear + 1 : realYear;
    const m2 = realMonth === 12 ? 1 : realMonth + 1;
    // Period: 26th of prev month → 25th of this month
    const s = cutoffStart(realYear, realMonth);
    const e = cutoffEnd(realYear, realMonth);
    const label = `${MONTHS_ID[realMonth - 1]} ${realYear}`;
    ranges.push({ label, range: () => ({ date_start: s, date_end: e }) });
  }

  return ranges;
};

const QUICK_RANGES = buildQuickRanges();
const PAGE_SIZES = [10, 25, 50, 100];

const COLS = [
  { key: 'no',               label: 'No',           align: 'center', filterable: false, w: 'w-10' },
  { key: 'outlet',           label: 'Outlet',        align: 'left',   filterable: true  },
  { key: 'no_nota',          label: 'No Nota',       align: 'left',   filterable: true  },
  { key: 'customer_nama',    label: 'Customer',      align: 'left',   filterable: true  },
  { key: 'pembuat_nota',     label: 'Pembuat Nota',  align: 'left',   filterable: true  },
  { key: 'tgl_terima',       label: 'Tgl Terima',    align: 'left',   filterable: false, sortable: true },
  { key: 'tgl_selesai',      label: 'Tgl Selesai',   align: 'left',   filterable: false, sortable: true },
  { key: 'waktu_pembayaran', label: 'Waktu Bayar',   align: 'left',   filterable: false, sortable: true },
  { key: 'nominal_bayar',    label: 'Nominal',       align: 'right',  filterable: false },
  { key: 'daftar_item',      label: 'Item Layanan',  align: 'left',   filterable: true  },
];

/* ── Quick Range Dropdown ─────────────────────────────── */
function QuickRangeDropdown({ ranges, onSelect, currentLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const cepat = ranges.filter((r) => ['Hari Ini', 'Kemarin'].includes(r.label));
  const bulan = ranges.filter((r) => !['Hari Ini', 'Kemarin'].includes(r.label));
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
                          ${
                            currentLabel === qr.label
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

/* ── Column Filter Dropdown ────────────────────────────── */
function ColFilterDropdown({ colKey, values, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = q ? values.filter((v) => String(v).toLowerCase().includes(q.toLowerCase())) : values;
  const allSelected = selected.size === 0 || selected.size === values.length;

  const toggle = (v) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };
  const toggleAll = () => onChange(new Set());

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`ml-1 p-0.5 rounded transition-colors ${
          selected.size > 0
            ? 'text-lime-500 bg-lime-50'
            : 'text-gray-300 hover:text-gray-500'
        }`}
        title="Filter kolom"
      >
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl w-52 overflow-hidden animate-fade-in text-gray-700 normal-case tracking-normal font-normal">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              placeholder="Cari…"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              onClick={toggleAll}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-gray-600 font-medium border-b border-gray-50"
            >
              {allSelected ? <CheckSquare className="w-3.5 h-3.5 text-brand-600" /> : <Square className="w-3.5 h-3.5 text-gray-300" />}
              Semua
            </button>
            {filtered.map((v) => (
              <button
                key={v}
                onClick={() => toggle(v)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left"
              >
                {selected.has(v) ? (
                  <CheckSquare className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                )}
                <span className="truncate">{v || '(kosong)'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Loading Bar ───────────────────────────────────────── */
function LoadingBar({ visible }) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="h-full bg-gradient-to-r from-brand-500 via-lime-400 to-brand-500 animate-[loadbar_1.4s_ease-in-out_infinite]" style={{backgroundSize:'200% 100%'}} />
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */
export default function CleanoxByWaschenPage() {
  const [dateStart, setDateStart]   = useState(DEFAULT_START);
  const [dateEnd,   setDateEnd]     = useState(DEFAULT_END);
  const [outlet,    setOutlet]      = useState('');
  const [dateField, setDateField]   = useState('tgl_terima');
  const [search,    setSearch]      = useState('');

  const [applied, setApplied] = useState({
    date_start: DEFAULT_START,
    date_end:   DEFAULT_END,
    outlet:     '',
    date_field: 'tgl_terima',
  });

  const [outlets,    setOutlets]    = useState([]);
  const [rows,       setRows]       = useState([]);
  const [stats,      setStats]      = useState({ total: 0, totalNominal: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 0 });
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Column filters: Map<colKey, Set<value>>
  const [colFilters, setColFilters] = useState({});
  const [sortKey, setSortKey] = useState('tgl_terima');
  const [sortDir, setSortDir] = useState('desc');
  const [quickLabel, setQuickLabel] = useState('');

  const abortRef = useRef(null);

  /* Fetch outlets once */
  useEffect(() => {
    api.get('/cleanox-by-waschen/outlets')
      .then(({ data }) => setOutlets(data.outlets || []))
      .catch(() => {});
  }, []);

  /* Core fetch */
  const fetchData = useCallback(async (page, limit, f = applied) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      date_start: f.date_start,
      date_end:   f.date_end,
      date_field: f.date_field || 'tgl_terima',
      ...(f.outlet && { outlet: f.outlet }),
      page,
      limit,
    });

    try {
      const { data } = await api.get(`/cleanox-by-waschen?${params}`, { signal: ctrl.signal });
      setRows(data.data);
      setStats(data.stats);
      setPagination(data.pagination);
      setColFilters({}); // reset column filters when data reloads
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setError(err.response?.data?.message || 'Gagal memuat data. Coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    fetchData(1, pagination.limit || 25, applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  /* Handlers */
  const applyFilter = () => setApplied({ date_start: dateStart, date_end: dateEnd, outlet, date_field: dateField });

  const applyQuick = (qr) => {
    const r = qr.range();
    setDateStart(r.date_start);
    setDateEnd(r.date_end);
    setQuickLabel(qr.label);
    setApplied({ date_start: r.date_start, date_end: r.date_end, outlet, date_field: dateField });
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const goPage = (p) => { setPagination((prev) => ({ ...prev, page: p })); fetchData(p, pagination.limit); };
  const changeLimit = (l) => { setPagination((prev) => ({ ...prev, limit: l, page: 1 })); fetchData(1, l); };

  /* Column filter unique values */
  const colUniqueValues = useMemo(() => {
    const map = {};
    COLS.filter((c) => c.filterable).forEach((c) => {
      map[c.key] = [...new Set(rows.map((r) => r[c.key] ?? '').filter(Boolean))].sort();
    });
    return map;
  }, [rows]);

  const setColFilter = (key, set) => setColFilters((prev) => ({ ...prev, [key]: set }));

  /* Client-side filtering */
  const filtered = useMemo(() => {
    let data = rows;

    // text search
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((r) =>
        (r.no_nota       || '').toLowerCase().includes(q) ||
        (r.customer_nama || '').toLowerCase().includes(q) ||
        (r.outlet        || '').toLowerCase().includes(q) ||
        (r.pembuat_nota  || '').toLowerCase().includes(q) ||
        (r.daftar_item   || '').toLowerCase().includes(q)
      );
    }

    // column filters
    COLS.filter((c) => c.filterable).forEach((c) => {
      const sel = colFilters[c.key];
      if (sel && sel.size > 0) {
        data = data.filter((r) => sel.has(r[c.key] ?? ''));
      }
    });

    // sort
    if (sortKey) {
      data = [...data].sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return data;
  }, [rows, search, colFilters, sortKey, sortDir]);

  /* CSV Export */
  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = ['No','Outlet','No Nota','Customer','Pembuat Nota','Tgl Terima','Tgl Selesai','Waktu Bayar','Nominal (IDR)','Item Layanan'];
    const dataRows = filtered.map((r, i) => [
      i + 1,
      r.outlet || '',
      r.no_nota || '',
      r.customer_nama || '',
      r.pembuat_nota || '',
      fmtDate(r.tgl_terima),
      fmtDate(r.tgl_selesai),
      fmtDateTime(r.waktu_pembayaran),
      r.nominal_bayar || 0,
      `"${(r.daftar_item || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers, ...dataRows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `cleanox-by-waschen_${applied.date_start}_sd_${applied.date_end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  /* Page buttons */
  const pageButtons = () => {
    const total = pagination.totalPages, cur = pagination.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 4)         return [1, 2, 3, 4, 5, '…', total];
    if (cur >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', cur - 1, cur, cur + 1, '…', total];
  };

  const activeColFiltersCount = Object.values(colFilters).filter((s) => s && s.size > 0).length;

  return (
    <>
      <LoadingBar visible={loading} />
      <div className="p-3 sm:p-5 space-y-4 max-w-[1400px] mx-auto">

        {/* ── Page header ─── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Cleanox By Waschen</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Laporan transaksi Cleanox &amp; Karpet dari outlet Waschen
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetchData(pagination.page, pagination.limit)} disabled={loading} className="btn-secondary text-xs sm:text-sm">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button onClick={exportCSV} disabled={!filtered.length} className="btn-primary text-xs sm:text-sm">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* ── Quick range dropdown ─── */}
        <QuickRangeDropdown ranges={QUICK_RANGES} onSelect={applyQuick} currentLabel={quickLabel} />

        {/* ── Filter card ─── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Filter Data</span>
            <span className="text-xs text-gray-400 ml-auto">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Filter berdasarkan:
              <select
                value={dateField}
                onChange={(e) => setDateField(e.target.value)}
                className="ml-1.5 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"
              >
                <option value="tgl_terima">Tgl Terima</option>
                <option value="waktu_pembayaran">Waktu Bayar</option>
              </select>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Mulai</label>
              <input type="date" className="input-field text-sm" value={dateStart} max={dateEnd}
                onChange={(e) => setDateStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Akhir</label>
              <input type="date" className="input-field text-sm" value={dateEnd} min={dateStart}
                onChange={(e) => setDateEnd(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Outlet</label>
              <select className="input-field text-sm" value={outlet} onChange={(e) => setOutlet(e.target.value)}>
                <option value="">Semua Outlet</option>
                {outlets.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={applyFilter} disabled={loading} className="btn-primary w-full">
                <Search className="w-4 h-4" />
                Terapkan Filter
              </button>
            </div>
          </div>

          {/* Active tags */}
          {(applied.outlet || activeColFiltersCount > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
              <span className="text-xs text-gray-400">Filter aktif:</span>
              {applied.outlet && (
                <span className="inline-flex items-center gap-1 badge bg-brand-100 text-brand-700">
                  <Building2 className="w-3 h-3" />
                  {applied.outlet}
                  <button onClick={() => { setOutlet(''); setApplied((a) => ({ ...a, outlet: '' })); }} className="hover:text-brand-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {activeColFiltersCount > 0 && (
                <span className="inline-flex items-center gap-1 badge bg-lime-100 text-lime-700">
                  <Filter className="w-3 h-3" />
                  {activeColFiltersCount} filter kolom aktif
                  <button onClick={() => setColFilters({})} className="hover:text-lime-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Stats ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: FileText, label: 'Total Nota',   value: loading ? null : stats.total.toLocaleString('id-ID'),   color: 'text-brand-600', bg: 'bg-brand-50' },
            { icon: Banknote, label: 'Total Nominal', value: loading ? null : fmtCurrency(stats.totalNominal),       color: 'text-lime-600',  bg: 'bg-lime-50'  },
            { icon: Calendar, label: 'Periode',       value: `${fmtDate(applied.date_start)} – ${fmtDate(applied.date_end)}`, color: 'text-teal-600', bg: 'bg-teal-50' },
          ].map((s) => (
            <div key={s.label} className="card flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium">{s.label}</p>
                {s.value === null ? (
                  <div className="h-5 w-24 bg-gray-100 rounded animate-pulse mt-0.5" />
                ) : (
                  <p className="text-base sm:text-lg font-bold text-gray-900 truncate">{s.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Table card ─── */}
        <div className="card p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-gray-50 flex-wrap">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nota, customer…"
                className="input-field pl-9 text-xs sm:text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-sm flex-shrink-0">
              <span className="text-gray-400 text-xs hidden sm:inline">Baris:</span>
              <select
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                value={pagination.limit}
                onChange={(e) => changeLimit(Number(e.target.value))}
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Table wrapper — horizontal scroll on mobile */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 sm:px-4 py-3 text-[11px] font-semibold text-white/90 uppercase tracking-wider whitespace-nowrap
                        ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                        ${col.w || ''}`}
                    >
                      <div className={`flex items-center gap-0.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                        {col.label}
                        {col.filterable && (
                          <ColFilterDropdown
                            colKey={col.key}
                            values={colUniqueValues[col.key] || []}
                            selected={colFilters[col.key] || new Set()}
                            onChange={(s) => setColFilter(col.key, s)}
                          />
                        )}
                        {col.sortable && (
                          <button
                            onClick={() => toggleSort(col.key)}
                            className={`ml-1 p-0.5 rounded transition-colors ${
                              sortKey === col.key ? 'text-lime-400' : 'text-white/30 hover:text-white/70'
                            }`}
                            title={sortKey === col.key ? (sortDir === 'asc' ? 'Urutkan Terbesar' : 'Urutkan Terkecil') : 'Urutkan'}
                          >
                            {sortKey === col.key
                              ? sortDir === 'asc'
                                ? <ArrowUp className="w-3 h-3" />
                                : <ArrowDown className="w-3 h-3" />
                              : <ArrowUpDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Loading skeleton */}
                {loading && Array.from({ length: Math.min(pagination.limit || 6, 10) }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50 animate-pulse">
                    {COLS.map((c) => (
                      <td key={c.key} className="px-3 sm:px-4 py-3">
                        <div className={`h-3 bg-gray-100 rounded-full ${c.align === 'right' ? 'ml-auto w-20' : 'w-full max-w-[120px]'}`} />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Error */}
                {!loading && error && (
                  <tr><td colSpan={COLS.length} className="px-4 py-16 text-center">
                    <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
                    <p className="text-red-600 font-medium text-sm">{error}</p>
                    <button onClick={() => fetchData(pagination.page, pagination.limit)}
                      className="mt-3 text-sm text-brand-600 hover:underline">Coba lagi</button>
                  </td></tr>
                )}

                {/* Empty */}
                {!loading && !error && filtered.length === 0 && (
                  <tr><td colSpan={COLS.length} className="px-4 py-16 text-center">
                    <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">Tidak ada data</p>
                    <p className="text-gray-300 text-xs mt-1">Coba ubah filter tanggal atau outlet</p>
                  </td></tr>
                )}

                {/* Rows */}
                {!loading && !error && filtered.map((row, idx) => {
                  const rowNum = (pagination.page - 1) * pagination.limit + idx + 1;
                  return (
                    <tr key={`${row.no_nota}-${idx}`}
                      className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors even:bg-slate-50/30">
                      <td className="px-3 sm:px-4 py-2.5 text-center text-xs text-gray-400 tabular-nums">{rowNum}</td>
                      <td className="px-3 sm:px-4 py-2.5">
                        <span className="badge bg-brand-100 text-brand-700 font-semibold text-[11px]">{row.outlet || '—'}</span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{row.no_nota || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap text-xs">{row.customer_nama || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{row.pembuat_nota || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(row.tgl_terima)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(row.tgl_selesai)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDateTime(row.waktu_pembayaran)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-right font-bold text-lime-700 whitespace-nowrap tabular-nums text-xs">{fmtCurrency(row.nominal_bayar)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-400 text-xs max-w-[180px]">
                        <div className="truncate" title={row.daftar_item}>{row.daftar_item || '—'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ─── */}
          {!loading && !error && pagination.totalPages > 0 && (
            <div className="px-3 sm:px-4 py-3 border-t border-gray-50 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-700">
                  {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total).toLocaleString('id-ID')}
                  {' – '}
                  {Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString('id-ID')}
                </span>{' '}
                dari{' '}
                <span className="font-semibold text-gray-700">{pagination.total.toLocaleString('id-ID')}</span> data
                {filtered.length !== rows.length && (
                  <span className="ml-1 text-lime-600">(filter: {filtered.length.toLocaleString('id-ID')})</span>
                )}
              </p>

              <div className="flex items-center gap-1">
                <button onClick={() => goPage(1)} disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => goPage(pagination.page - 1)} disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="hidden sm:flex items-center gap-1">
                  {pageButtons().map((p, i) =>
                    p === '…' ? (
                      <span key={`el-${i}`} className="px-1 text-gray-400 text-xs">…</span>
                    ) : (
                      <button key={p} onClick={() => goPage(p)}
                        className={`min-w-[28px] h-[28px] px-1 text-xs rounded-lg border transition-colors ${
                          pagination.page === p
                            ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}>
                        {p}
                      </button>
                    )
                  )}
                </div>
                <span className="sm:hidden text-xs text-gray-500 px-2">
                  {pagination.page}/{pagination.totalPages}
                </span>

                <button onClick={() => goPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => goPage(pagination.totalPages)} disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
