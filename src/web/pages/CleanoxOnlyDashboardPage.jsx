import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Calendar,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  DollarSign,
  BarChart2,
  FileText,
  Search,
  PlusCircle,
  History,
  Users,
  ClipboardList,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import api from '@shared/utils/api.js';
import TablePagination, {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  paginateList,
} from '@web/components/TablePagination.jsx';

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const formatRp = (val) => {
  if (val === undefined || val === null || Number.isNaN(val)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

const formatDate = (val) => {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (val) => {
  if (!val) return '—';
  return new Date(val).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const STATUS_STYLE = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Assigned: 'bg-sky-50 text-sky-700 border-sky-100',
  Waiting_Confirmation: 'bg-amber-50 text-amber-700 border-amber-100',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-100',
  In_Progress: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-100',
};

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#4f46e5'];

const QUICK_LINKS = [
  { to: '/cleanox-only/transactions/new', label: 'Tambah Transaksi', icon: PlusCircle },
  { to: '/cleanox-only/transactions', label: 'Riwayat Transaksi', icon: History },
  { to: '/cleanox-only/customers', label: 'Customer', icon: Users },
];

const emptyDashboard = {
  period: {},
  summary: {
    total_transactions: 0,
    total_revenue: 0,
    incoming_transactions: 0,
    active_transactions: 0,
    completed_transactions: 0,
    cancelled_transactions: 0,
    avg_per_transaction: 0,
  },
  statusBreakdown: [],
  categoryBreakdown: [],
  paymentMethodBreakdown: [],
  paymentStatusBreakdown: [],
  trends: [],
  target: { target_nominal: 0, realisasi: 0, persen: 0 },
  details: [],
};

export default function CleanoxOnlyDashboardPage() {
  const [periods, setPeriods] = useState([]);
  const [filterType, setFilterType] = useState('bulan');
  const [selectedPeriod, setSelectedPeriod] = useState({ yr: '', mo: '' });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${String(now.getDate()).padStart(2, '0')}` };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState(emptyDashboard);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const yearsList = useMemo(() => {
    const list = Array.from(new Set(periods.map((p) => p.yr))).filter(Boolean).sort((a, b) => b - a);
    if (list.length === 0) {
      const y = new Date().getFullYear();
      return [y, y - 1, y - 2];
    }
    return list;
  }, [periods]);

  useEffect(() => {
    setLoading(true);
    api.get('/pos-dashboard/available-periods')
      .then(({ data }) => {
        const list = data.periods || [];
        setPeriods(list);
        if (list.length > 0) {
          setSelectedPeriod({ yr: list[0].yr, mo: list[0].mo });
        } else {
          const now = new Date();
          setSelectedPeriod({ yr: now.getFullYear(), mo: now.getMonth() + 1 });
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Gagal memuat daftar periode');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (filterType === 'bulan' && (!selectedPeriod.yr || !selectedPeriod.mo)) return;
    if (filterType === 'rentang' && (!dateRange.startDate || !dateRange.endDate)) return;
    if (filterType === 'tahun' && !selectedYear) return;

    setLoading(true);
    setError('');

    let url = `/pos-dashboard/data?filterType=${filterType}`;
    if (filterType === 'bulan') {
      url += `&year=${selectedPeriod.yr}&month=${selectedPeriod.mo}`;
    } else if (filterType === 'rentang') {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    } else if (filterType === 'tahun') {
      url += `&year=${selectedYear}`;
    }

    api.get(url)
      .then(({ data }) => {
        setDashboardData(data);
        setCurrentPage(1);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Gagal memuat data dashboard revenue');
      })
      .finally(() => setLoading(false));
  }, [filterType, selectedPeriod, selectedYear, dateRange]);

  const handlePeriodChange = (e) => {
    const [yr, mo] = e.target.value.split('-').map(Number);
    setSelectedPeriod({ yr, mo });
  };

  const handleRefresh = () => {
    setFilterType((prev) => prev);
    setLoading(true);
    setError('');
    let url = `/pos-dashboard/data?filterType=${filterType}`;
    if (filterType === 'bulan') {
      url += `&year=${selectedPeriod.yr}&month=${selectedPeriod.mo}`;
    } else if (filterType === 'rentang') {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    } else if (filterType === 'tahun') {
      url += `&year=${selectedYear}`;
    }
    api.get(url)
      .then(({ data }) => setDashboardData(data))
      .catch((err) => setError(err.response?.data?.message || 'Gagal memuat data dashboard revenue'))
      .finally(() => setLoading(false));
  };

  const trendChartData = useMemo(() => {
    return (dashboardData.trends || []).map((row) => ({
      date: new Date(row.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
      sales: row.sales,
      count: row.count,
    }));
  }, [dashboardData.trends]);

  const statusChartData = useMemo(() => {
    return (dashboardData.statusBreakdown || []).map((row) => ({
      name: String(row.status || '').replace(/_/g, ' '),
      value: row.total,
      revenue: row.revenue,
    }));
  }, [dashboardData.statusBreakdown]);

  const categoryChartData = useMemo(() => {
    return (dashboardData.categoryBreakdown || []).map((row) => ({
      name: row.category_name,
      revenue: row.revenue,
      items: row.total_items,
    }));
  }, [dashboardData.categoryBreakdown]);

  const paymentMethodChartData = useMemo(() => {
    return (dashboardData.paymentMethodBreakdown || []).map((row) => ({
      name: row.method_group,
      revenue: row.revenue,
      total: row.total,
    }));
  }, [dashboardData.paymentMethodBreakdown]);

  const paymentStatusChartData = useMemo(() => {
    return (dashboardData.paymentStatusBreakdown || []).map((row) => ({
      name: row.payment_status === 'lunas' ? 'Lunas' : 'Belum lunas',
      value: row.total,
      revenue: row.revenue,
      payment_status: row.payment_status,
    }));
  }, [dashboardData.paymentStatusBreakdown]);

  const filteredDetails = useMemo(() => {
    const details = dashboardData.details || [];
    if (!searchTerm.trim()) return details;
    const term = searchTerm.toLowerCase();
    return details.filter((row) =>
      (row.transaction_no && row.transaction_no.toLowerCase().includes(term)) ||
      (row.customer_name && row.customer_name.toLowerCase().includes(term)) ||
      (row.status && row.status.toLowerCase().includes(term)) ||
      (row.daftar_item && row.daftar_item.toLowerCase().includes(term)) ||
      (row.payment_method_label && row.payment_method_label.toLowerCase().includes(term)) ||
      (row.payment_method_group && row.payment_method_group.toLowerCase().includes(term)) ||
      (row.payment_status && row.payment_status.toLowerCase().includes(term)) ||
      (row.payment_status === 'lunas' && 'lunas'.includes(term)) ||
      (row.payment_status !== 'lunas' && 'belum lunas'.includes(term))
    );
  }, [dashboardData.details, searchTerm]);

  const {
    items: paginatedDetails,
    totalItems,
    totalPages,
    page: safePage,
  } = paginateList(filteredDetails, currentPage, pageSize);

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const summary = dashboardData.summary || emptyDashboard.summary;
  const target = dashboardData.target || emptyDashboard.target;
  const pct = Number(target.persen || 0);
  const hasTarget = target.target_nominal > 0;
  const barWidth = Math.min(pct, 100);
  const sisa = hasTarget ? Math.max(0, target.target_nominal - target.realisasi) : 0;

  const statusInfo = !hasTarget
    ? { label: 'Target Belum Diset', color: 'text-slate-400', bgBadge: 'bg-slate-100', ring: 'bg-slate-200' }
    : pct >= 100
      ? { label: 'Target Tercapai! 🎉', color: 'text-emerald-600', bgBadge: 'bg-emerald-50', ring: 'bg-emerald-500' }
      : pct >= 75
        ? { label: 'On Track', color: 'text-blue-600', bgBadge: 'bg-blue-50', ring: 'bg-blue-500' }
        : pct >= 50
          ? { label: 'Perlu Dikejar', color: 'text-amber-600', bgBadge: 'bg-amber-50', ring: 'bg-amber-500' }
          : { label: 'Perlu Perhatian', color: 'text-rose-600', bgBadge: 'bg-rose-50', ring: 'bg-rose-500' };

  const barColor = !hasTarget
    ? 'from-slate-300 to-slate-400'
    : pct >= 100
      ? 'from-emerald-400 to-emerald-600'
      : pct >= 75
        ? 'from-blue-400 to-indigo-600'
        : pct >= 50
          ? 'from-amber-400 to-orange-500'
          : 'from-rose-400 to-rose-600';

  return (
    <div className="p-3 sm:p-5 max-w-[1400px] mx-auto space-y-6 bg-slate-50 min-h-full">
      <section
        className="relative overflow-hidden rounded-[20px] px-5 py-[18px] text-white"
        style={{
          background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 35%, #1D4ED8 70%, #3B82F6 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative">
          <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-100/80">Cleanox Only</p>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-[-0.01em]">Dashboard Revenue</h1>
          <p className="mt-2 text-[13px] text-blue-100/90 max-w-xl">
            Monitoring transaksi, omzet, dan realisasi target revenue Cleanox Only.
          </p>
        </div>
      </section>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            Grafik Analitik Revenue
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Data berdasarkan tanggal layanan transaksi.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
            {['bulan', 'rentang', 'tahun'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  filterType === type ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {type === 'bulan' ? 'Bulan' : type === 'rentang' ? 'Rentang' : 'Tahun'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {filterType === 'bulan' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={`${selectedPeriod.yr}-${selectedPeriod.mo}`}
                  onChange={handlePeriodChange}
                  disabled={loading}
                  className="bg-transparent text-xs focus:outline-none cursor-pointer font-semibold text-slate-700"
                >
                  {periods.map((p, idx) => (
                    <option key={idx} value={`${p.yr}-${p.mo}`}>
                      {MONTHS_ID[p.mo - 1]} {p.yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {filterType === 'rentang' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="bg-transparent text-xs focus:outline-none font-semibold text-slate-700"
                />
                <span className="text-slate-400 text-xs">s/d</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="bg-transparent text-xs focus:outline-none font-semibold text-slate-700"
                />
              </div>
            )}

            {filterType === 'tahun' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent text-xs focus:outline-none font-semibold text-slate-700"
                >
                  {yearsList.map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center justify-center p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Menarik data transaksi...</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">Gapai Target Cleanox</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.bgBadge} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {dashboardData.period?.date_start && dashboardData.period?.date_end
                      ? `${formatDate(dashboardData.period.date_start)} – ${formatDate(dashboardData.period.date_end)}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full xl:w-auto xl:min-w-[420px]">
                <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-2.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Realisasi Revenue</span>
                  <span className="text-xs font-extrabold text-slate-700 mt-0.5 block">{formatRp(target.realisasi)}</span>
                </div>
                <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-xl p-2.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Target</span>
                  <span className="text-xs font-extrabold text-indigo-700 mt-0.5 block">{formatRp(target.target_nominal)}</span>
                </div>
                <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-2.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Sisa</span>
                  <span className="text-xs font-extrabold text-slate-700 mt-0.5 block">{formatRp(sisa)}</span>
                </div>
              </div>
            </div>
            <div className="px-5 pb-4">
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-semibold mt-1">
                <span>{pct.toFixed(1)}% tercapai</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 shadow-lg">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-indigo-200 text-[11px] font-semibold uppercase tracking-widest mb-1">Total Revenue</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{formatRp(summary.total_revenue)}</h2>
                <p className="text-indigo-200 text-xs mt-1">
                  {summary.total_transactions} transaksi dalam periode
                </p>
              </div>
              <div className="flex gap-3">
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center min-w-[100px]">
                  <p className="text-indigo-200 text-[10px] font-semibold uppercase">Incoming</p>
                  <p className="text-white font-extrabold text-base mt-1">{summary.incoming_transactions}</p>
                </div>
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center min-w-[100px]">
                  <p className="text-indigo-200 text-[10px] font-semibold uppercase">Active</p>
                  <p className="text-white font-extrabold text-base mt-1">{summary.active_transactions}</p>
                </div>
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center min-w-[100px]">
                  <p className="text-indigo-200 text-[10px] font-semibold uppercase">Completed</p>
                  <p className="text-white font-extrabold text-base mt-1">{summary.completed_transactions}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Transactions', value: summary.total_transactions.toLocaleString('id-ID'), icon: FileText, bg: 'bg-indigo-50', iconColor: 'text-indigo-600', sub: `${summary.cancelled_transactions} cancelled` },
              { label: 'Total Revenue', value: formatRp(summary.total_revenue), icon: DollarSign, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', sub: 'exclude cancelled' },
              { label: 'Active Transactions', value: summary.active_transactions.toLocaleString('id-ID'), icon: ClipboardList, bg: 'bg-blue-50', iconColor: 'text-blue-600', sub: 'assigned + scheduled + in progress' },
              { label: 'Avg / Transaction', value: formatRp(summary.avg_per_transaction), icon: BarChart2, bg: 'bg-amber-50', iconColor: 'text-amber-600', sub: 'average revenue' },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-start gap-3 hover:shadow-md transition-all group">
                <div className={`w-9 h-9 ${card.bg} rounded-xl flex items-center justify-center ${card.iconColor} flex-shrink-0 group-hover:scale-110 transition-transform`}>
                  <card.icon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{card.label}</p>
                  <p className="text-base font-extrabold text-slate-800 mt-0.5 leading-tight truncate">{card.value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800">Trend Omzet Harian</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Omzet berdasarkan tanggal layanan</p>
              <div className="h-64">
                {trendChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">Tidak ada data trend.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => formatRp(v)} />
                      <Line type="monotone" dataKey="sales" name="Omzet" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800">Status Transaksi</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Distribusi per status</p>
              <div className="h-64 flex items-center justify-center">
                {statusChartData.length === 0 ? (
                  <p className="text-xs text-slate-400">Tidak ada data status.</p>
                ) : (
                  <PieChart width={220} height={220}>
                    <Pie data={statusChartData} cx={110} cy={110} innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                      {statusChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                )}
              </div>
            </div>
          </div>

          {categoryChartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800">Omzet per Kategori Layanan</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Breakdown dari item transaksi</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData} barSize={28} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => formatRp(v)} />
                    <Bar dataKey="revenue" name="Omzet" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800">Omzet per Metode Pembayaran</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Tunai, BCA, EDC (exclude cancelled)</p>
              <div className="h-56">
                {paymentMethodChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Tidak ada data metode pembayaran.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paymentMethodChartData} barSize={28} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v, name) => (name === 'Omzet' ? formatRp(v) : v)}
                      />
                      <Bar dataKey="revenue" name="Omzet" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800">Status Pembayaran</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Lunas vs belum lunas</p>
              <div className="h-56 flex items-center justify-center">
                {paymentStatusChartData.length === 0 ? (
                  <p className="text-xs text-slate-400">Tidak ada data status pembayaran.</p>
                ) : (
                  <PieChart width={220} height={220}>
                    <Pie
                      data={paymentStatusChartData}
                      cx={110}
                      cy={110}
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {paymentStatusChartData.map((row, i) => (
                        <Cell
                          key={i}
                          fill={row.payment_status === 'lunas' ? '#10b981' : '#f59e0b'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, _name, item) => [
                        `${v} trx · ${formatRp(item?.payload?.revenue || 0)}`,
                        item?.payload?.name || '',
                      ]}
                    />
                  </PieChart>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Detail Transaksi</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Daftar transaksi dalam periode filter</p>
              </div>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari transaksi, customer, item..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none font-medium"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[12px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left">No Transaksi</th>
                    <th className="px-4 py-2.5 text-left">Customer</th>
                    <th className="px-4 py-2.5 text-left">Tanggal Layanan</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Pembayaran</th>
                    <th className="px-4 py-2.5 text-left">Metode</th>
                    <th className="px-4 py-2.5 text-left min-w-[180px]">Item Layanan</th>
                    <th className="px-4 py-2.5 text-center">Worker</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedDetails.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">
                        Tidak ada transaksi untuk periode ini.
                      </td>
                    </tr>
                  ) : (
                    paginatedDetails.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/cleanox-only/transactions/${row.id}`}
                            className="font-bold text-indigo-600 font-sans text-[12px] hover:underline"
                          >
                            {row.transaction_no}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{row.customer_name || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatDateTime(row.service_date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${STATUS_STYLE[row.status] || STATUS_STYLE.Draft}`}>
                            {String(row.status || '').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                              row.payment_status === 'lunas'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {row.payment_status === 'lunas' ? 'Lunas' : 'Belum lunas'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 text-[13px]">
                          {row.payment_method_label || row.payment_method_group || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 text-[13px] leading-relaxed">{row.daftar_item}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{row.total_workers}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                          {formatRp(row.final_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <TablePagination
              totalItems={totalItems}
              totalPages={totalPages}
              page={safePage}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
              itemLabel="transaksi"
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-[14px] font-bold tracking-[-0.01em] text-slate-900">Quick Action</h2>
            <div className="grid gap-2.5 md:grid-cols-3">
              {QUICK_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-[16px] border border-slate-200 bg-white px-[14px] pt-5 pb-4 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                >
                  <div
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-blue-700"
                    style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
                  >
                    <item.icon className="w-[22px] h-[22px]" />
                  </div>
                  <h3 className="mt-4 text-[14px] font-bold text-slate-900">{item.label}</h3>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
