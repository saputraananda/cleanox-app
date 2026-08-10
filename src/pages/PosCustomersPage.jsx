import { useEffect, useMemo, useState } from 'react';
import { Inbox, Plus, RefreshCw, Search, Pencil, X, Save } from 'lucide-react';
import api from '../utils/api.js';
import CustomerFormFields, {
  customerToForm,
  emptyCustomerForm,
  formToPayload,
} from '../components/CustomerFormFields.jsx';
import BodyPortal from '../components/BodyPortal.jsx';
import TablePagination, {
  PAGE_SIZE_OPTIONS,
  paginateList,
} from '../components/TablePagination.jsx';

export default function PosCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyCustomerForm);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = async (term = search) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/pos-customers', { params: { search: term } });
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat customer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      loadData(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyCustomerForm);
    setPanelOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(customerToForm(row));
    setPanelOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = formToPayload(form);
      if (editingId) {
        await api.put(`/pos-customers/${editingId}`, payload);
      } else {
        await api.post('/pos-customers', payload);
      }
      setPanelOpen(false);
      setForm(emptyCustomerForm);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan customer');
    } finally {
      setSaving(false);
    }
  };

  const pagination = useMemo(
    () => paginateList(customers, currentPage, pageSize),
    [customers, currentPage, pageSize]
  );

  return (
    <div className="p-3 sm:p-5 space-y-6 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-700">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.01em] text-slate-900">
            Customer
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
            Master customer dengan alamat Jabodetabek terstruktur dan sumber info Cleanox.
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
            style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' }}
          >
            <Plus className="w-4 h-4" />
            Tambah Customer
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
              placeholder="Cari nama, telepon, atau alamat..."
              className="w-full rounded-[12px] border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-xs sm:text-sm focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]"
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

        {error && !panelOpen && (
          <div className="mx-3 mb-3 mt-3 rounded-[12px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700 sm:mx-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-14 text-center text-[13px] text-slate-500">Memuat customer...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Nama</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Telepon</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Alamat</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Sumber</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Transaksi</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Tier</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">Status</th>
                  <th className="px-3 sm:px-4 py-3 text-right text-[12px] font-semibold text-white/90 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">Tidak ada data</p>
                      <p className="text-gray-300 text-xs mt-1">Coba ubah kata kunci pencarian customer</p>
                    </td>
                  </tr>
                ) : (
                  pagination.items.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-slate-50/40 transition-colors even:bg-slate-50/20">
                      <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">{row.phone || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700 max-w-sm truncate">
                        {row.address || '—'}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-700">
                        {row.referral_source_name
                          ? row.referral_employee_name
                            ? `${row.referral_source_name} · ${row.referral_employee_name}`
                            : row.referral_source_name
                          : '—'}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm font-semibold text-gray-800">
                        {row.transaction_count || 0}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-500">{row.tier || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border border-emerald-100 bg-emerald-50 text-emerald-700">
                          {row.status || 'Aktif'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 text-indigo-600 transition duration-150 hover:-translate-y-0.5 hover:bg-indigo-100 active:scale-[.95]"
                          aria-label="Edit customer"
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
            itemLabel="customer"
          />
        )}
      </div>

      {panelOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-bold tracking-[-0.01em] text-slate-900">
                  {editingId ? 'Edit Customer' : 'Tambah Customer'}
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

              <form onSubmit={handleSubmit} className="space-y-4">
                <CustomerFormFields form={form} setForm={setForm} />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700"
                  >
                    <X className="w-4 h-4" />
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' }}
                  >
                    <Save className="w-4 h-4" />
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
