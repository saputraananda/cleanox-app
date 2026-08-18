import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Minus,
  X,
  Check,
  Users,
  CalendarDays,
  UserCheck,
  Package,
  MessageSquareText,
  ClipboardList,
  Lock,
  Pencil,
  Trash2,
  Copy,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import CustomerFormFields, {
  emptyCustomerForm,
  formToPayload,
} from '@web/components/CustomerFormFields.jsx';
import BodyPortal from '@web/components/BodyPortal.jsx';
import TablePagination, { PAGE_SIZE_OPTIONS } from '@web/components/TablePagination.jsx';
import { buildCustomerOrderMessage } from '@web/utils/posCustomerOrderMessage.js';
import { buildGroupOrderMessage } from '@web/utils/posGroupOrderMessage.js';
import {
  getGcCrewSizeFromItems,
  isGeneralCleaningCategory,
  parseGcCrewSizeFromServiceName,
} from '@web/utils/posGeneralCleaningBilling.js';
import { resolveEffectiveBasePrice } from '@web/utils/posServicePrice.js';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const sectionCardClass =
  'rounded-[20px] border border-slate-200/80 bg-white px-[14px] pt-5 pb-4 shadow-[0_0_0_1px_rgba(0,0,0,.03),0_8px_28px_rgba(15,23,42,.04)] space-y-4';

const labelEyebrowClass =
  'text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400';

const primaryBtnStyle = { background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)' };

const STEPS = [
  { key: 'customer', label: '1 Customer' },
  { key: 'schedule', label: '2 Jadwal' },
  { key: 'workers', label: '3 Pekerja' },
  { key: 'items', label: '4 Item' },
];

function getInitials(name = '') {
  return String(name)
    .replace(/^\[TEST\]\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function combineServiceDate(date, time) {
  if (!date) return '';
  return `${date}T${time || '09:00'}`;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
}

function normalizeTimeInput(value) {
  const raw = String(value).trim();
  if (!raw) return '';

  if (isValidTime(raw)) return raw;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  let hours;
  let minutes;

  if (raw.includes(':')) {
    const [hourPart = '', minutePart = ''] = raw.split(':');
    hours = Number(hourPart);
    minutes = Number((minutePart + '0').slice(0, 2));
  } else if (digits.length <= 2) {
    hours = Number(digits);
    minutes = 0;
  } else if (digits.length === 3) {
    hours = Number(digits.slice(0, 1));
    minutes = Number(digits.slice(1));
  } else {
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2, 4));
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  if (hours > 23 || minutes > 59) return '';

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-[11.5px] text-slate-500">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function LockedStep({ icon: Icon, title, hint }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-8 text-center shadow-[0_0_0_1px_rgba(0,0,0,.03)] transition duration-150">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] text-slate-500"
        style={{ background: 'linear-gradient(135deg, #F1F5F9 0%, #F8FAFC 100%)' }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
        <Lock className="w-3 h-3" />
        Terkunci
      </div>
      <h3 className="mt-3 text-[14px] font-bold tracking-[-0.01em] text-slate-900">{title}</h3>
      <p className="mt-1.5 text-[12.5px] text-slate-500 max-w-sm mx-auto">{hint}</p>
    </div>
  );
}

