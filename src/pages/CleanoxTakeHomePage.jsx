import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  Building2,
  FileText,
  X,
  ChevronDown,
  CheckSquare,
  Square,
  AlertCircle,
  Inbox,
  Clock,
  Loader2,
  MapPin,
  Truck,
  Waves,
  Package,
  Navigation,
  Check,
  User,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Eye,
  Phone,
  Camera,
  Download,
  ExternalLink,
} from 'lucide-react';
import Swal from 'sweetalert2';
import api from '../utils/api.js';
import { getToken, getUser } from '../utils/auth.js';

/* ── Helpers ───────────────────────────────────────────── */
const fmtDate = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const fmtDateTime = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toLocalDateTimeInput = (dt) => {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const today = toISO(new Date());

const cutoffStart = (year, month) => {
  const d = new Date(year, month - 2, 26);
  return toISO(d);
};
const cutoffEnd = (year, month) => {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-25`;
};

const now = new Date();
const _curMonth = now.getMonth() + 1;
const _curYear = now.getFullYear();
let periodMonth, periodYear;
if (now.getDate() > 25) {
  if (_curMonth === 12) {
    periodMonth = 1;
    periodYear = _curYear + 1;
  } else {
    periodMonth = _curMonth + 1;
    periodYear = _curYear;
  }
} else {
  periodMonth = _curMonth;
  periodYear = _curYear;
}
const DEFAULT_START = cutoffStart(periodYear, periodMonth);
const DEFAULT_END = cutoffEnd(periodYear, periodMonth);

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const buildStaticRanges = () => [
  { label: 'Semua Data', range: () => ({ date_start: '2000-01-01', date_end: '2099-12-31' }) },
  { label: 'Hari Ini', range: () => ({ date_start: today, date_end: today }) },
  {
    label: 'Kemarin',
    range: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const s = toISO(d);
      return { date_start: s, date_end: s };
    },
  },
];
const PAGE_SIZES = [10, 25, 50, 100];

/* ── Stages Configuration ───────────────────────────────── */
const STAGES = [
  { key: 'diambil', label: 'Diambil', icon: Truck, color: 'blue' },
  { key: 'dicuci', label: 'Dicuci', icon: Waves, color: 'amber' },
  { key: 'packing', label: 'Packing', icon: Package, color: 'purple' },
  { key: 'diantar', label: 'Diantar', icon: Truck, color: 'sky' },
  { key: 'pengantaran', label: 'Pengantaran', icon: Navigation, color: 'green' },
];

const STAGE_COLORS = {
  blue: { line: 'bg-blue-500', dot: 'bg-blue-500', dotBorder: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' },
  amber: { line: 'bg-amber-500', dot: 'bg-amber-500', dotBorder: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
  purple: { line: 'bg-purple-500', dot: 'bg-purple-500', dotBorder: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700' },
  sky: { line: 'bg-sky-500', dot: 'bg-sky-500', dotBorder: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-700' },
  green: { line: 'bg-green-500', dot: 'bg-green-500', dotBorder: 'border-green-200', bg: 'bg-green-50', text: 'text-green-700' },
};

const VALID_STATUSES = ['Diambil', 'Dicuci', 'Packing', 'Diantar', 'Pengantaran'];

const STATUS_STYLE = {
  'Diambil': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'Dicuci': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  'Packing': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  'Diantar': { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
  'Pengantaran': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  'Dibatalkan': { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  'Tertunda': { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
};

const normalizeStatusLabel = (st) => {
  if (!st) return '—';
  const lower = String(st).trim().toLowerCase();
  if (lower === 'diambil') return 'Diambil';
  if (lower === 'dicuci') return 'Dicuci';
  if (lower === 'packing') return 'Packing';
  if (lower === 'diantar') return 'Diantar';
  if (lower === 'pengantaran') return 'Pengantaran';
  return st;
};

/* ── Status Badge ─────────────────────────────────────── */
function StatusBadge({ status }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>;
  const label = normalizeStatusLabel(status);
  const s = STATUS_STYLE[label] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      {label}
    </span>
  );
}

const formatWaLink = (phone) => {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  if (!clean.startsWith('62')) clean = '62' + clean;
  return `https://wa.me/${clean}`;
};

/* ── Quick Range Dropdown ─────────────────────────────── */
function QuickRangeDropdown({ ranges, onSelect, currentLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const cepat = ranges.filter((r) => ['Semua Data', 'Hari Ini', 'Kemarin'].includes(r.label));
  const bulan = ranges.filter((r) => !['Semua Data', 'Hari Ini', 'Kemarin'].includes(r.label));
  const byYear = {};
  bulan.forEach((r) => {
    const parts = r.label.split(' ');
    const yr = parts[parts.length - 1] || String(new Date().getFullYear());
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(r);
  });

  const select = (qr) => { setOpen(false); onSelect(qr); };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white
          hover:border-brand-400 hover:text-brand-700 transition-all duration-150"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700">{currentLabel || 'Pilih Periode'}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl w-72 overflow-hidden animate-fade-in">
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Cepat</p>
            <div className="flex gap-1.5">
              {cepat.map((qr) => (
                <button
                  key={qr.label}
                  onClick={() => select(qr)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                    currentLabel === qr.label
                      ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                      : 'border-gray-200 text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700'
                  }`}
                >
                  {qr.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100 max-h-64 overflow-y-auto p-3 space-y-3">
            {Object.entries(byYear)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([yr, items]) => (
                <div key={yr}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{yr}</p>
                  <div className="grid grid-cols-3 gap-1">
                    {items.map((qr) => (
                      <button
                        key={qr.label}
                        onClick={() => select(qr)}
                        className={`py-1.5 text-xs rounded-lg border transition-colors px-1 truncate ${
                          currentLabel === qr.label
                            ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                            : 'border-gray-200 text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {qr.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Date Input (native calendar picker) ───────────────── */
function DateInput({ value, onChange, className }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    try {
      if (typeof inputRef.current?.showPicker === 'function') {
        inputRef.current.showPicker();
      }
    } catch {
      // Browser safety catch
    }
  };

  const handleKeyDown = (e) => {
    const allowedKeys = ['Tab', 'Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!allowedKeys.includes(e.key)) e.preventDefault();
  };

  return (
    <input
      ref={inputRef}
      type="date"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={openPicker}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onPaste={(e) => e.preventDefault()}
      className={className}
    />
  );
}

/* ── Loading Bar ───────────────────────────────────────── */
function LoadingBar({ visible }) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 h-0.5 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="h-full bg-gradient-to-r from-brand-500 via-lime-400 to-brand-500 animate-[loadbar_1.4s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }} />
    </div>
  );
}

/* ── Multi-select Employee Picker (Identik Waschen) ─────── */
function EmployeePicker({ employees = [], selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const empList = employees.map((e) => (typeof e === 'string' ? { id: e, name: e } : { id: e.employee_id || e.id || e.full_name || e.name, name: e.full_name || e.name }));

  const filtered = q
    ? empList.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : empList;

  const selectedNames = selected.map((s) => (typeof s === 'string' ? s : s.employee_name || s.name || s.full_name)).filter(Boolean);

  const toggle = (name) => {
    const next = selectedNames.includes(name)
      ? selectedNames.filter((n) => n !== name)
      : [...selectedNames, name];
    onChange(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1 flex-wrap min-h-[32px] px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white hover:border-brand-300 transition-colors text-left"
      >
        {selectedNames.length === 0 && <span className="text-gray-400">Pilih pegawai...</span>}
        {selectedNames.map((n) => (
          <span key={n} className="inline-flex items-center gap-0.5 bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
            {n}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(n); }}
              className="hover:text-red-500 ml-0.5"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <ChevronDown className="w-3 h-3 text-gray-400 ml-auto flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl w-full max-h-48 overflow-hidden">
          <div className="p-1.5 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              placeholder="Cari pegawai..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-36 overflow-y-auto">
            {filtered.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => toggle(emp.name)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left"
              >
                {selectedNames.includes(emp.name)
                  ? <CheckSquare className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                  : <Square className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                <span>{emp.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Tidak ditemukan</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tracking Modal (100% Identik Waschen) ─────────────── */
function TrackingModal({ show, onClose, row, canUpdate, onStageUpdated, onPhotoPreview }) {
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState('');
  const [deletingStage, setDeletingStage] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [stageForm, setStageForm] = useState({});
  const [photoFiles, setPhotoFiles] = useState({});
  const token = getToken();

  // Load workers
  useEffect(() => {
    if (!show) return;
    const loadWorkers = async () => {
      try {
        const { data } = await api.get('/cleanox-takehome/workers');
        const list = (data.workers || []).map((w) => ({
          id: w.employee_id,
          name: w.full_name,
        }));
        list.unshift({ id: 0, name: 'Admin' });
        setEmployees(list);
      } catch (err) {
        console.warn('[takehome/modalWorkers]', err.message);
      }
    };
    loadWorkers();
  }, [show]);

  // Init form
  useEffect(() => {
    if (!row) return;
    const initial = {};
    for (const s of STAGES) {
      const stageData = (row.takehome_progress?.stages || []).find((stg) => stg.key === s.key);
      const rawWorkers = stageData?.by || [];
      const workerNames = rawWorkers.map((w) => (typeof w === 'string' ? w : w.employee_name || w.name)).filter(Boolean);
      initial[s.key] = {
        employees: workerNames,
        timestamp: stageData?.at ? toLocalDateTimeInput(stageData.at) : toLocalDateTimeInput(new Date()),
      };
    }
    setStageForm(initial);
    setPhotoFiles({});
    setEditingStage(null);
    setDeletingStage(null);
  }, [row]);

  if (!show || !row) return null;

  const progress = row.takehome_progress || {};
  const stages = STAGES.map((s) => {
    const found = (progress.stages || []).find((stg) => stg.key === s.key);
    return {
      ...s,
      filled: Boolean(found?.filled),
      by: found?.by || [],
      at: found?.at || null,
      photo_file: found?.photo_file || null,
      photo_path: found?.photo_path || null,
    };
  });

  const nextStageKey = progress.next_stage || stages.find((s) => !s.filled)?.key || null;
  const allComplete = stages.every((s) => s.filled);

  const updateFormField = (stageKey, field, val) => {
    setStageForm((prev) => ({
      ...prev,
      [stageKey]: {
        ...(prev[stageKey] || { employees: [], timestamp: '' }),
        [field]: val,
      },
    }));
  };

  const txId = row.transaction_id || row.id;

  const handleSave = async (stageKey, isCorrection = false) => {
    if (!canUpdate) {
      Swal.fire({ icon: 'warning', title: 'Akses Ditolak', text: 'Hanya user company_id 1 atau 3 yang diizinkan mengupdate.' });
      return;
    }

    const form = stageForm[stageKey] || {};
    if (!form.employees || form.employees.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Pekerja Wajib Diisi', text: 'Pilih minimal 1 pekerja pelaksana' });
      return;
    }

    setSaving(stageKey);
    try {
      const formData = new FormData();
      formData.append('workers', JSON.stringify(form.employees));
      if (form.timestamp) formData.append('timestamp', form.timestamp);
      if (photoFiles[stageKey]) formData.append('photo', photoFiles[stageKey]);

      const { data } = await api.post(`/cleanox-takehome/${txId}/stages/${stageKey}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Swal.fire({
        icon: 'success',
        title: 'Berhasil',
        text: data.message || 'Stage berhasil disimpan',
        timer: 1500,
        showConfirmButton: false,
      });

      setEditingStage(null);
      setPhotoFiles((prev) => {
        const next = { ...prev };
        delete next[stageKey];
        return next;
      });
      onStageUpdated?.();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan',
        text: err.response?.data?.message || 'Terjadi kesalahan server',
      });
    } finally {
      setSaving('');
    }
  };

  const handleDelete = async (stageKey) => {
    if (!canUpdate) return;
    setSaving(`del-${stageKey}`);
    try {
      await api.post(`/cleanox-takehome/${txId}/stages/${stageKey}/clear`);
      Swal.fire({
        icon: 'success',
        title: 'Berhasil Dihapus',
        text: `Stage ${stageKey} dan setelahnya telah di-reset`,
        timer: 1500,
        showConfirmButton: false,
      });
      setDeletingStage(null);
      onStageUpdated?.();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Hapus',
        text: err.response?.data?.message || 'Terjadi kesalahan server',
      });
    } finally {
      setSaving('');
    }
  };

  const itemsSummary = (row.items || []).map((it) => `${it.service_name} (${it.qty} ${it.unit || ''})`).join(', ') || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
        {/* Header (Clean White Header identik Waschen) */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-600" />
              Lacak Progres
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Tracking pengerjaan Take Home</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Info card (Identik Waschen) */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-400">No Nota</span>
                <p className="font-mono font-semibold text-gray-800">{row.transaction_no || `#${txId}`}</p>
              </div>
              <div>
                <span className="text-gray-400">Status</span>
                <div className="mt-0.5">
                  <StatusBadge status={progress.status || 'Diambil'} />
                </div>
              </div>
              <div>
                <span className="text-gray-400">Customer</span>
                <p className="font-semibold text-gray-800">{row.customer_name || '—'}</p>
              </div>
              <div>
                <span className="text-gray-400">Telepon</span>
                <p className="font-semibold text-gray-800">{row.customer_phone || '—'}</p>
              </div>
              <div>
                <span className="text-gray-400">Tgl Layanan</span>
                <p className="font-semibold text-gray-800">{fmtDate(row.service_date)}</p>
              </div>
              <div>
                <span className="text-gray-400">Estimasi Selesai</span>
                <p className="font-semibold text-gray-800">
                  {row.estimated_completion_date ? (
                    <span className="text-amber-700 font-bold">
                      {fmtDate(row.estimated_completion_date)}
                      {row.estimated_days ? ` (${row.estimated_days} hari)` : ''}
                    </span>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400">Alamat Customer</span>
                <p className="font-semibold text-gray-800">{row.customer_address || '—'}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <span className="text-gray-400">Layanan Dipilih</span>
              <p className="font-semibold text-brand-700">
                {row.service_name ? `${row.service_name} (${row.item_qty} ${row.item_unit || ''})` : itemsSummary}
              </p>
              {row.items && row.items.length > 1 && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Semua layanan dalam nota: {itemsSummary}
                </p>
              )}
            </div>
          </div>

          {/* Stepper Timeline (Identik Waschen) */}
          <div className="relative pl-4">
            {stages.map((stg, idx) => {
              const sc = STAGE_COLORS[stg.color];
              const filled = Boolean(stg.filled);
              const isActive = !filled && nextStageKey === stg.key && canUpdate;
              const isEditing = filled && editingStage === stg.key && canUpdate;
              const isDeleting = deletingStage === stg.key;
              const Icon = stg.icon;
              const form = stageForm[stg.key] || { employees: [], timestamp: '' };
              const workerNames = (stg.by || []).map((w) => (typeof w === 'string' ? w : w.employee_name || w.name)).filter(Boolean);

              const photoFilename = stg.photo_file || (stg.photo_path ? stg.photo_path.split('/').pop() : null);

              return (
                <div key={stg.key} className="relative pb-6 last:pb-0">
                  {/* Vertical line */}
                  {idx < stages.length - 1 && (
                    <div
                      className={`absolute left-[11px] top-8 w-0.5 h-[calc(100%-16px)] ${
                        filled ? sc.line : 'bg-gray-200'
                      }`}
                    />
                  )}

                  {/* Dot */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                        filled
                          ? `${sc.dot} border-white text-white shadow-sm`
                          : `bg-white ${sc.dotBorder}`
                      }`}
                    >
                      {filled ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Icon className={`w-3 h-3 ${sc.text} opacity-50`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${filled ? sc.text : 'text-gray-400'}`}>
                          {stg.label}
                        </span>
                        {filled && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                            Selesai
                          </span>
                        )}
                      </div>

                      {/* Filled info */}
                      {filled && !isEditing && (
                        <div className={`mt-1.5 rounded-lg p-2.5 ${sc.bg} space-y-1`}>
                          <div className="flex items-center gap-1.5 text-xs">
                            <User className="w-3 h-3 flex-shrink-0" />
                            <span className={`font-medium ${sc.text}`}>{workerNames.join(', ') || '—'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              <span className={sc.text}>{fmtDateTime(stg.at)}</span>
                            </div>
                            {canUpdate && (
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  onClick={() => setEditingStage(stg.key)}
                                  title="Koreksi"
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
                                >
                                  <Pencil className="w-2.5 h-2.5" /> Koreksi
                                </button>
                                {isDeleting ? (
                                  <>
                                    <button
                                      onClick={() => handleDelete(stg.key)}
                                      disabled={saving === `del-${stg.key}`}
                                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded border border-red-400 bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60"
                                    >
                                      {saving === `del-${stg.key}` ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />} Ya, Hapus
                                    </button>
                                    <button
                                      onClick={() => setDeletingStage(null)}
                                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors"
                                    >
                                      Batal
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => { setDeletingStage(stg.key); setEditingStage(null); }}
                                    title="Hapus progres ini"
                                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-red-200 text-red-500 hover:border-red-400 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" /> Hapus
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Evidence Photo button */}
                          {photoFilename && (
                            <div className="pt-1 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const previewUrl = `/api/cleanox-takehome/evidence/${encodeURIComponent(photoFilename)}`;
                                  onPhotoPreview?.(previewUrl, `Foto Bukti ${stg.label} (${row.transaction_no || row.id})`, photoFilename);
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-xs"
                              >
                                <Eye className="w-3.5 h-3.5 text-brand-600" />
                                Lihat Foto Bukti
                              </button>
                            </div>
                          )}

                          {isDeleting && (
                            <p className="text-[10px] text-red-600 mt-1">
                              ⚠ Semua progres setelah <strong>{stg.label}</strong> juga akan ikut dihapus.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Admin override form for already-filled stage */}
                      {isEditing && (
                        <div className="mt-2 space-y-2 bg-white border border-amber-200 rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Koreksi Data (Admin)</p>
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                              Dikerjakan Oleh
                            </label>
                            <EmployeePicker
                              employees={employees}
                              selected={form.employees}
                              onChange={(v) => updateFormField(stg.key, 'employees', v)}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                              Waktu
                            </label>
                            <input
                              type="datetime-local"
                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                              value={form.timestamp}
                              onChange={(e) => updateFormField(stg.key, 'timestamp', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                              Ganti Foto Bukti (Opsional)
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => setPhotoFiles((prev) => ({ ...prev, [stg.key]: e.target.files?.[0] || null }))}
                              className="w-full text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:border-gray-200 file:bg-gray-50 file:text-xs file:font-medium hover:file:bg-gray-100"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSave(stg.key, true)}
                              disabled={saving === stg.key}
                              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                            >
                              {saving === stg.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Simpan Koreksi
                            </button>
                            <button
                              onClick={() => setEditingStage(null)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Editable form (only for the next unfilled stage) */}
                      {!filled && isActive && (
                        <div className="mt-2 space-y-2 bg-white border border-gray-200 rounded-lg p-3">
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                              Dikerjakan Oleh
                            </label>
                            <EmployeePicker
                              employees={employees}
                              selected={form.employees}
                              onChange={(v) => updateFormField(stg.key, 'employees', v)}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                              Waktu
                            </label>
                            <input
                              type="datetime-local"
                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                              value={form.timestamp}
                              onChange={(e) => updateFormField(stg.key, 'timestamp', e.target.value)}
                            />
                            <p className="text-[10px] text-gray-400 mt-0.5">Kosongkan untuk waktu sekarang</p>
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                              Foto Bukti (Evidence)
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => setPhotoFiles((prev) => ({ ...prev, [stg.key]: e.target.files?.[0] || null }))}
                              className="w-full text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:border-gray-200 file:bg-gray-50 file:text-xs file:font-medium hover:file:bg-gray-100"
                            />
                          </div>
                          <button
                            onClick={() => handleSave(stg.key)}
                            disabled={saving === stg.key}
                            className="w-full py-1.5 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                          >
                            {saving === stg.key ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Simpan {stg.label}
                          </button>
                        </div>
                      )}

                      {/* Pending state */}
                      {!filled && !isActive && (
                        <p className="mt-1 text-xs text-gray-300 italic">Menunggu...</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completed banner */}
          {allComplete && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <p className="text-sm font-semibold text-green-700">Semua proses selesai!</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50">
          <button onClick={onClose} className="btn-secondary text-xs">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Evidence Photo Viewer Modal ────────────────────────── */
function EvidencePhotoViewerModal({ previewPhoto, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [previewPhoto?.url, retryKey]);

  if (!previewPhoto) return null;

  const rawUrl = previewPhoto.url;
  const filename = previewPhoto.filename || rawUrl.split('?')[0].split('/').pop();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden flex flex-col min-h-[380px] max-h-[90vh]">
        {/* Top Header */}
        <div className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0 pr-3">
            <div className="p-1.5 rounded-lg bg-lime-500/10 text-lime-400 flex-shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
                {previewPhoto.title || 'Foto Bukti Pengerjaan'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">{filename}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <a
              href={rawUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Buka di tab baru"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={rawUrl}
              download={filename}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Unduh foto"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative flex-1 flex items-center justify-center p-3 sm:p-5 overflow-auto bg-slate-950/80 min-h-[300px]">
          {loading && !error && (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-lime-400" />
              <span className="text-xs">Memuat foto bukti...</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-sm">
              <AlertCircle className="w-10 h-10 text-rose-400" />
              <div>
                <p className="text-sm font-semibold text-white">Gagal Memuat Foto</p>
                <p className="text-xs text-slate-400 mt-1">
                  Foto bukti belum tersedia atau gagal dimuat dari server.
                </p>
              </div>
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-500 text-slate-900 font-semibold text-xs hover:bg-lime-400 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Muat Ulang
              </button>
            </div>
          )}

          <img
            key={retryKey}
            src={rawUrl}
            alt={previewPhoto.title}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
            className={`max-w-full max-h-[72vh] object-contain rounded-xl shadow-lg transition-opacity duration-300 ${
              loading || error ? 'hidden' : 'block'
            }`}
          />
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>Cleanox Take Home Evidence</span>
          <span>PT Waschen Alora Indonesia</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main Cleanox Take Home Page ────────────────────────── */
export default function CleanoxTakeHomePage() {
  const user = getUser();
  const token = getToken();

  // Permission: company_id = 1 or 3
  const userCompanyId = user?.company_id != null ? Number(user.company_id) : null;
  const canUpdate = userCompanyId === 1 || userCompanyId === 3 || Boolean(user?.isManagement);

  // States
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [availablePeriods, setAvailablePeriods] = useState([]);

  // Table filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(new Set());
  const [dateStart, setDateStart] = useState(DEFAULT_START);
  const [dateEnd, setDateEnd] = useState(DEFAULT_END);
  const [quickLabel, setQuickLabel] = useState(`${MONTHS_ID[periodMonth - 1]} ${periodYear}`);
  const [applied, setApplied] = useState({
    date_start: DEFAULT_START,
    date_end: DEFAULT_END,
    search: '',
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });

  // Tracking modal & photo preview modal
  const [trackingRow, setTrackingRow] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Load available periods from API
  useEffect(() => {
    const loadPeriods = async () => {
      try {
        const { data } = await api.get('/cleanox-takehome/available-periods');
        if (data?.periods) {
          setAvailablePeriods(data.periods);
        }
      } catch (err) {
        console.warn('[takehome/periods]', err.message);
      }
    };
    loadPeriods();
  }, []);

  /* ── Dynamic Ranges: Full 12 Months per Year ────────── */
  const dynamicRanges = useMemo(() => {
    const years = new Set([_curYear, _curYear - 1]);
    (availablePeriods || []).forEach((p) => {
      if (p.yr) years.add(Number(p.yr));
    });

    const monthRanges = [];
    Array.from(years)
      .sort((a, b) => b - a)
      .forEach((yr) => {
        for (let m = 1; m <= 12; m += 1) {
          const s = cutoffStart(yr, m);
          const e = cutoffEnd(yr, m);
          const label = `${MONTHS_ID[m - 1]} ${yr}`;
          monthRanges.push({ label, range: () => ({ date_start: s, date_end: e }) });
        }
      });

    return [
      ...buildStaticRanges(),
      ...monthRanges,
    ];
  }, [availablePeriods]);

  /* ── Fetch Data ─────────────────────────────────────── */
  const fetchData = useCallback(
    async (page = 1, limit = pagination.limit) => {
      setLoading(true);
      setError('');
      try {
        const stageParam = statusFilter.size > 0 ? Array.from(statusFilter).join(',').toLowerCase() : undefined;
        const params = {
          page,
          limit,
          search: applied.search || undefined,
          stage: stageParam,
          date_start: applied.date_start || undefined,
          date_end: applied.date_end || undefined,
        };

        const { data } = await api.get('/cleanox-takehome', { params });
        setRows(data.data || []);
        setPagination({
          page: data.pagination?.page || 1,
          limit: data.pagination?.limit || limit,
          total: data.pagination?.total || 0,
          totalPages: data.pagination?.totalPages || 1,
        });

        // Update trackingRow if open
        if (trackingRow) {
          const updated = (data.data || []).find((r) => r.id === trackingRow.id);
          if (updated) setTrackingRow(updated);
        }
      } catch (err) {
        console.error('[takehome/fetchData]', err);
        setError(err.response?.data?.message || 'Gagal mengambil data Take Home');
      } finally {
        setLoading(false);
      }
    },
    [applied, statusFilter, trackingRow]
  );

  useEffect(() => {
    fetchData(pagination.page, pagination.limit);
  }, [applied, statusFilter]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied((prev) => ({ ...prev, search: search.trim() }));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const applyFilter = () => {
    setApplied({
      date_start: dateStart,
      date_end: dateEnd,
      search: search.trim(),
    });
  };

  const applyQuick = (qr) => {
    const r = qr.range();
    setDateStart(r.date_start);
    setDateEnd(r.date_end);
    setQuickLabel(qr.label);
    setApplied({
      date_start: r.date_start,
      date_end: r.date_end,
      search: search.trim(),
    });
  };

  const updateStatusFilter = (next) => {
    setStatusFilter(next);
  };

  const goPage = (p) => {
    setPagination((prev) => ({ ...prev, page: p }));
    fetchData(p, pagination.limit);
  };

  const changeLimit = (l) => {
    setPagination((prev) => ({ ...prev, limit: l, page: 1 }));
    fetchData(1, l);
  };

  const pageButtons = () => {
    const total = pagination.totalPages;
    const cur = pagination.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (cur >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', cur - 1, cur, cur + 1, '…', total];
  };

  /* Columns definition (Identik styling Waschen) */
  const COLS = [
    { key: 'no', label: 'No', align: 'center', w: 'w-10' },
    { key: 'no_nota', label: 'No Nota', align: 'left' },
    { key: 'customer_nama', label: 'Customer', align: 'left' },
    { key: 'layanan', label: 'Layanan / Item', align: 'left' },
    { key: 'tgl_layanan', label: 'Tgl Layanan', align: 'left' },
    { key: 'tgl_selesai', label: 'Tgl Selesai', align: 'left' },
    { key: 'status', label: 'Status', align: 'center' },
    { key: 'lacak', label: 'Lacak', align: 'center', w: 'w-20' },
  ];

  const isAllData = applied.date_start === '2000-01-01' && applied.date_end === '2099-12-31';
  const periodeValue = isAllData ? 'Semua Data' : `${fmtDate(applied.date_start)} – ${fmtDate(applied.date_end)}`;

  return (
    <>
      <LoadingBar visible={loading} />

      {/* ── Tracking Modal ───────────────────────────────── */}
      <TrackingModal
        show={Boolean(trackingRow)}
        onClose={() => setTrackingRow(null)}
        row={trackingRow}
        canUpdate={canUpdate}
        onStageUpdated={() => fetchData(pagination.page, pagination.limit)}
        onPhotoPreview={(url, title, filename) => setPreviewPhoto({ url, title, filename })}
      />

      {/* ── HD Photo Viewer Modal ────────────────────────── */}
      <EvidencePhotoViewerModal
        previewPhoto={previewPhoto}
        onClose={() => setPreviewPhoto(null)}
      />

      {/* ── Page Container (Identik Waschen) ─────────────── */}
      <div className="p-3 sm:p-5 space-y-4 max-w-[1400px] mx-auto">
        {/* ── Page header ─── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Production Status Cleanox Take Home</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Tracking status produksi per transaksi Cleanox Take Home — klik Lacak untuk detail progres
            </p>
          </div>
          <button
            onClick={() => fetchData(pagination.page, pagination.limit)}
            disabled={loading}
            className="btn-secondary text-xs sm:text-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* ── Quick range dropdown ─── */}
        <QuickRangeDropdown ranges={dynamicRanges} onSelect={applyQuick} currentLabel={quickLabel} />

        {/* ── Filter card ─── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Filter Data</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Mulai</label>
              <DateInput value={dateStart} onChange={setDateStart} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Akhir</label>
              <DateInput value={dateEnd} onChange={setDateEnd} className="input-field text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={applyFilter} disabled={loading} className="btn-primary w-full">
                <Search className="w-4 h-4" />
                Terapkan Filter
              </button>
            </div>
          </div>

          {/* Active tags */}
          {statusFilter.size > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
              <span className="text-xs text-gray-400">Filter aktif:</span>
              <span className="inline-flex items-center gap-1 badge bg-lime-100 text-lime-700">
                <Filter className="w-3 h-3" />
                {statusFilter.size} filter status aktif
                <button onClick={() => updateStatusFilter(new Set())} className="hover:text-lime-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}
        </div>

        {/* ── Stats ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: FileText,
              label: isAllData ? 'Total Seluruh Item Layanan' : 'Item Layanan di Periode Ini',
              value: loading ? null : `${pagination.total} item`,
              color: 'text-brand-600',
              bg: 'bg-brand-50'
            },
            {
              icon: Calendar,
              label: 'Periode Terpilih',
              value: periodeValue,
              color: 'text-teal-600',
              bg: 'bg-teal-50'
            },
          ].map((s) => (
            <div key={s.label} className="card flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium">{s.label}</p>
                {s.value === null ? (
                  <div className="h-5 w-24 bg-gray-100 rounded animate-pulse mt-0.5" />
                ) : (
                  <p className="text-base sm:text-lg font-bold text-gray-900 truncate">{s.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Status legend ─── */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 font-medium">Status:</span>
          {VALID_STATUSES.map((st) => {
            const isActive = statusFilter.has(st);
            return (
              <button
                key={st}
                type="button"
                title={`Filter: ${st}`}
                onClick={() => {
                  const next = new Set(statusFilter);
                  if (next.has(st)) next.delete(st); else next.add(st);
                  updateStatusFilter(next);
                }}
                className={`transition-all duration-150 rounded-full ${
                  isActive ? 'ring-2 ring-offset-1 ring-gray-400 scale-105' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <StatusBadge status={st} />
              </button>
            );
          })}
          {statusFilter.size > 0 && (
            <button
              type="button"
              onClick={() => updateStatusFilter(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              reset
            </button>
          )}
        </div>

        {/* ── Table card ─── */}
        <div className="card p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-gray-50 flex-wrap">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nota, customer, alamat…"
                className="input-field pl-9 text-xs sm:text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-sm flex-shrink-0">
              <span className="text-gray-400 text-xs hidden sm:inline">Baris:</span>
              <select
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                value={pagination.limit}
                onChange={(e) => changeLimit(Number(e.target.value))}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[1000px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 sm:px-4 py-3 text-[11px] font-semibold text-white/90 uppercase tracking-wider whitespace-nowrap
                        ${col.align === 'center' ? 'text-center' : 'text-left'} ${col.w || ''}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Loading skeleton */}
                {loading && Array.from({ length: Math.min(pagination.limit || 6, 10) }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50 animate-pulse">
                    {COLS.map((c) => (
                      <td key={c.key} className="px-3 sm:px-4 py-3">
                        <div className={`h-3 bg-gray-100 rounded-full ${c.align === 'center' ? 'mx-auto w-16' : 'w-full max-w-[120px]'}`} />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Error */}
                {!loading && error && (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 py-16 text-center">
                      <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
                      <p className="text-red-600 font-medium text-sm">{error}</p>
                      <button
                        onClick={() => fetchData(pagination.page, pagination.limit)}
                        className="mt-3 text-sm text-brand-600 hover:underline"
                      >
                        Coba lagi
                      </button>
                    </td>
                  </tr>
                )}

                {/* Empty */}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 py-16 text-center">
                      <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">Tidak ada data di periode ini</p>
                      <p className="text-gray-300 text-xs mt-1">Coba pilih periode "Semua Data" atau bulan lainnya</p>
                    </td>
                  </tr>
                )}

                {/* Rows (Identik Waschen) */}
                {!loading &&
                  !error &&
                  rows.map((row, idx) => {
                    const rowNum = (pagination.page - 1) * pagination.limit + idx + 1;
                    const progress = row.takehome_progress || {};
                    const waLink = formatWaLink(row.customer_phone);
                    const serviceText = row.service_name
                      ? `${row.service_name} (${Number(row.item_qty || 1).toLocaleString('id-ID')} ${row.item_unit || ''})`
                      : ((row.items || []).map((it) => `${it.service_name} (${it.qty} ${it.unit || ''})`).join(', ') || '—');

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors even:bg-slate-50/30"
                      >
                        {/* No */}
                        <td className="px-3 sm:px-4 py-2.5 text-center text-xs text-gray-400 tabular-nums">
                          {rowNum}
                        </td>

                        {/* No Nota */}
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {row.transaction_no || `#${row.transaction_id || row.id}`}
                        </td>

                        {/* Customer */}
                        <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap text-xs">
                          <p>{row.customer_name || '—'}</p>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-0.5"
                            >
                              <Phone className="w-2.5 h-2.5" />
                              {row.customer_phone}
                            </a>
                          )}
                        </td>


                        {/* Layanan */}
                        <td className="px-3 sm:px-4 py-2.5 text-gray-800 font-medium text-xs max-w-xs truncate" title={serviceText}>
                          {serviceText}
                        </td>

                        {/* Tgl Layanan */}
                        <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                          {fmtDateTime(row.service_date)}
                        </td>

                        {/* Tgl Selesai */}
                        <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs">
                          {row.estimated_completion_date ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-gray-800">
                                {fmtDate(row.estimated_completion_date)}
                              </span>
                              {row.estimated_days != null && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  {row.estimated_days} hari
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 font-mono">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 sm:px-4 py-2.5 text-center">
                          <StatusBadge status={progress.status || 'Diambil'} />
                        </td>

                        {/* Lacak Button (Identik Waschen: Lime Green with MapPin) */}
                        <td className="px-3 sm:px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setTrackingRow(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-lime-500 text-white hover:bg-lime-600 transition-colors shadow-sm"
                          >
                            <MapPin className="w-3 h-3" />
                            Lacak
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination (Identik Waschen) ─── */}
          {!loading && !error && pagination.totalPages > 0 && (
            <div className="px-3 sm:px-4 py-3 border-t border-gray-50 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-700">
                  {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total).toLocaleString('id-ID')}
                  {' – '}
                  {Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString('id-ID')}
                </span>{' '}
                dari{' '}
                <span className="font-semibold text-gray-700">{pagination.total.toLocaleString('id-ID')}</span> data
              </p>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => goPage(1)}
                  disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => goPage(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="hidden sm:flex items-center gap-1">
                  {pageButtons().map((p, i) =>
                    p === '…' ? (
                      <span key={`el-${i}`} className="px-1 text-gray-400 text-xs">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => goPage(p)}
                        className={`min-w-[28px] h-[28px] px-1 text-xs rounded-lg border transition-colors ${
                          pagination.page === p
                            ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
                <span className="sm:hidden text-xs text-gray-500 px-2">
                  {pagination.page}/{pagination.totalPages}
                </span>

                <button
                  onClick={() => goPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => goPage(pagination.totalPages)}
                  disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
