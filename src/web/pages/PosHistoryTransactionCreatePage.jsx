import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Users,
  Clock3,
  Package,
  UserCheck,
  Check,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';
import TablePagination, { PAGE_SIZE_OPTIONS } from '@web/components/TablePagination.jsx';
import {
  calculateGcBillingHours,
  computeGcLineTotals,
  getGcCrewSizeFromItems,
  isGeneralCleaningCategory,
} from '@web/utils/posGeneralCleaningBilling.js';
import { resolveEffectiveBasePrice } from '@web/utils/posServicePrice.js';
import { isBlankAddress } from '@web/utils/posCustomerAddress.js';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const sectionCardClass =
  'rounded-[20px] border border-slate-200/80 bg-white px-[14px] pt-5 pb-4 shadow-[0_0_0_1px_rgba(0,0,0,.03),0_8px_28px_rgba(15,23,42,.04)] space-y-4';

const labelEyebrowClass =
  'text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400';

const primaryBtnStyle = { background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' };

const formatCurrency = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
}

function combineDateTime(date, time) {
  if (!date || !isValidTime(time)) return '';
  return `${date}T${time}`;
}

export default function PosHistoryTransactionCreatePage() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerModalLoading, setCustomerModalLoading] = useState(false);
  const [customerModalSearch, setCustomerModalSearch] = useState('');
  const [customerModalPage, setCustomerModalPage] = useState(1);
  const [customerModalPageSize, setCustomerModalPageSize] = useState(PAGE_SIZE_OPTIONS[0] || 10);
  const [customerPagination, setCustomerPagination] = useState({
    page: 1,
    page_size: PAGE_SIZE_OPTIONS[0] || 10,
    total_items: 0,
    total_pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    service_date: '',
    start_time: '09:00',
    end_time: '11:00',
    total_people: 1,
    notes: '',
    items: [],
    worker_ids: [],
  });
  const [serviceIdDraft, setServiceIdDraft] = useState('');

  const gcServices = useMemo(
    () => services.filter((row) => isGeneralCleaningCategory(row.category_name)),
    [services]
  );

  const gcCrewInfo = useMemo(
    () => getGcCrewSizeFromItems(form.items, services),
    [form.items, services]
  );

  const jobStartedAt = combineDateTime(form.service_date, form.start_time);
  const jobEndedAt = combineDateTime(form.service_date, form.end_time);

  const pricingPreview = useMemo(() => {
    if (!jobStartedAt || !jobEndedAt || !form.items.length) {
      return { ok: false, hours: null, subtotal: 0, discount: 0, finalAmount: 0 };
    }
    let hours;
    try {
      hours = calculateGcBillingHours({
        startedAt: jobStartedAt,
        completedAt: jobEndedAt,
      });
    } catch {
      return { ok: false, hours: null, subtotal: 0, discount: 0, finalAmount: 0 };
    }

    let subtotal = 0;
    let discount = 0;
    for (const item of form.items) {
      const service = services.find((row) => Number(row.id) === Number(item.service_id));
      if (!service) continue;
      const listPrice = Number(service.price || 0);
      const coretPrice = service.coret_price == null ? null : Number(service.coret_price);
      const basePrice = resolveEffectiveBasePrice({
        price: listPrice,
        coret_price: coretPrice,
      });
      const computed = computeGcLineTotals({
        basePrice,
        promoType: item.promo_type || null,
        promoValue: item.promo_value || null,
        billingHours: hours,
      });
      subtotal += basePrice * hours;
      discount += computed.promoDiscountAmount;
    }

    return {
      ok: true,
      hours,
      subtotal,
      discount,
      finalAmount: subtotal - discount,
    };
  }, [form.items, jobEndedAt, jobStartedAt, services]);

  const loadCustomers = async ({
    search = customerModalSearch,
    page = customerModalPage,
    pageSize = customerModalPageSize,
  } = {}) => {
    setCustomerModalLoading(true);
    try {
      const { data } = await api.get('/pos-customers', {
        params: { search, page, page_size: pageSize },
      });
      setCustomers(data.customers || []);
      setCustomerPagination({
        page: Number(data.pagination?.page || page),
        page_size: Number(data.pagination?.page_size || pageSize),
        total_items: Number(data.pagination?.total_items || 0),
        total_pages: Number(data.pagination?.total_pages || 1),
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat customer');
    } finally {
      setCustomerModalLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [serviceRes, workerRes] = await Promise.all([
          api.get('/pos-transactions/services'),
          api.get('/pos-transactions/workers'),
        ]);
        setServices(serviceRes.data.services || []);
        setWorkers(workerRes.data.workers || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat master POS');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!gcCrewInfo.ok || !gcCrewInfo.hasGc || !gcCrewInfo.crewSize) return;
    setForm((prev) => {
      if (Number(prev.total_people) === gcCrewInfo.crewSize && prev.worker_ids.length <= gcCrewInfo.crewSize) {
        return prev;
      }
      return {
        ...prev,
        total_people: gcCrewInfo.crewSize,
        worker_ids: prev.worker_ids.slice(0, gcCrewInfo.crewSize),
      };
    });
  }, [gcCrewInfo]);

  const openCustomerModal = async () => {
    setCustomerModalOpen(true);
    setCustomerModalSearch('');
    setCustomerModalPage(1);
    await loadCustomers({ search: '', page: 1, pageSize: customerModalPageSize });
  };

  const handleSelectCustomer = (row) => {
    if (isBlankAddress(row.address)) {
      setError('Alamat customer wajib diisi sebelum membuat transaksi history');
      return;
    }
    setSelectedCustomer(row);
    setCustomerModalOpen(false);
    setError('');
  };

  const handleAddService = () => {
    const service = gcServices.find((row) => Number(row.id) === Number(serviceIdDraft));
    if (!service) {
      setError('Pilih service General Cleaning');
      return;
    }
    setForm((prev) => ({
      ...prev,
      items: [
        {
          service_id: service.id,
          service_name: service.name,
          category_name: service.category_name,
          qty: 1,
        },
      ],
    }));
    setServiceIdDraft('');
    setError('');
  };

  const toggleWorker = (employeeId) => {
    const workerId = Number(employeeId);
    setForm((prev) => {
      const already = prev.worker_ids.includes(workerId);
      if (already) {
        return { ...prev, worker_ids: prev.worker_ids.filter((id) => id !== workerId) };
      }
      const max = Math.max(1, Number(prev.total_people || 1));
      if (prev.worker_ids.length >= max) {
        setError(`Maksimal ${max} pekerja sesuai paket GC`);
        return prev;
      }
      setError('');
      return { ...prev, worker_ids: [...prev.worker_ids, workerId] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomer?.id) {
      setError('Pilih customer terlebih dahulu');
      return;
    }
    if (!form.service_date || !isValidTime(form.start_time) || !isValidTime(form.end_time)) {
      setError('Tanggal, jam mulai, dan jam selesai wajib diisi');
      return;
    }
    if (!jobStartedAt || !jobEndedAt) {
      setError('Jam mulai/selesai tidak valid');
      return;
    }
    if (!pricingPreview.ok) {
      setError('Jam selesai harus setelah jam mulai');
      return;
    }
    if (!form.items.length) {
      setError('Pilih minimal 1 service General Cleaning');
      return;
    }
    if (!gcCrewInfo.ok || !gcCrewInfo.hasGc) {
      setError(gcCrewInfo.error || 'Paket General Cleaning tidak valid');
      return;
    }
    if (form.worker_ids.length !== Number(form.total_people || 1)) {
      setError(`Pilih tepat ${form.total_people} pekerja sesuai paket General Cleaning`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        is_history_entry: true,
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_phone: selectedCustomer.phone || null,
        customer_address: selectedCustomer.address || null,
        service_date: jobStartedAt,
        job_started_at: jobStartedAt,
        job_ended_at: jobEndedAt,
        total_people: Number(form.total_people || 1),
        notes: form.notes,
        service_mode: 'home_service',
        worker_ids: form.worker_ids,
        items: form.items.map((item) => ({
          service_id: Number(item.service_id),
          qty: 1,
        })),
      };
      const { data } = await api.post('/pos-transactions', payload);
      navigate(`/cleanox-only/transactions/${data.transaction_id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mencatat transaksi history');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 max-w-[1100px] mx-auto bg-slate-50 min-h-full">
        <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-[18px]">
          <p className={labelEyebrowClass}>Cleanox Only</p>
          <p className="mt-2 text-sm text-slate-500">Memuat form Input Transaksi History...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 max-w-[1100px] mx-auto bg-slate-50 min-h-full space-y-4">
      <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-[18px]">
        <Link
          to="/cleanox-only/transactions"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Riwayat
        </Link>
        <p className={`${labelEyebrowClass} mt-3`}>Cleanox Only</p>
        <h1 className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-slate-900">
          Input Transaksi History
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Pencatatan General Cleaning dengan jam mulai/selesai. Muncul di riwayat & nota, tidak ke mobile.
        </p>
      </div>

      {error && (
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className={sectionCardClass}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-50 text-blue-700">
              <Users className="w-[18px] h-[18px]" />
            </div>
            <div>
              <p className={labelEyebrowClass}>1 Customer</p>
              <h2 className="text-[14px] font-bold text-slate-900">Pilih customer</h2>
            </div>
          </div>
          {selectedCustomer ? (
            <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="font-semibold text-slate-900">{selectedCustomer.name}</p>
              <p className="text-[12.5px] text-slate-600">{selectedCustomer.phone || '-'}</p>
              <p className="mt-1 text-[12.5px] text-slate-500">{selectedCustomer.address}</p>
              <button
                type="button"
                onClick={openCustomerModal}
                className="mt-2 text-[12px] font-semibold text-blue-700"
              >
                Ganti customer
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openCustomerModal}
              className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700"
            >
              <Search className="w-4 h-4" />
              Cari customer
            </button>
          )}
        </section>

        <section className={sectionCardClass}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-50 text-blue-700">
              <Clock3 className="w-[18px] h-[18px]" />
            </div>
            <div>
              <p className={labelEyebrowClass}>2 Jadwal & Durasi</p>
              <h2 className="text-[14px] font-bold text-slate-900">Tanggal + jam mulai/selesai</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-600">Tanggal</span>
              <input
                type="date"
                className={inputClass}
                value={form.service_date}
                onChange={(e) => setForm((prev) => ({ ...prev, service_date: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-600">Jam mulai</span>
              <input
                type="time"
                className={inputClass}
                value={form.start_time}
                onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-600">Jam selesai</span>
              <input
                type="time"
                className={inputClass}
                value={form.end_time}
                onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
              />
            </label>
          </div>
          {pricingPreview.ok && (
            <p className="text-[12.5px] text-slate-500">
              Durasi ditagih: <span className="font-semibold text-slate-800">{pricingPreview.hours} jam</span>
            </p>
          )}
        </section>

        <section className={sectionCardClass}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-50 text-blue-700">
              <Package className="w-[18px] h-[18px]" />
            </div>
            <div>
              <p className={labelEyebrowClass}>3 Service GC</p>
              <h2 className="text-[14px] font-bold text-slate-900">General Cleaning saja</h2>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className={inputClass}
              value={serviceIdDraft}
              onChange={(e) => setServiceIdDraft(e.target.value)}
            >
              <option value="">Pilih paket GC</option>
              {gcServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddService}
              className="inline-flex items-center justify-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white"
              style={primaryBtnStyle}
            >
              Pakai paket
            </button>
          </div>
          {form.items[0] && (
            <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px]">
              <p className="font-semibold text-slate-900">{form.items[0].service_name}</p>
              <p className="text-slate-500">Crew: {form.total_people} teknisi</p>
            </div>
          )}
        </section>

        <section className={sectionCardClass}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-50 text-blue-700">
              <UserCheck className="w-[18px] h-[18px]" />
            </div>
            <div>
              <p className={labelEyebrowClass}>4 Pekerja</p>
              <h2 className="text-[14px] font-bold text-slate-900">
                Pilih {form.total_people} pekerja
              </h2>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {workers.map((worker) => {
              const selected = form.worker_ids.includes(Number(worker.employee_id));
              return (
                <button
                  key={worker.employee_id}
                  type="button"
                  onClick={() => toggleWorker(worker.employee_id)}
                  className={`rounded-[14px] border px-3 py-3 text-left transition ${
                    selected
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-slate-900">{worker.full_name}</p>
                    {selected && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[11.5px] text-slate-500">{worker.phone_number || '-'}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className={sectionCardClass}>
          <label className="space-y-1.5 block">
            <span className="text-[12px] font-semibold text-slate-600">Catatan (opsional)</span>
            <textarea
              className={inputClass}
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Catatan internal pencatatan history"
            />
          </label>
          <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Estimasi total
            </p>
            <p className="mt-1 text-[22px] font-bold text-slate-900">
              {pricingPreview.ok ? formatCurrency(pricingPreview.finalAmount) : '—'}
            </p>
            {pricingPreview.ok && (
              <p className="text-[12px] text-slate-500">
                {pricingPreview.hours} jam · diskon {formatCurrency(pricingPreview.discount)}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] px-5 py-3 text-[13px] font-bold text-white disabled:opacity-60"
            style={primaryBtnStyle}
          >
            {saving ? 'Menyimpan...' : 'Simpan Transaksi History'}
          </button>
        </section>
      </form>

      {customerModalOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/40 p-3">
            <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-xl flex flex-col">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-bold text-slate-900">Pilih Customer</h3>
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="text-[13px] font-semibold text-slate-500"
                >
                  Tutup
                </button>
              </div>
              <div className="px-5 py-3 border-b border-slate-100">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setCustomerModalPage(1);
                    loadCustomers({ search: customerModalSearch, page: 1 });
                  }}
                  className="flex gap-2"
                >
                  <input
                    className={inputClass}
                    value={customerModalSearch}
                    onChange={(e) => setCustomerModalSearch(e.target.value)}
                    placeholder="Cari nama / telepon"
                  />
                  <button
                    type="submit"
                    className="rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white"
                    style={primaryBtnStyle}
                  >
                    Cari
                  </button>
                </form>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {customerModalLoading ? (
                  <p className="text-sm text-slate-500">Memuat...</p>
                ) : customers.length === 0 ? (
                  <p className="text-sm text-slate-500">Customer tidak ditemukan</p>
                ) : (
                  customers.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => handleSelectCustomer(row)}
                      className="w-full rounded-[14px] border border-slate-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      <p className="text-[12.5px] text-slate-500">{row.phone || '-'}</p>
                      <p className="text-[12px] text-slate-400 mt-1 line-clamp-2">
                        {row.address || 'Alamat kosong'}
                      </p>
                    </button>
                  ))
                )}
              </div>
              <div className="px-5 py-3 border-t border-slate-100">
                <TablePagination
                  totalItems={customerPagination.total_items}
                  totalPages={customerPagination.total_pages}
                  page={customerPagination.page}
                  pageSize={customerModalPageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={(page) => {
                    setCustomerModalPage(page);
                    loadCustomers({ page });
                  }}
                  onPageSizeChange={(size) => {
                    setCustomerModalPageSize(size);
                    setCustomerModalPage(1);
                    loadCustomers({ page: 1, pageSize: size });
                  }}
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
