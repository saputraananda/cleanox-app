import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, ArrowRight, SlidersHorizontal } from 'lucide-react';
import api from '../utils/api.js';

const formatCurrency = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function PosTransactionsPage() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.get('/pos-transactions/summary'),
        api.get('/pos-transactions', { params: { search, status } }),
      ]);
      setSummary(summaryRes.data.summary);
      setTransactions(listRes.data.transactions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data POS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const summaryCards = useMemo(
    () => [
      { label: 'Incoming', value: summary?.incoming_transactions || 0 },
      { label: 'Active', value: summary?.active_transactions || 0 },
      { label: 'Completed', value: summary?.completed_transactions || 0 },
      { label: 'Total Revenue', value: formatCurrency(summary?.total_revenue || 0) },
    ],
    [summary]
  );

  const handleFilter = async (e) => {
    e.preventDefault();
    await loadData();
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-700">Cleanox Only</p>
          <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-slate-900 mt-1">Riwayat Transaksi</h1>
          <p className="text-sm text-slate-500 mt-2">
            Jalur transaksi POS baru yang terpisah dari tracking produksi existing.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <form onSubmit={handleFilter} className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari no transaksi, customer, atau nomor WA"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Assigned">Assigned</option>
            <option value="Waiting_Confirmation">Waiting Confirmation</option>
            <option value="Scheduled">Scheduled</option>
            <option value="In_Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Terapkan
          </button>
        </form>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {loading ? (
          <div className="py-14 text-center text-sm text-slate-500">Memuat transaksi POS...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[15px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">No Transaksi</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Tanggal Layanan</th>
                  <th className="px-3 py-3">Orang</th>
                  <th className="px-3 py-3">Item</th>
                  <th className="px-3 py-3">Worker</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                      Belum ada transaksi POS.
                    </td>
                  </tr>
                ) : (
                  transactions.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-semibold text-brand-700">{row.transaction_no}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">{row.customer_name}</div>
                        <div className="text-sm text-slate-400">{row.customer_phone || '-'}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatDateTime(row.service_date)}</td>
                      <td className="px-3 py-3 text-slate-600">{row.total_people}</td>
                      <td className="px-3 py-3 text-slate-600">{row.total_items}</td>
                      <td className="px-3 py-3 text-slate-600">{row.total_workers}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {row.pricing_pending
                          ? 'Pending jam'
                          : formatCurrency(row.final_amount)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          to={`/cleanox-only/transactions/${row.id}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-blue-200 bg-blue-50 text-blue-700 transition duration-150 hover:-translate-y-0.5 hover:bg-blue-100 active:scale-[.95]"
                          aria-label="Detail transaksi"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
