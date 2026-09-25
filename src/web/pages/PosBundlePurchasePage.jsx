import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CreditCard,
  Package,
  Pencil,
  Search,
  Users,
  X,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';
import TablePagination, { PAGE_SIZE_OPTIONS } from '@web/components/TablePagination.jsx';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const sectionCardClass =
  'rounded-[20px] border border-slate-200/80 bg-white px-[14px] pt-5 pb-4 shadow-[0_0_0_1px_rgba(0,0,0,.03),0_8px_28px_rgba(15,23,42,.04)] space-y-4';

const labelEyebrowClass =
  'text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400';

const primaryBtnStyle = { background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' };

const STEPS = [
  { key: 'customer', label: '1 Customer' },
  { key: 'paket', label: '2 Paket' },
  { key: 'bayar', label: '3 Pembayaran' },
];

function money(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function getInitials(name = '') {
  return String(name)
    .replace(/^\[TEST\]\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getCustomerSourceLabel(row) {
  if (row.source_system === 'smartlink') return 'Smartlink';
  if (row.source_system === 'pos_legacy') return 'POS · Legacy';
  return 'POS';
}

function SectionHeader({ step, icon: Icon, title, action, hint }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-blue-700"
          style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
        >
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div>
          {step && <p className={labelEyebrowClass}>{step}</p>}
          <h2 className="mt-0.5 text-[15px] font-extrabold tracking-[-0.01em] text-slate-900">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-[12px] text-slate-500">{hint}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function PosBundlePurchasePage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [customerPagination, setCustomerPagination] = useState({
    page: 1,
    page_size: PAGE_SIZE_OPTIONS[0] || 10,
    total_items: 0,
    total_pages: 1,
  });
  const [bundles, setBundles] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBundleId, setSelectedBundleId] = useState('');
  const [bundleDetail, setBundleDetail] = useState(null);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('belum_lunas');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerModalLoading, setCustomerModalLoading] = useState(false);
  const [customerModalSearch, setCustomerModalSearch] = useState('');
  const [customerModalPage, setCustomerModalPage] = useState(1);
  const [customerModalPageSize, setCustomerModalPageSize] = useState(PAGE_SIZE_OPTIONS[0] || 10);

  const loadCustomers = async ({
    search = '',
    page = 1,
    pageSize = customerModalPageSize,
  } = {}) => {
    const safePage = Math.max(1, Number(page || 1));
    const safePageSize = Math.max(1, Number(pageSize || customerModalPageSize || 10));
    const { data } = await api.get('/pos-customers', {
      params: {
        search,
        status: 'Aktif',
        page: safePage,
        page_size: safePageSize,
      },
    });
    setCustomers(data.customers || []);
    setCustomerPagination(
      data.pagination || {
        page: safePage,
        page_size: safePageSize,
        total_items: Array.isArray(data.customers) ? data.customers.length : 0,
        total_pages: 1,
      }
    );
    setCustomerModalPage(data.pagination?.page || safePage);
    setCustomerModalPageSize(data.pagination?.page_size || safePageSize);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [bundleRes, payRes] = await Promise.all([
          api.get('/pos-bundles', { params: { is_active: 1 } }),
          api.get('/pos-master/payment-methods'),
        ]);
        setBundles(bundleRes.data.bundles || []);
        setPaymentMethods(payRes.data.data || payRes.data.payment_methods || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat data pembelian paket');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedBundleId) {
      setBundleDetail(null);
      return;
    }
    api
      .get(`/pos-bundles/${selectedBundleId}`)
      .then(({ data }) => setBundleDetail(data.bundle || null))
      .catch(() => setBundleDetail(null));
  }, [selectedBundleId]);

  const openCustomerPickerModal = async () => {
    setCustomerModalOpen(true);
    setCustomerModalPage(1);
    setError('');
    setCustomerModalLoading(true);
    try {
      await loadCustomers({
        search: customerModalSearch,
        page: 1,
        pageSize: customerModalPageSize,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat customer');
    } finally {
      setCustomerModalLoading(false);
    }
  };

  const closeCustomerPickerModal = () => {
    setCustomerModalOpen(false);
  };

  const handleSearchCustomer = async (e) => {
    e.preventDefault();
    setCustomerModalLoading(true);
    try {
      await loadCustomers({
        search: customerModalSearch,
        page: 1,
        pageSize: customerModalPageSize,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mencari customer');
    } finally {
      setCustomerModalLoading(false);
    }
  };

  const handleCustomerPageChange = async (page) => {
    setCustomerModalLoading(true);
    try {
      await loadCustomers({
        search: customerModalSearch,
        page,
        pageSize: customerModalPageSize,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat halaman customer');
    } finally {
      setCustomerModalLoading(false);
    }
  };

  const handleCustomerPageSizeChange = async (pageSize) => {
    setCustomerModalLoading(true);
    try {
      await loadCustomers({
        search: customerModalSearch,
        page: 1,
        pageSize,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat customer');
    } finally {
      setCustomerModalLoading(false);
    }
  };

  const handleSelectCustomer = async (row) => {
    setError('');
    try {
      if (row.needs_ensure && row.legacy_id_konsumen) {
        const { data } = await api.post('/pos-customers/ensure-legacy', {
          id_konsumen: row.legacy_id_konsumen,
        });
        if (!data?.customer?.id) {
          setError('Customer belum valid setelah sinkronisasi');
          return;
        }
        setSelectedCustomer(data.customer);
        setCustomerModalOpen(false);
        return;
      }
      if (!row.id) {
        setError('Customer belum valid');
        return;
      }
      setSelectedCustomer(row);
      setCustomerModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyiapkan customer');
    }
  };

  const activeStepKey = !selectedCustomer?.id
    ? 'customer'
    : !selectedBundleId
      ? 'paket'
      : 'bayar';
  const activeIndex = STEPS.findIndex((step) => step.key === activeStepKey);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const customerId = Number(selectedCustomer?.id);
    const bundleId = Number(selectedBundleId);
    if (!customerId || !bundleId) {
      setError(
        !customerId
          ? 'Customer belum valid. Pilih ulang customer dari daftar.'
          : 'Paket wajib dipilih'
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/pos-bundles/purchases', {
        customer_id: customerId,
        bundle_id: bundleId,
        payment_method_id: paymentMethodId ? Number(paymentMethodId) : null,
        payment_status: paymentStatus,
      });
      const txId = data.transaction?.id;
      navigate(txId ? `/cleanox-only/transactions/${txId}` : '/cleanox-only/transactions');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membuat pembelian paket');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
        <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-[18px]">
          <p className={labelEyebrowClass}>Cleanox Only</p>
          <p className="mt-2 text-[14px] font-semibold text-slate-700">Memuat form pembelian...</p>
          <p className="mt-1 text-[11.5px] text-slate-400">Menyiapkan paket dan metode bayar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 space-y-5 max-w-[1400px] mx-auto bg-slate-50 min-h-full pb-24 xl:pb-6">
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
              Beli Paket Bundle
            </h1>
            <p className="mt-2 max-w-xl text-[13px] text-blue-100/90">
              Isi bertahap: customer → pilih paket → pembayaran. Saldo aktif setelah lunas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {STEPS.map((step, idx) => {
              const done = idx < activeIndex;
              const current = idx === activeIndex;
              return (
                <span
                  key={step.key}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold backdrop-blur-xl transition duration-150 ${
                    done
                      ? 'border-emerald-300/40 bg-emerald-400/20 text-white'
                      : current
                        ? 'border-white/30 bg-white/15 text-white'
                        : 'border-white/12 bg-white/10 text-blue-100'
                  }`}
                >
                  {done ? `✓ ${step.label.replace(/^\d+\s/, '')}` : step.label}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3.5 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="min-w-0 space-y-5">
            <section className={sectionCardClass}>
              <SectionHeader
                step="Langkah 1"
                icon={Users}
                title="Pilih Customer"
                hint="Wajib dipilih sebelum paket dibuka"
              />

              {selectedCustomer?.id ? (
                <div className="flex items-start justify-between gap-3 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3.5">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[13px] font-extrabold text-white">
                      {getInitials(selectedCustomer.name) || 'C'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[14px] font-extrabold text-emerald-800">
                        <Check className="w-4 h-4 shrink-0" />
                        <span className="truncate">{selectedCustomer.name}</span>
                      </div>
                      <p className="mt-1 text-[11.5px] text-emerald-700">
                        {selectedCustomer.phone || 'Tanpa telepon'}
                      </p>
                      {selectedCustomer.address ? (
                        <p className="mt-1 text-[12.5px] text-emerald-700/90 line-clamp-2">
                          {selectedCustomer.address}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openCustomerPickerModal}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-white px-3 py-2 text-[12px] font-semibold text-emerald-700 transition duration-150 hover:bg-emerald-100 active:scale-[.98]"
                    aria-label="Ganti customer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Ganti
                  </button>
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-[13px] font-semibold text-slate-700">Belum ada customer dipilih</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    Klik tombol di bawah untuk membuka daftar customer aktif.
                  </p>
                  <button
                    type="button"
                    onClick={openCustomerPickerModal}
                    className="mt-4 inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                    style={primaryBtnStyle}
                  >
                    <Users className="w-4 h-4" />
                    Pilih Customer
                  </button>
                </div>
              )}
            </section>

            {!selectedCustomer?.id ? (
              <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-10 text-center shadow-[0_0_0_1px_rgba(0,0,0,.03)]">
                <div
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] text-blue-700"
                  style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
                >
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="mt-4 text-[14px] font-bold tracking-[-0.01em] text-slate-900">
                  Mulai dari customer
                </h3>
                <p className="mt-1.5 text-[12.5px] text-slate-500 max-w-sm mx-auto">
                  Pilih customer di atas untuk membuka langkah pemilihan paket.
                </p>
              </div>
            ) : (
              <>
                <section className={sectionCardClass}>
                  <SectionHeader
                    step="Langkah 2"
                    icon={Package}
                    title="Pilih Paket Bundle"
                    hint="Pilih satu paket aktif yang akan dibeli customer"
                  />

                  {bundles.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">
                      Belum ada paket aktif. Buat dulu di menu Paket Bundle.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {bundles.map((bundle) => {
                        const active = String(selectedBundleId) === String(bundle.id);
                        return (
                          <button
                            key={bundle.id}
                            type="button"
                            onClick={() => {
                              setSelectedBundleId(String(bundle.id));
                              setError('');
                            }}
                            className={`rounded-[16px] border px-4 py-3.5 text-left transition duration-150 ${
                              active
                                ? 'border-blue-400 bg-blue-50 shadow-[0_0_0_3px_rgba(59,130,246,.12)]'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[13px] font-extrabold text-slate-900">
                                {bundle.name}
                              </p>
                              {active ? <Check className="w-4 h-4 text-blue-600 shrink-0" /> : null}
                            </div>
                            <p className="mt-2 font-sans text-[14px] font-extrabold text-blue-700">
                              {money(bundle.price)}
                            </p>
                            {bundle.coret_price != null ? (
                              <p className="text-[11px] text-slate-400 line-through">
                                {money(bundle.coret_price)}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11.5px] text-slate-500">
                              Aktif {bundle.duration_months} bulan setelah lunas
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {bundleDetail ? (
                    <div className="rounded-[16px] border border-emerald-200 bg-emerald-50/70 px-4 py-3.5">
                      <p className="text-[12px] font-extrabold text-emerald-900">Isi kuota paket</p>
                      <ul className="mt-2 space-y-1 text-[12.5px] text-emerald-800">
                        {(bundleDetail.items || []).map((item) => (
                          <li key={item.id}>
                            • {item.service_name}: {item.quota_amount} {item.quota_unit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>

                {selectedBundleId ? (
                  <section className={sectionCardClass}>
                    <SectionHeader
                      step="Langkah 3"
                      icon={CreditCard}
                      title="Pembayaran"
                      hint="Saldo paket baru aktif setelah status lunas"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className={labelEyebrowClass}>Metode bayar</span>
                        <select
                          className={inputClass}
                          value={paymentMethodId}
                          onChange={(e) => setPaymentMethodId(e.target.value)}
                        >
                          <option value="">Belum dipilih</option>
                          {paymentMethods.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.label || row.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className={labelEyebrowClass}>Status bayar</span>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'belum_lunas', label: 'Belum lunas' },
                            { value: 'lunas', label: 'Lunas' },
                          ].map((option) => {
                            const active = paymentStatus === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setPaymentStatus(option.value)}
                                className={`rounded-[12px] border px-3 py-2.5 text-[12.5px] font-bold transition duration-150 ${
                                  active
                                    ? option.value === 'lunas'
                                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                      : 'border-amber-400 bg-amber-50 text-amber-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </label>
                    </div>
                    <p className="text-[11.5px] text-slate-500">
                      Jika belum lunas, paket belum aktif. Lunasi lewat detail transaksi (unggah
                      bukti jika diperlukan).
                    </p>
                  </section>
                ) : null}
              </>
            )}
          </div>

          <aside className="hidden xl:block xl:sticky xl:top-4">
            <div
              className="rounded-[20px] p-5 text-white shadow-[0_12px_40px_rgba(15,23,42,.18)]"
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 55%, #1D4ED8 100%)',
              }}
            >
              <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-200/80">
                Ringkasan pembelian
              </p>
              <p className="mt-2 text-[11.5px] text-blue-100/90">
                {selectedCustomer?.name || 'Customer belum dipilih'}
              </p>
              <p className="mt-4 text-[11.5px] text-blue-100">Total paket</p>
              <p className="font-sans text-[22px] font-extrabold tracking-[-0.01em]">
                {bundleDetail ? money(bundleDetail.price) : 'Rp 0'}
              </p>
              {bundleDetail?.coret_price != null ? (
                <p className="mt-1 text-[12px] text-blue-200/80 line-through">
                  {money(bundleDetail.coret_price)}
                </p>
              ) : null}
              <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[12.5px] text-blue-100">
                <p className="flex justify-between gap-2">
                  <span>Paket</span>
                  <span className="font-semibold text-white text-right">
                    {bundleDetail?.name || '-'}
                  </span>
                </p>
                <p className="flex justify-between gap-2">
                  <span>Masa aktif</span>
                  <span>
                    {bundleDetail ? `${bundleDetail.duration_months} bulan` : '-'}
                  </span>
                </p>
                <p className="flex justify-between gap-2">
                  <span>Status bayar</span>
                  <span className="capitalize">
                    {paymentStatus === 'lunas' ? 'Lunas' : 'Belum lunas'}
                  </span>
                </p>
              </div>
              <button
                type="submit"
                disabled={saving || !selectedCustomer?.id || !selectedBundleId}
                className="mt-5 w-full rounded-[12px] bg-white px-4 py-3 text-[13px] font-extrabold text-blue-800 transition duration-150 hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {saving ? 'Menyimpan...' : 'Buat Pembelian'}
              </button>
            </div>
          </aside>
        </div>

        <div className="xl:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
                Total
              </p>
              <p className="font-sans text-[16px] font-extrabold text-slate-900">
                {bundleDetail ? money(bundleDetail.price) : 'Rp 0'}
              </p>
            </div>
            <button
              type="submit"
              disabled={saving || !selectedCustomer?.id || !selectedBundleId}
              className="rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              style={primaryBtnStyle}
            >
              {saving ? 'Menyimpan...' : 'Buat Pembelian'}
            </button>
          </div>
        </div>
      </form>

      {customerModalOpen && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={closeCustomerPickerModal}
          >
            <div
              className="flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.04),0_16px_48px_rgba(15,23,42,.18)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className={labelEyebrowClass}>Langkah 1</p>
                  <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.01em] text-slate-900">
                    Pilih Customer
                  </h2>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    Diurutkan dari customer yang paling sering transaksi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCustomerPickerModal}
                  className="rounded-[10px] p-1.5 text-slate-400 transition duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[.98]"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <form onSubmit={handleSearchCustomer} className="flex flex-col gap-2.5 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={customerModalSearch}
                      onChange={(e) => setCustomerModalSearch(e.target.value)}
                      placeholder="Cari nama, telepon, atau alamat customer"
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                    style={primaryBtnStyle}
                  >
                    Cari
                  </button>
                </form>

                {customerModalLoading ? (
                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-10 text-center">
                    <p className="text-[13px] font-semibold text-slate-700">Memuat customer...</p>
                  </div>
                ) : customers.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                    <p className="text-[13px] font-semibold text-slate-700">Customer tidak ditemukan</p>
                    <p className="mt-1 text-[11.5px] text-slate-500">
                      Ubah kata kunci pencarian atau tambahkan customer baru dari menu Customer.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {customers.map((row) => (
                      <button
                        key={row.id || row.legacy_id_konsumen}
                        type="button"
                        onClick={() => handleSelectCustomer(row)}
                        className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white active:scale-[.98]"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-blue-700"
                            style={{
                              background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)',
                            }}
                          >
                            {getInitials(row.name) || 'C'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-[13px] font-bold text-slate-800 truncate">
                                {row.name}
                              </div>
                              <span
                                className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                  row.source_system === 'smartlink'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-blue-200 bg-blue-50 text-blue-700'
                                }`}
                              >
                                {getCustomerSourceLabel(row)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11.5px] text-slate-500">
                              {row.phone || 'Tanpa telepon'}
                            </div>
                            {row.address && (
                              <div className="mt-1 text-[11.5px] text-slate-400 truncate">
                                {row.address}
                              </div>
                            )}
                            <span className="mt-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              {row.transaction_count || 0} transaksi
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-100">
                <TablePagination
                  totalItems={customerPagination.total_items || 0}
                  page={customerPagination.page || customerModalPage}
                  pageSize={customerModalPageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={handleCustomerPageChange}
                  onPageSizeChange={handleCustomerPageSizeChange}
                  itemLabel="customer"
                />
              </div>
            </div>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
