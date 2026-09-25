import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Inbox,
  Package,
  PlusCircle,
  Search,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import TablePagination, { PAGE_SIZE_OPTIONS } from '@web/components/TablePagination.jsx';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const primaryBtnStyle = { background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' };

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status) {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'pending_payment':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'exhausted':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    case 'expired':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'cancelled':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function statusLabel(status) {
  switch (status) {
    case 'active':
      return 'Aktif';
    case 'pending_payment':
      return 'Pending bayar';
    case 'exhausted':
      return 'Habis';
    case 'expired':
      return 'Kedaluwarsa';
    case 'cancelled':
      return 'Dibatalkan';
    default:
      return status || '-';
  }
}

function canUseInstance(row) {
  if (row.status !== 'active') return false;
  if (!row.expires_at) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;
  const balances = row.balances || [];
  return balances.some((bal) => Number(bal.remaining_amount) > 0);
}

export default function PosBundleBalancesPage() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0] || 10);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 10,
    total_items: 0,
    total_pages: 1,
  });

  const loadData = async ({
    term = search,
    status = statusFilter,
    pageValue = page,
    size = pageSize,
  } = {}) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/pos-bundles/instances', {
        params: {
          search: term || undefined,
          status: status || 'active',
          page: pageValue,
          page_size: size,
        },
      });
      setInstances(data.instances || []);
      setPagination(
        data.pagination || {
          page: pageValue,
          page_size: size,
          total_items: Array.isArray(data.instances) ? data.instances.length : 0,
          total_pages: 1,
        }
      );
      setPage(data.pagination?.page || pageValue);
      setPageSize(data.pagination?.page_size || size);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat saldo paket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadData({ term: search, status: statusFilter, pageValue: 1, size: pageSize });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, pageSize]);

  const handleUse = (row) => {
    if (!canUseInstance(row)) return;
    navigate(
      `/cleanox-only/transactions/new?customer_id=${row.customer_id}&customer_bundle_id=${row.id}`
    );
  };

  return (
    <div className="p-3 sm:p-5 space-y-5 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
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
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-100/80">
              Cleanox Only
            </p>
            <h1 className="mt-2 text-[22px] font-extrabold tracking-[-0.01em]">
              Saldo Paket Bundle
            </h1>
            <p className="mt-2 max-w-xl text-[13px] text-blue-100/90">
              Daftar paket aktif customer — pakai ulang tanpa mencari nota beli di Riwayat.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/cleanox-only/transactions/new')}
              className="inline-flex items-center gap-2 rounded-[12px] border border-white/25 bg-white/15 px-4 py-2.5 text-[13px] font-bold text-white backdrop-blur transition hover:bg-white/25"
            >
              <PlusCircle className="w-4 h-4" />
              Transaksi Baru
            </button>
            <button
              type="button"
              onClick={() => navigate('/cleanox-only/bundles/purchase')}
              className="inline-flex items-center gap-2 rounded-[12px] bg-white px-4 py-2.5 text-[13px] font-extrabold text-blue-800 transition hover:-translate-y-0.5"
            >
              <ShoppingBag className="w-4 h-4" />
              Beli Paket
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3.5 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      <section className="rounded-[20px] border border-slate-200/80 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.03),0_8px_28px_rgba(15,23,42,.04)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-100">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari customer / WA / nama paket..."
              className={`${inputClass} pl-9`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${inputClass} sm:max-w-[180px]`}
          >
            <option value="active">Aktif</option>
            <option value="all">Semua</option>
            <option value="pending_payment">Pending bayar</option>
            <option value="exhausted">Habis</option>
            <option value="expired">Kedaluwarsa</option>
          </select>
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-16 text-center text-[13px] text-slate-500">Memuat saldo paket...</div>
        ) : instances.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Belum ada saldo paket</p>
            <p className="text-gray-300 text-xs mt-1">
              Beli paket dulu, atau ubah filter status.
            </p>
            <button
              type="button"
              onClick={() => navigate('/cleanox-only/bundles/purchase')}
              className="mt-4 inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white"
              style={primaryBtnStyle}
            >
              <ShoppingBag className="w-4 h-4" />
              Beli Paket
            </button>
          </div>
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 sm:grid-cols-2">
            {instances.map((row) => {
              const usable = canUseInstance(row);
              return (
                <div
                  key={row.id}
                  className="rounded-[16px] border border-slate-200 bg-slate-50/80 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-blue-700"
                          style={{
                            background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)',
                          }}
                        >
                          <Wallet className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-extrabold text-slate-900 truncate">
                            {row.customer_name}
                          </p>
                          <p className="text-[11.5px] text-slate-500">
                            {row.customer_phone || 'Tanpa telepon'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(
                        row.status
                      )}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-800">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      {row.bundle_name}
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-500">
                      {row.expires_at
                        ? `Aktif sampai ${formatDateTime(row.expires_at)}`
                        : 'Belum aktif (pending bayar)'}
                    </p>
                  </div>

                  <ul className="space-y-1 rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-[12px] text-slate-700">
                    {(row.balances || []).length === 0 ? (
                      <li className="text-slate-400">Tidak ada item kuota</li>
                    ) : (
                      (row.balances || []).map((bal) => (
                        <li key={bal.id} className="flex justify-between gap-2">
                          <span className="truncate">{bal.service_name}</span>
                          <span className="shrink-0 font-semibold">
                            sisa {bal.remaining_amount}/{bal.initial_amount} {bal.quota_unit}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {row.purchase_transaction_id ? (
                      <Link
                        to={`/cleanox-only/transactions/${row.purchase_transaction_id}`}
                        className="text-[11.5px] font-semibold text-blue-700 hover:underline"
                      >
                        Lihat nota beli →
                      </Link>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      disabled={!usable}
                      onClick={() => handleUse(row)}
                      className="inline-flex items-center gap-1.5 rounded-[12px] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-45"
                      style={primaryBtnStyle}
                      title={
                        usable
                          ? 'Pakai kuota paket ini'
                          : row.status === 'pending_payment'
                            ? 'Lunasi dulu di nota beli'
                            : 'Paket tidak dapat dipakai'
                      }
                    >
                      Pakai
                    </button>
                  </div>
                  {!usable && row.status === 'pending_payment' ? (
                    <p className="text-[11px] text-amber-700">
                      Lunasi dulu di nota beli agar saldo aktif.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {!loading && instances.length > 0 ? (
          <TablePagination
            totalItems={pagination.total_items || 0}
            page={pagination.page || page}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={(nextPage) => {
              setPage(nextPage);
              loadData({ pageValue: nextPage });
            }}
            onPageSizeChange={(size) => setPageSize(size)}
            itemLabel="paket"
          />
        ) : null}
      </section>
    </div>
  );
}
