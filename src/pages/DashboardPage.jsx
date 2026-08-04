import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ChevronRight,
  Calendar,
  Factory,
  Users,
  TrendingUp,
  FileText,
  Search,
  RefreshCw,
  AlertCircle,
  Building2,
  DollarSign,
  Briefcase,
  ChevronLeft,
  User,
  ShoppingBag,
  CreditCard,
  Wallet,
  BarChart2,
  ClipboardList
} from 'lucide-react';
import { getUser } from '../utils/auth.js';
import api from '../utils/api.js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// Currency and date formatting helpers
const formatRp = (val) => {
  if (val === undefined || val === null || isNaN(val)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val);
};

const formatDate = (val) => {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatDateTime = (val) => {
  if (!val) return '—';
  return new Date(val).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const MENU_CARDS = [
  {
    id: 'pos-admin',
    title: 'POS Admin',
    description: 'Input transaksi POS baru, assignment worker, dan pantau tracking POS.',
    icon: ClipboardList,
    gradient: 'from-sky-500 to-indigo-600',
    ring: 'ring-sky-200',
    soon: false,
    to: '/pos-transactions',
    roles: ['admin', 'management'],
  },
  {
    id: 'cleanox',
    title: 'Cleanox',
    description: 'Manajemen dan monitoring data Cleanox internal.',
    icon: Sparkles,
    gradient: 'from-violet-500 to-purple-600',
    ring: 'ring-purple-200',
    soon: true,
    to: '/cleanox',
    roles: [],
  },
  {
    id: 'status-produksi',
    title: 'Status Produksi',
    description: 'Pantau dan perbarui status pengerjaan order cleanox secara real-time.',
    icon: Factory,
    gradient: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-200',
    soon: false,
    to: '/cleanox-by-waschen-production',
    roles: ['admin', 'management', 'produksi', 'frontliner'],
  },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = getUser();
  const firstName = user?.name?.split(' ')[0] || 'User';
  const todayLabel = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const showDashboard = user?.role === 'admin' || user?.role === 'produksi' || user?.isManagement;

  // Filter & Data States
  const [activeTab, setActiveTab] = useState('cleanox-by-waschen');
  const [periods, setPeriods] = useState([]);
  const [outletsList, setOutletsList] = useState([]);
  const [selectedOutlets, setSelectedOutlets] = useState([]);
  const [isOutletDropdownOpen, setIsOutletDropdownOpen] = useState(false);

  const [filterType, setFilterType] = useState('bulan'); // 'bulan' | 'rentang' | 'tahun'
  const [selectedPeriod, setSelectedPeriod] = useState({ yr: '', mo: '' });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Set default dateRange to 26th of last month to 25th of current month
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    let startYear = currentYear;
    let startMonth = currentMonth - 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear = currentYear - 1;
    }
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-26`;
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-25`;
    return { startDate, endDate };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dashboard states
  const [dashboardData, setDashboardData] = useState({
    period: {},
    performance: [],
    details: [],
    summary: { total_nota: 0, total_omzet: 0, jatah_70: 0, jatah_30: 0, avg_per_nota: 0 },
    cashier: [],
    trends: { total: [], waschenOnly: [] },
    cleanoxOnlyBreakdown: { rows: [], grand_total: { tunai: 0, non_tunai: 0, total: 0 } },
    cleanoxTarget: { target_nominal: 0, realisasi: 0, omzet_total: 0, persen: 0 }
  });

  // Table pagination and search states
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [cleanoxSearchTerm, setCleanoxSearchTerm] = useState('');
  const [cleanoxCurrentPage, setCleanoxCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Memoized years list from periods
  const yearsList = useMemo(() => {
    const list = Array.from(new Set(periods.map(p => p.yr))).filter(Boolean).sort((a, b) => b - a);
    if (list.length === 0) {
      const currentYear = new Date().getFullYear();
      return [currentYear, currentYear - 1, currentYear - 2];
    }
    return list;
  }, [periods]);

  // Fetch available periods & outlets on mount if showDashboard is true
  useEffect(() => {
    if (!showDashboard) return;
    setLoading(true);
    api.get('/dashboard-cleanox/available-periods')
      .then(({ data }) => {
        const list = data.periods || [];
        setPeriods(list);
        if (list.length > 0) {
          setSelectedPeriod({ yr: list[0].yr, mo: list[0].mo });
        } else {
          const now = new Date();
          setSelectedPeriod({ yr: now.getFullYear(), mo: now.getMonth() + 1 });
        }

        const fetchedOutlets = data.outlets || [];
        setOutletsList(fetchedOutlets);
      })
      .catch((err) => {
        console.error('[cleanox-dashboard/periods-error]', err);
        setError('Gagal memuat daftar periode billing');
        setLoading(false);
      });
  }, [showDashboard]);

  // Fetch dashboard data when filters change
  useEffect(() => {
    if (!showDashboard) return;

    if (filterType === 'bulan' && (!selectedPeriod.yr || !selectedPeriod.mo)) return;
    if (filterType === 'rentang' && (!dateRange.startDate || !dateRange.endDate)) return;
    if (filterType === 'tahun' && !selectedYear) return;

    setLoading(true);
    setError('');

    let url = `/dashboard-cleanox/data?filterType=${filterType}`;
    if (filterType === 'bulan') {
      url += `&year=${selectedPeriod.yr}&month=${selectedPeriod.mo}`;
    } else if (filterType === 'rentang') {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    } else if (filterType === 'tahun') {
      url += `&year=${selectedYear}`;
    }

    if (selectedOutlets.length > 0) {
      url += `&outlets=${encodeURIComponent(selectedOutlets.join(','))}`;
    }

    api.get(url)
      .then(({ data }) => {
        setDashboardData(data);
        setCurrentPage(1);
        setCleanoxCurrentPage(1);
      })
      .catch((err) => {
        console.error('[cleanox-dashboard/data-error]', err);
        setError(err.response?.data?.message || 'Gagal memuat data dashboard');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filterType, selectedPeriod, selectedYear, dateRange, selectedOutlets, showDashboard]);

  // Compute aligned trends (Query 5 & Query 6)
  const formattedTrends = useMemo(() => {
    const totalList = dashboardData.trends.total || [];
    const waschenList = dashboardData.trends.waschenOnly || [];
    const trendMap = {};

    totalList.forEach(t => {
      const dateStr = t.tanggal.split('T')[0];
      const dLabel = new Date(t.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      trendMap[dateStr] = {
        dateRaw: dateStr,
        date: dLabel,
        totalSales: Number(t.sales || 0),
        waschenOnly: 0,
        cleanoxOnly: 0,
        cleanox30: 0
      };
    });

    waschenList.forEach(w => {
      const dateStr = w.tanggal.split('T')[0];
      const val = Number(w.sales || 0);
      if (!trendMap[dateStr]) {
        const dLabel = new Date(w.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        trendMap[dateStr] = {
          dateRaw: dateStr,
          date: dLabel,
          totalSales: 0,
          waschenOnly: val,
          cleanoxOnly: 0,
          cleanox30: 0
        };
      } else {
        trendMap[dateStr].waschenOnly = val;
      }
    });

    return Object.values(trendMap)
      .map(item => {
        const cleanoxOnly = Math.max(0, item.totalSales - item.waschenOnly);
        item.cleanoxOnly = cleanoxOnly;
        item.cleanox70 = cleanoxOnly * 0.7;
        return item;
      })
      .sort((a, b) => new Date(a.dateRaw) - new Date(b.dateRaw));
  }, [dashboardData.trends]);

  // Compute Cleanox 70% performance per outlet
  const formattedPerformance = useMemo(() => {
    return dashboardData.performance.map(item => ({
      ...item,
      cleanox_sales_70: Number(item.cleanox_sales || 0) * 0.7
    }));
  }, [dashboardData.performance]);

  // Filtered detail transactions for Table
  const filteredDetails = useMemo(() => {
    const details = dashboardData.details || [];
    if (!searchTerm.trim()) return details;
    const term = searchTerm.toLowerCase();

    return details.filter(row =>
      (row.no_nota && row.no_nota.toLowerCase().includes(term)) ||
      (row.customer_nama && row.customer_nama.toLowerCase().includes(term)) ||
      (row.outlet && row.outlet.toLowerCase().includes(term)) ||
      (row.daftar_item && row.daftar_item.toLowerCase().includes(term)) ||
      (row.pembuat_nota && row.pembuat_nota.toLowerCase().includes(term))
    );
  }, [dashboardData.details, searchTerm]);

  // Paginated transactions
  const paginatedDetails = useMemo(() => {
    const offset = (currentPage - 1) * itemsPerPage;
    return filteredDetails.slice(offset, offset + itemsPerPage);
  }, [filteredDetails, currentPage]);

  const totalPages = Math.ceil(filteredDetails.length / itemsPerPage);

  const handleOutletToggle = (outletName) => {
    if (selectedOutlets.includes(outletName)) {
      setSelectedOutlets(selectedOutlets.filter(o => o !== outletName));
    } else {
      setSelectedOutlets([...selectedOutlets, outletName]);
    }
  };

  const handleSelectAllOutlets = () => {
    setSelectedOutlets(outletsList);
  };

  const handleClearOutlets = () => {
    setSelectedOutlets([]);
  };

  const displayOutletName = (name) => name.replace(' Laundry', '');

  const handlePeriodChange = (e) => {
    const [yr, mo] = e.target.value.split('-');
    setSelectedPeriod({ yr: Number(yr), mo: Number(mo) });
  };

  const handleRefresh = () => {
    if (filterType === 'bulan' && (!selectedPeriod.yr || !selectedPeriod.mo)) return;
    if (filterType === 'rentang' && (!dateRange.startDate || !dateRange.endDate)) return;
    if (filterType === 'tahun' && !selectedYear) return;

    setLoading(true);
    setError('');

    let url = `/dashboard-cleanox/data?filterType=${filterType}`;
    if (filterType === 'bulan') {
      url += `&year=${selectedPeriod.yr}&month=${selectedPeriod.mo}`;
    } else if (filterType === 'rentang') {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    } else if (filterType === 'tahun') {
      url += `&year=${selectedYear}`;
    }

    if (selectedOutlets.length > 0) {
      url += `&outlets=${encodeURIComponent(selectedOutlets.join(','))}`;
    }

    api.get(url)
      .then(({ data }) => {
        setDashboardData(data);
        setCleanoxCurrentPage(1);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Gagal menyegarkan data');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const visibleCards = MENU_CARDS.filter(
    (item) =>
      item.roles.length > 0 &&
      (item.roles.includes(user?.role) ||
        (item.roles.includes('management') && user?.isManagement))
  );

  return (
    <div className={`p-6 mx-auto space-y-6 ${showDashboard ? 'max-w-7xl' : 'max-w-4xl'}`}>
      {/* Analytics Dashboard section (Only for authorized roles) */}
      {showDashboard && (
        <div className="space-y-6">

          {/* Header & period selector */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                Grafik Analitik Cleanox
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitoring penjualan, realisasi target, dan segmentasi pelanggan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Outlet Filter */}
              <div className="flex items-center gap-2 relative">
                <span className="text-xs font-semibold text-slate-500">Outlet</span>
                <div className="relative">
                  <button
                    onClick={() => setIsOutletDropdownOpen(!isOutletDropdownOpen)}
                    className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none transition-all"
                  >
                    <span>
                      {selectedOutlets.length === 0 || selectedOutlets.length === outletsList.length
                        ? 'Semua Outlet'
                        : `${selectedOutlets.length} Outlet Terpilih`}
                    </span>
                    <span className="text-slate-400 text-[10px]">▼</span>
                  </button>

                  {isOutletDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOutletDropdownOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-150 rounded-2xl shadow-xl z-20 p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                          <span className="font-bold text-slate-700">Pilih Outlet</span>
                          <div className="flex items-center gap-1.5 font-semibold">
                            <button
                              onClick={handleSelectAllOutlets}
                              className="text-purple-600 hover:text-purple-700 hover:underline"
                            >
                              Pilih Semua
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              onClick={handleClearOutlets}
                              className="text-slate-500 hover:text-slate-700 hover:underline"
                            >
                              Bersihkan
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {outletsList.map((outlet, idx) => {
                            const isChecked = selectedOutlets.includes(outlet);
                            return (
                              <label
                                key={idx}
                                className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-650"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleOutletToggle(outlet)}
                                  className="rounded text-purple-600 focus:ring-purple-500 h-3.5 w-3.5 border-slate-300"
                                />
                                <span>{displayOutletName(outlet)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Separator */}
              <div className="hidden sm:block h-6 w-px bg-slate-200" />

              {/* Segmented Control Filter Type */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                <button
                  onClick={() => setFilterType('bulan')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterType === 'bulan'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Bulan
                </button>
                <button
                  onClick={() => setFilterType('rentang')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterType === 'rentang'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Rentang
                </button>
                <button
                  onClick={() => setFilterType('tahun')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterType === 'tahun'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Tahun
                </button>
              </div>

              {/* Dynamic Input based on active filterType */}
              <div className="flex items-center gap-2">
                {filterType === 'bulan' && (
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-700 font-semibold focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={`${selectedPeriod.yr}-${selectedPeriod.mo}`}
                      onChange={handlePeriodChange}
                      disabled={loading}
                      className="bg-transparent text-xs focus:outline-none cursor-pointer disabled:opacity-50 font-semibold text-slate-700"
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
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-700 font-semibold focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                    <input
                      type="date"
                      value={dateRange.startDate}
                      onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                      disabled={loading}
                      className="bg-transparent text-xs focus:outline-none cursor-pointer disabled:opacity-50 font-semibold text-slate-700"
                    />
                    <span className="text-slate-400 text-xs">s/d</span>
                    <input
                      type="date"
                      value={dateRange.endDate}
                      onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                      disabled={loading}
                      className="bg-transparent text-xs focus:outline-none cursor-pointer disabled:opacity-50 font-semibold text-slate-700"
                    />
                  </div>
                )}

                {filterType === 'tahun' && (
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-700 font-semibold focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      disabled={loading}
                      className="bg-transparent text-xs focus:outline-none cursor-pointer disabled:opacity-50 font-semibold text-slate-700"
                    >
                      {yearsList.map((yr, idx) => (
                        <option key={idx} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="flex items-center justify-center p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-all disabled:opacity-50"
                  title="Refresh Data"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Gapai Target Card */}
          {!loading && !error && (() => {
            const ct = dashboardData.cleanoxTarget || {};
            const pct = Number(ct.persen || 0);
            const hasTarget = ct.target_nominal > 0;
            const barWidth = Math.min(pct, 100);
            const sisa = hasTarget ? Math.max(0, ct.target_nominal - ct.realisasi) : 0;
            const statusInfo = !hasTarget
              ? { label: 'Target Belum Diset', color: 'text-slate-400', bgBadge: 'bg-slate-100', ring: 'bg-slate-200' }
              : pct >= 100
                ? { label: 'Target Tercapai! 🎉', color: 'text-emerald-600', bgBadge: 'bg-emerald-50', ring: 'bg-emerald-500' }
                : pct >= 75
                  ? { label: 'On Track', color: 'text-blue-600', bgBadge: 'bg-blue-50', ring: 'bg-blue-500' }
                  : pct >= 50
                    ? { label: 'Perlu Dikejar', color: 'text-amber-600', bgBadge: 'bg-amber-50', ring: 'bg-amber-500' }
                    : { label: 'Perlu Perhatian', color: 'text-rose-600', bgBadge: 'bg-rose-50', ring: 'bg-rose-500' };
            const barColor = !hasTarget ? 'from-slate-300 to-slate-400'
              : pct >= 100 ? 'from-emerald-400 to-emerald-600'
                : pct >= 75 ? 'from-blue-400 to-indigo-600'
                  : pct >= 50 ? 'from-amber-400 to-orange-500'
                    : 'from-rose-400 to-rose-600';

            return (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                  {/* Left: Title + Badge */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
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
                          ? ` • ${formatDate(dashboardData.period.date_start)} – ${formatDate(dashboardData.period.date_end)}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  {/* Right: KPI styled boxes grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full xl:w-auto xl:min-w-[700px]">
                    <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-2.5 flex flex-col justify-center text-right xl:text-left">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate">Cleanox Only</span>
                      <span className="text-xs font-extrabold text-slate-700 mt-0.5">{formatRp(ct.cleanox_only_total || 0)}</span>
                    </div>

                    <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-2.5 flex flex-col justify-center text-right xl:text-left">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate">Cleanox By Waschen</span>
                      <span className="text-xs font-extrabold text-slate-700 mt-0.5">{formatRp(ct.jatah_70_waschen || 0)}</span>
                    </div>

                    <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-xl p-2.5 flex flex-col justify-center text-right xl:text-left col-span-2 sm:col-span-1">
                      <span className="text-[9px] text-indigo-500 font-bold uppercase tracking-wider truncate">Total Realisasi</span>
                      <span className="text-xs font-black text-indigo-650 mt-0.5">{formatRp(ct.realisasi || 0)}</span>
                    </div>

                    <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-2.5 flex flex-col justify-center text-right xl:text-left">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate">Target</span>
                      <span className="text-xs font-extrabold text-slate-700 mt-0.5">{hasTarget ? formatRp(ct.target_nominal) : '—'}</span>
                    </div>

                    <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-2.5 flex flex-col justify-center text-right xl:text-left">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate">Sisa Target</span>
                      <span className={`text-xs font-black mt-0.5 ${sisa === 0 && hasTarget ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {hasTarget ? formatRp(sisa) : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar section */}
                <div className="px-5 pb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {hasTarget ? `${pct.toFixed(1)}% tercapai` : 'Target belum disetujui'}
                    </span>
                    {hasTarget && sisa > 0 && (
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Butuh {formatRp(sisa)} lagi
                      </span>
                    )}
                    {hasTarget && sisa === 0 && (
                      <span className="text-[10px] text-emerald-600 font-bold">✓ Sudah Melewati Target!</span>
                    )}
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  {hasTarget && (
                    <div className="flex justify-between text-[9px] text-slate-400 font-semibold mt-1">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Tabs bar */}
          <div className="flex bg-slate-100/80 p-1 rounded-2xl w-full sm:w-fit border border-slate-200/50">
            <button
              onClick={() => setActiveTab('cleanox-by-waschen')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'cleanox-by-waschen'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Cleanox By Waschen
            </button>
            <button
              onClick={() => setActiveTab('cleanox-only')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'cleanox-only'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Cleanox Only
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && !error && (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-xs font-semibold text-slate-500">Menarik data transaksi...</p>
            </div>
          )}

          {!loading && !error && activeTab === 'cleanox-by-waschen' && (
            <div className="space-y-6">

              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* Total Nota */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3 relative overflow-hidden group hover:shadow-md transition-all">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-450 leading-none">Total Nota Cleanox</p>
                    <h3 className="text-lg font-extrabold text-slate-850 mt-1">
                      {dashboardData.summary.total_nota.toLocaleString('id-ID')}
                    </h3>
                  </div>
                </div>

                {/* Jatah Mitra */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3 relative overflow-hidden group hover:shadow-md transition-all">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 flex-shrink-0">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-450 leading-none">Cleanox By Waschen</p>
                    <h3 className="text-base font-extrabold text-slate-850 mt-1 leading-tight">
                      {formatRp(dashboardData.summary.jatah_70)}
                    </h3>
                  </div>
                </div>

                {/* Average Per Nota */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3 relative overflow-hidden group hover:shadow-md transition-all">
                  <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 flex-shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-450 leading-none">Rerata / Nota Cleanox</p>
                    <h3 className="text-base font-extrabold text-slate-850 mt-1 leading-tight">
                      {formatRp(dashboardData.summary.avg_per_nota)}
                    </h3>
                  </div>
                </div>

              </div>

              {/* Performance & Trends Chart Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Daily Trends Chart */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Tren Cleanox By Waschen</h3>
                    <p className="text-[11px] text-slate-400">Cleanox By Waschen</p>
                  </div>
                  <div className="h-72 w-full">
                    {formattedTrends.length === 0 ? (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                        Tidak ada data tren penjualan
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={formattedTrends} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={10}
                            tickLine={false}
                            tickFormatter={(v) => (v >= 1000000 ? `${v / 1000000}M` : v >= 1000 ? `${v / 1000}K` : v)}
                          />
                          <Tooltip
                            formatter={(val) => [formatRp(val), '']}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <Line type="monotone" dataKey="cleanox70" name="Cleanox By Waschen" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Outlet Performance Chart */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Performa Per Outlet</h3>
                    <p className="text-[11px] text-slate-400">Cleanox By Waschen</p>
                  </div>
                  <div className="h-72 w-full">
                    {formattedPerformance.length === 0 ? (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                        Tidak ada data performa outlet
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={formattedPerformance} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="outlet" stroke="#94a3b8" fontSize={9} tickLine={false} tickFormatter={(v) => v.replace('Waschen Laundry ', '').replace('Waschen ', '')} />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={10}
                            tickLine={false}
                            tickFormatter={(v) => (v >= 1000000 ? `${v / 1000000}Jt` : v >= 1000 ? `${v / 1000}K` : v)}
                          />
                          <Tooltip
                            formatter={(val) => [formatRp(val), '']}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <Bar dataKey="cleanox_sales_70" name="Cleanox By Waschen" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

              </div>

              {/* Segment & Leaderboard Grid */}
              {/*
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                // Leaderboard
                <div className="lg:col-span-12 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 flex flex-col">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Performa Pembuat Nota</h3>
                    <p className="text-[11px] text-slate-400">Kontribusi Pembuat Nota Terhadap Omzet Cleanox</p>
                  </div>
                  <div className="flex-1 overflow-y-auto max-h-60 space-y-3 pr-1 text-slate-600">
                    {dashboardData.cashier.length === 0 ? (
                      <div className="w-full h-32 flex items-center justify-center text-slate-400 text-xs">
                        Tidak ada data leaderboard
                      </div>
                    ) : (
                      dashboardData.cashier.map((item, index) => {
                        const initials = item.pembuat_nota
                          ? item.pembuat_nota.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                          : 'K';
                        const maxOmzet = dashboardData.cashier[0]?.total_omzet || 1;
                        const percent = Math.min(100, Math.round((item.total_omzet / maxOmzet) * 100));
                        return (
                          <div key={index} className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${index === 0 ? 'bg-amber-100 text-amber-700' :
                              index === 1 ? 'bg-slate-200 text-slate-700' :
                                index === 2 ? 'bg-orange-100 text-orange-700' :
                                  'text-slate-400'
                              }`}>
                              {index + 1}
                            </div>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${index === 0 ? 'bg-amber-500 text-white' :
                              index === 1 ? 'bg-indigo-500 text-white' :
                                index === 2 ? 'bg-emerald-500 text-white' :
                                  'bg-slate-100 text-slate-650'
                              }`}>
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-750 mb-0.5">
                                <span className="truncate">{item.pembuat_nota}</span>
                                <span className="text-slate-900">{formatRp(item.total_omzet)}</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div style={{ width: `${percent}%` }} className={`h-full rounded-full ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-indigo-500' : index === 2 ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`} />
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5">
                                <span>{item.total_nota} Nota</span>
                                <span>Jatah Cleanox: {formatRp(item.total_omzet * 0.7)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
              */}

              {/* Detail Table */}
              {/*
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Daftar Detail Transaksi Cleanox</h3>
                    <p className="text-[11px] text-slate-400">Rincian invoice nonton e-money dengan item Cleanox/Karpet</p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Cari nota, customer, item..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-700 placeholder-slate-450"
                    />
                  </div>
                </div>

                // Table container
                <div className="overflow-x-auto rounded-xl border border-slate-200/60">
                  <table className="w-full border-collapse text-left text-xs text-slate-650">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200/80 font-bold text-slate-700">
                        <th className="px-3 py-2.5">Outlet</th>
                        <th className="px-3 py-2.5">No Nota</th>
                        <th className="px-3 py-2.5">Customer</th>
                        <th className="px-3 py-2.5">Waktu Bayar</th>
                        <th className="px-3 py-2.5">Tanggal Terima</th>
                        <th className="px-3 py-2.5">Tanggal Selesai</th>
                        <th className="px-3 py-2.5">Daftar Item</th>
                        <th className="px-3 py-2.5 text-right">Nominal</th>
                        <th className="px-3 py-2.5 text-right">Cleanox (70%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedDetails.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-slate-450">
                            Tidak ada data transaksi yang cocok
                          </td>
                        </tr>
                      ) : (
                        paginatedDetails.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2.5 font-bold text-slate-700">{row.outlet}</td>
                            <td className="px-3 py-2.5">
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                {row.no_nota}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-800">
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                <span className="truncate max-w-[100px]" title={row.customer_nama}>
                                  {row.customer_nama}
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-400 block ml-4">Oleh: {row.pembuat_nota || '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                              {formatDateTime(row.waktu_pembayaran)}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                              {formatDate(row.tgl_terima)}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                              {formatDate(row.tgl_selesai)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[11px] text-slate-600 line-clamp-2 max-w-[180px]" title={row.daftar_item}>
                                {row.daftar_item}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">
                              {formatRp(row.nominal_bayar)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                              {formatRp(Number(row.nominal_bayar || 0) * 0.7)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                // Table Pagination
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-450">
                      Menampilkan <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> -{' '}
                      <span className="font-semibold">
                        {Math.min(currentPage * itemsPerPage, filteredDetails.length)}
                      </span>{' '}
                      dari <span className="font-semibold">{filteredDetails.length}</span> transaksi
                    </p>

                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => setCurrentPage(v => Math.max(1, v - 1))}
                        disabled={currentPage === 1}
                        className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      {Array.from({ length: totalPages }).map((_, idx) => {
                        const pageNum = idx + 1;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-bold border transition-all ${currentPage === pageNum
                              ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setCurrentPage(v => Math.min(totalPages, v + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                )}

              </div>
              */}

            </div>
          )}


          {!loading && activeTab === 'cleanox-only' && (() => {
            const breakdown = dashboardData.cleanoxOnlyBreakdown || { rows: [], grand_total: { tunai: 0, non_tunai: 0, total: 0 } };
            const gt = breakdown.grand_total;
            const rows = breakdown.rows || [];
            const pctTunai = gt.total > 0 ? ((gt.tunai / gt.total) * 100).toFixed(1) : '0.0';
            const pctNonTunai = gt.total > 0 ? ((gt.non_tunai / gt.total) * 100).toFixed(1) : '0.0';
            const pieData = [
              { name: 'Tunai', value: gt.tunai, color: '#6366f1' },
              { name: 'Non-Tunai', value: gt.non_tunai, color: '#a78bfa' },
            ];
            const RADIAN = Math.PI / 180;
            const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
              if (percent < 0.05) return null;
              const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
              const x = cx + radius * Math.cos(-midAngle * RADIAN);
              const y = cy + radius * Math.sin(-midAngle * RADIAN);
              return (
                <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[11px] font-bold" style={{ fontSize: 11, fontWeight: 700 }}>
                  {(percent * 100).toFixed(1)}%
                </text>
              );
            };
            const barData = rows.map(r => ({
              name: r.outlet.replace(' Laundry', '').replace('Waschen ', ''),
              tunai: r.tunai,
              nonTunai: r.non_tunai,
              total: r.total,
            }));
            const formatRpShort = (v) => {
              if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
              if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
              return String(v);
            };
            const customTooltip = ({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs min-w-[180px]">
                  <p className="font-bold text-slate-700 mb-2 text-[11px]">{label}</p>
                  {payload.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 py-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.fill || p.color }} />
                        <span className="text-slate-500">{p.name}</span>
                      </span>
                      <span className="font-bold text-slate-800">{formatRp(p.value)}</span>
                    </div>
                  ))}
                </div>
              );
            };
            return (
              <div className="space-y-5">
                {/* Hero Summary Banner */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 shadow-lg">
                  <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-indigo-300/20 blur-3xl" />
                  <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-indigo-200 text-[11px] font-semibold uppercase tracking-widest mb-1">Rekap Pembayaran</p>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{formatRp(gt.total)}</h2>
                      <p className="text-indigo-200 text-xs mt-1">
                        {dashboardData.period?.date_start && dashboardData.period?.date_end
                          ? `${formatDate(dashboardData.period.date_start)} – ${formatDate(dashboardData.period.date_end)}`
                          : '–'}
                        {' • '}{rows.length} Outlet
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center min-w-[110px]">
                        <p className="text-indigo-200 text-[10px] font-semibold uppercase tracking-wider">Tunai</p>
                        <p className="text-white font-extrabold text-base mt-1">{formatRp(gt.tunai)}</p>
                        <p className="text-indigo-200 text-[10px] mt-0.5">{pctTunai}%</p>
                      </div>
                      <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center min-w-[110px]">
                        <p className="text-indigo-200 text-[10px] font-semibold uppercase tracking-wider">Non-Tunai</p>
                        <p className="text-white font-extrabold text-base mt-1">{formatRp(gt.non_tunai)}</p>
                        <p className="text-indigo-200 text-[10px] mt-0.5">{pctNonTunai}%</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* KPI Cards Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    {
                      label: 'Total Revenue', value: formatRp(gt.total),
                      icon: DollarSign, bg: 'bg-indigo-50', iconColor: 'text-indigo-600',
                      sub: `${rows.length} outlet aktif`
                    },
                    {
                      label: 'Total Tunai', value: formatRp(gt.tunai),
                      icon: Wallet, bg: 'bg-emerald-50', iconColor: 'text-emerald-600',
                      sub: `${pctTunai}% dari total`
                    },
                    {
                      label: 'Total Non-Tunai', value: formatRp(gt.non_tunai),
                      icon: CreditCard, bg: 'bg-violet-50', iconColor: 'text-violet-600',
                      sub: `${pctNonTunai}% dari total`
                    },
                    {
                      label: 'Rata-rata / Outlet', value: formatRp(rows.length > 0 ? Math.round(gt.total / rows.length) : 0),
                      icon: BarChart2, bg: 'bg-amber-50', iconColor: 'text-amber-600',
                      sub: 'rerata per outlet'
                    },
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

                {/* Charts Row */}
                {/*
                {rows.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    // Stacked Bar Chart
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Perbandingan Per Outlet</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">Tunai vs Non-Tunai</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-semibold">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />Tunai</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-300 inline-block" />Non-Tunai</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barData} barSize={28} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              tickFormatter={formatRpShort}
                              tick={{ fontSize: 10, fill: '#94a3b8' }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip content={customTooltip} />
                            <Bar dataKey="tunai" name="Tunai" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="nonTunai" name="Non-Tunai" stackId="a" fill="#c4b5fd" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    // Donut Chart
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                      <div className="mb-4">
                        <h3 className="text-sm font-bold text-slate-800">Komposisi Pembayaran</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Tunai vs Non-Tunai</p>
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        <div className="relative">
                          <PieChart width={180} height={180}>
                            <Pie
                              data={pieData}
                              cx={90} cy={90}
                              innerRadius={52} outerRadius={82}
                              paddingAngle={3}
                              dataKey="value"
                              labelLine={false}
                              label={renderCustomLabel}
                            >
                              {pieData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} stroke="none" />
                              ))}
                            </Pie>
                          </PieChart>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Total</p>
                            <p className="text-xs font-extrabold text-slate-800 leading-tight text-center px-2">{formatRpShort(gt.total)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {pieData.map((d, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: d.color }} />
                              <span className="text-slate-600 font-semibold">{d.name}</span>
                            </span>
                            <span className="font-bold text-slate-800">{formatRp(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                */}

                {/* Per-Outlet Detail Table */}
                {/*
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Detail Per Outlet</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{rows.length} outlet ditemukan</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="px-5 py-3 text-left">Outlet</th>
                          <th className="px-5 py-3 text-right">Tunai</th>
                          <th className="px-5 py-3 text-right">Non-Tunai</th>
                          <th className="px-5 py-3 text-right">Total</th>
                          <th className="px-5 py-3 text-right w-36">% Non-Tunai</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-xs">
                              Tidak ada data untuk periode ini.
                            </td>
                          </tr>
                        ) : rows.map((row, idx) => {
                          const pct = row.total > 0 ? (row.non_tunai / row.total) * 100 : 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors group">
                              <td className="px-5 py-3 font-semibold text-slate-700 flex items-center gap-2.5">
                                <div className="w-1.5 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500 flex-shrink-0" />
                                {row.outlet}
                              </td>
                              <td className="px-5 py-3 text-right text-emerald-700 font-semibold">{formatRp(row.tunai)}</td>
                              <td className="px-5 py-3 text-right text-violet-700 font-semibold">{formatRp(row.non_tunai)}</td>
                              <td className="px-5 py-3 text-right font-extrabold text-slate-800">{formatRp(row.total)}</td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                    <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span className="text-slate-500 font-semibold text-[11px] w-10 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {rows.length > 0 && (
                        <tfoot>
                          <tr className="bg-gradient-to-r from-indigo-50 to-violet-50 border-t-2 border-indigo-100">
                            <td className="px-5 py-3.5 font-extrabold text-indigo-800 text-xs">TOTAL SEMUA OUTLET</td>
                            <td className="px-5 py-3.5 text-right font-extrabold text-emerald-700">{formatRp(gt.tunai)}</td>
                            <td className="px-5 py-3.5 text-right font-extrabold text-violet-700">{formatRp(gt.non_tunai)}</td>
                            <td className="px-5 py-3.5 text-right font-extrabold text-indigo-900">{formatRp(gt.total)}</td>
                            <td className="px-5 py-3.5 text-right font-extrabold text-indigo-700">{pctNonTunai}%</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
                */}

                {/* Cleanox Only Detail Transactions Table */}
                {(() => {
                  const details = breakdown.details || [];
                  const filtered = details.filter(row => {
                    if (!cleanoxSearchTerm.trim()) return true;
                    const t = cleanoxSearchTerm.toLowerCase();
                    return (
                      (row.no_nota && row.no_nota.toLowerCase().includes(t)) ||
                      (row.customer_nama && row.customer_nama.toLowerCase().includes(t)) ||
                      (row.outlet && row.outlet.toLowerCase().includes(t)) ||
                      (row.jenis_bayar && row.jenis_bayar.toLowerCase().includes(t)) ||
                      (row.daftar_item && row.daftar_item.toLowerCase().includes(t))
                    );
                  });

                  const offset = (cleanoxCurrentPage - 1) * itemsPerPage;
                  const paginated = filtered.slice(offset, offset + itemsPerPage);
                  const totalPg = Math.ceil(filtered.length / itemsPerPage);

                  return (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Detail Transaksi Cleanox</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">Daftar nota pembayaran dan item layanan Cleanox Only</p>
                        </div>
                        {/* Search Input */}
                        <div className="relative w-full sm:w-64">
                          <input
                            type="text"
                            placeholder="Cari nota, customer, item..."
                            value={cleanoxSearchTerm}
                            onChange={(e) => {
                              setCleanoxSearchTerm(e.target.value);
                              setCleanoxCurrentPage(1);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none transition-all placeholder:text-slate-400 font-medium"
                          />
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-slate-100 rounded-xl">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="px-4 py-2.5 text-left">No Nota</th>
                              <th className="px-4 py-2.5 text-left">Customer</th>
                              <th className="px-4 py-2.5 text-left">Outlet</th>
                              <th className="px-4 py-2.5 text-left">Waktu Pembayaran</th>
                              <th className="px-4 py-2.5 text-left">Cara Bayar</th>
                              <th className="px-4 py-2.5 text-left min-w-[200px]">Item Layanan</th>
                              <th className="px-4 py-2.5 text-right">Nominal Bayar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {paginated.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                                  Tidak ada transaksi Cleanox Only yang ditemukan.
                                </td>
                              </tr>
                            ) : (
                              paginated.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                  <td className="px-4 py-2.5 font-bold text-indigo-600 font-mono text-[10px]">{row.no_nota}</td>
                                  <td className="px-4 py-2.5 font-semibold text-slate-700">{row.customer_nama || '—'}</td>
                                  <td className="px-4 py-2.5 text-slate-550 font-medium">{displayOutletName(row.outlet)}</td>
                                  <td className="px-4 py-2.5 text-slate-450 font-medium">{formatDateTime(row.waktu_pembayaran)}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${row.jenis_bayar === 'Tunai'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        : 'bg-violet-50 text-violet-700 border border-violet-100'
                                      }`}>
                                      {row.jenis_bayar}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 font-semibold text-slate-600 text-[11px] leading-relaxed">
                                    {row.daftar_item}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                                    {formatRp(row.nominal_bayar)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalPg > 1 && (
                        <div className="flex items-center justify-between pt-2">
                          <p className="text-[10px] text-slate-400 font-medium">
                            Menampilkan <span className="font-semibold">{offset + 1}</span> -{' '}
                            <span className="font-semibold">{Math.min(offset + itemsPerPage, filtered.length)}</span>{' '}
                            dari <span className="font-semibold">{filtered.length}</span> transaksi
                          </p>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => setCleanoxCurrentPage(v => Math.max(1, v - 1))}
                              disabled={cleanoxCurrentPage === 1}
                              className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            {Array.from({ length: totalPg }).map((_, idx) => {
                              const pg = idx + 1;
                              return (
                                <button
                                  key={pg}
                                  onClick={() => setCleanoxCurrentPage(pg)}
                                  className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-bold border transition-all ${cleanoxCurrentPage === pg
                                      ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm'
                                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                  {pg}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => setCleanoxCurrentPage(v => Math.min(totalPg, v + 1))}
                              disabled={cleanoxCurrentPage === totalPg}
                              className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}



        </div>
      )}

    </div>
  );
}
