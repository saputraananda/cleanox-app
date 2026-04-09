import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogIn, LogOut, Monitor, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Calendar, Search,
  RefreshCw, Clock, User, Shield,
} from 'lucide-react';
import api from '../utils/api.js';

const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = toISO(new Date());
const thirtyDaysAgo = toISO(new Date(Date.now() - 29 * 86400000));

const fmtDateTime = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const durationStr = (login, logout) => {
  if (!logout) return null;
  const diff = new Date(logout) - new Date(login);
  if (diff < 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s}d`;
};

const ROLE_STYLE = {
  admin:      'bg-purple-100 text-purple-700 border-purple-200',
  cleanox:    'bg-brand-100 text-brand-700 border-brand-200',
  frontliner: 'bg-amber-100 text-amber-700 border-amber-200',
  employee:   'bg-gray-100 text-gray-600 border-gray-200',
};

function LoadingBar({ visible }) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="h-full bg-gradient-to-r from-brand-500 via-lime-400 to-brand-500 animate-[loadbar_1.4s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }} />
    </div>
  );
}

export default function AuditLoginPage() {
  const [dateStart, setDateStart] = useState(thirtyDaysAgo);
  const [dateEnd,   setDateEnd]   = useState(today);
  const [search,    setSearch]    = useState('');
  const [rows,      setRows]      = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const abortRef = useRef(null);

  const fetchData = useCallback(async (page = 1, limit = 50, ds = dateStart, de = dateEnd) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date_start: ds, date_end: de, page, limit });
      const { data } = await api.get(`/auth/audit-login?${params}`, { signal: ctrl.signal });
      setRows(data.data);
      setPagination(data.pagination);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setError(err.response?.data?.message || 'Gagal memuat data');
      }
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd]);

  useEffect(() => { fetchData(); }, []);

  const applyFilter = () => fetchData(1, pagination.limit, dateStart, dateEnd);
  const goPage = (p) => { setPagination((prev) => ({ ...prev, page: p })); fetchData(p, pagination.limit); };

  const filtered = search.trim()
    ? rows.filter((r) =>
        (r.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.role     || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.ip_address || '').includes(search)
      )
    : rows;

  const pageButtons = () => {
    const total = pagination.totalPages, cur = pagination.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 4)         return [1, 2, 3, 4, 5, '…', total];
    if (cur >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', cur - 1, cur, cur + 1, '…', total];
  };

  return (
    <>
      <LoadingBar visible={loading} />
      <div className="p-3 sm:p-5 space-y-4 max-w-[1200px] mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Audit Login</h1>
            <p className="text-xs text-gray-400 mt-0.5">Riwayat login & logout seluruh pengguna</p>
          </div>
          <button
            onClick={() => fetchData(pagination.page, pagination.limit)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:border-brand-400 hover:text-brand-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Dari</label>
            <input
              type="date" value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Sampai</label>
            <input
              type="date" value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={applyFilter}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors"
          >
            <Calendar className="w-4 h-4" /> Terapkan
          </button>
          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari username, role, IP..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {pagination.total.toLocaleString('id-ID')} record
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">No</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Username</span>
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Role</span>
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><LogIn className="w-3.5 h-3.5" /> Login</span>
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><LogOut className="w-3.5 h-3.5" /> Logout</span>
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Durasi</span>
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5" /> IP</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Memuat data...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Tidak ada data</td></tr>
                ) : (
                  filtered.map((r, i) => {
                    const dur = durationStr(r.login_at, r.logout_at);
                    const roleStyle = ROLE_STYLE[r.role] || ROLE_STYLE.employee;
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${!r.logout_at ? 'bg-green-50/30' : ''}`}>
                        <td className="px-3 py-2.5 text-gray-400">
                          {(pagination.page - 1) * pagination.limit + i + 1}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-gray-800">{r.username}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${roleStyle}`}>
                            {r.role}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 font-mono text-[11px]">
                          {fmtDateTime(r.login_at)}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.logout_at ? (
                            <span className="text-gray-700 font-mono text-[11px]">{fmtDateTime(r.logout_at)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-semibold">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                              Aktif
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500">
                          {dur ? (
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">{dur}</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-gray-500">{r.ip_address || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-gray-400">
                Halaman {pagination.page} dari {pagination.totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => goPage(1)} disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors">
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button onClick={() => goPage(pagination.page - 1)} disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageButtons().map((p, i) =>
                  p === '…' ? (
                    <span key={`e${i}`} className="px-2 text-gray-400">…</span>
                  ) : (
                    <button key={p} onClick={() => goPage(p)}
                      className={`min-w-[32px] h-8 rounded-lg text-xs font-medium transition-colors
                        ${pagination.page === p ? 'bg-brand-700 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
                      {p}
                    </button>
                  )
                )}
                <button onClick={() => goPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => goPage(pagination.totalPages)} disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors">
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