export default function PosTransactionCreatePage() {
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
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [error, setError] = useState('');
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState(emptyCustomerForm);
  const [form, setForm] = useState({
    service_date: '',
    total_people: 1,
    notes: '',
    items: [],
    worker_ids: [],
    service_mode: 'home_service',
  });
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [itemDraft, setItemDraft] = useState({ service_id: '', qty: 1, promo_id: '' });
  const [itemModalError, setItemModalError] = useState('');
  const [deleteItemIndex, setDeleteItemIndex] = useState(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  const hasSchedule = Boolean(form.service_date);
  const maxWorkers = Math.max(1, Number(form.total_people || 1));
  const hasWorkers = form.worker_ids.length >= 1;
  const canShowWorkers = Boolean(selectedCustomer) && hasSchedule;
  const canShowItems = canShowWorkers && hasWorkers;
  const activeStepKey = !selectedCustomer
    ? 'customer'
    : !hasSchedule
      ? 'schedule'
      : !hasWorkers
        ? 'workers'
        : 'items';

  const loadCustomers = async ({ search = '', page = 1, pageSize = customerModalPageSize } = {}) => {
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

  const handleSelectCustomer = async (row) => {
    setError('');
    try {
      if (row.needs_ensure && row.legacy_id_konsumen) {
        const { data } = await api.post('/pos-customers/ensure-legacy', {
          id_konsumen: row.legacy_id_konsumen,
        });
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

  const getCustomerSourceLabel = (row) => {
    if (row.source_system === 'smartlink') return 'Smartlink';
    if (row.source_system === 'pos_legacy') return 'POS · Legacy';
    return 'POS';
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [serviceRes] = await Promise.all([
          api.get('/pos-transactions/services'),
          loadCustomers({ search: '', page: 1, pageSize: PAGE_SIZE_OPTIONS[0] || 10 }),
        ]);
        setServices(serviceRes.data.services || []);
        setServiceCategoriesMaster(serviceRes.data.categories || []);
        const workerRes = await api.get('/pos-transactions/workers');
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
    if (!form.service_date) return undefined;
    let cancelled = false;
    const loadBusyWorkers = async () => {
      try {
        const { data } = await api.get('/pos-transactions/workers', {
          params: { service_date: form.service_date },
        });
        if (cancelled) return;
        const nextWorkers = data.workers || [];
        setWorkers(nextWorkers);
        setForm((prev) => {
          const allowed = prev.worker_ids.filter((id) => {
            const row = nextWorkers.find((w) => Number(w.employee_id) === Number(id));
            return row && !row.is_busy;
          });
          if (allowed.length === prev.worker_ids.length) return prev;
          return { ...prev, worker_ids: allowed };
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Gagal memuat ketersediaan pekerja');
        }
      }
    };
    loadBusyWorkers();
    return () => {
      cancelled = true;
    };
  }, [form.service_date]);

  useEffect(() => {
    setForm((prev) => {
      const max = Math.max(1, Number(prev.total_people || 1));
      if (prev.worker_ids.length <= max) return prev;
      return { ...prev, worker_ids: prev.worker_ids.slice(0, max) };
    });
  }, [form.total_people]);

  const selectedTotals = useMemo(() => {
    return form.items.reduce(
      (acc, item) => {
        const service = services.find((row) => Number(row.id) === Number(item.service_id));
        if (!service) return acc;

        const isGc = isGeneralCleaningCategory(service.category_name);
        const qty = Math.max(1, Number(item.qty || 1));
        const promo = service.promos?.find((row) => Number(row.id) === Number(item.promo_id));
        const base = resolveEffectiveBasePrice(service);
        const discountPerUnit = promo
          ? promo.promo_type === 'persen'
            ? (base * Number(promo.promo_value || 0)) / 100
            : Number(promo.promo_value || 0)
          : 0;
        const safeDiscountPerUnit = Math.min(base, discountPerUnit);
        const finalPrice = Math.max(0, base - safeDiscountPerUnit);

        if (isGc) {
          acc.hasGc = true;
          acc.gcRates.push({
            name: service.name,
            rate: finalPrice,
            crew: parseGcCrewSizeFromServiceName(service.name) || Number(form.total_people || 1),
          });
          return acc;
        }

        acc.subtotal += base * qty;
        acc.discount += safeDiscountPerUnit * qty;
        return acc;
      },
      { subtotal: 0, discount: 0, hasGc: false, gcRates: [] }
    );
  }, [form.items, form.total_people, services]);

  const gcCrewInfo = useMemo(
    () => getGcCrewSizeFromItems(form.items, services),
    [form.items, services]
  );

  useEffect(() => {
    if (!gcCrewInfo.ok || !gcCrewInfo.hasGc || !gcCrewInfo.crewSize) return;
    setForm((prev) => {
      const crew = gcCrewInfo.crewSize;
      if (Number(prev.total_people) === crew && prev.worker_ids.length <= crew) return prev;
      return {
        ...prev,
        total_people: crew,
        worker_ids: prev.worker_ids.slice(0, crew),
      };
    });
  }, [gcCrewInfo]);

  const customerMessagePreview = useMemo(() => {
    const messageItems = form.items
      .map((item) => {
        const service = services.find((row) => Number(row.id) === Number(item.service_id));
        if (!service) return null;

        const qty = Math.max(1, Number(item.qty || 1));
        const promo = service.promos?.find((row) => Number(row.id) === Number(item.promo_id));
        const base = resolveEffectiveBasePrice(service);
        const originalPrice =
          service.coret_price != null && service.coret_price !== ''
            ? Number(service.price || 0)
            : null;
        const discountPerUnit = promo
          ? promo.promo_type === 'persen'
            ? (base * Number(promo.promo_value || 0)) / 100
            : Number(promo.promo_value || 0)
          : 0;
        const safeDiscountPerUnit = Math.min(base, discountPerUnit);
        const finalPrice = Math.max(0, base - safeDiscountPerUnit);
        const isGc = isGeneralCleaningCategory(service.category_name);

        return {
          service_name: service.name,
          qty: isGc ? 1 : qty,
          base_price: base,
          original_price: originalPrice,
          final_price_per_unit: finalPrice,
          line_total: isGc ? 0 : finalPrice * qty,
          promo_type: promo?.promo_type || null,
          promo_value: promo ? Number(promo.promo_value || 0) : null,
          category_name: service.category_name || null,
        };
      })
      .filter(Boolean);

    return buildCustomerOrderMessage({
      customerName: selectedCustomer?.name || '-',
      customerPhone: selectedCustomer?.phone || null,
      customerAddress: selectedCustomer?.address || null,
      serviceDate: form.service_date,
      items: messageItems,
      totalPeople: form.total_people,
      finalAmount: selectedTotals.subtotal - selectedTotals.discount,
      pricingFinalized: false,
    });
  }, [form.items, form.service_date, form.total_people, selectedCustomer, selectedTotals, services]);

  const selectedWorkers = useMemo(() => {
    return form.worker_ids
      .map((workerId) => workers.find((row) => Number(row.employee_id) === Number(workerId)))
      .filter(Boolean);
  }, [form.worker_ids, workers]);

  const groupMessagePreview = useMemo(() => {
    const messageItems = form.items
      .map((item) => {
        const service = services.find((row) => Number(row.id) === Number(item.service_id));
        if (!service) return null;

        const qty = Math.max(1, Number(item.qty || 1));
        const promo = service.promos?.find((row) => Number(row.id) === Number(item.promo_id));
        const base = resolveEffectiveBasePrice(service);
        const originalPrice =
          service.coret_price != null && service.coret_price !== ''
            ? Number(service.price || 0)
            : null;
        const discountPerUnit = promo
          ? promo.promo_type === 'persen'
            ? (base * Number(promo.promo_value || 0)) / 100
            : Number(promo.promo_value || 0)
          : 0;
        const safeDiscountPerUnit = Math.min(base, discountPerUnit);
        const finalPrice = Math.max(0, base - safeDiscountPerUnit);
        const isGc = isGeneralCleaningCategory(service.category_name);

        return {
          service_name: service.name,
          qty: isGc ? 1 : qty,
          base_price: base,
          original_price: originalPrice,
          final_price_per_unit: finalPrice,
          line_total: isGc ? 0 : finalPrice * qty,
          promo_type: promo?.promo_type || null,
          promo_value: promo ? Number(promo.promo_value || 0) : null,
          category_name: service.category_name || null,
        };
      })
      .filter(Boolean);

    return buildGroupOrderMessage({
      customerName: selectedCustomer?.name || '-',
      customerPhone: selectedCustomer?.phone || null,
      customerAddress: selectedCustomer?.address || null,
      serviceDate: form.service_date,
      items: messageItems,
      totalPeople: form.total_people,
      notes: form.notes,
      finalAmount: selectedTotals.subtotal - selectedTotals.discount,
      pricingFinalized: false,
      workers: selectedWorkers.map((worker) => ({
        full_name: worker.full_name,
        phone_number: worker.phone_number,
      })),
    });
  }, [
    form.items,
    form.notes,
    form.service_date,
    form.total_people,
    selectedCustomer,
    selectedTotals,
    selectedWorkers,
    services,
  ]);

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

  const resetServicePickerFilters = (categoryId = 'all') => {
    setServiceSearch('');
    setSelectedCategoryId(categoryId);
  };

  const openAddItemModal = () => {
    setEditingItemIndex(null);
    setItemDraft({ service_id: '', qty: 1, promo_id: '' });
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
      promo_id: item.promo_id || '',
    });
    setItemModalError('');
    resetServicePickerFilters(categoryId);
    setItemModalOpen(true);
  };

  const closeItemModal = () => {
    setItemModalOpen(false);
    setEditingItemIndex(null);
    setItemDraft({ service_id: '', qty: 1, promo_id: '' });
    setItemModalError('');
    resetServicePickerFilters('all');
  };

  const handleItemDraftChange = (key, value) => {
    setItemDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'service_id') next.promo_id = '';
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
    const nextItemsPreview =
      editingItemIndex === null
        ? [...form.items, { service_id: itemDraft.service_id, qty: 1, promo_id: itemDraft.promo_id || '' }]
        : form.items.map((item, idx) =>
            idx === editingItemIndex
              ? {
                  service_id: itemDraft.service_id,
                  qty: Math.max(1, Number(itemDraft.qty || 1)),
                  promo_id: itemDraft.promo_id || '',
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
      qty: isGc ? 1 : Math.max(1, Number(itemDraft.qty || 1)),
      promo_id: itemDraft.promo_id || '',
    };

    setForm((prev) => {
      const nextItems =
        editingItemIndex === null
          ? [...prev.items, payload]
          : prev.items.map((item, idx) => (idx === editingItemIndex ? payload : item));
      const nextCrew = getGcCrewSizeFromItems(nextItems, services);
      const nextPeople = nextCrew.hasGc && nextCrew.crewSize ? nextCrew.crewSize : prev.total_people;
      return {
        ...prev,
        items: nextItems,
        total_people: nextPeople,
        worker_ids: prev.worker_ids.slice(0, Math.max(1, Number(nextPeople || 1))),
      };
    });
    closeItemModal();
  };

  const confirmDeleteItem = () => {
    if (deleteItemIndex === null) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== deleteItemIndex),
    }));
    setDeleteItemIndex(null);
  };

  const toggleWorker = (employeeId) => {
    const workerId = Number(employeeId);
    const workerRow = workers.find((row) => Number(row.employee_id) === workerId);
    if (workerRow?.is_busy) return;
    setForm((prev) => {
      const already = prev.worker_ids.includes(workerId);
      if (already) {
        return {
          ...prev,
          worker_ids: prev.worker_ids.filter((id) => id !== workerId),
        };
      }
      const max = Math.max(1, Number(prev.total_people || 1));
      if (prev.worker_ids.length >= max) {
        return prev;
      }
      return {
        ...prev,
        worker_ids: [...prev.worker_ids, workerId],
      };
    });
  };

  const handlePeopleChange = (value) => {
    const nextPeople = Math.max(1, Number(value || 1));
    setForm((prev) => ({
      ...prev,
      total_people: nextPeople,
      worker_ids: prev.worker_ids.slice(0, nextPeople),
    }));
  };

  const syncServiceDate = (date, time) => {
    setForm((prev) => ({
      ...prev,
      service_date: date && isValidTime(time) ? combineServiceDate(date, time) : '',
    }));
  };

  const handleScheduleDateChange = (value) => {
    setScheduleDate(value);
    syncServiceDate(value, scheduleTime);
  };

  const handleScheduleTimeChange = (value) => {
    const digits = String(value).replace(/\D/g, '').slice(0, 4);
    const isBackspace = String(value).length < String(scheduleTime).length;

    let formatted = digits;
    if (digits.length >= 3) {
      formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    } else if (digits.length === 2) {
      formatted = isBackspace ? digits : `${digits}:`;
    }

    setScheduleTime(formatted);
    if (isValidTime(formatted)) {
      syncServiceDate(scheduleDate, formatted);
    } else if (!digits) {
      syncServiceDate(scheduleDate, '');
    }
  };

  const handleScheduleTimeBlur = () => {
    if (!scheduleTime.trim()) {
      setScheduleTime('');
      syncServiceDate(scheduleDate, '');
      return;
    }

    const normalized = normalizeTimeInput(scheduleTime);
    if (!normalized) {
      setScheduleTime('');
      syncServiceDate(scheduleDate, '');
      return;
    }

    setScheduleTime(normalized);
    syncServiceDate(scheduleDate, normalized);
  };

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
      setError(err.response?.data?.message || 'Gagal mengubah pagination customer');
    } finally {
      setCustomerModalLoading(false);
    }
  };

  const openCreateCustomerModal = () => {
    setNewCustomerForm(emptyCustomerForm);
    setError('');
    setShowCreateCustomer(true);
  };

  const closeCreateCustomerModal = () => {
    setShowCreateCustomer(false);
    setNewCustomerForm(emptyCustomerForm);
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    setCreatingCustomer(true);
    setError('');
    try {
      const { data } = await api.post('/pos-customers', formToPayload(newCustomerForm));
      setSelectedCustomer(data.customer);
      closeCreateCustomerModal();
      await loadCustomers({
        search: customerModalSearch,
        page: customerModalPage,
        pageSize: customerModalPageSize,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menambah customer');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomer?.id) {
      setError('Pilih customer terlebih dahulu');
      return;
    }
    if (!form.service_date) {
      setError('Tanggal layanan wajib diisi');
      return;
    }
    if (form.worker_ids.length < 1) {
      setError('Pilih minimal 1 pekerja');
      return;
    }
    if (!gcCrewInfo.ok) {
      setError(gcCrewInfo.error || 'Paket General Cleaning tidak valid');
      return;
    }
    if (gcCrewInfo.hasGc && form.worker_ids.length !== Number(form.total_people || 1)) {
      setError(`Pilih tepat ${form.total_people} pekerja sesuai paket General Cleaning`);
      return;
    }
    if (!form.items.length || form.items.some((item) => !item.service_id)) {
      setError('Tambah minimal 1 item service');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_phone: selectedCustomer.phone || null,
        customer_address: selectedCustomer.address || null,
        service_date: form.service_date,
        total_people: Number(form.total_people || 1),
        notes: form.notes,
        service_mode: form.service_mode || 'home_service',
        worker_ids: form.worker_ids,
        items: form.items.map((item) => ({
          service_id: Number(item.service_id),
          qty: Number(item.qty || 1),
          promo_id: item.promo_id ? Number(item.promo_id) : null,
        })),
      };
      const { data } = await api.post('/pos-transactions', payload);
      navigate(`/cleanox-only/transactions/${data.transaction_id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membuat transaksi POS');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 max-w-[1400px] mx-auto bg-slate-50 min-h-full">
        <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-[18px]">
          <p className={labelEyebrowClass}>Cleanox Only</p>
          <p className="mt-2 text-[14px] font-semibold text-slate-700">Memuat form transaksi...</p>
          <p className="mt-1 text-[11.5px] text-slate-400">Menyiapkan customer, service, dan worker</p>
        </div>
      </div>
    );
  }

  const finalTotal = selectedTotals.subtotal - selectedTotals.discount;
  const stepOrder = STEPS.map((s) => s.key);
  const activeIndex = stepOrder.indexOf(activeStepKey);

  return (
    <div className={`p-3 sm:p-5 space-y-5 max-w-[1400px] mx-auto bg-slate-50 min-h-full ${canShowItems ? 'pb-28' : 'pb-6'}`}>
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
            <h1 className="mt-2 text-[22px] font-extrabold tracking-[-0.01em]">Tambah Transaksi</h1>
            <p className="mt-2 max-w-xl text-[13px] text-blue-100/90">
              Isi bertahap: customer → jadwal → pekerja → item service.
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

      <section className={sectionCardClass}>
        <SectionHeader
          step="Langkah 1"
          icon={Users}
          title="Pilih Customer"
          hint="Wajib dipilih sebelum jadwal dibuka"
          action={
            <button
              type="button"
              onClick={openCreateCustomerModal}
              className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
            >
              <Plus className="w-4 h-4" />
              Tambah Customer
            </button>
          }
        />

        {selectedCustomer ? (
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
                {selectedCustomer.address && (
                  <p className="mt-1 text-[12.5px] text-emerald-700/90 line-clamp-2">
                    {selectedCustomer.address}
                  </p>
                )}
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

      {!selectedCustomer ? (
        <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-10 text-center shadow-[0_0_0_1px_rgba(0,0,0,.03)]">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] text-blue-700"
            style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
          >
            <ClipboardList className="w-6 h-6" />
          </div>
          <h3 className="mt-4 text-[14px] font-bold tracking-[-0.01em] text-slate-900">
            Mulai dari customer
          </h3>
          <p className="mt-1.5 text-[12.5px] text-slate-500 max-w-sm mx-auto">
            Pilih customer di atas untuk membuka langkah jadwal layanan.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Step 2: Jadwal only */}
          <section className={sectionCardClass}>
            <SectionHeader
              step="Langkah 2"
              icon={CalendarDays}
              title="Jadwal Layanan"
              hint="Isi tanggal dulu — pekerja baru terbuka setelah tanggal terisi"
            />
            <div className="mb-4">
              <span className={labelEyebrowClass}>Mode layanan</span>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    value: 'home_service',
                    title: 'Home Service',
                    hint: 'Pembersihan di lokasi customer',
                  },
                  {
                    value: 'take_home',
                    title: 'Take Home',
                    hint: 'Dibawa proses lalu diantar kembali',
                  },
                ].map((option) => {
                  const active = form.service_mode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, service_mode: option.value }))}
                      className={`rounded-[14px] border px-3.5 py-3 text-left transition ${
                        active
                          ? 'border-blue-400 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,.25)]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p className={`text-[13px] font-extrabold ${active ? 'text-blue-800' : 'text-slate-800'}`}>
                        {option.title}
                      </p>
                      <p className={`mt-0.5 text-[11.5px] ${active ? 'text-blue-700/80' : 'text-slate-500'}`}>
                        {option.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_320px] lg:items-start">
              <div className="space-y-1.5">
                <span className={labelEyebrowClass}>Tanggal layanan</span>
                <div className="rounded-[16px] border border-slate-200 bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.02)]">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <label className="space-y-1.5">
                    <span className="text-[11.5px] font-semibold text-slate-500">Tanggal</span>
                    <input
                      type="date"
                      required
                      value={scheduleDate}
                      onChange={(e) => handleScheduleDateChange(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[11.5px] font-semibold text-slate-500">Jam</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="09:00"
                      value={scheduleTime}
                      onChange={(e) => handleScheduleTimeChange(e.target.value)}
                      onBlur={handleScheduleTimeBlur}
                      maxLength={5}
                      className={`${inputClass} text-[15px] font-bold tracking-[-0.01em] ${
                        isValidTime(scheduleTime)
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : scheduleTime
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : ''
                      }`}
                      aria-label="Jam layanan"
                    />
                  </label>
                  </div>
                </div>
                <p className="text-[11.5px] text-slate-400">
                  Ketik jam layanan, contoh: 1230 jadi 12:30.
                </p>
              </div>
              <label className="space-y-1.5">
                <span className={labelEyebrowClass}>Jumlah orang</span>
                <div className="rounded-[16px] border border-slate-200 bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.02)]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePeopleChange(Number(form.total_people || 1) - 1)}
                    disabled={gcCrewInfo.hasGc || Number(form.total_people || 1) <= 1}
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-slate-50 text-slate-700 transition duration-150 hover:-translate-y-0.5 hover:bg-white hover:border-blue-300 active:scale-[.95] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-slate-50 disabled:hover:border-slate-200"
                    aria-label="Kurangi jumlah orang"
                  >
                    <Minus className="w-[18px] h-[18px]" strokeWidth={2} />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    readOnly
                    value={form.total_people}
                    className="w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-sans text-[16px] font-bold tracking-[-0.01em] text-slate-800"
                    aria-label="Jumlah orang"
                  />
                  <button
                    type="button"
                    onClick={() => handlePeopleChange(Number(form.total_people || 1) + 1)}
                    disabled={gcCrewInfo.hasGc}
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.95] disabled:opacity-40"
                    style={primaryBtnStyle}
                    aria-label="Tambah jumlah orang"
                  >
                    <Plus className="w-[18px] h-[18px]" strokeWidth={2} />
                  </button>
                </div>
                </div>
                <p className="text-[11.5px] text-slate-400">
                  {gcCrewInfo.hasGc
                    ? 'Jumlah teknisi mengikuti paket General Cleaning'
                    : `Maksimal pekerja yang bisa dipilih: ${maxWorkers}`}
                </p>
              </label>
            </div>
            {!hasSchedule && (
              <p className="rounded-[12px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-[12.5px] text-blue-700">
                Isi tanggal layanan untuk membuka pemilihan pekerja.
              </p>
            )}
          </section>

          {/* Step 3: Workers */}
          {!canShowWorkers ? (
            <LockedStep
              icon={UserCheck}
              title="Pilih pekerja menunggu jadwal"
              hint="Isi tanggal layanan dulu. Jumlah pekerja mengikuti jumlah orang."
            />
          ) : (
            <section className={`${sectionCardClass} transition duration-150`}>
              <SectionHeader
                step="Langkah 3"
                icon={UserCheck}
                title="Pilih Pekerja"
                hint="Pilih siapa yang bertugas — tidak perlu tepat penuh"
                action={
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    {form.worker_ids.length} / {maxWorkers} dipilih
                  </span>
                }
              />
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {workers.map((worker) => {
                  const checked = form.worker_ids.includes(Number(worker.employee_id));
                  const busy = Boolean(worker.is_busy);
                  const atLimit = !checked && form.worker_ids.length >= maxWorkers;
                  const disabled = busy || atLimit;
                  return (
                    <label
                      key={worker.employee_id}
                      className={`rounded-[12px] border p-3 text-[13px] transition duration-150 ${
                        checked
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-800 cursor-pointer hover:-translate-y-0.5 active:scale-[.98]'
                          : busy
                            ? 'border-amber-200 bg-amber-50/70 text-amber-900/80 cursor-not-allowed'
                            : atLimit
                              ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                              : 'border-slate-200 bg-slate-50 text-slate-700 cursor-pointer hover:-translate-y-0.5 active:scale-[.98]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleWorker(worker.employee_id)}
                      />
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            checked ? 'bg-emerald-500' : busy ? 'bg-amber-400' : 'bg-slate-300'
                          }`}
                        />
                        <div>
                          <div className="font-semibold">{worker.full_name}</div>
                          <div className="mt-0.5 text-[11.5px] opacity-80">
                            {worker.phone_number || 'Tanpa nomor WA'}
                          </div>
                          {busy && (
                            <div className="mt-1 text-[10.5px] font-semibold text-amber-700 leading-snug">
                              Sudah terjadwal: {worker.busy_reason || 'tugas aktif di tanggal ini'}
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {!hasWorkers && (
                <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-700">
                  Pilih minimal 1 pekerja untuk lanjut ke item service.
                </p>
              )}
            </section>
          )}

          {/* Step 4: Items + notes + submit */}
          {!canShowItems ? (
            canShowWorkers ? (
              <LockedStep
                icon={Package}
                title="Item service menunggu pekerja"
                hint={`Pilih pekerja dulu (maks. ${maxWorkers} sesuai jumlah orang).`}
              />
            ) : null
          ) : (
            <>
              <section className={`${sectionCardClass} transition duration-150`}>
                <SectionHeader
                  step="Langkah 4"
                  icon={Package}
                  title="Item Service"
                  hint="Tambah item lewat modal — hasilnya tampil sebagai kartu"
                  action={
                    <button
                      type="button"
                      onClick={openAddItemModal}
                      className="inline-flex items-center gap-1.5 rounded-[12px] border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] font-semibold text-blue-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                    >
                      <Plus className="w-4 h-4" />
                      Tambah Item
                    </button>
                  }
                />

                {form.items.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-[13px] font-semibold text-slate-700">Belum ada item</p>
                    <p className="mt-1 text-[11.5px] text-slate-500">
                      Klik Tambah Item untuk memilih service, qty, dan promo.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {form.items.map((item, index) => {
                      const service = services.find(
                        (row) => Number(row.id) === Number(item.service_id)
                      );
                      const promo = service?.promos?.find(
                        (row) => Number(row.id) === Number(item.promo_id)
                      );
                      const qty = Math.max(1, Number(item.qty || 1));
                      const base = resolveEffectiveBasePrice(service || {});
                      const hasCoret =
                        service?.coret_price != null && service?.coret_price !== '';
                      const listPrice = Number(service?.price || 0);
                      const discountPerUnit = promo
                        ? promo.promo_type === 'persen'
                          ? (base * Number(promo.promo_value || 0)) / 100
                          : Number(promo.promo_value || 0)
                        : 0;
                      const rateFinal = Math.max(0, base - Math.min(base, discountPerUnit));
                      const isGc = isGeneralCleaningCategory(service?.category_name);
                      const crew =
                        parseGcCrewSizeFromServiceName(service?.name) ||
                        Number(form.total_people || 1);
                      const lineTotal = isGc ? 0 : rateFinal * qty;

                      return (
                        <div
                          key={`${item.service_id}-${index}`}
                          className="flex items-start justify-between gap-3 rounded-[16px] border border-slate-200 bg-slate-50/80 px-4 py-3.5 transition duration-150 hover:-translate-y-0.5"
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
                              {promo && (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                                  {promo.name}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-[14px] font-bold tracking-[-0.01em] text-slate-900 truncate">
                              {service?.name || 'Service tidak ditemukan'}
                            </p>
                            <p className="mt-1 text-[11.5px] text-slate-500">
                              {isGc
                                ? `Rp ${rateFinal.toLocaleString('id-ID')} / ${crew} Teknisi / Jam`
                                : service
                                  ? (
                                      <>
                                        Qty {qty} ·{' '}
                                        {hasCoret && (
                                          <span className="line-through text-slate-400 mr-1">
                                            Rp {listPrice.toLocaleString('id-ID')}
                                          </span>
                                        )}
                                        Rp {base.toLocaleString('id-ID')} / unit
                                      </>
                                    )
                                  : `Qty ${qty}`}
                            </p>
                            <p className="mt-1 font-sans text-[13px] font-semibold text-slate-800">
                              {isGc
                                ? 'Menyesuaikan total jam pengerjaan'
                                : `Rp ${lineTotal.toLocaleString('id-ID')}`}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditItemModal(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-blue-200 bg-blue-50 text-blue-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.95]"
                              aria-label="Edit item"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteItemIndex(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-rose-200 bg-rose-50 text-rose-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.95]"
                              aria-label="Hapus item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className={sectionCardClass}>
                <SectionHeader
                  icon={MessageSquareText}
                  title="Pesan & Catatan"
                  hint="Pesan otomatis (salin saja) — catatan admin muncul di pesan group"
                />
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className={labelEyebrowClass}>Catatan admin</span>
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className={inputClass}
                      placeholder="Contoh: Bawa alat ekstra, parkir di lobby"
                    />
                  </label>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={labelEyebrowClass}>Preview pesan group (otomatis)</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(groupMessagePreview);
                            } catch {
                              setError('Gagal menyalin pesan group');
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Salin
                        </button>
                      </div>
                      <pre className="min-h-[140px] whitespace-pre-wrap rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 font-sans text-[12.5px] leading-relaxed text-slate-700">
                        {groupMessagePreview}
                      </pre>
                      <p className="text-[11.5px] text-slate-400">
                        Format pesan tidak dapat diubah — isi mengikuti data transaksi.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={labelEyebrowClass}>Preview pesan customer (otomatis)</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(customerMessagePreview);
                            } catch {
                              setError('Gagal menyalin pesan customer');
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Salin
                        </button>
                      </div>
                      <pre className="min-h-[140px] whitespace-pre-wrap rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 font-sans text-[12.5px] leading-relaxed text-slate-700">
                        {customerMessagePreview}
                      </pre>
                      <p className="text-[11.5px] text-slate-400">
                        Format pesan tidak dapat diubah — isi mengikuti data transaksi.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="sticky bottom-4 z-10 rounded-[20px] p-5 text-white shadow-[0_12px_40px_rgba(15,23,42,.25)]"
                style={{
                  background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 55%, #1D4ED8 100%)',
                }}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-blue-200/80">
                      Ringkasan biaya
                    </p>
                    <p className="mt-1 text-[11.5px] text-blue-100">Subtotal (non-GC)</p>
                    <p className="font-sans text-[20px] font-extrabold tracking-[-0.01em]">
                      Rp {selectedTotals.subtotal.toLocaleString('id-ID')}
                    </p>
                    <p className="mt-2 text-[12.5px] text-blue-100">
                      Diskon:{' '}
                      <span className="font-sans">
                        Rp {selectedTotals.discount.toLocaleString('id-ID')}
                      </span>
                    </p>
                    {selectedTotals.hasGc && (
                      <div className="mt-2 space-y-1 text-[12px] text-blue-100">
                        {selectedTotals.gcRates.map((row, idx) => (
                          <p key={`${row.name}-${idx}`}>
                            GC: Rp {Number(row.rate || 0).toLocaleString('id-ID')} / {row.crew}{' '}
                            Teknisi / Jam
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-[13px] font-semibold text-white">
                      {selectedTotals.hasGc ? (
                        <>Total final: Menyesuaikan total jam pengerjaan</>
                      ) : (
                        <>
                          Estimasi total:{' '}
                          <span className="font-sans">Rp {finalTotal.toLocaleString('id-ID')}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-[12px] bg-white px-5 py-3 text-[13px] font-bold text-slate-900 transition duration-150 hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-60"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan Transaksi POS'}
                  </button>
                </div>
              </section>
            </>
          )}
        </form>
      )}

      {showCreateCustomer && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={closeCreateCustomerModal}
          >
            <div
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_0_0_1px_rgba(0,0,0,.04),0_16px_48px_rgba(15,23,42,.18)] space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={labelEyebrowClass}>Cleanox Only</p>
                <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.01em] text-slate-900">
                  Tambah Customer
                </h2>
                <p className="mt-1 text-[11.5px] text-slate-500">
                  Customer baru akan langsung terpilih untuk transaksi ini.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateCustomerModal}
                className="rounded-[10px] p-1.5 text-slate-400 transition duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[.98]"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <CustomerFormFields
                form={newCustomerForm}
                setForm={setNewCustomerForm}
                showStatus={false}
                showTier={false}
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCreateCustomerModal}
                  className="rounded-[12px] border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingCustomer}
                  className="rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-60"
                  style={primaryBtnStyle}
                >
                  {creatingCustomer ? 'Menyimpan...' : 'Simpan Customer'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </BodyPortal>
      )}

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
                      Ubah kata kunci pencarian atau tambahkan customer baru dari tombol yang sudah ada.
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
                            style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)' }}
                          >
                            {getInitials(row.name) || 'C'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-[13px] font-bold text-slate-800 truncate">{row.name}</div>
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
                              <div className="mt-1 text-[11.5px] text-slate-400 truncate">{row.address}</div>
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

      {itemModalOpen && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={closeItemModal}
          >
            <div
              className="flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.04),0_16px_48px_rgba(15,23,42,.18)]"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className={labelEyebrowClass}>Item Service</p>
                <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.01em] text-slate-900">
                  {editingItemIndex === null ? 'Tambah Item' : `Edit Item ${editingItemIndex + 1}`}
                </h2>
                <p className="mt-1 text-[11.5px] text-slate-500">
                  Cari dan pilih service, lalu atur qty serta promo.
                </p>
              </div>
              <button
                type="button"
                onClick={closeItemModal}
                className="rounded-[10px] p-1.5 text-slate-400 transition duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[.98]"
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

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Cari service..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setServiceSearch((prev) => prev.trim())}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                  style={primaryBtnStyle}
                >
                  <Search className="w-4 h-4" />
                  Cari
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {serviceCategories.map((cat) => {
                  const active = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={String(cat.id)}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[12px] border px-3 py-2 text-[12.5px] font-semibold transition duration-150 hover:-translate-y-0.5 active:scale-[.98] ${
                        active
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {cat.id === 'all' && <Package className="w-3.5 h-3.5" />}
                      {cat.name}
                    </button>
                  );
                })}
              </div>

              {filteredServices.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-[13px] font-semibold text-slate-700">Service tidak ditemukan</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    Ubah kata kunci pencarian atau pilih kategori lain.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredServices.map((service) => {
                    const selected = Number(itemDraft.service_id) === Number(service.id);
                    const metaParts = [];
                    if (service.satuan_name) metaParts.push(service.satuan_name);
                    if (service.duration_value && service.duration_unit) {
                      metaParts.push(`${service.duration_value} ${service.duration_unit}`);
                    }
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleItemDraftChange('service_id', String(service.id))}
                        className={`rounded-[16px] border px-4 py-3.5 text-left transition duration-150 hover:-translate-y-0.5 active:scale-[.98] ${
                          selected
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-[13px] font-bold tracking-[-0.01em] text-slate-900">
                            {service.name}
                          </p>
                          {selected && (
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        {metaParts.length > 0 && (
                          <p className="mt-1 text-[11.5px] text-slate-500">{metaParts.join(' · ')}</p>
                        )}
                        <p className="mt-2 font-sans text-[13px] font-bold text-blue-700">
                          {service.coret_price != null ? (
                            <span className="inline-flex flex-col gap-0.5">
                              <span className="text-[11px] font-medium text-slate-400 line-through">
                                Rp {Number(service.price || 0).toLocaleString('id-ID')}
                              </span>
                              <span>
                                Rp {Number(service.coret_price).toLocaleString('id-ID')}
                              </span>
                            </span>
                          ) : (
                            <>Rp {Number(service.price || 0).toLocaleString('id-ID')}</>
                          )}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSaveItemModal}
              className="shrink-0 space-y-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className={labelEyebrowClass}>Qty</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleItemDraftChange('qty', Math.max(1, Number(itemDraft.qty || 1) - 1))
                      }
                      disabled={Number(itemDraft.qty || 1) <= 1}
                      className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.95] disabled:opacity-40"
                      aria-label="Kurangi qty"
                    >
                      <Minus className="w-[18px] h-[18px]" />
                    </button>
                    <input
                      type="text"
                      readOnly
                      value={itemDraft.qty}
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-center font-sans text-[16px] font-bold text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleItemDraftChange('qty', Math.max(1, Number(itemDraft.qty || 1) + 1))
                      }
                      className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.95]"
                      style={primaryBtnStyle}
                      aria-label="Tambah qty"
                    >
                      <Plus className="w-[18px] h-[18px]" />
                    </button>
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className={labelEyebrowClass}>Promo</span>
                  <select
                    value={itemDraft.promo_id}
                    onChange={(e) => handleItemDraftChange('promo_id', e.target.value)}
                    className={inputClass}
                    disabled={!itemDraft.service_id}
                  >
                    <option value="">Tanpa promo</option>
                    {(
                      services.find((row) => Number(row.id) === Number(itemDraft.service_id))
                        ?.promos || []
                    ).map((promo) => (
                      <option key={promo.id} value={promo.id}>
                        {promo.name} -{' '}
                        {promo.promo_type === 'persen'
                          ? `${promo.promo_value}%`
                          : `Rp ${promo.promo_value.toLocaleString('id-ID')}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeItemModal}
                  className="rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
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

      {deleteItemIndex !== null && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={() => setDeleteItemIndex(null)}
          >
            <div
              className="w-full max-w-md rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_0_0_1px_rgba(0,0,0,.04),0_16px_48px_rgba(15,23,42,.18)] space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-rose-200 bg-rose-50 text-rose-700">
                <Trash2 className="w-[18px] h-[18px]" />
              </div>
              <div>
                <h2 className="text-[16px] font-extrabold tracking-[-0.01em] text-slate-900">
                  Hapus item?
                </h2>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Item {deleteItemIndex + 1} akan dihapus dari transaksi. Aksi ini tidak bisa
                  dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteItemIndex(null)}
                className="rounded-[12px] border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteItem}
                className="rounded-[12px] border border-rose-200 bg-rose-600 px-4 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 hover:bg-rose-700 active:scale-[.98]"
              >
                Ya, Hapus
              </button>
            </div>
            </div>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
