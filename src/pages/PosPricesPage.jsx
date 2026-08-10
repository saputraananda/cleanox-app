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
  category_id: '',
  satuan_name: '',
  duration_value: '',
  duration_unit: '',
  price: '',
  coret_price: '',
  status: 'Aktif',
};

function rowToForm(row) {
  return {
    name: row.name || '',
    category_id: row.category_id == null ? '' : String(row.category_id),
    satuan_name: row.satuan_name || '',
    duration_value: row.duration_value == null ? '' : String(row.duration_value),
    duration_unit: row.duration_unit || '',
    price: row.price == null ? '' : String(row.price),
    coret_price: row.coret_price == null ? '' : String(row.coret_price),
    status: row.status || 'Aktif',
  };
}

export default function PosPricesPage() {
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadCategories = async () => {
    const { data } = await api.get('/pos-master/categories');
    setCategories(data.categories || []);
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/pos-master/services', {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
          category_id: categoryFilter || undefined,
        },
      });
      setServices(data.services || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      loadData();
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, categoryFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setPanelOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setError('');
    setPanelOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        category_id: form.category_id || null,
        satuan_name: form.satuan_name || null,
        duration_value: form.duration_value === '' ? null : Number(form.duration_value),
        duration_unit: form.duration_unit || null,
        price: Number(form.price),
        coret_price: form.coret_price === '' ? null : Number(form.coret_price),
        status: form.status,
      };
      if (editingId) {
        await api.put(`/pos-master/services/${editingId}`, payload);
      } else {
        await api.post('/pos-master/services', payload);
      }
      setPanelOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan service');
    } finally {
      setSaving(false);
    }
  };

  const pagination = useMemo(
    () => paginateList(services, currentPage, pageSize),
    [services, currentPage, pageSize]
  );

  return (
    <div className="p-3 sm:p-5 space-y-6 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-700">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.01em] text-slate-900">
            Prices
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
            Master service dan harga dasar untuk katalog POS.
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
            Tambah Service
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
              placeholder="Cari nama service..."
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

        <div className="grid grid-cols-1 gap-3 border-b border-gray-50 px-3 py-3 sm:grid-cols-2 lg:grid-cols-[180px_220px] sm:px-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">Semua status</option>
            <option value="Aktif">Aktif</option>
            <option value="Nonaktif">Nonaktif</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">Semua kategori</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {error && !panelOpen && (
          <div className="mx-3 mb-3 mt-3 rounded-[12px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700 sm:mx-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-14 text-center text-[13px] text-slate-500">Memuat service...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Nama</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Kategori</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Satuan</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Harga</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Harga Coret</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Status</th>
                  <th className="px-3 sm:px-4 py-3 text-right text-[12px] font-semibold text-white/90 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {services.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">Tidak ada data</p>
                      <p className="text-gray-300 text-xs mt-1">Coba ubah filter service atau kategori</p>
                    </td>
                  </tr>
                ) : (
                  pagination.items.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-slate-50/40 transition-colors even:bg-slate-50/20">
                      <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700">{row.category_name || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700">{row.satuan_name || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 font-sans text-sm font-bold text-gray-800 whitespace-nowrap">
                        {row.price == null
                          ? '—'
                          : `Rp ${Number(row.price).toLocaleString('id-ID')}`}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-sans text-sm font-bold text-gray-800 whitespace-nowrap">
                        {row.coret_price == null
                          ? '—'
                          : `Rp ${Number(row.coret_price).toLocaleString('id-ID')}`}
                      </td>
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
                          aria-label="Edit service"
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
            itemLabel="service"
          />
        )}
      </div>

      {panelOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-bold tracking-[-0.01em] text-slate-900">
                  {editingId ? 'Edit Service' : 'Tambah Service'}
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
                  Nama
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Contoh: Cuci Sofa 2 Dudukan"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Kategori
                  </span>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">Tanpa kategori</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Satuan
                  </span>
                  <input
                    value={form.satuan_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, satuan_name: e.target.value }))}
                    className={inputClass}
                    placeholder="pcs, m2, sesi..."
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Durasi
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={form.duration_value}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, duration_value: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="Contoh: 2"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Satuan Durasi
                  </span>
                  <select
                    value={form.duration_unit}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, duration_unit: e.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">—</option>
                    <option value="jam">jam</option>
                    <option value="hari">hari</option>
                    <option value="minggu">minggu</option>
                    <option value="bulan">bulan</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Harga
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                    className={inputClass}
                    placeholder="Contoh: 150000"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Harga Coret (opsional)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.coret_price}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, coret_price: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="Kosongkan jika tidak dipakai"
                  />
                </label>
              </div>

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
