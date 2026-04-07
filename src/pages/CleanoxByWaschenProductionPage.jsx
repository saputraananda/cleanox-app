import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  Building2,
  FileText,
  X,
  ChevronDown,
  CheckSquare,
  Square,
  AlertCircle,
  Inbox,
  Clock,
  Loader2,
} from 'lucide-react';
import api from '../utils/api.js';
import { getToken } from '../utils/auth.js';

/* ── Helpers ───────────────────────────────────────────── */
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
const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = toISO(new Date());

const cutoffStart = (year, month) => {
  const d = new Date(year, month - 2, 26);
  return toISO(d);
};
const cutoffEnd = (year, month) => {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-25`;
};
const now = new Date();
const DEFAULT_START = cutoffStart(now.getFullYear(), now.getMonth() + 1);
const DEFAULT_END = cutoffEnd(now.getFullYear(), now.getMonth() + 1);

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const buildQuickRanges = () => {
  const ranges = [];
  const n = new Date();
  ranges.push({ label: 'Hari Ini', range: () => ({ date_start: today, date_end: today }) });
  ranges.push({
    label: 'Kemarin',
    range: () => {
      const d = new Date(); d.setDate(d.getDate() - 1); const s = toISO(d);
      return { date_start: s, date_end: s };
    },
  });
  for (let i = 0; i < 12; i++) {
    const yr = n.getFullYear();
    const mo = n.getMonth() + 1 - i;
    const realYear = mo <= 0 ? yr - 1 : yr;
    const realMonth = mo <= 0 ? mo + 12 : mo;
    const s = cutoffStart(realYear, realMonth);
    const e = cutoffEnd(realYear, realMonth);
    const label = `${MONTHS_ID[realMonth - 1]} ${realYear}`;
    ranges.push({ label, range: () => ({ date_start: s, date_end: e }) });
  }
  return ranges;
};

const QUICK_RANGES = buildQuickRanges();
const PAGE_SIZES = [10, 25, 50, 100];

const VALID_STATUSES = ['Pickup', 'Cuci Jemur', 'Packing', 'Pengantaran'];

const STATUS_STYLE = {
  'Pickup':      { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200'   },
  'Cuci Jemur': { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200'  },
  'Packing':    { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  'Pengantaran':{ bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200'  },
};

const COLS = [
  { key: 'no',           label: 'No',              align: 'center', filterable: false, w: 'w-10' },
  { key: 'outlet',       label: 'Outlet',           align: 'left',   filterable: true  },
  { key: 'no_nota',      label: 'No Nota',          align: 'left',   filterable: true  },
  { key: 'customer_nama',label: 'Customer',          align: 'left',   filterable: true  },
  { key: 'tgl_terima',   label: 'Tgl Terima',       align: 'left',   filterable: false },
  { key: 'tgl_selesai',  label: 'Tgl Selesai',      align: 'left',   filterable: false },
  { key: 'status',       label: 'Status',           align: 'center', filterable: true  },
  { key: 'updated_by',   label: 'Diupdate Oleh',    align: 'left',   filterable: true  },
  { key: 'updated_at',   label: 'Terakhir Update',  align: 'left',   filterable: false },
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
          selected.size > 0 ? 'text-lime-500 bg-lime-50' : 'text-gray-300 hover:text-gray-500'
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
                {selected.has(v)
                  ? <CheckSquare className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                  : <Square className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                <span className="truncate">{v || '(kosong)'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Date Input (DD/MM/YYYY) ───────────────────────────── */
function DateInput({ value, onChange, className }) {
  const toDisplay = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const [display, setDisplay] = useState(() => toDisplay(value));
  useEffect(() => { setDisplay(toDisplay(value)); }, [value]);

  const handleChange = (e) => {
    let raw = e.target.value.replace(/[^\d]/g, '');
    if (raw.length > 4) raw = raw.slice(0, 2) + '/' + raw.slice(2, 4) + '/' + raw.slice(4, 8);
    else if (raw.length > 2) raw = raw.slice(0, 2) + '/' + raw.slice(2);
    setDisplay(raw);
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) onChange(`${match[3]}-${match[2]}-${match[1]}`);
  };

  const handleBlur = () => { setDisplay(toDisplay(value)); };

  return (
    <input type="text" value={display} onChange={handleChange} onBlur={handleBlur}
      placeholder="DD/MM/YYYY" maxLength={10} className={className} />
  );
}

/* ── Loading Bar ───────────────────────────────────────── */
function LoadingBar({ visible }) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="h-full bg-gradient-to-r from-brand-500 via-lime-400 to-brand-500 animate-[loadbar_1.4s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }} />
    </div>
  );
}

/* ── Status Badge ─────────────────────────────────────── */
function StatusBadge({ status }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>;
  const s = STATUS_STYLE[status] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      {status}
    </span>
  );
}

/* ── Inline Status Select ─────────────────────────────── */
function StatusSelect({ row, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(row.status || '');

  useEffect(() => {
    setCurrent(row.status || '');
  }, [row.status]);

  const handleChange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus || newStatus === current) return;
    setLoading(true);
    try {
      await api.patch(`/cleanox-by-waschen-production/${encodeURIComponent(row.no_nota)}/status`, {
        status: newStatus,
      });
      setCurrent(newStatus);
      onUpdate(row.no_nota, newStatus);
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal mengupdate status');
    } finally {
      setLoading(false);
    }
  };

  const s = current ? STATUS_STYLE[current] : null;

  return (
    <div className="relative flex items-center gap-1.5">
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500 flex-shrink-0" />}
      <select
        value={current}
        onChange={handleChange}
        disabled={loading}
        className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border appearance-none cursor-pointer
          focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-60 disabled:cursor-not-allowed
          ${s ? `${s.bg} ${s.text} ${s.border}` : 'bg-gray-100 text-gray-500 border-gray-200'}
        `}
      >
        <option value="">— Pilih —</option>
        {VALID_STATUSES.map((st) => (
          <option key={st} value={st}>{st}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */
export default function CleanoxByWaschenProductionPage() {
  const [dateStart, setDateStart] = useState(DEFAULT_START);
  const [dateEnd, setDateEnd]     = useState(DEFAULT_END);
  const [outlet, setOutlet]       = useState('');
  const [dateField, setDateField] = useState('tgl_terima');
  const [search, setSearch]       = useState('');

  const [applied, setApplied] = useState({
    date_start: DEFAULT_START,
    date_end:   DEFAULT_END,
    outlet:     '',
    date_field: 'tgl_terima',
  });

  const [outlets,    setOutlets]    = useState([]);
  const [rows,       setRows]       = useState([]);
  const [stats,      setStats]      = useState({ total: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 0 });
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [colFilters, setColFilters] = useState({});
  const [quickLabel, setQuickLabel] = useState('');

  const abortRef = useRef(null);

  /* Fetch outlets once */
  useEffect(() => {
    api.get('/cleanox-by-waschen-production/outlets')
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
      const { data } = await api.get(`/cleanox-by-waschen-production?${params}`, { signal: ctrl.signal });
      setRows(data.data);
      setStats(data.stats);
      setPagination(data.pagination);
      setColFilters({});
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

  /* Real-time SSE — sync updates from all users */
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`/api/cleanox-by-waschen-production/events?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      try {
        const { no_nota, status, updated_by, updated_at } = JSON.parse(e.data);
        setRows((prev) =>
          prev.map((r) =>
            r.no_nota === no_nota ? { ...r, status, updated_by, updated_at } : r
          )
        );
      } catch {}
    };
    return () => es.close();
  }, []);

  /* Handle inline status update — sync row state client-side */
  const handleStatusUpdate = useCallback((no_nota, newStatus) => {
    setRows((prev) =>
      prev.map((r) =>
        r.no_nota === no_nota
          ? { ...r, status: newStatus, updated_at: new Date().toISOString() }
          : r
      )
    );
  }, []);

  const applyFilter = () => setApplied({ date_start: dateStart, date_end: dateEnd, outlet, date_field: dateField });

  const applyQuick = (qr) => {
    const r = qr.range();
    setDateStart(r.date_start);
    setDateEnd(r.date_end);
    setQuickLabel(qr.label);
    setApplied({ date_start: r.date_start, date_end: r.date_end, outlet, date_field: dateField });
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

  /* Client-side filtering + search */
  const filtered = useMemo(() => {
    let data = rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((r) =>
        (r.no_nota        || '').toLowerCase().includes(q) ||
        (r.customer_nama  || '').toLowerCase().includes(q) ||
        (r.outlet         || '').toLowerCase().includes(q) ||
        (r.status         || '').toLowerCase().includes(q) ||
        (r.updated_by     || '').toLowerCase().includes(q)
      );
    }

    COLS.filter((c) => c.filterable).forEach((c) => {
      const sel = colFilters[c.key];
      if (sel && sel.size > 0) {
        data = data.filter((r) => sel.has(r[c.key] ?? ''));
      }
    });

    return data;
  }, [rows, search, colFilters]);

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
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Production Status</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Tracking status produksi Cleanox &amp; Karpet — update status langsung dari tabel
            </p>
          </div>
          <button
            onClick={() => fetchData(pagination.page, pagination.limit)}
            disabled={loading}
            className="btn-secondary text-xs sm:text-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
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
                <option value="tgl_selesai">Tgl Selesai</option>
              </select>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Mulai</label>
              <DateInput value={dateStart} onChange={setDateStart} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Akhir</label>
              <DateInput value={dateEnd} onChange={setDateEnd} className="input-field text-sm" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: FileText, label: 'Total Nota', value: loading ? null : stats.total.toLocaleString('id-ID'), color: 'text-brand-600', bg: 'bg-brand-50' },
            { icon: Calendar, label: 'Periode', value: `${fmtDate(applied.date_start)} – ${fmtDate(applied.date_end)}`, color: 'text-teal-600', bg: 'bg-teal-50' },
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

        {/* ── Status legend ─── */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 font-medium">Status:</span>
          {VALID_STATUSES.map((st) => (
            <StatusBadge key={st} status={st} />
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
                placeholder="Cari nota, customer, status…"
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

          {/* Table */}
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
                      <div className={`flex items-center gap-0.5 ${col.align === 'center' ? 'justify-center' : ''}`}>
                        {col.label}
                        {col.filterable && (
                          <ColFilterDropdown
                            colKey={col.key}
                            values={colUniqueValues[col.key] || []}
                            selected={colFilters[col.key] || new Set()}
                            onChange={(s) => setColFilter(col.key, s)}
                          />
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
                        <div className={`h-3 bg-gray-100 rounded-full ${c.align === 'center' ? 'mx-auto w-20' : 'w-full max-w-[120px]'}`} />
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
                    <tr
                      key={`${row.no_nota}-${idx}`}
                      className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors even:bg-slate-50/30"
                    >
                      <td className="px-3 sm:px-4 py-2.5 text-center text-xs text-gray-400 tabular-nums">{rowNum}</td>
                      <td className="px-3 sm:px-4 py-2.5">
                        <span className="badge bg-brand-100 text-brand-700 font-semibold text-[11px]">{row.outlet || '—'}</span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{row.no_nota || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap text-xs">{row.customer_nama || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(row.tgl_terima)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(row.tgl_selesai)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-center">
                        <StatusSelect row={row} onUpdate={handleStatusUpdate} />
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{row.updated_by || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDateTime(row.updated_at)}</td>
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
