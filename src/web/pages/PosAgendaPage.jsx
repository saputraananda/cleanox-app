import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import api from '@shared/utils/api.js';
import TablePagination, { DEFAULT_PAGE_SIZE } from '@web/components/TablePagination.jsx';

const OTHER_TYPES = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'training_teknisi', label: 'Training Teknisi' },
  { value: 'event_pameran_bazaar', label: 'Event / Pameran / Bazaar' },
  { value: 'survey_site_visit', label: 'Survey & Site Visit' },
  { value: 'lainnya', label: 'Lainnya' },
];

const STATUS_BADGE = {
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  scheduled: 'border-violet-200 bg-violet-50 text-violet-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
};

const STATUS_LABEL = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  completed: 'Completed',
  cancelled: 'Dibatalkan',
};

function formatDateRange(start, end, time) {
  if (!start) return '-';
  const startLabel = new Date(`${start}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  if (!end || end === start) {
    return time ? `${startLabel} · ${time}` : startLabel;
  }
  const endLabel = new Date(`${end}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

function kindLabel(row) {
  if (row.agenda_kind === 'special_collaboration') return 'Special Collaboration';
  const found = OTHER_TYPES.find((t) => t.value === row.other_type);
  if (row.other_type === 'lainnya') return row.other_type_label || 'Lainnya';
  return found?.label || row.other_type || 'Agenda lain';
}

export default function PosAgendaPage() {
  const [summary, setSummary] = useState(null);
  const [agendas, setAgendas] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
    total_items: 0,
    total_pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async ({
    page = currentPage,
    size = pageSize,
    searchTerm = search,
    statusValue = status,
    dateFromValue = dateFrom,
    dateToValue = dateTo,
  } = {}) => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.get('/pos-agenda/summary'),
        api.get('/pos-agenda', {
          params: {
            search: searchTerm || undefined,
            status: statusValue || undefined,
            ...(dateFromValue ? { date_from: dateFromValue } : {}),
            ...(dateToValue ? { date_to: dateToValue } : {}),
            page,
            page_size: size,
          },
        }),
      ]);
      setSummary(summaryRes.data.summary);
      setAgendas(listRes.data.agendas || []);
      const nextPagination = {
        page: Number(listRes.data.pagination?.page || page),
        page_size: Number(listRes.data.pagination?.page_size || size),
        total_items: Number(listRes.data.pagination?.total_items || 0),
        total_pages: Number(listRes.data.pagination?.total_pages || 1),
      };
      setPagination(nextPagination);
      setCurrentPage(nextPagination.page);
      setPageSize(nextPagination.page_size);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat riwayat agenda');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const summaryCards = useMemo(
    () => [
      { label: 'Draft', value: summary?.draft_agendas || 0 },
      { label: 'Terjadwal', value: summary?.scheduled_agendas || 0 },
      { label: 'Completed', value: summary?.completed_agendas || 0 },
      { label: 'Total', value: summary?.total_agendas || 0 },
    ],
    [summary]
  );

  const handleFilter = async (e) => {
    e.preventDefault();
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('Tanggal mulai tidak boleh setelah tanggal akhir');
      return;
    }
    await loadData({
      page: 1,
      size: pageSize,
      searchTerm: search,
      statusValue: status,
      dateFromValue: dateFrom,
      dateToValue: dateTo,
    });
  };

  const handleRefresh = async () => {
    await loadData({
      page: currentPage,
      size: pageSize,
      searchTerm: search,
      statusValue: status,
      dateFromValue: dateFrom,
      dateToValue: dateTo,
    });
  };

  const handlePageChange = async (page) => {
    await loadData({
      page,
      size: pageSize,
      searchTerm: search,
      statusValue: status,
      dateFromValue: dateFrom,
      dateToValue: dateTo,
    });
  };

  const handlePageSizeChange = async (size) => {
    await loadData({
      page: 1,
      size,
      searchTerm: search,
      statusValue: status,
      dateFromValue: dateFrom,
      dateToValue: dateTo,
    });
  };

  const paginationTotalItems =
    pagination.total_items > 0
      ? pagination.total_items
      : Number(summary?.total_agendas || agendas.length || 0);
  const paginationTotalPages =
    pagination.total_pages > 1
      ? pagination.total_pages
      : Math.max(1, Math.ceil(paginationTotalItems / pageSize) || 1);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-700">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.01em] text-slate-900">
            Riwayat Agenda
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Histori agenda Cleanox Only (bukan sales).
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            to="/cleanox-only/agenda/new"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </Link>
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

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleFilter} className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
          <div className="relative min-w-[220px] flex-1 self-end">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama agenda atau lokasi"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Terjadwal</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </label>
          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Tanggal agenda dari
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Sampai
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Terapkan
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-14 text-center text-sm text-slate-500">Memuat riwayat agenda...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[15px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Agenda</th>
                    <th className="px-3 py-3">Jenis</th>
                    <th className="px-3 py-3">Jadwal</th>
                    <th className="px-3 py-3">Isi</th>
                    <th className="px-3 py-3">Teknisi</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agendas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                        Belum ada riwayat agenda.
                      </td>
                    </tr>
                  ) : (
                    agendas.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">{row.name}</div>
                          <div className="mt-1 inline-flex items-center gap-1 text-sm text-slate-400">
                            <MapPin className="h-3.5 w-3.5" />
                            {row.location || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{kindLabel(row)}</td>
                        <td className="px-3 py-3 text-slate-600">
                          <div>{row.day_label || '-'}</div>
                          <div className="text-sm text-slate-400">
                            {formatDateRange(row.start_date, row.end_date, row.agenda_time)}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {row.content_type === 'item_service'
                            ? `Item ${row.item_count || 0}`
                            : 'Deskripsi'}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{row.worker_count ?? 0}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-sm font-semibold ${
                              STATUS_BADGE[row.status] || STATUS_BADGE.draft
                            }`}
                          >
                            {STATUS_LABEL[row.status] || row.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            to={`/cleanox-only/agenda/${row.id}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                            aria-label="Lihat detail agenda"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <TablePagination
              page={pagination.page}
              pageSize={pagination.page_size}
              totalItems={paginationTotalItems}
              totalPages={paginationTotalPages}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
