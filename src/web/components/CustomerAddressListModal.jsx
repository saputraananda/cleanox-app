import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Home,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';
import CustomerAddressModal from '@web/components/CustomerAddressModal.jsx';

export default function CustomerAddressListModal({ isOpen, onClose, customer, onUpdated }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadAddresses = async () => {
    if (!customer?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/pos-customers/${customer.id}/addresses`);
      setAddresses(data.addresses || []);
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat daftar alamat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && customer?.id) {
      loadAddresses();
    }
  }, [isOpen, customer?.id]);

  const handleSetPrimary = async (addressId) => {
    setActionLoadingId(addressId);
    setError('');
    try {
      await api.patch(`/pos-customers/${customer.id}/addresses/${addressId}/primary`);
      await loadAddresses();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengubah alamat utama');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (addressId) => {
    if (!window.confirm('Yakin ingin menghapus alamat ini?')) return;
    setActionLoadingId(addressId);
    setError('');
    try {
      await api.delete(`/pos-customers/${customer.id}/addresses/${addressId}`);
      await loadAddresses();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus alamat');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[24px] border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-50 text-blue-600">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-extrabold text-slate-800">
                  Buku Alamat: {customer?.name || 'Customer'}
                </h3>
                <p className="text-[12px] text-slate-500">
                  Kelola daftar alamat layanan untuk transaksi cepat di kasir
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <span className="text-[12px] font-bold text-slate-600">
              Total Alamat: {addresses.length}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingAddress(null);
                setAddressFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Alamat Baru
            </button>
          </div>

          {/* Address List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {error && (
              <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center text-[13px] text-slate-400">
                Memuat daftar alamat...
              </div>
            ) : addresses.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-[13px] font-semibold text-slate-600">
                  Belum ada alamat tersimpan
                </p>
                <p className="mt-1 text-[11.5px] text-slate-400">
                  Tambahkan alamat pertama untuk customer ini
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAddress(null);
                    setAddressFormOpen(true);
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-blue-600 px-3.5 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-blue-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Alamat Sekarang
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`rounded-[16px] border p-4 transition ${
                      addr.is_primary
                        ? 'border-blue-300 bg-blue-50/30 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11.5px] font-extrabold text-slate-700">
                          {addr.label === 'Rumah' && <Home className="w-3.5 h-3.5 text-blue-600" />}
                          {addr.label === 'Kantor' && <Building2 className="w-3.5 h-3.5 text-indigo-600" />}
                          {addr.label || 'Rumah'}
                        </span>
                        {addr.is_primary ? (
                          <span className="inline-flex items-center gap-1 rounded-[8px] bg-emerald-100 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Alamat Utama (Default)
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={actionLoadingId === addr.id}
                            onClick={() => handleSetPrimary(addr.id)}
                            className="inline-flex items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700 transition"
                          >
                            <Star className="w-3 h-3 text-amber-500" />
                            Jadikan Utama
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAddress(addr);
                            setAddressFormOpen(true);
                          }}
                          className="rounded-[8px] p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="Edit Alamat"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === addr.id}
                          onClick={() => handleDelete(addr.id)}
                          className="rounded-[8px] p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Hapus Alamat"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {(addr.recipient_name || addr.recipient_phone) && (
                      <p className="mt-2 text-[12px] font-semibold text-slate-600">
                        Kontak: {addr.recipient_name || '-'}{addr.recipient_phone ? ` (${addr.recipient_phone})` : ''}
                      </p>
                    )}

                    <p className="mt-1.5 text-[12.5px] text-slate-700 leading-relaxed">
                      {addr.address}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[12px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>

      {addressFormOpen && (
        <CustomerAddressModal
          isOpen={addressFormOpen}
          onClose={() => {
            setAddressFormOpen(false);
            setEditingAddress(null);
          }}
          customerId={customer?.id}
          addressToEdit={editingAddress}
          onSaved={() => {
            loadAddresses();
          }}
        />
      )}
    </BodyPortal>
  );
}
