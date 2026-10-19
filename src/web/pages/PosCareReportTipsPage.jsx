import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  Sparkles,
  AlertCircle,
  Eye,
  Tag,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';
import TablePagination, {
  PAGE_SIZE_OPTIONS,
  paginateList,
} from '@web/components/TablePagination.jsx';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const primaryBtnStyle = { background: 'linear-gradient(135deg, #0A3058 0%, #164E87 100%)' };

const defaultTipsArray = ['', '', '', '', '', ''];

const emptyForm = {
  category_key: '',
  label: '',
  item_sub_label: '',
  item_prefix: 'Item',
  title: '',
  keywords: '',
  tips: [...defaultTipsArray],
  sort_order: 0,
  is_active: 1,
};

export default function PosCareReportTipsPage() {
  const [tipsList, setTipsList] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/pos-master/care-report-tips', {
        params: { all: 'true' },
      });
      setTipsList(data.tips || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat master tips care report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredList = useMemo(() => {
    return tipsList.filter((item) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        item.label?.toLowerCase().includes(q) ||
        item.category_key?.toLowerCase().includes(q) ||
        item.title?.toLowerCase().includes(q) ||
        (Array.isArray(item.keywords) && item.keywords.some((kw) => kw.toLowerCase().includes(q)));

      const matchStatus =
        statusFilter === '' ||
        (statusFilter === '1' && item.is_active === 1) ||
        (statusFilter === '0' && item.is_active === 0);

      return matchSearch && matchStatus;
    });
  }, [tipsList, search, statusFilter]);

  const pagination = useMemo(() => {
    return paginateList(filteredList, currentPage, pageSize);
  }, [filteredList, currentPage, pageSize]);


  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      sort_order: tipsList.length + 1,
      tips: [...defaultTipsArray],
    });
    setError('');
    setSuccessMsg('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    const rawTips = Array.isArray(row.tips) ? row.tips : [];
    const formattedTips = [...rawTips];
    while (formattedTips.length < 6) formattedTips.push('');

    const rawKw = Array.isArray(row.keywords) ? row.keywords.join(', ') : '';

    setForm({
      category_key: row.category_key || '',
      label: row.label || '',
      item_sub_label: row.item_sub_label || '',
      item_prefix: row.item_prefix || 'Item',
      title: row.title || '',
      keywords: rawKw,
      tips: formattedTips.slice(0, 6),
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active ?? 1,
    });
    setError('');
    setSuccessMsg('');
    setModalOpen(true);
  };

  const openPreview = (row) => {
    setPreviewData(row);
    setPreviewModalOpen(true);
  };

  const handleTipChange = (index, value) => {
    setForm((prev) => {
      const updated = [...prev.tips];
      updated[index] = value;
      return { ...prev, tips: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    // Filter out completely empty tips if less than 6
    const cleanTips = form.tips.map((t) => t.trim()).filter((t) => t.length > 0);
    if (cleanTips.length === 0) {
      setError('Harap isi minimal 1 poin tips perawatan (disarankan 6 poin).');
      setSaving(false);
      return;
    }

    const keywordsArray = form.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);

    const payload = {
      category_key: form.category_key.trim().toLowerCase().replace(/\s+/g, '_'),
      label: form.label.trim(),
      item_sub_label: form.item_sub_label.trim() || form.label.trim(),
      item_prefix: form.item_prefix,
      title: form.title.trim(),
      keywords: keywordsArray,
      tips: cleanTips,
      sort_order: Number(form.sort_order || 0),
      is_active: Number(form.is_active),
    };

    try {
      if (editingId) {
        await api.put(`/pos-master/care-report-tips/${editingId}`, payload);
        setSuccessMsg('Tips kategori berhasil diperbarui!');
      } else {
        await api.post('/pos-master/care-report-tips', payload);
        setSuccessMsg('Tips kategori baru berhasil ditambahkan!');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan data tips');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Yakin ingin menghapus master tips "${row.title}" (${row.category_key})?`)) {
      return;
    }
    setError('');
    try {
      await api.delete(`/pos-master/care-report-tips/${row.id}`);
      setSuccessMsg(`Tips "${row.label}" berhasil dihapus.`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus tips');
    }
  };

  const handleToggleStatus = async (row) => {
    try {
      await api.put(`/pos-master/care-report-tips/${row.id}`, {
        is_active: row.is_active === 1 ? 0 : 1,
      });
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal mengubah status');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1500px] mx-auto min-h-full">
      {/* Header Halaman */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-sky-700">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-sky-600" />
            Master Tips Cleanox Care Report
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
            Kelola teks edukasi tips perawatan per layanan yang otomatis tercetak pada dokumen PDF Care Report.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            style={primaryBtnStyle}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition"
          >
            <Plus className="w-4 h-4" />
            Tambah Kategori Tips
          </button>
        </div>
      </div>

      {/* Alert Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <Check className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari layanan, judul, keywords..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:bg-white focus:border-sky-500 focus:outline-none"
          >
            <option value="">Semua Status</option>
            <option value="1">Aktif</option>
            <option value="0">Nonaktif</option>
          </select>
          <span className="text-xs text-slate-400 font-medium">
            Total: <strong className="text-slate-700">{filteredList.length}</strong> kategori
          </span>
        </div>
      </div>

      {/* Tabel Data */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">Urutan</th>
                <th className="py-3 px-4">Layanan & Key</th>
                <th className="py-3 px-4">Judul Tips PDF</th>
                <th className="py-3 px-4">Prefix / Sublabel</th>
                <th className="py-3 px-4">Kata Kunci Deteksi</th>
                <th className="py-3 px-4 text-center">Jml Tips</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                    Memuat master data tips...
                  </td>
                </tr>
              ) : pagination.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Tidak ada kategori tips yang sesuai dengan pencarian.
                  </td>
                </tr>
              ) : (
                pagination.items.map((row) => {

                  const tipsArray = Array.isArray(row.tips) ? row.tips : [];
                  const keywordsArray = Array.isArray(row.keywords) ? row.keywords : [];

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-500">
                        {row.sort_order}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{row.label}</div>
                        <div className="font-mono text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded inline-block mt-0.5 border border-sky-100">
                          {row.category_key}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {row.title}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {row.item_prefix || 'Item'}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-0.5">{row.item_sub_label}</div>
                      </td>
                      <td className="py-3.5 px-4 max-w-[220px]">
                        <div className="flex flex-wrap gap-1">
                          {keywordsArray.slice(0, 4).map((kw, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded"
                            >
                              {kw}
                            </span>
                          ))}
                          {keywordsArray.length > 4 && (
                            <span className="text-[10px] text-slate-400 font-semibold">
                              +{keywordsArray.length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center justify-center font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] border border-emerald-200">
                          {tipsArray.length} Poin
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(row)}
                          title="Klik untuk ubah status aktif/nonaktif"
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition ${
                            row.is_active === 1
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {row.is_active === 1 ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Aktif
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-slate-400" /> Nonaktif
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openPreview(row)}
                            className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                            title="Preview Tampilan Kartu PDF"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit Tips"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Hapus Kategori"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <TablePagination
          totalItems={pagination.totalItems}
          page={pagination.page}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          itemLabel="kategori tips"
        />
      </div>


      {/* MODAL FORM TAMBAH / EDIT */}
      {modalOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-sky-50/70 via-white to-blue-50/60 px-6 py-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingId ? 'Edit Kategori Tips' : 'Tambah Kategori Tips Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sesuaikan label, kata kunci pencocokan, serta 6 butir tips perawatan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                {error && (
                  <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Section 1: Konfigurasi Identitas Kategori */}
                <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kategori Key <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={!!editingId}
                      required
                      placeholder="contoh: kasur, karpet, mobil"
                      value={form.category_key}
                      onChange={(e) => setForm({ ...form, category_key: e.target.value })}
                      className={`${inputClass} ${editingId ? 'opacity-60 cursor-not-allowed' : ''}`}
                    />
                    <span className="text-[10px] text-slate-400">
                      ID unik (huruf kecil & tanpa spasi).
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Label Pill Transaksi <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="contoh: Deep Clean Kasur"
                      value={form.label}
                      onChange={(e) => setForm({ ...form, label: e.target.value })}
                      className={inputClass}
                    />
                    <span className="text-[10px] text-slate-400">
                      Teks yang tampil di pill atas & dropdown.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sublabel Item Foto <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="contoh: Deep Clean Kasur"
                      value={form.item_sub_label}
                      onChange={(e) => setForm({ ...form, item_sub_label: e.target.value })}
                      className={inputClass}
                    />
                    <span className="text-[10px] text-slate-400">
                      Sublabel di bawah nama item pada foto.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Prefix Penomoran
                    </label>
                    <select
                      value={form.item_prefix}
                      onChange={(e) => setForm({ ...form, item_prefix: e.target.value })}
                      className={inputClass}
                    >
                      <option value="Item">Item (Item 1, Item 2)</option>
                      <option value="Area">Area (Area 1, Area 2 - General Cleaning)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Judul Kartu Tips di Dokumen PDF <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="contoh: Tips Perawatan Kasur di Rumah"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kata Kunci Auto-Deteksi Layanan (Pisahkan dengan koma)
                    </label>
                    <input
                      type="text"
                      placeholder="contoh: kasur, bed, springbed, mattress, bantal"
                      value={form.keywords}
                      onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                      className={inputClass}
                    />
                    <span className="text-[10px] text-slate-500">
                      Jika nama layanan transaksi mengandung kata kunci di atas, tips ini akan otomatis terpilih.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Urutan Tampilan
                    </label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Status Aktif
                    </label>
                    <select
                      value={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })}
                      className={inputClass}
                    >
                      <option value={1}>Aktif (Bisa Dipilih)</option>
                      <option value={0}>Nonaktif (Disembunyikan)</option>
                    </select>
                  </div>
                </div>

                {/* Section 2: Butir Tips (1 s/d 6) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      6 Butir Tips Perawatan (Format 2 Kolom x 3 Baris)
                    </h4>
                    <span className="text-[11px] text-slate-400">Disarankan 6 butir lengkap</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {form.tips.map((tipText, idx) => (
                      <div key={idx} className="relative">
                        <div className="absolute left-3 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#84B814] text-[11px] font-bold text-white shadow-sm">
                          {idx + 1}
                        </div>
                        <textarea
                          rows={2}
                          placeholder={`Tuliskan tips nomor ${idx + 1}...`}
                          value={tipText}
                          onChange={(e) => handleTipChange(idx, e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-xs text-slate-800 transition focus:bg-white focus:border-sky-500 focus:outline-none resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={saving}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={primaryBtnStyle}
                    className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold text-white shadow hover:opacity-95 transition disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menyimpan...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" /> Simpan Tips
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </BodyPortal>
      )}

      {/* MODAL PREVIEW TAMPILAN SEPERTI DI PDF */}
      {previewModalOpen && previewData && (
        <BodyPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-sky-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    Preview Tampilan Kartu PDF ({previewData.label})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Box Tips Layout Seperti di PDF */}
              <div className="rounded-2xl border-2 border-[#D9E6BD] bg-[#F4F8EC] p-5 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-[#05406B] tracking-tight">
                  {previewData.title}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
                  {(Array.isArray(previewData.tips) ? previewData.tips : []).map((tipText, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#84B814] text-[11px] font-bold text-white shadow-sm mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="text-xs text-[#0F172A] leading-relaxed">{tipText}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>
                  Kata Kunci:{' '}
                  <strong className="text-slate-700">
                    {(Array.isArray(previewData.keywords) ? previewData.keywords : []).join(', ') || '-'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Tutup Preview
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
