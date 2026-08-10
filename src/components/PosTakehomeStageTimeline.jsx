import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  ChevronDown,
  Package,
  Shirt,
  Truck,
  Navigation,
  HandMetal,
  Loader2,
  Square,
  Upload,
  X,
} from 'lucide-react';
import api from '../utils/api.js';

const STAGES = [
  { key: 'diambil', label: 'Diambil', icon: HandMetal, color: 'blue' },
  { key: 'dicuci', label: 'Dicuci', icon: Shirt, color: 'amber' },
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

function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
    return match ? `${match[1]}T${match[2]}:${match[3]}` : '';
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeSelectedWorkers(list = []) {
  return (list || [])
    .map((item) => {
      const employeeId = item?.employee_id != null ? Number(item.employee_id) : null;
      const employeeName = String(item?.employee_name || item?.full_name || item?.name || '').trim();
      if (!employeeName) return null;
      return {
        employee_id: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
        employee_name: employeeName,
      };
    })
    .filter(Boolean);
}

function workerOptionLabel(worker) {
  return String(worker?.full_name || worker?.employee_name || worker?.name || '').trim();
}

function WorkerMultiPicker({ workers = [], selected = [], onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return workers;
    return workers.filter((worker) => workerOptionLabel(worker).toLowerCase().includes(term));
  }, [workers, q]);

  const isSelected = (worker) => {
    const id = Number(worker.employee_id);
    return selected.some((item) => Number(item.employee_id) === id);
  };

  const toggle = (worker) => {
    const id = Number(worker.employee_id);
    const name = workerOptionLabel(worker);
    if (!name || !Number.isFinite(id)) return;
    if (isSelected(worker)) {
      onChange(selected.filter((item) => Number(item.employee_id) !== id));
      return;
    }
    onChange([...selected, { employee_id: id, employee_name: name }]);
  };

  const remove = (employeeId) => {
    onChange(selected.filter((item) => Number(item.employee_id) !== Number(employeeId)));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-1 flex-wrap min-h-[36px] px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:border-slate-300 transition-colors text-left disabled:opacity-60"
      >
        {selected.length === 0 && <span className="text-slate-400">Pilih pekerja...</span>}
        {selected.map((item) => (
          <span
            key={`${item.employee_id}-${item.employee_name}`}
            className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
          >
            {item.employee_name}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                remove(item.employee_id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  remove(item.employee_id);
                }
              }}
              className="hover:text-rose-600"
            >
              <X className="w-2.5 h-2.5" />
            </span>
          </span>
        ))}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-auto flex-shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl w-full max-h-52 overflow-hidden">
          <div className="p-1.5 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              placeholder="Cari pekerja..."
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {workers.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">List pekerja Assignment Worker kosong</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Tidak ditemukan</p>
            ) : (
              filtered.map((worker) => {
                const checked = isSelected(worker);
                return (
                  <button
                    key={worker.employee_id}
                    type="button"
                    onClick={() => toggle(worker)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 text-left"
                  >
                    {checked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                    )}
                    <span>{workerOptionLabel(worker)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PosTakehomeStageTimeline({
  transactionId,
  progress,
  previewMap = {},
  workers = [],
  disabled = false,
  onUpdated,
}) {
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const stages = useMemo(
    () =>
      STAGES.map((stage) => {
        const fromApi = (progress?.stages || []).find((item) => item.key === stage.key);
        return (
          fromApi || {
            key: stage.key,
            label: stage.label,
            filled: false,
            by: [],
            at: null,
            photo_file: null,
            photo_path: null,
          }
        );
      }),
    [progress]
  );

  const stageMap = useMemo(() => {
    const map = new Map();
    for (const stage of stages) map.set(stage.key, stage);
    return map;
  }, [stages]);

  const nextKey =
    progress?.next_stage ||
    stages.find((stage) => !stage.filled)?.key ||
    null;

  useEffect(() => {
    setForms({});
  }, [progress?.updated_at, progress?.id]);

  const getSelectedWorkers = (stageKey) => {
    if (forms[stageKey] && Object.prototype.hasOwnProperty.call(forms[stageKey], 'selectedWorkers')) {
      return forms[stageKey].selectedWorkers;
    }
    return normalizeSelectedWorkers(stageMap.get(stageKey)?.by || []);
  };

  const getTimestamp = (stageKey) => forms[stageKey]?.timestamp ?? '';

  const updateForm = (key, patch) => {
    setForms((prev) => ({
      ...prev,
      [key]: {
        selectedWorkers: prev[key]?.selectedWorkers || normalizeSelectedWorkers(stageMap.get(key)?.by || []),
        timestamp: prev[key]?.timestamp ?? '',
        ...patch,
      },
    }));
  };

  const clearFormOverride = (stageKey) => {
    setForms((prev) => {
      const next = { ...prev };
      delete next[stageKey];
      return next;
    });
  };

  const handleSave = async (stageKey) => {
    if (disabled || saving) return;
    const selectedWorkers = getSelectedWorkers(stageKey);
    if (selectedWorkers.length === 0) {
      setError('Pilih minimal 1 pekerja');
      return;
    }
    setSaving(stageKey);
    setError('');
    try {
      const { data } = await api.patch(
        `/pos-transactions/${transactionId}/takehome-stages/${stageKey}`,
        {
          workers: selectedWorkers,
          timestamp: getTimestamp(stageKey) || undefined,
        }
      );
      clearFormOverride(stageKey);
      onUpdated?.(data.takehome_progress);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan stage');
    } finally {
      setSaving('');
    }
  };

  const handleClear = async (stageKey) => {
    if (disabled || saving) return;
    if (!window.confirm(`Hapus stage ${stageKey} dan semua stage setelahnya?`)) return;
    setSaving(`clear-${stageKey}`);
    setError('');
    try {
      const { data } = await api.post(
        `/pos-transactions/${transactionId}/takehome-stages/${stageKey}/clear`
      );
      clearFormOverride(stageKey);
      onUpdated?.(data.takehome_progress);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus stage');
    } finally {
      setSaving('');
    }
  };

  const handleUpload = async (stageKey, file) => {
    if (disabled || saving || !file) return;
    const selectedWorkers = getSelectedWorkers(stageKey);
    if (selectedWorkers.length === 0) {
      setError('Pilih minimal 1 pekerja sebelum upload foto');
      return;
    }
    setSaving(`upload-${stageKey}`);
    setError('');
    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('workers', JSON.stringify(selectedWorkers));
      const timestamp = getTimestamp(stageKey);
      if (timestamp) formData.append('timestamp', timestamp);
      const { data } = await api.post(
        `/pos-transactions/${transactionId}/takehome-stages/${stageKey}/evidence`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      clearFormOverride(stageKey);
      onUpdated?.(data.takehome_progress);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunggah evidence');
    } finally {
      setSaving('');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Progress Take Home</h2>
        <p className="mt-1 text-xs text-slate-500">
          Timeline operasional mirip Cleanox by Waschen. Diisi pekerja; admin bisa lihat dan edit.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-0">
        {STAGES.map((stage, idx) => {
          const data = stageMap.get(stage.key) || { filled: false, by: [], at: null, photo_path: null };
          const filled = Boolean(data.filled);
          const isActive = !filled && nextKey === stage.key;
          const sc = STAGE_COLORS[stage.color];
          const Icon = stage.icon;
          const byNames = (data.by || []).map((w) => w.employee_name).filter(Boolean);
          const selectedWorkers = getSelectedWorkers(stage.key);
          const timestampValue = getTimestamp(stage.key) || (filled ? toDatetimeLocalValue(data.at) : '');
          const preview = data.photo_path ? previewMap[data.photo_path] : null;

          return (
            <div key={stage.key} className="relative pb-6 last:pb-0">
              {idx < STAGES.length - 1 && (
                <div
                  className={`absolute left-[11px] top-8 w-0.5 h-[calc(100%-16px)] ${
                    filled ? sc.line : 'bg-slate-200'
                  }`}
                />
              )}
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                    filled ? `${sc.dot} border-white text-white shadow-sm` : `bg-white ${sc.dotBorder}`
                  }`}
                >
                  {filled ? <Check className="w-3 h-3" /> : <Icon className={`w-3 h-3 ${sc.text} opacity-50`} />}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${filled ? sc.text : 'text-slate-400'}`}>
                      {stage.label}
                    </span>
                    {filled && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                        Selesai
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                        Aktif
                      </span>
                    )}
                  </div>

                  {filled && (
                    <div className={`rounded-lg p-2.5 ${sc.bg} space-y-1`}>
                      <p className={`text-xs font-medium ${sc.text}`}>
                        {byNames.join(', ') || '—'}
                      </p>
                      <p className="text-[11px] text-slate-600">{formatDateTime(data.at)}</p>
                      {data.photo_path && (
                        <div className="pt-1">
                          {preview ? (
                            <img
                              src={preview}
                              alt={stage.label}
                              className="h-28 w-full max-w-[220px] rounded-xl object-cover border border-white/70"
                            />
                          ) : (
                            <div className="h-28 w-full max-w-[220px] rounded-xl bg-white/60 animate-pulse" />
                          )}
                        </div>
                      )}
                      {!disabled && (
                        <button
                          type="button"
                          disabled={Boolean(saving)}
                          onClick={() => handleClear(stage.key)}
                          className="mt-1 text-[11px] font-semibold text-rose-700 hover:underline disabled:opacity-60"
                        >
                          {saving === `clear-${stage.key}` ? 'Menghapus...' : 'Clear stage + setelahnya'}
                        </button>
                      )}
                    </div>
                  )}

                  {(isActive || filled) && !disabled && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">Dikerjakan oleh</span>
                        <WorkerMultiPicker
                          workers={workers}
                          selected={selectedWorkers}
                          disabled={Boolean(saving)}
                          onChange={(next) => updateForm(stage.key, { selectedWorkers: next })}
                        />
                      </div>
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">Waktu (opsional)</span>
                        <input
                          type="datetime-local"
                          value={timestampValue}
                          onChange={(e) => updateForm(stage.key, { timestamp: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={Boolean(saving)}
                          onClick={() => handleSave(stage.key)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {saving === stage.key ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Simpan {stage.label}
                        </button>
                        <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          {saving === `upload-${stage.key}` ? 'Mengunggah...' : 'Upload foto'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={Boolean(saving)}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              handleUpload(stage.key, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {!filled && !isActive && (
                    <p className="text-xs text-slate-300 italic">Menunggu...</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {progress?.all_complete && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Semua stage take-home selesai. Survey pekerja tetap diperlukan untuk menutup tugas.
        </div>
      )}
    </section>
  );
}
