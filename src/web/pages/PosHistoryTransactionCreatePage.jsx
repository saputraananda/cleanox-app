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
  Plus,
  Minus,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';
import TablePagination, { PAGE_SIZE_OPTIONS } from '@web/components/TablePagination.jsx';
import {
  calculateGcBillingHours,
  getGcCrewSizeFromItems,
  isGeneralCleaningCategory,
  parseGcCrewSizeFromServiceName,
} from '@web/utils/posGeneralCleaningBilling.js';
import { resolveEffectiveBasePrice } from '@web/utils/posServicePrice.js';
import {
  formatMeterDimensionsLabel,
  getBillableMultiplier,
  isMeterPricedService,
  resolveMeterFromDimensions,
} from '@web/utils/posMeterServices.js';
import { isBlankAddress } from '@web/utils/posCustomerAddress.js';
import { computeTransactionPromoDiscount } from '@web/utils/posTransactionPromo.js';

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

function emptyItemDraft() {
  return {
    service_id: '',
    qty: 1,
    meter_length: '',
    meter_width: '',
  };
}

export default function PosHistoryTransactionCreatePage() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [serviceCategoriesMaster, setServiceCategoriesMaster] = useState([]);
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
    service_mode: 'home_service',
    payment_method_id: '',
    promo_id: '',
  });
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentGroup, setPaymentGroup] = useState('');
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [itemDraft, setItemDraft] = useState(emptyItemDraft());
  const [itemModalError, setItemModalError] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');

  const gcCrewInfo = useMemo(
    () => getGcCrewSizeFromItems(form.items, services),
    [form.items, services]
  );

  const jobStartedAt = combineDateTime(form.service_date, form.start_time);
  const jobEndedAt = combineDateTime(form.service_date, form.end_time);

  const pricingPreview = useMemo(() => {
    let hours = null;
    let hoursOk = false;
    if (jobStartedAt && jobEndedAt) {
      try {
        hours = calculateGcBillingHours({
          startedAt: jobStartedAt,
          completedAt: jobEndedAt,
        });
        hoursOk = true;
      } catch {
        hoursOk = false;
      }
    }

    let subtotal = 0;
    let hasGc = false;
    const gcRates = [];

    for (const item of form.items) {
      const service = services.find((row) => Number(row.id) === Number(item.service_id));
      if (!service) continue;
      const isGc = isGeneralCleaningCategory(service.category_name);
      const qty = Math.max(1, Number(item.qty || 1));
      const base = resolveEffectiveBasePrice(service);
      const rateFinal = base;

      if (isGc) {
        hasGc = true;
        gcRates.push({
          name: service.name,
          rate: rateFinal,
          crew: parseGcCrewSizeFromServiceName(service.name) || Number(form.total_people || 1),
        });
        if (hoursOk && hours != null) {
          subtotal += base * hours;
        }
        continue;
      }

      const billable = getBillableMultiplier({
        serviceName: service.name,
        qty,
        meter: item.meter,
      });
      subtotal += base * billable;
    }

    const selectedPromo = (form.items || [])
      .flatMap((item) => {
        const service = services.find((row) => Number(row.id) === Number(item.service_id));
        return service?.promos || [];
      })
      .find((row) => Number(row.id) === Number(form.promo_id));

    const { discountAmount: discount } = computeTransactionPromoDiscount({
      subtotal,
      promoType: selectedPromo?.promo_type || null,
      promoValue: selectedPromo?.promo_value ?? null,
    });

    return {
      hours,
      hoursOk,
      hasGc,
      gcRates,
      subtotal,
      discount,
      finalAmount: subtotal - discount,
      needsHours: hasGc,
    };
  }, [form.items, form.promo_id, form.total_people, jobEndedAt, jobStartedAt, services]);

  const availablePromos = useMemo(() => {
    const map = new Map();
    for (const item of form.items || []) {
      const service = services.find((row) => Number(row.id) === Number(item.service_id));
      for (const promo of service?.promos || []) {
        if (!map.has(Number(promo.id))) map.set(Number(promo.id), promo);
      }
    }
    return [...map.values()];
  }, [form.items, services]);

  useEffect(() => {
    if (!form.promo_id) return;
    const stillValid = availablePromos.some((row) => Number(row.id) === Number(form.promo_id));
    if (!stillValid) {
      setForm((prev) => ({ ...prev, promo_id: '' }));
    }
  }, [availablePromos, form.promo_id]);

  const serviceCategories = useMemo(() => {
    const cats = [...serviceCategoriesMaster]
      .map((row) => ({ id: Number(row.id), name: row.name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
    const hasUncategorized = services.some((service) => service.category_id == null);
    const list = [{ id: 'all', name: 'Semua' }, ...cats];
    if (hasUncategorized) list.push({ id: 'none', name: 'Lainnya' });
    return list;
  }, [serviceCategoriesMaster, services]);

  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLowerCase();
    return services.filter((service) => {
      if (selectedCategoryId === 'none') {
        if (service.category_id != null) return false;
      } else if (selectedCategoryId !== 'all') {
        if (Number(service.category_id) !== Number(selectedCategoryId)) return false;
      }
      if (!term) return true;
      return String(service.name || '')
        .toLowerCase()
        .includes(term);
    });
  }, [services, serviceSearch, selectedCategoryId]);

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
        const [serviceRes, workerRes, paymentRes] = await Promise.all([
          api.get('/pos-transactions/services'),
          api.get('/pos-transactions/workers'),
          api.get('/pos-master/payment-methods', { params: { is_active: 1 } }),
        ]);
        setServices(serviceRes.data.services || []);
        setServiceCategoriesMaster(serviceRes.data.categories || []);
        setWorkers(workerRes.data.workers || []);
        setPaymentMethods(paymentRes.data.data || []);
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
      if (
        Number(prev.total_people) === gcCrewInfo.crewSize &&
        prev.worker_ids.length <= gcCrewInfo.crewSize
      ) {
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

  const resetServicePickerFilters = (categoryId = 'all') => {
    setServiceSearch('');
    setSelectedCategoryId(categoryId);
  };

  const openAddItemModal = () => {
    setEditingItemIndex(null);
    setItemDraft(emptyItemDraft());
    setItemModalError('');
    resetServicePickerFilters('all');
    setItemModalOpen(true);
  };

  const openEditItemModal = (index) => {
    const item = form.items[index];
    const service = services.find((row) => Number(row.id) === Number(item.service_id));
    const categoryId =
      service?.category_id == null ? (service ? 'none' : 'all') : Number(service.category_id);
    setEditingItemIndex(index);
    setItemDraft({
      service_id: item.service_id || '',
      qty: Math.max(1, Number(item.qty || 1)),
      meter_length:
        item.meter_length != null && item.meter_length !== ''
          ? String(item.meter_length)
          : item.meter != null && item.meter !== ''
            ? String(item.meter)
            : '',
      meter_width:
        item.meter_width != null && item.meter_width !== ''
          ? String(item.meter_width)
          : item.meter != null && item.meter !== ''
            ? '1'
            : '',
    });
    setItemModalError('');
    resetServicePickerFilters(categoryId);
    setItemModalOpen(true);
  };

  const closeItemModal = () => {
    setItemModalOpen(false);
    setEditingItemIndex(null);
    setItemDraft(emptyItemDraft());
    setItemModalError('');
    resetServicePickerFilters('all');
  };

  const handleItemDraftChange = (key, value) => {
    setItemDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'service_id') {
        const nextService = services.find((row) => Number(row.id) === Number(value));
        if (!isMeterPricedService(nextService?.name)) {
          next.meter_length = '';
          next.meter_width = '';
        }
      }
      return next;
    });
  };

  const handleSaveItemModal = (e) => {
    e.preventDefault();
    if (!itemDraft.service_id) {
      setItemModalError('Pilih service terlebih dahulu');
      return;
    }

    const service = services.find((row) => Number(row.id) === Number(itemDraft.service_id));
    const needsMeter = isMeterPricedService(service?.name);
    const lengthValue = Number(itemDraft.meter_length);
    const widthValue = Number(itemDraft.meter_width);
    const meterValue = resolveMeterFromDimensions({
      serviceName: service?.name,
      length: itemDraft.meter_length,
      width: itemDraft.meter_width,
    });
    // Meter ukuran opsional — bisa diisi nanti di detail

    const qtyValue = Math.max(1, Number(itemDraft.qty || 1));
    const nextItemsPreview =
      editingItemIndex === null
        ? [
            ...form.items,
            {
              service_id: itemDraft.service_id,
              qty: qtyValue,
              meter: needsMeter ? meterValue : null,
              meter_length: needsMeter && meterValue != null ? lengthValue : null,
              meter_width: needsMeter && meterValue != null ? widthValue : null,
            },
          ]
        : form.items.map((item, idx) =>
            idx === editingItemIndex
              ? {
                  service_id: itemDraft.service_id,
                  qty: qtyValue,
                  meter: needsMeter ? meterValue : null,
                  meter_length: needsMeter && meterValue != null ? lengthValue : null,
                  meter_width: needsMeter && meterValue != null ? widthValue : null,
                }
              : item
          );
    const crewCheck = getGcCrewSizeFromItems(nextItemsPreview, services);
    if (!crewCheck.ok) {
      setItemModalError(crewCheck.error);
      return;
    }

    const isGc = isGeneralCleaningCategory(service?.category_name);
    const payload = {
      service_id: itemDraft.service_id,
      qty: isGc ? 1 : qtyValue,
      meter: isGc || !needsMeter ? null : meterValue,
      meter_length: isGc || !needsMeter || meterValue == null ? null : lengthValue,
      meter_width: isGc || !needsMeter || meterValue == null ? null : widthValue,
    };

    setForm((prev) => {
      const nextItems =
        editingItemIndex === null
          ? [...prev.items, payload]
          : prev.items.map((item, idx) => (idx === editingItemIndex ? payload : item));
      const nextCrew = getGcCrewSizeFromItems(nextItems, services);
      const nextPeople =
        nextCrew.hasGc && nextCrew.crewSize ? nextCrew.crewSize : prev.total_people;
      return {
        ...prev,
        items: nextItems,
        total_people: nextPeople,
        worker_ids: prev.worker_ids.slice(0, Math.max(1, Number(nextPeople || 1))),
      };
    });
    closeItemModal();
  };

  const removeItem = (index) => {
    setForm((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index);
      const nextCrew = getGcCrewSizeFromItems(nextItems, services);
      const nextPeople =
        nextCrew.hasGc && nextCrew.crewSize ? nextCrew.crewSize : prev.total_people;
      return {
        ...prev,
        items: nextItems,
        total_people: nextPeople,
        worker_ids: prev.worker_ids.slice(0, Math.max(1, Number(nextPeople || 1))),
      };
    });
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
        setError(`Maksimal ${max} pekerja`);
        return prev;
      }
      setError('');
      return { ...prev, worker_ids: [...prev.worker_ids, workerId] };
    });
  };

  const handlePeopleChange = (value) => {
    if (gcCrewInfo.hasGc) return;
    const nextPeople = Math.max(1, Number(value || 1));
    setForm((prev) => ({
      ...prev,
      total_people: nextPeople,
      worker_ids: prev.worker_ids.slice(0, nextPeople),
    }));
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
    if (!jobStartedAt || !jobEndedAt || !pricingPreview.hoursOk) {
      setError('Jam selesai harus setelah jam mulai');
      return;
    }
    if (!form.items.length) {
      setError('Tambah minimal 1 item service');
      return;
    }
    if (!gcCrewInfo.ok) {
      setError(gcCrewInfo.error || 'Paket General Cleaning tidak valid');
      return;
    }
    if (form.worker_ids.length < 1) {
      setError('Pilih minimal 1 pekerja');
      return;
    }
    if (gcCrewInfo.hasGc && form.worker_ids.length !== Number(form.total_people || 1)) {
      setError(`Pilih tepat ${form.total_people} pekerja sesuai paket General Cleaning`);
      return;
    }
    if (!form.payment_method_id) {
      setError('Metode pembayaran wajib dipilih');
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
        service_mode: form.service_mode || 'home_service',
        payment_method_id: Number(form.payment_method_id),
        promo_id: form.promo_id ? Number(form.promo_id) : null,
        worker_ids: form.worker_ids,
        items: form.items.map((item) => ({
          service_id: Number(item.service_id),
          qty: Number(item.qty || 1),
          meter: item.meter == null || item.meter === '' ? null : Number(item.meter),
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

  const draftService = services.find((row) => Number(row.id) === Number(itemDraft.service_id));
  const draftNeedsMeter = isMeterPricedService(draftService?.name);
  const draftIsGc = isGeneralCleaningCategory(draftService?.category_name);
  const draftArea = resolveMeterFromDimensions({
    serviceName: draftService?.name,
    length: itemDraft.meter_length,
    width: itemDraft.meter_width,
  });

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
          Pola sama seperti tambah transaksi, untuk pencatatan history. GC dihitung dari jam
          mulai/selesai. Tidak muncul di mobile.
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
              <p className={labelEyebrowClass}>2 Jadwal & Mode</p>
              <h2 className="text-[14px] font-bold text-slate-900">
                Tanggal, jam, dan mode layanan
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'home_service', label: 'Home Service' },
              { value: 'take_home', label: 'Take Home' },
            ].map((option) => {
              const active = form.service_mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, service_mode: option.value }))}
                  className={`rounded-[12px] border px-3 py-2 text-[12.5px] font-semibold ${
                    active
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
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
          {pricingPreview.hoursOk && (
            <p className="text-[12.5px] text-slate-500">
              Durasi ditagih GC:{' '}
              <span className="font-semibold text-slate-800">{pricingPreview.hours} jam</span>
              {!pricingPreview.hasGc && ' (tidak dipakai jika tanpa GC)'}
            </p>
          )}
        </section>

        <section className={sectionCardClass}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-50 text-blue-700">
                <Package className="w-[18px] h-[18px]" />
              </div>
              <div>
                <p className={labelEyebrowClass}>3 Item Service</p>
                <h2 className="text-[14px] font-bold text-slate-900">Semua layanan</h2>
                <p className="mt-0.5 text-[11.5px] text-slate-500">
                  Sama seperti tambah transaksi. GC dihitung dari jam mulai/selesai.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openAddItemModal}
              className="inline-flex items-center gap-1.5 rounded-[12px] border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] font-semibold text-blue-700"
            >
              <Plus className="w-4 h-4" />
              Tambah Item
            </button>
          </div>

          {form.items.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-[13px] font-semibold text-slate-700">Belum ada item</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {form.items.map((item, index) => {
                const service = services.find((row) => Number(row.id) === Number(item.service_id));
                const qty = Math.max(1, Number(item.qty || 1));
                const base = resolveEffectiveBasePrice(service || {});
                const rateFinal = base;
                const isGc = isGeneralCleaningCategory(service?.category_name);
                const crew =
                  parseGcCrewSizeFromServiceName(service?.name) ||
                  Number(form.total_people || 1);
                const billable = isGc
                  ? 1
                  : getBillableMultiplier({
                      serviceName: service?.name,
                      qty,
                      meter: item.meter,
                    });
                const lineTotal =
                  isGc && pricingPreview.hoursOk
                    ? rateFinal * pricingPreview.hours
                    : isGc
                      ? 0
                      : rateFinal * billable;

                return (
                  <div
                    key={`${item.service_id}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-[16px] border border-slate-200 bg-slate-50/80 px-4 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
                          Item {index + 1}
                        </span>
                        {isGc && (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                            General Cleaning
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-[14px] font-bold text-slate-900 truncate">
                        {service?.name || 'Service tidak ditemukan'}
                      </p>
                      <p className="mt-1 text-[11.5px] text-slate-500">
                        {isGc
                          ? `Rp ${rateFinal.toLocaleString('id-ID')} / ${crew} Teknisi / Jam`
                          : `Qty ${qty}${
                              formatMeterDimensionsLabel({
                                length: item.meter_length,
                                width: item.meter_width,
                                meter: item.meter,
                              })
                                ? ` · ${formatMeterDimensionsLabel({
                                    length: item.meter_length,
                                    width: item.meter_width,
                                    meter: item.meter,
                                  })}`
                                : ''
                            }`}
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-slate-800">
                        {isGc && !pricingPreview.hoursOk
                          ? 'Pending jam'
                          : formatCurrency(lineTotal)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditItemModal(index)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600"
                        aria-label="Edit item"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-rose-200 bg-rose-50 text-rose-600"
                        aria-label="Hapus item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
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
              {!gcCrewInfo.hasGc && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[12px] text-slate-500">Jumlah orang</span>
                  <button
                    type="button"
                    onClick={() => handlePeopleChange(Number(form.total_people || 1) - 1)}
                    disabled={Number(form.total_people || 1) <= 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-white disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="min-w-[1.5rem] text-center font-bold text-slate-800">
                    {form.total_people}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePeopleChange(Number(form.total_people || 1) + 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
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
          <p className="text-[13px] font-semibold text-slate-800">Pembayaran</p>
          <p className="mt-1 text-[11.5px] text-slate-400">
            Status default belum lunas — bukti diunggah di detail transaksi
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Tunai', 'BCA', 'EDC'].map((group) => {
              const selectedMethod = paymentMethods.find(
                (m) => Number(m.id) === Number(form.payment_method_id)
              );
              const active = (paymentGroup || selectedMethod?.method_group || '') === group;
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => {
                    setPaymentGroup(group);
                    if (group === 'EDC') {
                      const stillEdc = paymentMethods.some(
                        (m) =>
                          m.method_group === 'EDC' &&
                          Number(m.id) === Number(form.payment_method_id)
                      );
                      if (!stillEdc) {
                        setForm((prev) => ({ ...prev, payment_method_id: '' }));
                      }
                      return;
                    }
                    const method = paymentMethods.find((m) => m.method_group === group);
                    setForm((prev) => ({
                      ...prev,
                      payment_method_id: method ? String(method.id) : '',
                    }));
                  }}
                  className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {group}
                </button>
              );
            })}
          </div>
          {(() => {
            const selectedMethod = paymentMethods.find(
              (m) => Number(m.id) === Number(form.payment_method_id)
            );
            const group = paymentGroup || selectedMethod?.method_group || '';
            if (group === 'BCA' && selectedMethod) {
              return (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {selectedMethod.label}
                </p>
              );
            }
            if (group === 'EDC') {
              return (
                <label className="mt-3 block space-y-1.5">
                  <span className="text-[12px] font-semibold text-slate-600">Jenis kartu EDC BCA</span>
                  <select
                    value={form.payment_method_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, payment_method_id: e.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">Pilih jenis kartu</option>
                    {paymentMethods
                      .filter((m) => m.method_group === 'EDC')
                      .map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                  </select>
                </label>
              );
            }
            return null;
          })()}
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
          <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-600">Promo (satu transaksi)</span>
              <select
                className={inputClass}
                value={form.promo_id}
                onChange={(e) => setForm((prev) => ({ ...prev, promo_id: e.target.value }))}
                disabled={form.items.length === 0}
              >
                <option value="">Tanpa promo</option>
                {availablePromos.map((promo) => (
                  <option key={promo.id} value={promo.id}>
                    {promo.name} -{' '}
                    {promo.promo_type === 'persen'
                      ? `${promo.promo_value}%`
                      : `Rp ${Number(promo.promo_value || 0).toLocaleString('id-ID')}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Estimasi total
            </p>
            {pricingPreview.hasGc &&
              pricingPreview.gcRates.map((row, idx) => (
                <p key={`${row.name}-${idx}`} className="text-[12px] text-slate-500">
                  GC: Rp {Number(row.rate || 0).toLocaleString('id-ID')} / {row.crew} Teknisi / Jam
                </p>
              ))}
            <p className="mt-1 text-[22px] font-bold text-slate-900">
              {pricingPreview.needsHours && !pricingPreview.hoursOk
                ? '—'
                : formatCurrency(pricingPreview.finalAmount)}
            </p>
            <p className="text-[12px] text-slate-500">
              Diskon {formatCurrency(pricingPreview.discount)}
              {pricingPreview.hasGc && pricingPreview.hoursOk
                ? ` · GC ${pricingPreview.hours} jam`
                : ''}
            </p>
            </div>
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

      {itemModalOpen && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={closeItemModal}
          >
            <div
              className="flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className={labelEyebrowClass}>Item Service</p>
                  <h2 className="mt-1 text-[16px] font-extrabold text-slate-900">
                    {editingItemIndex === null ? 'Tambah Item' : `Edit Item ${editingItemIndex + 1}`}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeItemModal}
                  className="rounded-[10px] p-1.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {itemModalError && (
                  <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700">
                    {itemModalError}
                  </div>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Cari service..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {serviceCategories.map((cat) => {
                    const active = selectedCategoryId === cat.id;
                    return (
                      <button
                        key={String(cat.id)}
                        type="button"
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`inline-flex shrink-0 rounded-[12px] border px-3 py-2 text-[12.5px] font-semibold ${
                          active
                            ? 'border-blue-300 bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredServices.map((service) => {
                    const selected = Number(itemDraft.service_id) === Number(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleItemDraftChange('service_id', String(service.id))}
                        className={`rounded-[16px] border px-4 py-3.5 text-left ${
                          selected
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <p className="line-clamp-2 text-[13px] font-bold text-slate-900">
                          {service.name}
                        </p>
                        <p className="mt-2 font-sans text-[13px] font-bold text-blue-700">
                          Rp {Number(resolveEffectiveBasePrice(service) || 0).toLocaleString('id-ID')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form
                onSubmit={handleSaveItemModal}
                className="shrink-0 space-y-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4"
              >
                <div
                  className={`grid grid-cols-1 gap-3 ${
                    draftNeedsMeter && !draftIsGc ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                  }`}
                >
                  <label className="block space-y-1.5">
                    <span className={labelEyebrowClass}>Qty</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleItemDraftChange('qty', Math.max(1, Number(itemDraft.qty || 1) - 1))
                        }
                        disabled={draftIsGc || Number(itemDraft.qty || 1) <= 1}
                        className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border border-slate-200 bg-white disabled:opacity-40"
                      >
                        <Minus className="w-[18px] h-[18px]" />
                      </button>
                      <input
                        type="text"
                        readOnly
                        value={draftIsGc ? 1 : itemDraft.qty}
                        className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-center font-sans text-[16px] font-bold text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleItemDraftChange('qty', Math.max(1, Number(itemDraft.qty || 1) + 1))
                        }
                        disabled={draftIsGc}
                        className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-white disabled:opacity-40"
                        style={primaryBtnStyle}
                      >
                        <Plus className="w-[18px] h-[18px]" />
                      </button>
                    </div>
                    {draftIsGc && (
                      <p className="text-[11px] text-slate-500">
                        Qty GC mengikuti jam mulai/selesai
                      </p>
                    )}
                  </label>

                  {draftNeedsMeter && !draftIsGc && (
                    <div className="block space-y-1.5">
                      <span className={labelEyebrowClass}>Ukuran (panjang × lebar)</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={itemDraft.meter_length}
                          onChange={(e) => handleItemDraftChange('meter_length', e.target.value)}
                          className={inputClass}
                          placeholder="P"
                        />
                        <span className="text-sm font-bold text-slate-400">×</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={itemDraft.meter_width}
                          onChange={(e) => handleItemDraftChange('meter_width', e.target.value)}
                          className={inputClass}
                          placeholder="L"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {draftArea != null ? `Total ${draftArea} m²` : 'Opsional — bisa diisi nanti di detail transaksi'}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeItemModal}
                    className="rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white"
                    style={primaryBtnStyle}
                  >
                    {editingItemIndex === null ? 'Tambah Item' : 'Simpan Perubahan'}
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
