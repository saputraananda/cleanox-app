import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Minus,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import api from '@shared/utils/api.js';
import {
  formatMeterDimensionsLabel,
  isMeterPricedService,
  resolveMeterFromDimensions,
} from '@web/utils/posMeterServices.js';

const OTHER_TYPES = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'training_teknisi', label: 'Training Teknisi' },
  { value: 'event_pameran_bazaar', label: 'Event / Pameran / Bazaar' },
  { value: 'survey_site_visit', label: 'Survey & Site Visit' },
  { value: 'lainnya', label: 'Lainnya' },
];

const CREATE_STEPS = [
  { key: 'jenis', label: 'Jenis' },
  { key: 'detail', label: 'Detail' },
  { key: 'isi', label: 'Isi' },
  { key: 'teknisi', label: 'Teknisi' },
  { key: 'catatan', label: 'Catatan' },
  { key: 'simpan', label: 'Simpan' },
];

function HorizontalStepper({ steps, stepIndex, onStepClick }) {
  return (
    <div className="mt-4 overflow-x-auto pb-1">
      <div className="flex min-w-[520px] items-start">
        {steps.map((step, idx) => {
          const completed = idx < stepIndex;
          const current = idx === stepIndex;
          const clickable = idx < stepIndex;
          return (
            <div key={step.key} className="contents">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(idx)}
                className={`flex w-[72px] shrink-0 flex-col items-center gap-2 ${
                  clickable ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    completed
                      ? 'bg-violet-700'
                      : current
                        ? 'border-2 border-violet-700 bg-white'
                        : 'border border-slate-200 bg-white'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      completed ? 'bg-white' : current ? 'bg-violet-700' : 'bg-slate-300'
                    }`}
                  />
                </span>
                <span
                  className={`text-center text-[11px] leading-tight ${
                    current
                      ? 'font-semibold text-slate-800'
                      : completed
                        ? 'font-medium text-slate-700'
                        : 'font-medium text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <div
                  className={`mt-3.5 h-0.5 min-w-[8px] flex-1 ${
                    idx < stepIndex ? 'bg-violet-700' : 'bg-slate-200'
                  }`}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800';
const labelEyebrowClass = 'text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400';

function weekdayName(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return DAY_NAMES[date.getUTCDay()];
}

function buildDayLabel(start, end) {
  if (!start) return '';
  const startName = weekdayName(start);
  if (!end || end === start) return startName;
  return `${startName}–${weekdayName(end)}`;
}

function formatDateRange(start, end, time) {
  if (!start) return '-';
  const startLabel = new Date(`${start}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  if (!end || end === start) {
    return time ? `${startLabel} · ${time}` : startLabel;
  }
  const endLabel = new Date(`${end}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

const emptyForm = () => ({
  agenda_kind: 'special_collaboration',
  other_type: '',
  other_type_label: '',
  name: '',
  location: '',
  start_date: '',
  end_date: '',
  agenda_time: '09:00',
  content_type: 'description',
  description: '',
  notes: '',
  worker_ids: [],
  items: [],
});

const emptyItemDraft = () => ({
  service_id: '',
  qty: 1,
  meter_length: '',
  meter_width: '',
});

export default function PosAgendaCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [workers, setWorkers] = useState([]);
  const [services, setServices] = useState([]);
  const [serviceCategoriesMaster, setServiceCategoriesMaster] = useState([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [itemModalError, setItemModalError] = useState('');
  const [itemDraft, setItemDraft] = useState(emptyItemDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stepIndex, setStepIndex] = useState(0);

  const isSingleDay =
    Boolean(form.start_date) && Boolean(form.end_date) && form.start_date === form.end_date;
  const isMultiDay =
    Boolean(form.start_date) && Boolean(form.end_date) && form.end_date > form.start_date;
  const dayLabel = buildDayLabel(form.start_date, form.end_date || form.start_date);

  const loadWorkers = async () => {
    if (!form.start_date) {
      setWorkers([]);
      return;
    }
    try {
      const { data } = await api.get('/pos-agenda/workers', {
        params: {
          start_date: form.start_date,
          end_date: form.end_date || form.start_date,
          ...(isSingleDay && form.agenda_time ? { agenda_time: form.agenda_time } : {}),
        },
      });
      setWorkers(data.workers || []);
    } catch {
      setWorkers([]);
    }
  };

  const loadServices = async () => {
    try {
      const { data } = await api.get('/pos-transactions/services');
      setServices(data.services || []);
      setServiceCategoriesMaster(data.categories || []);
    } catch {
      setServices([]);
      setServiceCategoriesMaster([]);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [form.start_date, form.end_date, form.agenda_time]);

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

  const selectedWorkers = useMemo(
    () => workers.filter((w) => form.worker_ids.includes(Number(w.employee_id))),
    [workers, form.worker_ids]
  );

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
      service_id: item.service_id ? String(item.service_id) : '',
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
        if (!isMeterPricedService({ satuanName: nextService?.satuan_name })) {
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
    if (!service) {
      setItemModalError('Service tidak ditemukan');
      return;
    }
    const needsMeter = isMeterPricedService({ satuanName: service?.satuan_name });
    const lengthValue = Number(itemDraft.meter_length);
    const widthValue = Number(itemDraft.meter_width);
    const meterValue = resolveMeterFromDimensions({
      satuanName: service?.satuan_name,
      length: itemDraft.meter_length,
      width: itemDraft.meter_width,
    });
    const qtyValue = Math.max(1, Number(itemDraft.qty || 1));
    const nextItem = {
      service_id: Number(itemDraft.service_id),
      service_name: service.name,
      category_name: service.category_name || null,
      satuan_name: service.satuan_name || null,
      qty: qtyValue,
      meter: needsMeter ? meterValue : null,
      meter_length: needsMeter && meterValue != null ? lengthValue : null,
      meter_width: needsMeter && meterValue != null ? widthValue : null,
    };

    setForm((prev) => ({
      ...prev,
      items:
        editingItemIndex === null
          ? [...prev.items, nextItem]
          : prev.items.map((item, idx) => (idx === editingItemIndex ? nextItem : item)),
    }));
    closeItemModal();
    setError('');
  };

  const removeItem = (index) => {
    if (!window.confirm('Hapus item ini?')) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const toggleWorker = (workerId) => {
    setForm((prev) => {
      const id = Number(workerId);
      const exists = prev.worker_ids.includes(id);
      return {
        ...prev,
        worker_ids: exists
          ? prev.worker_ids.filter((x) => x !== id)
          : [...prev.worker_ids, id],
      };
    });
  };

  const validateStep = (index) => {
    if (index === 0) {
      if (form.agenda_kind === 'other' && !form.other_type) {
        return 'Tipe agenda lain wajib dipilih';
      }
      if (form.other_type === 'lainnya' && !form.other_type_label.trim()) {
        return 'Isian Lainnya wajib diisi';
      }
      return null;
    }
    if (index === 1) {
      if (!form.name.trim() || !form.location.trim()) {
        return 'Nama dan lokasi wajib diisi';
      }
      if (!form.start_date || !form.end_date) {
        return 'Tanggal mulai dan selesai wajib diisi';
      }
      if (form.end_date < form.start_date) {
        return 'Tanggal selesai tidak boleh sebelum tanggal mulai';
      }
      if (isSingleDay && !form.agenda_time) {
        return 'Jam wajib diisi untuk agenda satu hari';
      }
      return null;
    }
    if (index === 2) {
      if (form.content_type === 'description' && !form.description.trim()) {
        return 'Deskripsi wajib diisi';
      }
      if (form.content_type === 'item_service' && form.items.length < 1) {
        return 'Minimal 1 item service';
      }
      return null;
    }
    if (index === 3) {
      if (form.worker_ids.length < 1) return 'Minimal 1 teknisi';
      return null;
    }
    return null;
  };

  const goNext = () => {
    const msg = validateStep(stepIndex);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setSuccess('');
    setStepIndex((i) => Math.min(i + 1, CREATE_STEPS.length - 1));
  };

  const goBack = () => {
    setError('');
    setSuccess('');
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const submitAgenda = async (saveMode) => {
    setError('');
    setSuccess('');
    if (!form.name.trim() || !form.location.trim()) {
      setError('Nama dan lokasi wajib diisi');
      return;
    }
    if (!form.start_date || !form.end_date) {
      setError('Tanggal mulai dan selesai wajib diisi');
      return;
    }
    if (form.end_date < form.start_date) {
      setError('Tanggal selesai tidak boleh sebelum tanggal mulai');
      return;
    }
    if (isSingleDay && !form.agenda_time) {
      setError('Jam wajib diisi untuk agenda satu hari');
      return;
    }
    if (form.agenda_kind === 'other' && !form.other_type) {
      setError('Tipe agenda lain wajib dipilih');
      return;
    }
    if (form.other_type === 'lainnya' && !form.other_type_label.trim()) {
      setError('Isian Lainnya wajib diisi');
      return;
    }
    if (form.content_type === 'description' && !form.description.trim()) {
      setError('Deskripsi wajib diisi');
      return;
    }
    if (form.content_type === 'item_service' && form.items.length < 1) {
      setError('Minimal 1 item service');
      return;
    }
    if (form.worker_ids.length < 1) {
      setError('Minimal 1 teknisi');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post('/pos-agenda', {
        agenda_kind: form.agenda_kind,
        other_type: form.agenda_kind === 'other' ? form.other_type : null,
        other_type_label:
          form.agenda_kind === 'other' && form.other_type === 'lainnya'
            ? form.other_type_label
            : null,
        name: form.name.trim(),
        location: form.location.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        agenda_time: isSingleDay ? form.agenda_time : null,
        content_type: form.content_type,
        description: form.content_type === 'description' ? form.description.trim() : null,
        notes: form.notes.trim() || null,
        worker_ids: form.worker_ids,
        items:
          form.content_type === 'item_service'
            ? form.items.map((item) => ({
                service_id: item.service_id,
                qty: item.qty,
                meter: item.meter,
              }))
            : [],
        save_mode: saveMode,
      });
      const agendaId = data?.agenda?.id;
      if (agendaId) {
        navigate(`/cleanox-only/agenda/${agendaId}`);
        return;
      }
      setSuccess(
        saveMode === 'schedule' ? 'Agenda berhasil dijadwalkan' : 'Agenda disimpan sebagai draft'
      );
      setForm(emptyForm());
      navigate('/cleanox-only/agenda');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan agenda');
    } finally {
      setSaving(false);
    }
  };

  const draftService = services.find(
    (row) => Number(row.id) === Number(itemDraft.service_id)
  );
  const draftNeedsMeter = isMeterPricedService({ satuanName: draftService?.satuan_name });
  const draftArea = resolveMeterFromDimensions({
    satuanName: draftService?.satuan_name,
    length: itemDraft.meter_length,
    width: itemDraft.meter_width,
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 bg-slate-50 p-3 sm:p-5 min-h-full">
      <div>
        <Link
          to="/cleanox-only/agenda"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Riwayat Agenda
        </Link>
        <h1 className="mt-3 text-[22px] font-extrabold tracking-[-0.01em] text-slate-900">
          Tambah Agenda
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Lengkapi langkah berikut lalu simpan sebagai draft atau jadwalkan.
        </p>
        <HorizontalStepper
          steps={CREATE_STEPS}
          stepIndex={stepIndex}
          onStepClick={(idx) => {
            setError('');
            setSuccess('');
            setStepIndex(idx);
          }}
        />
      </div>

      {error && (
        <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
          {success}
        </div>
      )}

      <section className="space-y-5 rounded-[20px] border border-slate-200 bg-white p-4 sm:p-5">
        <div>
          <p className="text-[13px] font-semibold text-slate-900">
            {CREATE_STEPS[stepIndex]?.label}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">
            Langkah {stepIndex + 1} dari {CREATE_STEPS.length}
          </p>
        </div>

        {stepIndex === 0 && (
          <div key="jenis" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Jenis Agenda
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'special_collaboration', label: 'Special Collaboration' },
                { value: 'other', label: 'Agenda lain' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      agenda_kind: opt.value,
                      other_type: opt.value === 'other' ? prev.other_type : '',
                      other_type_label: opt.value === 'other' ? prev.other_type_label : '',
                    }))
                  }
                  className={`rounded-xl border px-3.5 py-2 text-sm font-semibold ${
                    form.agenda_kind === opt.value
                      ? 'border-violet-700 bg-violet-700 text-white'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.agenda_kind === 'other' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Tipe agenda lain</span>
                  <select
                    value={form.other_type}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        other_type: e.target.value,
                        other_type_label:
                          e.target.value === 'lainnya' ? prev.other_type_label : '',
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    <option value="">Pilih tipe</option>
                    {OTHER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {form.other_type === 'lainnya' && (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600">Isian manual</span>
                    <input
                      value={form.other_type_label}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, other_type_label: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                      placeholder="Nama agenda lain"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {stepIndex === 1 && (
          <div key="detail" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Detail Agenda
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-slate-600">Nama Agenda</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-slate-600">Lokasi</span>
                <input
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Tanggal mulai</span>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      start_date: e.target.value,
                      end_date: prev.end_date || e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Tanggal selesai</span>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Hari (otomatis)</span>
                <input
                  value={dayLabel}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
                />
              </label>
              {isSingleDay && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Jam</span>
                  <input
                    type="time"
                    value={form.agenda_time}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, agenda_time: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
              )}
              {isMultiDay && (
                <p className="text-xs text-slate-500 md:col-span-2">
                  Agenda multi-hari tidak memakai jam.
                </p>
              )}
            </div>
          </div>
        )}

        {stepIndex === 2 && (
          <div key="isi" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Isi Agenda
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'item_service', label: 'Item Service' },
                { value: 'description', label: 'Deskripsi' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      content_type: opt.value,
                      items: opt.value === 'item_service' ? prev.items : [],
                      description: opt.value === 'description' ? prev.description : '',
                    }))
                  }
                  className={`rounded-xl border px-3.5 py-2 text-sm font-semibold ${
                    form.content_type === opt.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.content_type === 'description' ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Deskripsi</span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Item Service</p>
                    <p className="text-[11.5px] text-slate-500">Tanpa harga — tidak masuk sales</p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddItemModal}
                    className="inline-flex items-center gap-1.5 rounded-[12px] border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] font-semibold text-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Item
                  </button>
                </div>
                {form.items.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-[13px] font-semibold text-slate-700">Belum ada item</p>
                    <p className="mt-1 text-[11.5px] text-slate-500">
                      Klik Tambah Item untuk memilih service dan qty.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {form.items.map((item, index) => {
                      const dimLabel = formatMeterDimensionsLabel({
                        length: item.meter_length,
                        width: item.meter_width,
                        meter: item.meter,
                      });
                      return (
                        <div
                          key={`${item.service_id}-${index}`}
                          className="flex items-start justify-between gap-3 rounded-[16px] border border-slate-200 bg-slate-50/80 px-4 py-3.5"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
                              Item {index + 1}
                            </span>
                            <p className="mt-2 truncate text-[14px] font-bold text-slate-900">
                              {item.service_name || 'Service'}
                            </p>
                            <p className="mt-1 text-[11.5px] text-slate-500">
                              Qty {item.qty}
                              {dimLabel ? ` · ${dimLabel}` : ''}
                              {isMeterPricedService({ satuanName: item.satuan_name }) &&
                              item.meter == null
                                ? ' · Pending meter'
                                : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditItemModal(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-blue-200 bg-blue-50 text-blue-700"
                              aria-label="Edit item"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-rose-200 bg-rose-50 text-rose-700"
                              aria-label="Hapus item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {stepIndex === 3 && (
          <div key="teknisi" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pilih Teknisi
              </p>
              <p className="text-xs text-slate-500">{form.worker_ids.length} dipilih</p>
            </div>
            {!form.start_date ? (
              <p className="text-sm text-slate-500">Isi tanggal dulu untuk memuat teknisi.</p>
            ) : workers.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada teknisi produksi tersedia.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {workers.map((worker) => {
                  const checked = form.worker_ids.includes(Number(worker.employee_id));
                  return (
                    <button
                      key={worker.employee_id}
                      type="button"
                      onClick={() => toggleWorker(worker.employee_id)}
                      className={`rounded-xl border px-3 py-3 text-left ${
                        checked
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-slate-200 bg-white hover:border-violet-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{worker.full_name}</p>
                        {checked && <Check className="h-4 w-4 text-violet-700" />}
                      </div>
                      <p className="text-xs text-slate-500">{worker.phone_number || '-'}</p>
                      {worker.is_busy && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">
                          {worker.busy_reason || 'Busy'}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {stepIndex === 4 && (
          <div key="catatan" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Catatan</p>
            <textarea
              rows={5}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Catatan opsional"
            />
          </div>
        )}

        {stepIndex === 5 && (
          <div key="simpan" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Review & Simpan
            </p>
            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Nama:</span> {form.name || '-'}
              </p>
              <p>
                <span className="font-semibold">Lokasi:</span> {form.location || '-'}
              </p>
              <p>
                <span className="font-semibold">Jadwal:</span>{' '}
                {formatDateRange(
                  form.start_date,
                  form.end_date,
                  isSingleDay ? form.agenda_time : null
                )}{' '}
                ({dayLabel || '-'})
              </p>
              <p>
                <span className="font-semibold">Isi:</span>{' '}
                {form.content_type === 'item_service'
                  ? `${form.items.length} item service`
                  : 'Deskripsi'}
              </p>
              <p>
                <span className="font-semibold">Teknisi:</span>{' '}
                {selectedWorkers.map((w) => w.full_name).join(', ') || '-'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => submitAgenda('draft')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Menyimpan...' : 'Simpan sebagai draft'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => submitAgenda('schedule')}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                <CalendarDays className="h-4 w-4" />
                {saving ? 'Menyimpan...' : 'Simpan & Jadwalkan'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>
          ) : (
            <span />
          )}
          {stepIndex < CREATE_STEPS.length - 1 && (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
            >
              Lanjut
            </button>
          )}
        </div>
      </section>

      {itemModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={closeItemModal}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.04),0_16px_48px_rgba(15,23,42,.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className={labelEyebrowClass}>Item Service</p>
                <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.01em] text-slate-900">
                  {editingItemIndex === null ? 'Tambah Item' : `Edit Item ${editingItemIndex + 1}`}
                </h2>
                <p className="mt-1 text-[11.5px] text-slate-500">
                  Cari dan pilih service, lalu atur qty dan ukuran panjang × lebar (jika perlu).
                  Harga tidak dicatat untuk agenda.
                </p>
              </div>
              <button
                type="button"
                onClick={closeItemModal}
                className="rounded-[10px] p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
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
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[12px] bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white"
                >
                  <Search className="h-4 w-4" />
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
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[12px] border px-3 py-2 text-[12.5px] font-semibold ${
                        active
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {cat.id === 'all' && <Package className="h-3.5 w-3.5" />}
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
                        className={`rounded-[16px] border px-4 py-3.5 text-left ${
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
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        {metaParts.length > 0 && (
                          <p className="mt-1 text-[11.5px] text-slate-500">
                            {metaParts.join(' · ')}
                          </p>
                        )}
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
              <div
                className={`grid grid-cols-1 gap-3 ${
                  draftNeedsMeter ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
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
                      disabled={Number(itemDraft.qty || 1) <= 1}
                      className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                      aria-label="Kurangi qty"
                    >
                      <Minus className="h-[18px] w-[18px]" />
                    </button>
                    <input
                      type="text"
                      readOnly
                      value={itemDraft.qty}
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-center text-[16px] font-bold text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleItemDraftChange('qty', Math.max(1, Number(itemDraft.qty || 1) + 1))
                      }
                      className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-slate-900 text-white"
                      aria-label="Tambah qty"
                    >
                      <Plus className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </label>

                {draftNeedsMeter && (
                  <div className="block space-y-1.5 sm:col-span-2">
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
                        aria-label="Panjang meter"
                      />
                      <span className="shrink-0 text-sm font-bold text-slate-400">×</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={itemDraft.meter_width}
                        onChange={(e) => handleItemDraftChange('meter_width', e.target.value)}
                        className={inputClass}
                        placeholder="L"
                        aria-label="Lebar meter"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {draftArea != null
                        ? `Total ${draftArea} m²`
                        : 'Opsional — bisa dikosongkan (pending meter)'}
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
                  className="rounded-[12px] bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white"
                >
                  {editingItemIndex === null ? 'Tambah Item' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
