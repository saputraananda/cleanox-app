import { useEffect, useMemo, useState } from 'react';
import { Inbox, Plus, RefreshCw, Search, Pencil, X, Trash2 } from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';
import TablePagination, {
  PAGE_SIZE_OPTIONS,
  paginateList,
} from '@web/components/TablePagination.jsx';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const primaryBtnStyle = { background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' };

const emptyItem = () => ({
  service_id: '',
  quota_unit: 'kali',
  quota_amount: '1',
});

const emptyForm = {
  name: '',
  price: '',
  coret_price: '',
  duration_months: '1',
  is_active: true,
  notes: '',
  items: [emptyItem()],
};

function money(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export default function PosBundlesPage() {
  const [bundles, setBundles] = useState([]);
  const [services, setServices] = useState([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadServices = async () => {
    const { data } = await api.get('/pos-master/services', { params: { status: 'Aktif' } });
    setServices(data.services || []);
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/pos-bundles', {
        params: {
          search: search || undefined,
          is_active: activeFilter === '' ? undefined : activeFilter,
        },
      });
      setBundles(data.bundles || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat paket bundle');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      loadData();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setPanelOpen(true);
  };

  const openEdit = async (row) => {
    setError('');
    try {
      const { data } = await api.get(`/pos-bundles/${row.id}`);
      const bundle = data.bundle;
      setEditingId(bundle.id);
      setForm({
        name: bundle.name || '',
        price: String(bundle.price ?? ''),
        coret_price: bundle.coret_price == null ? '' : String(bundle.coret_price),
        duration_months: String(bundle.duration_months ?? '1'),
        is_active: Boolean(bundle.is_active),
        notes: bundle.notes || '',
        items: (bundle.items || []).map((item) => ({
          service_id: String(item.service_id),
          quota_unit: item.quota_unit || 'kali',
          quota_amount: String(item.quota_amount ?? '1'),
        })),
      });
      if (!(bundle.items || []).length) {
        setForm((prev) => ({ ...prev, items: [emptyItem()] }));
      }
      setPanelOpen(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail paket');
    }
  };

  const updateItem = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [key]: value };
        if (key === 'service_id') {
          const service = services.find((row) => Number(row.id) === Number(value));
          const isGc =
            String(service?.category_name || '')
              .trim()
              .toLowerCase() === 'general cleaning';
          if (isGc) next.quota_unit = 'jam';
        }
        return next;
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        price: Number(form.price),
        coret_price: form.coret_price === '' ? null : Number(form.coret_price),
        duration_months: Number(form.duration_months),
        is_active: form.is_active ? 1 : 0,
        notes: form.notes || null,
        items: form.items.map((item, index) => ({
          service_id: Number(item.service_id),
          quota_unit: item.quota_unit,
          quota_amount: Number(item.quota_amount),
          sort_order: index,
        })),
      };
      if (editingId) {
        await api.put(`/pos-bundles/${editingId}`, payload);
      } else {
        await api.post('/pos-bundles', payload);
      }
      setPanelOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan paket bundle');
    } finally {
      setSaving(false);
    }
  };

  const pagination = useMemo(
    () => paginateList(bundles, currentPage, pageSize),
    [bundles, currentPage, pageSize]
  );

  return (
    <div className="p-3 sm:p-5 space-y-6 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-700">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.01em] text-slate-900">
            Paket Bundle
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
            Master paket kuota (jam / kali) dengan harga jual dan harga coret.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white"
            style={primaryBtnStyle}
          >
            <Plus className="w-4 h-4" />
            Tambah Paket
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3 border-b border-gray-50">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama paket..."
              className={`${inputClass} pl-9`}
            />
          </div>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className={`${inputClass} max-w-[160px]`}
          >
            <option value="">Semua status</option>
            <option value="1">Aktif</option>
            <option value="0">Nonaktif</option>
          </select>
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
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

        {error && !panelOpen && (
          <div className="mx-3 my-3 rounded-[12px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700 sm:mx-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-14 text-center text-[13px] text-slate-500">Memuat paket...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  <th className="px-3 py-3 text-left text-[12px] font-semibold text-white/90 uppercase">Nama</th>
                  <th className="px-3 py-3 text-left text-[12px] font-semibold text-white/90 uppercase">Harga</th>
                  <th className="px-3 py-3 text-left text-[12px] font-semibold text-white/90 uppercase">Coret</th>
                  <th className="px-3 py-3 text-left text-[12px] font-semibold text-white/90 uppercase">Masa Aktif</th>
                  <th className="px-3 py-3 text-left text-[12px] font-semibold text-white/90 uppercase">Item</th>
                  <th className="px-3 py-3 text-left text-[12px] font-semibold text-white/90 uppercase">Status</th>
                  <th className="px-3 py-3 text-right text-[12px] font-semibold text-white/90 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {bundles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">Belum ada paket bundle</p>
                    </td>
                  </tr>
                ) : (
                  pagination.items.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-slate-50/40">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{row.name}</td>
                      <td className="px-3 py-2.5 font-bold text-gray-800">{money(row.price)}</td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {row.coret_price == null ? '-' : money(row.coret_price)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{row.duration_months} bulan</td>
                      <td className="px-3 py-2.5 text-slate-700">{row.item_count || 0}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            row.is_active
                              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          {row.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 text-indigo-600"
                          aria-label="Edit paket"
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

        <TablePagination
          page={pagination.page}
          pageSize={pageSize}
          totalItems={pagination.totalItems}
          onPageChange={setCurrentPage}
        />
      </div>

      {panelOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
            <form
              onSubmit={handleSubmit}
              className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                <h2 className="text-[16px] font-extrabold text-slate-900">
                  {editingId ? 'Edit Paket Bundle' : 'Tambah Paket Bundle'}
                </h2>
                <button type="button" onClick={() => setPanelOpen(false)} className="p-2 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 p-4">
                {error && (
                  <div className="rounded-[12px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-slate-600">Nama paket</label>
                  <input
                    required
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-slate-600">Harga jual</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      value={form.price}
                      onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-slate-600">Harga coret</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      value={form.coret_price}
                      onChange={(e) => setForm((prev) => ({ ...prev, coret_price: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-slate-600">Masa aktif (bulan)</label>
                    <input
                      required
                      type="number"
                      min="1"
                      step="1"
                      className={inputClass}
                      value={form.duration_months}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, duration_months: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-[13px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Aktif
                </label>

                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-slate-600">Catatan</label>
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-bold text-slate-800">Isi kuota layanan</p>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }))
                      }
                      className="text-[12px] font-semibold text-blue-700"
                    >
                      + Tambah layanan
                    </button>
                  </div>
                  {form.items.map((item, index) => (
                    <div
                      key={`item-${index}`}
                      className="rounded-[12px] border border-slate-200 bg-slate-50 p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <select
                          required
                          className={inputClass}
                          value={item.service_id}
                          onChange={(e) => updateItem(index, 'service_id', e.target.value)}
                        >
                          <option value="">Pilih service</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </select>
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                items: prev.items.filter((_, i) => i !== index),
                              }))
                            }
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-rose-200 bg-rose-50 text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className={inputClass}
                          value={item.quota_unit}
                          onChange={(e) => updateItem(index, 'quota_unit', e.target.value)}
                        >
                          <option value="jam">Jam</option>
                          <option value="kali">Kali</option>
                        </select>
                        <input
                          required
                          type="number"
                          min="0.01"
                          step="0.01"
                          className={inputClass}
                          value={item.quota_amount}
                          onChange={(e) => updateItem(index, 'quota_amount', e.target.value)}
                          placeholder="Jumlah kuota"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3">
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
        </BodyPortal>
      )}
    </div>
  );
}
