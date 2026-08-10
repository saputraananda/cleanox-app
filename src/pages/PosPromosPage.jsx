import { useEffect, useMemo, useState } from 'react';
import { Inbox, Plus, RefreshCw, Search, Pencil, X } from 'lucide-react';
import api from '../utils/api.js';
import BodyPortal from '../components/BodyPortal.jsx';
import TablePagination, {
  PAGE_SIZE_OPTIONS,
  paginateList,
} from '../components/TablePagination.jsx';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const primaryBtnStyle = { background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' };

const emptyForm = {
  name: '',
  promo_type: 'nominal',
  promo_value: '',
  description: '',
  status: 'Aktif',
  service_ids: [],
};

function formatPromoValue(type, value) {
  if (type === 'persen') return `${Number(value || 0)}%`;
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export default function PosPromosPage() {
  const [promos, setPromos] = useState([]);
  const [services, setServices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLowerCase();
    if (!term) return services;
    return services.filter((row) => String(row.name || '').toLowerCase().includes(term));
  }, [services, serviceSearch]);

  const loadServices = async () => {
    const { data } = await api.get('/pos-master/services', { params: { status: 'Aktif' } });
    setServices(data.services || []);
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/pos-master/promos', {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
        },
      });
      setPromos(data.promos || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat promo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      loadData();
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setServiceSearch('');
    setError('');
    setPanelOpen(true);
  };

  const openEdit = async (row) => {
    setError('');
    setServiceSearch('');
    try {
      const { data } = await api.get(`/pos-master/promos/${row.id}`);
      const promo = data.promo;
      setEditingId(promo.id);
      setForm({
        name: promo.name || '',
        promo_type: promo.promo_type || 'nominal',
        promo_value: String(promo.promo_value ?? ''),
        description: promo.description || '',
        status: promo.status || 'Aktif',
        service_ids: promo.service_ids || [],
      });
      setPanelOpen(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail promo');
    }
  };

  const toggleService = (serviceId) => {
    setForm((prev) => {
      const exists = prev.service_ids.includes(serviceId);
      return {
        ...prev,
        service_ids: exists
          ? prev.service_ids.filter((id) => id !== serviceId)
          : [...prev.service_ids, serviceId],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        promo_type: form.promo_type,
        promo_value: Number(form.promo_value),
        description: form.description || null,
        status: form.status,
        service_ids: form.service_ids,
      };
      if (editingId) {
        await api.put(`/pos-master/promos/${editingId}`, payload);
      } else {
        await api.post('/pos-master/promos', payload);
      }
      setPanelOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan promo');
    } finally {
      setSaving(false);
    }
  };

  const pagination = useMemo(
    () => paginateList(promos, currentPage, pageSize),
    [promos, currentPage, pageSize]
  );

  return (
    <div className="p-3 sm:p-5 space-y-6 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-700">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.01em] text-slate-900">
            Promo
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
            Master promo dan tautan ke service yang bisa memakai promo.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
            style={primaryBtnStyle}
          >
            <Plus className="w-4 h-4" />
            Tambah Promo
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-0 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-gray-50 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama promo..."
              className={`${inputClass} pl-9 text-xs sm:text-sm`}
            />
          </div>
          <div className="flex items-center gap-2 text-sm flex-shrink-0">
            <span className="text-gray-400 text-xs hidden sm:inline">Baris:</span>
            <select
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-b border-gray-50 px-3 py-3 sm:px-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${inputClass} max-w-[180px]`}
          >
            <option value="">Semua status</option>
            <option value="Aktif">Aktif</option>
            <option value="Nonaktif">Nonaktif</option>
          </select>
        </div>

        {error && !panelOpen && (
          <div className="mx-3 mb-3 mt-3 rounded-[12px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700 sm:mx-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-14 text-center text-[13px] text-slate-500">Memuat promo...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Nama</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Tipe</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Nilai</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Service</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Status</th>
                  <th className="px-3 sm:px-4 py-3 text-right text-[12px] font-semibold text-white/90 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {promos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">Tidak ada data</p>
                      <p className="text-gray-300 text-xs mt-1">Coba ubah kata kunci atau filter status promo</p>
                    </td>
                  </tr>
                ) : (
                  pagination.items.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-slate-50/40 transition-colors even:bg-slate-50/20">
                      <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700 capitalize">{row.promo_type}</td>
                      <td className="px-3 sm:px-4 py-2.5 font-sans text-sm font-bold text-gray-800 whitespace-nowrap">
                        {formatPromoValue(row.promo_type, row.promo_value)}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700">{row.service_count || 0}</td>
                      <td className="px-3 sm:px-4 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            row.status === 'Nonaktif'
                              ? 'border-slate-200 bg-slate-50 text-slate-600'
                              : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {row.status || 'Aktif'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 text-indigo-600 transition duration-150 hover:-translate-y-0.5 hover:bg-indigo-100 active:scale-[.95]"
                          aria-label="Edit promo"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <TablePagination
            totalItems={pagination.totalItems}
            page={pagination.page}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            itemLabel="promo"
          />
        )}
      </div>

      {panelOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-bold tracking-[-0.01em] text-slate-900">
                  {editingId ? 'Edit Promo' : 'Tambah Promo'}
                </h2>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-[10px] p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="rounded-[12px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                  Nama Promo
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Contoh: Diskon Soft Opening"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Tipe
                  </span>
                  <select
                    value={form.promo_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, promo_type: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="nominal">nominal</option>
                    <option value="persen">persen</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Nilai
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.promo_value}
                    onChange={(e) => setForm((prev) => ({ ...prev, promo_value: e.target.value }))}
                    className={inputClass}
                    placeholder="Contoh: 10000 atau 10"
                  />
                </label>
              </div>

              <p className="text-[11.5px] text-slate-500">
                Preview: {formatPromoValue(form.promo_type, form.promo_value || 0)}
              </p>

              <label className="block space-y-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                  Deskripsi
                </span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className={inputClass}
                  placeholder="Contoh: Berlaku untuk pembukaan cabang baru"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className={inputClass}
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Nonaktif">Nonaktif</option>
                </select>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Service terkait ({form.service_ids.length})
                  </span>
                </div>
                <input
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Cari service..."
                  className={inputClass}
                />
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-[12px] border border-slate-200 bg-slate-50 p-2">
                  {filteredServices.length === 0 ? (
                    <p className="px-2 py-3 text-[12.5px] text-slate-500">Tidak ada service aktif.</p>
                  ) : (
                    filteredServices.map((service) => {
                      const checked = form.service_ids.includes(service.id);
                      return (
                        <label
                          key={service.id}
                          className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-1.5 text-[12.5px] hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleService(service.id)}
                          />
                          <span className="min-w-0 flex-1 truncate text-slate-700">{service.name}</span>
                          <span className="font-sans text-[11px] text-slate-400">
                            {service.price == null
                              ? '—'
                              : `Rp ${Number(service.price).toLocaleString('id-ID')}`}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-[12px] border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
                  style={primaryBtnStyle}
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
              </form>
            </div>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
