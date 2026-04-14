import { useState, useEffect, useCallback, useRef } from 'react';
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
  Upload,
  Camera,
  Download,
  Trash2,
  Image,
  Eye,
} from 'lucide-react';
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
const plusDays = (dt, days) => {
  if (!dt) return null;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
};
const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
const DEFAULT_START = cutoffStart(now.getFullYear(), now.getMonth() + 1);
const DEFAULT_END = cutoffEnd(now.getFullYear(), now.getMonth() + 1);

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const buildQuickRanges = () => {
  const ranges = [];
  const n = new Date();
  ranges.push({ label: 'Hari Ini', range: () => ({ date_start: today, date_end: today }) });
  ranges.push({
    label: 'Kemarin',
    range: () => {
      const d = new Date(); d.setDate(d.getDate() - 1); const s = toISO(d);
      return { date_start: s, date_end: s };
    },
  });
  for (let i = 0; i < 12; i++) {
    const yr = n.getFullYear();
    const mo = n.getMonth() + 1 - i;
    const realYear = mo <= 0 ? yr - 1 : yr;
    const realMonth = mo <= 0 ? mo + 12 : mo;
    const s = cutoffStart(realYear, realMonth);
    const e = cutoffEnd(realYear, realMonth);
    const label = `${MONTHS_ID[realMonth - 1]} ${realYear}`;
    ranges.push({ label, range: () => ({ date_start: s, date_end: e }) });
  }
  return ranges;
};

const QUICK_RANGES = buildQuickRanges();
const PAGE_SIZES = [10, 25, 50, 100];

const OUTLET_META = {
  'Waschen Laundry Raffles Hills': { short: 'Raffles', color: 'bg-purple-100 text-purple-700' },
  'Waschen Laundry Legenda Wisata': { short: 'Legenda', color: 'bg-amber-100 text-amber-700' },
  'Waschen Laundry Canadian': { short: 'Canadian', color: 'bg-green-100 text-green-700' },
  'Waschen Citra Grand': { short: 'Citra Grand', color: 'bg-pink-100 text-pink-700' },
  'Waschen Laundry Kota Wisata': { short: 'Kota Wisata', color: 'bg-blue-100 text-blue-700' },
};
const outletMeta = (name) => OUTLET_META[name] || { short: name, color: 'bg-brand-100 text-brand-700' };

const VALID_STATUSES = ['Pickup', 'Cuci Jemur', 'Packing', 'Pengantaran', 'Tertunda'];

const STATUS_STYLE = {
  'Pickup': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'Cuci Jemur': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  'Packing': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  'Pengantaran': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  'Dibatalkan': { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  'Tertunda': { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
};

const COLS = [
  { key: 'no', label: 'No', align: 'center', filterable: false, w: 'w-10' },
  { key: 'outlet', label: 'Outlet', align: 'left', filterable: true },
  { key: 'no_nota', label: 'No Nota', align: 'left', filterable: true },
  { key: 'customer_nama', label: 'Customer', align: 'left', filterable: true },
  { key: 'nama_item', label: 'Nama Item', align: 'left', filterable: true },
  { key: 'jumlah', label: 'Ukuran', align: 'right', filterable: false },
  { key: 'tgl_terima', label: 'Tgl Terima', align: 'left', filterable: false, sortable: true },
  { key: 'tgl_selesai', label: 'Tgl Selesai', align: 'left', filterable: false, sortable: true },
  { key: 'status', label: 'Status', align: 'center', filterable: true },
  { key: 'lacak', label: 'Lacak', align: 'center', filterable: false, w: 'w-20' },
];

/* ── Quick Range Dropdown ─────────────────────────────── */
function QuickRangeDropdown({ ranges, onSelect, currentLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const cepat = ranges.filter((r) => ['Hari Ini', 'Kemarin'].includes(r.label));
  const bulan = ranges.filter((r) => !['Hari Ini', 'Kemarin'].includes(r.label));
  const byYear = {};
  bulan.forEach((r) => {
    const yr = r.label.split(' ')[1];
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
                <button key={qr.label} onClick={() => select(qr)}
                  className="flex-1 py-1.5 text-xs text-gray-700 rounded-lg border border-gray-200
                    hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors">
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
                      <button key={qr.label} onClick={() => select(qr)}
                        className={`py-1.5 text-xs rounded-lg border transition-colors px-1 truncate
                          ${currentLabel === qr.label
                            ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                            : 'border-gray-200 text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700'
                          }`}>
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
      // Some browsers throw if picker can't be opened in current state.
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

/* ── Status Badge ─────────────────────────────────────── */
function StatusBadge({ status }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>;
  const s = STATUS_STYLE[status] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      {status}
    </span>
  );
}

const displayStatus = (row) => {
  if (row?.on_hold) return 'Tertunda';
  if (row?.isContinue === 0 || row?.isContinue === '0') return 'Dibatalkan';
  return row?.status || '—';
};

/* ── Stage config for tracking modal ──────────────────── */
const STAGES = [
  { key: 'Pickup', label: 'Pickup', icon: Truck, color: 'blue', byCol: 'pickup_by', atCol: 'pickup_at' },
  { key: 'Cuci Jemur', label: 'Cuci & Jemur', icon: Waves, color: 'amber', byCol: 'cuci_jemur_by', atCol: 'cuci_jemur_at' },
  { key: 'Packing', label: 'Packing', icon: Package, color: 'purple', byCol: 'packing_by', atCol: 'packing_at' },
  { key: 'Pengantaran', label: 'Pengantaran', icon: Navigation, color: 'green', byCol: 'pengantaran_by', atCol: 'pengantaran_at' },
];

const STAGE_COLORS = {
  blue: { line: 'bg-blue-500', dot: 'bg-blue-500', dotBorder: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' },
  amber: { line: 'bg-amber-500', dot: 'bg-amber-500', dotBorder: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
  purple: { line: 'bg-purple-500', dot: 'bg-purple-500', dotBorder: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700' },
  green: { line: 'bg-green-500', dot: 'bg-green-500', dotBorder: 'border-green-200', bg: 'bg-green-50', text: 'text-green-700' },
};

/* ── Multi-select Employee Picker ─────────────────────── */
function EmployeePicker({ employees, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : employees;

  const toggle = (name) => {
    const next = selected.includes(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name];
    onChange(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1 flex-wrap min-h-[32px] px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white hover:border-brand-300 transition-colors text-left"
      >
        {selected.length === 0 && <span className="text-gray-400">Pilih pegawai...</span>}
        {selected.map((n) => (
          <span key={n} className="inline-flex items-center gap-0.5 bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
            {n}
            <button type="button" onClick={(e) => { e.stopPropagation(); toggle(n); }} className="hover:text-red-500">
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
                {selected.includes(emp.name)
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

/* ── Image compression helper (canvas) ────────────────── */
async function compressImageFile(file, maxSizeMB = 2) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const MAX_DIM = 2048;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        const maxBytes = maxSizeMB * 1024 * 1024;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (blob.size <= maxBytes || quality <= 0.3) {
                resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
              } else {
                quality -= 0.1;
                tryCompress();
              }
            },
            'image/jpeg',
            quality,
          );
        };
        tryCompress();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── Camera Modal (getUserMedia live stream) ────────────── */
function CameraModal({ show, onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [captured, setCaptured] = useState(null); // blob URL of captured frame
  const [capturedBlob, setCapturedBlob] = useState(null);

  const startStream = useCallback(async (facing) => {
    // Stop previous stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setCaptured(null);
    setCapturedBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setReady(true);
        };
      }
    } catch (err) {
      alert('Tidak bisa mengakses kamera: ' + (err.message || err));
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (show) startStream(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlip = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startStream(next);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const MAX_DIM = 2048;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);

    // Compress to ≤ 2 MB
    const MAX_BYTES = 2 * 1024 * 1024;
    let quality = 0.85;
    const tryCompress = () => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        if (blob.size <= MAX_BYTES || quality <= 0.3) {
          const url = URL.createObjectURL(blob);
          setCaptured(url);
          setCapturedBlob(blob);
        } else {
          quality -= 0.1;
          tryCompress();
        }
      }, 'image/jpeg', quality);
    };
    tryCompress();
  };

  const handleRetake = () => {
    if (captured) URL.revokeObjectURL(captured);
    setCaptured(null);
    setCapturedBlob(null);
  };

  const handleUse = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    if (captured) URL.revokeObjectURL(captured);
    setCaptured(null);
    setCapturedBlob(null);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black" onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 flex-shrink-0">
        <button onClick={onClose} className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors">
          <X className="w-4 h-4" /> Batal
        </button>
        <p className="text-white text-sm font-semibold">Ambil Foto</p>
        <button onClick={handleFlip} className="text-white/70 hover:text-white text-sm transition-colors" title="Flip kamera">
          🔄
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        <canvas ref={canvasRef} className="hidden" />

        {!captured ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="max-h-full max-w-full object-contain"
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
            {/* Focus frame overlay */}
            {ready && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-white/40 rounded-xl" />
              </div>
            )}
          </>
        ) : (
          <img src={captured} alt="Captured" className="max-h-full max-w-full object-contain" />
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 bg-black/80 px-6 py-5">
        {!captured ? (
          <div className="flex items-center justify-center">
            <button
              onClick={handleCapture}
              disabled={!ready}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/30 shadow-lg disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center"
            >
              <div className="w-12 h-12 rounded-full bg-white" />
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleRetake}
              className="flex-1 py-3 rounded-xl border border-white/30 text-white text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Foto Ulang
            </button>
            <button
              onClick={handleUse}
              className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
            >
              Gunakan Foto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Evidance Upload Section (Pickup / Packing) ─────── */
function EvidanceSection({ itemId, stage, evidancePath, evidanceFile, userRole, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef(null);

  const canUpload = userRole === 'cleanox' || userRole === 'admin';
  const hasFile = !!evidancePath;
  const isImage = evidanceFile && /\.(jpe?g|png|gif|webp)$/i.test(evidanceFile);

  const doUpload = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      if (/^image\//.test(file.type)) {
        file = await compressImageFile(file, 2);
        if (file.size > 5 * 1024 * 1024) return alert('File masih terlalu besar setelah dikompresi (> 5 MB)');
      } else {
        return alert('Ukuran file melebihi 5 MB');
      }
    } else if (/^image\//.test(file.type)) {
      file = await compressImageFile(file, 2);
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('id', itemId);
      formData.append('stage', stage);
      const { data } = await api.post('/evidance/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded(stage, data.filename, data.filepath);
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) doUpload(e.target.files[0]);
    e.target.value = '';
  };

  const handleCameraCapture = (file) => {
    setShowCamera(false);
    doUpload(file);
  };

  const handleDelete = async () => {
    if (!confirm('Hapus evidance ini?')) return;
    setDeleting(true);
    try {
      await api.delete('/evidance/delete', { data: { id: itemId, stage } });
      onUploaded(stage, null, null);
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menghapus');
    } finally {
      setDeleting(false);
    }
  };

  // Strip leading /api if stored with prefix (data lama di DB mungkin masih ada /api)
  const apiPath = evidancePath?.replace(/^\/api\//, '/');

  const handlePreview = async () => {
    if (!apiPath) return;
    try {
      const resp = await api.get(apiPath, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      setPreview(url);
      setShowPreview(true);
    } catch {
      alert('Gagal memuat preview');
    }
  };

  const handleDownload = async () => {
    if (!apiPath) return;
    try {
      const resp = await api.get(apiPath, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = evidanceFile || 'evidance';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Gagal mendownload file');
    }
  };

  const stageLabel = stage === 'pickup' ? 'Pickup' : 'Packing';

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        Evidance {stageLabel}
      </p>

      {hasFile ? (
        <div className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50">
          <div className="flex items-center gap-2">
            {isImage ? <Image className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />}
            <span className="text-xs text-gray-700 truncate flex-1" title={evidanceFile}>{evidanceFile}</span>
          </div>
          <div className="flex gap-1.5">
            {isImage && (
              <button onClick={handlePreview} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
                <Eye className="w-3 h-3" /> Preview
              </button>
            )}
            <button onClick={handleDownload} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-600 transition-colors">
              <Download className="w-3 h-3" /> Download
            </button>
            {canUpload && (
              <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors ml-auto">
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Hapus
              </button>
            )}
          </div>
        </div>
      ) : canUpload ? (
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border border-dashed border-gray-300 bg-white text-gray-600 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-50 transition-colors"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload File
          </button>
          <button
            onClick={() => setShowCamera(true)}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border border-dashed border-amber-300 bg-white text-amber-600 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            Ambil Foto
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">Belum ada evidance</p>
      )}

      {/* Fullscreen image preview */}
      {showPreview && preview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => { setShowPreview(false); URL.revokeObjectURL(preview); setPreview(null); }}>
          <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setShowPreview(false); URL.revokeObjectURL(preview); setPreview(null); }}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors z-10">
              <X className="w-4 h-4 text-gray-600" />
            </button>
            <img src={preview} alt="Preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
          </div>
        </div>
      )}

      {/* Live camera modal */}
      <CameraModal show={showCamera} onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
    </div>
  );
}

/* ── Tracking Modal (JNE-style) ───────────────────────── */
function TrackingModal({ show, onClose, row, userRole }) {
  const [tracking, setTracking] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // stage key being saved
  const [stageForm, setStageForm] = useState({});
  const [catatan, setCatatan] = useState('');
  const [decisionCatatan, setDecisionCatatan] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [savingCatatan, setSavingCatatan] = useState(false);
  const [editingStage, setEditingStage] = useState(null); // stage key admin is overriding
  const [onHoldSuccess, setOnHoldSuccess] = useState(false);

  useEffect(() => {
    if (!show) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [show]);

  // Fetch tracking data + employees on open
  useEffect(() => {
    if (!show || !row) return;
    setLoading(true);
    setStageForm({});
    setCatatan('');
    setDecisionCatatan('');
    setEditingStage(null);
    setOnHoldSuccess(false);

    const fetchAll = async () => {
      try {
        const [trackRes, empRes] = await Promise.all([
          api.get('/cleanox-by-waschen-production/tracking', {
            params: { id: row.id },
          }),
          (userRole === 'cleanox' || userRole === 'admin') ? api.get('/cleanox-by-waschen-production/employees') : Promise.resolve({ data: { employees: [] } }),
        ]);
        setTracking(trackRes.data.tracking);
        setEmployees(empRes.data.employees || []);
        setCatatan(trackRes.data.tracking?.catatan_by_cleanox || '');
        setDecisionCatatan(trackRes.data.tracking?.catatan_cuci_jemur || '');

        // Init form with existing data
        const form = {};
        for (const stage of STAGES) {
          const byVal = trackRes.data.tracking[stage.byCol];
          const atVal = trackRes.data.tracking[stage.atCol];
          form[stage.key] = {
            employees: Array.isArray(byVal) ? byVal : [],
            timestamp: atVal ? atVal.slice(0, 16) : '', // datetime-local format
          };
        }
        setStageForm(form);
      } catch {
        setTracking(null);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [show, row, userRole]);

  const handleSaveCatatan = async () => {
    setSavingCatatan(true);
    try {
      await api.patch('/cleanox-by-waschen-production/catatan', {
        id: row.id,
        catatan: catatan.trim() || null,
      });
      setTracking((prev) => ({ ...prev, catatan_by_cleanox: catatan.trim() || null }));
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menyimpan catatan');
    } finally {
      setSavingCatatan(false);
    }
  };

  const handleRequestOnHold = async () => {
    setSaving('on_hold');
    try {
      await api.patch('/cleanox-by-waschen-production/on-hold', { id: row.id });
      setTracking((prev) => ({
        ...prev,
        on_hold: 1,
        isContinue: null,
        continue_by: null,
        catatan_cuci_jemur: null,
      }));
      setOnHoldSuccess(true);
      window.setTimeout(() => setOnHoldSuccess(false), 1800);
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal mengajukan on hold');
    } finally {
      setSaving(null);
    }
  };

  const handleDecision = async (decision) => {
    setSavingDecision(true);
    try {
      await api.patch('/cleanox-by-waschen-production/cuci-jemur/decision', {
        id: row.id,
        decision,
        catatan: decisionCatatan.trim() || null,
      });
      const { data } = await api.get('/cleanox-by-waschen-production/tracking', {
        params: { id: row.id },
      });
      setTracking(data.tracking);
      setDecisionCatatan(data.tracking?.catatan_cuci_jemur || '');
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menyimpan keputusan');
    } finally {
      setSavingDecision(false);
    }
  };

  const handleSaveStage = async (stageKey) => {
    const form = stageForm[stageKey];
    if (!form || form.employees.length === 0) return alert('Pilih minimal 1 pegawai');

    setSaving(stageKey);
    try {
      await api.post('/cleanox-by-waschen-production/tracking', {
        id: row.id,
        stage: stageKey,
        employee_names: form.employees,
        timestamp: form.timestamp || undefined,
      });
      // Refresh tracking
      const { data } = await api.get('/cleanox-by-waschen-production/tracking', {
        params: { id: row.id },
      });
      setTracking(data.tracking);
      const byVal = data.tracking[STAGES.find((s) => s.key === stageKey).byCol];
      const atVal = data.tracking[STAGES.find((s) => s.key === stageKey).atCol];
      setStageForm((prev) => ({
        ...prev,
        [stageKey]: {
          employees: Array.isArray(byVal) ? byVal : [],
          timestamp: atVal ? atVal.slice(0, 16) : '',
        },
      }));
      setEditingStage(null); // close admin override form after save
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setSaving(null);
    }
  };

  const updateFormField = (stageKey, field, value) => {
    setStageForm((prev) => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], [field]: value },
    }));
  };

  const handleEvidanceUploaded = (stage, filename, filepath) => {
    const fileCol = stage === 'pickup' ? 'pickup_evidance_file' : 'packing_evidance_file';
    const pathCol = stage === 'pickup' ? 'pickup_evidance_path' : 'packing_evidance_path';
    setTracking((prev) => ({ ...prev, [fileCol]: filename, [pathCol]: filepath }));
  };

  if (!show) return null;

  // Permission flags
  const isProduksiRole = userRole === 'cleanox' || userRole === 'produksi';
  const canFillNext = isProduksiRole || userRole === 'admin';
  const canEditFilled = userRole === 'admin';
  const canDecideOnHold = userRole === 'frontliner' || userRole === 'admin';
  const isRejectedByFrontliner = tracking?.isContinue === 0 || tracking?.isContinue === '0';
  const productionLocked = isProduksiRole && isRejectedByFrontliner;

  // Determine current active stage index
  const currentStageIdx = tracking
    ? STAGES.reduce((acc, stage, idx) => (tracking[stage.atCol] ? idx : acc), -1)
    : -1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-600" />
              Lacak Progres
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Tracking pengerjaan item</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : !tracking ? (
            <p className="text-center text-gray-400 py-8">Data tracking tidak ditemukan</p>
          ) : (
            <>
              {/* Info card */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-400">No Nota</span>
                    <p className="font-mono font-semibold text-gray-800">{tracking.no_nota}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Outlet</span>
                    <p className="font-semibold text-gray-800">{tracking.outlet || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Customer</span>
                    <p className="font-semibold text-gray-800">{tracking.customer_nama || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Alamat</span>
                    <p className="font-semibold text-gray-800">{tracking.alamat_customer || '—'}</p>
                  </div>
                </div>
                <div className="pt-1 border-t border-gray-200">
                  <span className="text-gray-400">Nama Item</span>
                  <p className="font-semibold text-gray-800">{tracking.nama_item}</p>
                  <span className="text-gray-400 mt-1.5 block">Keterangan Dari FL Via Smartlink</span>
                  <p className="font-medium text-gray-700">{tracking.keterangan || '—'}</p>
                </div>
                {tracking.on_hold ? (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Status Tertunda</p>
                        <p className="text-xs text-rose-600">Item ini menunggu pengecekan FL.</p>
                      </div>
                      <StatusBadge status="Tertunda" />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={decisionCatatan}
                        onChange={(e) => canDecideOnHold && setDecisionCatatan(e.target.value)}
                        placeholder="Catatan pengecekan / konfirmasi customer (opsional)"
                        readOnly={!canDecideOnHold}
                        className={`flex-1 px-3 py-2 text-xs border border-rose-200 rounded-lg bg-white ${canDecideOnHold ? 'focus:outline-none focus:ring-1 focus:ring-rose-400' : 'text-gray-500 cursor-not-allowed'}`}
                      />
                      {canDecideOnHold && (
                        <>
                          <button
                            onClick={() => handleDecision('lanjut')}
                            disabled={savingDecision}
                            className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          >
                            {savingDecision ? 'Menyimpan...' : 'Lanjut'}
                          </button>
                          <button
                            onClick={() => handleDecision('batal')}
                            disabled={savingDecision}
                            className="px-3 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          >
                            {savingDecision ? 'Menyimpan...' : 'Batal'}
                          </button>
                        </>
                      )}
                    </div>
                    {!canDecideOnHold && (
                      <p className="text-[11px] text-rose-600">Mode baca saja. Keputusan hanya bisa diisi Frontliner/Admin.</p>
                    )}
                  </div>
                ) : null}

                {!tracking.on_hold && tracking?.continue_by && (
                  <div className={`mt-3 rounded-lg border p-3 space-y-1.5 ${tracking.isContinue === 1 ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${tracking.isContinue === 1 ? 'text-emerald-700' : 'text-rose-700'}`}>Riwayat Keputusan FL</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs ${tracking.isContinue === 1 ? 'text-emerald-700' : 'text-rose-700'}`}>Diputuskan oleh: <strong>{tracking.continue_by}</strong></span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${tracking.isContinue === 1 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>
                        {tracking.isContinue === 1 ? 'ACC Lanjut' : 'Batal'}
                      </span>
                    </div>
                    <p className={`text-xs ${tracking.isContinue === 1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      Catatan FL: {tracking.catatan_cuci_jemur || 'Tidak ada catatan'}
                    </p>
                  </div>
                )}

                {productionLocked && (
                  <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
                    <p className="text-xs font-semibold text-rose-700">Progres dihentikan</p>
                    <p className="text-xs text-rose-600 mt-0.5">Frontliner memilih Batal. Tim produksi tidak dapat melanjutkan progres item ini.</p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="relative pl-4">
                {STAGES.map((stage, idx) => {
                  const sc = STAGE_COLORS[stage.color];
                  const filled = !!tracking[stage.atCol];
                  const isActive = idx === currentStageIdx + 1 && canFillNext && !productionLocked;
                  const isEditing = filled && canEditFilled && editingStage === stage.key;
                  const Icon = stage.icon;
                  const form = stageForm[stage.key] || { employees: [], timestamp: '' };

                  const byVal = tracking[stage.byCol];
                  const byNames = Array.isArray(byVal) ? byVal : [];
                  const atVal = tracking[stage.atCol];
                  const deadlineVal = stage.key === 'Cuci Jemur' ? tracking?.cuci_jemur_deadline_at : null;
                  const previewDeadline = stage.key === 'Cuci Jemur'
                    ? plusDays(form.timestamp || new Date(), 10)
                    : null;

                  return (
                    <div key={stage.key} className="relative pb-6 last:pb-0">
                      {/* Vertical line */}
                      {idx < STAGES.length - 1 && (
                        <div
                          className={`absolute left-[11px] top-8 w-0.5 h-[calc(100%-16px)] ${filled ? sc.line : 'bg-gray-200'
                            }`}
                        />
                      )}

                      {/* Dot */}
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${filled
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
                              {stage.label}
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
                                <span className={`font-medium ${sc.text}`}>{byNames.join(', ') || '—'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Clock className="w-3 h-3 flex-shrink-0" />
                                  <span className={sc.text}>{fmtDateTime(atVal)}</span>
                                </div>
                                {canEditFilled && (
                                  <button
                                    onClick={() => setEditingStage(stage.key)}
                                    title="Koreksi (Admin)"
                                    className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
                                  >
                                    <Pencil className="w-2.5 h-2.5" /> Koreksi
                                  </button>
                                )}
                              </div>
                              {stage.key === 'Cuci Jemur' && (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Calendar className="w-3 h-3 flex-shrink-0" />
                                  <span className={sc.text}>Estimasi selesai Maks: {fmtDateTime(deadlineVal)}</span>
                                </div>
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
                                  onChange={(v) => updateFormField(stage.key, 'employees', v)}
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
                                  onChange={(e) => updateFormField(stage.key, 'timestamp', e.target.value)}
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveStage(stage.key)}
                                  disabled={saving === stage.key}
                                  className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                                >
                                  {saving === stage.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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

                          {/* Editable form (only for the next unfilled stage, if not readOnly) */}
                          {!filled && isActive && (
                            <div className="mt-2 space-y-2 bg-white border border-gray-200 rounded-lg p-3">
                              <div>
                                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                                  Dikerjakan Oleh
                                </label>
                                <EmployeePicker
                                  employees={employees}
                                  selected={form.employees}
                                  onChange={(v) => updateFormField(stage.key, 'employees', v)}
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
                                  onChange={(e) => updateFormField(stage.key, 'timestamp', e.target.value)}
                                />
                                <p className="text-[10px] text-gray-400 mt-0.5">Kosongkan untuk waktu sekarang</p>
                                {stage.key === 'Cuci Jemur' && (
                                  <p className="text-[10px] text-brand-600 mt-0.5">
                                    Estimasi selesai otomatis: {fmtDateTime(previewDeadline)} (10 hari)
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => handleSaveStage(stage.key)}
                                disabled={saving === stage.key}
                                className="w-full py-1.5 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                              >
                                {saving === stage.key ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                Simpan {stage.label}
                              </button>
                              {stage.key === 'Cuci Jemur' && (userRole === 'cleanox' || userRole === 'admin') && (
                                <>
                                  <button
                                    onClick={handleRequestOnHold}
                                    disabled={saving === 'on_hold'}
                                    className={`w-full py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${onHoldSuccess
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                      : 'border-rose-200 text-rose-700 hover:bg-rose-50'} disabled:opacity-60`}
                                  >
                                    {saving === 'on_hold'
                                      ? 'Mengajukan...'
                                      : onHoldSuccess
                                        ? 'On Hold Berhasil'
                                        : 'On Hold - Tunda Progres'}
                                  </button>
                                  {onHoldSuccess && (
                                    <p className="text-[10px] text-emerald-600 animate-pulse">Permintaan on hold berhasil dikirim.</p>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {/* Pending state */}
                          {!filled && !isActive && (
                            <p className="mt-1 text-xs text-gray-300 italic">Menunggu...</p>
                          )}

                          {/* Evidance section for Pickup & Packing (show when stage is filled) */}
                          {(stage.key === 'Pickup' || stage.key === 'Packing') && filled && (
                            <div className="mt-2">
                              <EvidanceSection
                                itemId={row.id}
                                stage={stage.key === 'Pickup' ? 'pickup' : 'packing'}
                                evidancePath={tracking[stage.key === 'Pickup' ? 'pickup_evidance_path' : 'packing_evidance_path']}
                                evidanceFile={tracking[stage.key === 'Pickup' ? 'pickup_evidance_file' : 'packing_evidance_file']}
                                userRole={userRole}
                                onUploaded={handleEvidanceUploaded}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Completed banner */}
              {currentStageIdx === STAGES.length - 1 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
                  <p className="text-sm font-semibold text-green-700">Semua proses selesai!</p>
                </div>
              )}

              {/* Catatan Cleanox */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block">
                  Catatan Dari Team Cleanox (Opsional)
                </label>
                {userRole === 'frontliner' ? (
                  /* Read-only view for frontliner */
                  <div className={`px-3 py-2.5 text-xs rounded-lg border ${tracking?.catatan_by_cleanox ? 'bg-gray-50 border-gray-200 text-gray-800' : 'bg-gray-50 border-gray-200 text-gray-400 italic'}`}>
                    {tracking?.catatan_by_cleanox || 'Catatan Kosong'}
                  </div>
                ) : (
                  /* Editable for cleanox, admin, and others */
                  <>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                      placeholder="Tambahkan catatan..."
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveCatatan}
                        disabled={savingCatatan}
                        className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                      >
                        {savingCatatan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Simpan Catatan
                      </button>
                      {tracking?.catatan_by_cleanox && (
                        <button
                          onClick={async () => {
                            setCatatan('');
                            setSavingCatatan(true);
                            try {
                              await api.patch('/cleanox-by-waschen-production/catatan', { id: row.id, catatan: null });
                              setTracking((prev) => ({ ...prev, catatan_by_cleanox: null }));
                            } catch (err) {
                              alert(err.response?.data?.message || 'Gagal menghapus catatan');
                            } finally {
                              setSavingCatatan(false);
                            }
                          }}
                          disabled={savingCatatan}
                          title="Hapus catatan"
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */
export default function CleanoxByWaschenProductionPage() {
  const user = getUser();

  const [dateStart, setDateStart] = useState(DEFAULT_START);
  const [dateEnd, setDateEnd] = useState(DEFAULT_END);
  const [outlet, setOutlet] = useState('');
  const [dateField, setDateField] = useState('tgl_terima');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(new Set());

  const [applied, setApplied] = useState({
    date_start: DEFAULT_START,
    date_end: DEFAULT_END,
    outlet: '',
    date_field: 'tgl_terima',
    sort_key: '',
    sort_dir: 'desc',
    search: '',
    status: '',
  });

  const [outlets, setOutlets] = useState([]);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ total: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quickLabel, setQuickLabel] = useState('');

  // Tracking modal
  const [trackingRow, setTrackingRow] = useState(null);

  const abortRef = useRef(null);

  /* Fetch outlets once */
  useEffect(() => {
    api.get('/cleanox-by-waschen-production/outlets')
      .then(({ data }) => setOutlets(data.outlets || []))
      .catch(() => { });
  }, []);

  /* Core fetch */
  const fetchData = useCallback(async (page, limit, f = applied) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      date_start: f.date_start,
      date_end: f.date_end,
      date_field: f.date_field || 'tgl_terima',
      ...(f.outlet && { outlet: f.outlet }),
      ...(f.sort_key && { sort_key: f.sort_key, sort_dir: f.sort_dir || 'asc' }),
      ...(f.search && { search: f.search }),
      ...(f.status && { status: f.status }),
      page,
      limit,
    });

    try {
      const { data } = await api.get(`/cleanox-by-waschen-production?${params}`, { signal: ctrl.signal });
      setRows(data.data);
      setStats(data.stats);
      setPagination(data.pagination);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setError(err.response?.data?.message || 'Gagal memuat data. Coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    fetchData(1, pagination.limit || 25, applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  /* Real-time SSE — sync updates from all users */
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`/api/cleanox-by-waschen-production/events?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

        setRows((prev) =>
          prev.map((r) =>
            r.id === payload.id
              ? {
                ...r,
                ...(has(payload, 'status') ? { status: payload.status } : {}),
                ...(has(payload, 'on_hold') ? { on_hold: payload.on_hold } : {}),
                ...(has(payload, 'isContinue') ? { isContinue: payload.isContinue } : {}),
                ...(has(payload, 'continue_by') ? { continue_by: payload.continue_by } : {}),
                ...(has(payload, 'catatan_cuci_jemur') ? { catatan_cuci_jemur: payload.catatan_cuci_jemur } : {}),
                ...(has(payload, 'cuci_jemur_deadline_at') ? { cuci_jemur_deadline_at: payload.cuci_jemur_deadline_at } : {}),
                ...(has(payload, 'updated_at') ? { updated_at: payload.updated_at } : {}),
              }
              : r
          )
        );

        setTrackingRow((prev) => {
          if (!prev || prev.id !== payload.id) return prev;
          return {
            ...prev,
            ...(has(payload, 'status') ? { status: payload.status } : {}),
            ...(has(payload, 'on_hold') ? { on_hold: payload.on_hold } : {}),
            ...(has(payload, 'isContinue') ? { isContinue: payload.isContinue } : {}),
            ...(has(payload, 'continue_by') ? { continue_by: payload.continue_by } : {}),
            ...(has(payload, 'catatan_cuci_jemur') ? { catatan_cuci_jemur: payload.catatan_cuci_jemur } : {}),
            ...(has(payload, 'cuci_jemur_deadline_at') ? { cuci_jemur_deadline_at: payload.cuci_jemur_deadline_at } : {}),
            ...(has(payload, 'updated_at') ? { updated_at: payload.updated_at } : {}),
          };
        });
      } catch { }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    const q = search.trim();
    const t = setTimeout(() => {
      setApplied((prev) => (prev.search === q ? prev : { ...prev, search: q }));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const updateStatusFilter = (next) => {
    setStatusFilter(next);
    setApplied((prev) => ({
      ...prev,
      status: next.size > 0 ? Array.from(next).join(',') : '',
    }));
  };

  const applyFilter = () => setApplied((prev) => ({
    date_start: dateStart,
    date_end: dateEnd,
    outlet,
    date_field: dateField,
    sort_key: prev.sort_key,
    sort_dir: prev.sort_dir,
    search: search.trim(),
    status: prev.status,
  }));

  const applyQuick = (qr) => {
    const r = qr.range();
    setDateStart(r.date_start);
    setDateEnd(r.date_end);
    setQuickLabel(qr.label);
    setApplied((prev) => ({
      date_start: r.date_start,
      date_end: r.date_end,
      outlet,
      date_field: dateField,
      sort_key: prev.sort_key,
      sort_dir: prev.sort_dir,
      search: search.trim(),
      status: prev.status,
    }));
  };

  const goPage = (p) => { setPagination((prev) => ({ ...prev, page: p })); fetchData(p, pagination.limit); };
  const changeLimit = (l) => { setPagination((prev) => ({ ...prev, limit: l, page: 1 })); fetchData(1, l); };

  const toggleSort = (key) => {
    setApplied((prev) => ({
      ...prev,
      sort_dir: prev.sort_key === key ? (prev.sort_dir === 'asc' ? 'desc' : 'asc') : 'asc',
      sort_key: key,
    }));
  };

  const filtered = rows;

  /* Page buttons */
  const pageButtons = () => {
    const total = pagination.totalPages, cur = pagination.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (cur >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', cur - 1, cur, cur + 1, '…', total];
  };

  const activeColFiltersCount = statusFilter.size;

  return (
    <>
      <LoadingBar visible={loading} />
      <TrackingModal
        show={!!trackingRow}
        onClose={() => setTrackingRow(null)}
        row={trackingRow}
        userRole={user?.role}
      />
      <div className="p-3 sm:p-5 space-y-4 max-w-[1400px] mx-auto">

        {/* ── Page header ─── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Production Status</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Tracking status produksi per item Cleanox &amp; Karpet — klik Lacak untuk detail progres
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
        <QuickRangeDropdown ranges={QUICK_RANGES} onSelect={applyQuick} currentLabel={quickLabel} />

        {/* ── Filter card ─── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Filter Data</span>
            <span className="text-xs text-gray-400 ml-auto">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Filter berdasarkan:
              <select
                value={dateField}
                onChange={(e) => setDateField(e.target.value)}
                className="ml-1.5 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"
              >
                <option value="tgl_terima">Tgl Terima</option>
                <option value="tgl_selesai">Tgl Selesai</option>
              </select>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Mulai</label>
              <DateInput value={dateStart} onChange={setDateStart} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Akhir</label>
              <DateInput value={dateEnd} onChange={setDateEnd} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Outlet</label>
              <select className="input-field text-sm" value={outlet} onChange={(e) => setOutlet(e.target.value)}>
                <option value="">Semua Outlet</option>
                {outlets.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={applyFilter} disabled={loading} className="btn-primary w-full">
                <Search className="w-4 h-4" />
                Terapkan Filter
              </button>
            </div>
          </div>

          {/* Active tags */}
          {(applied.outlet || activeColFiltersCount > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
              <span className="text-xs text-gray-400">Filter aktif:</span>
              {applied.outlet && (
                <span className="inline-flex items-center gap-1 badge bg-brand-100 text-brand-700">
                  <Building2 className="w-3 h-3" />
                  {applied.outlet}
                  <button onClick={() => { setOutlet(''); setApplied((a) => ({ ...a, outlet: '' })); }} className="hover:text-brand-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {activeColFiltersCount > 0 && (
                <span className="inline-flex items-center gap-1 badge bg-lime-100 text-lime-700">
                  <Filter className="w-3 h-3" />
                  {activeColFiltersCount} filter kolom aktif
                  <button onClick={() => updateStatusFilter(new Set())} className="hover:text-lime-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Stats ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: FileText, label: 'Total Item', value: loading ? null : stats.total.toLocaleString('id-ID'), color: 'text-brand-600', bg: 'bg-brand-50' },
            { icon: Calendar, label: 'Periode', value: `${fmtDate(applied.date_start)} – ${fmtDate(applied.date_end)}`, color: 'text-teal-600', bg: 'bg-teal-50' },
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
                className={`transition-all duration-150 rounded-full ${isActive ? 'ring-2 ring-offset-1 ring-gray-400 scale-105' : 'opacity-70 hover:opacity-100'
                  }`}
              >
                <StatusBadge status={st} />
              </button>
            );
          })}
          {(statusFilter.size > 0) && (
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
                placeholder="Cari nota, customer, item…"
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
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
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
                      onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                      className={`px-3 sm:px-4 py-3 text-[11px] font-semibold text-white/90 uppercase tracking-wider whitespace-nowrap
                        ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                        ${col.w || ''}
                        ${col.sortable ? 'cursor-pointer select-none hover:bg-brand-700/50' : ''}`}
                    >
                      <div className={`flex items-center gap-0.5 ${col.align === 'center' ? 'justify-center' : ''}`}>
                        {col.label}
                        {col.sortable && (
                          <span className="ml-0.5">
                            {applied.sort_key === col.key ? (
                              applied.sort_dir === 'asc'
                                ? <ArrowUp className="w-3 h-3 text-lime-400" />
                                : <ArrowDown className="w-3 h-3 text-lime-400" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-white/30" />
                            )}
                          </span>
                        )}
                      </div>
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
                        <div className={`h-3 bg-gray-100 rounded-full ${c.align === 'center' ? 'mx-auto w-20' : 'w-full max-w-[120px]'}`} />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Error */}
                {!loading && error && (
                  <tr><td colSpan={COLS.length} className="px-4 py-16 text-center">
                    <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
                    <p className="text-red-600 font-medium text-sm">{error}</p>
                    <button onClick={() => fetchData(pagination.page, pagination.limit)}
                      className="mt-3 text-sm text-brand-600 hover:underline">Coba lagi</button>
                  </td></tr>
                )}

                {/* Empty */}
                {!loading && !error && filtered.length === 0 && (
                  <tr><td colSpan={COLS.length} className="px-4 py-16 text-center">
                    <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">Tidak ada data</p>
                    <p className="text-gray-300 text-xs mt-1">Coba ubah filter tanggal atau outlet</p>
                  </td></tr>
                )}

                {/* Rows */}
                {!loading && !error && filtered.map((row, idx) => {
                  const rowNum = (pagination.page - 1) * pagination.limit + idx + 1;
                  const itemTitle = [row.nama_item, row.keterangan].filter((v) => v).join(' — ');
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors even:bg-slate-50/30"
                    >
                      <td className="px-3 sm:px-4 py-2.5 text-center text-xs text-gray-400 tabular-nums">{rowNum}</td>
                      <td className="px-3 sm:px-4 py-2.5">
                        <span className={`badge font-semibold text-[11px] ${outletMeta(row.outlet).color}`} title={row.outlet}>{row.outlet ? outletMeta(row.outlet).short : '—'}</span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{row.no_nota || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap text-xs">{row.customer_nama || '—'}</td>
                      <td className="px-3 sm:px-4 py-2.5 max-w-[200px]" title={itemTitle}>
                        <p className="text-gray-700 text-xs truncate">{row.nama_item || '—'}</p>
                        <p className="text-[10px] text-gray-400 truncate">{row.keterangan || '—'}</p>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums text-xs text-gray-700 whitespace-nowrap">
                        {row.jumlah != null ? <><span className="font-semibold">{Number(row.jumlah).toLocaleString('id-ID')}</span><span className="text-gray-400 ml-1">{row.satuan_item || ''}</span></> : '—'}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(row.tgl_terima)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(row.tgl_selesai)}</td>
                      <td className="px-3 sm:px-4 py-2.5 text-center">
                        <StatusBadge status={displayStatus(row)} />
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-center">
                        <button
                          onClick={() => setTrackingRow(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg
                            bg-lime-500 text-white hover:bg-lime-600 transition-colors shadow-sm"
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

          {/* ── Pagination ─── */}
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
                {filtered.length !== rows.length && (
                  <span className="ml-1 text-lime-600">(filter: {filtered.length.toLocaleString('id-ID')})</span>
                )}
              </p>

              <div className="flex items-center gap-1">
                <button onClick={() => goPage(1)} disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => goPage(pagination.page - 1)} disabled={pagination.page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="hidden sm:flex items-center gap-1">
                  {pageButtons().map((p, i) =>
                    p === '…' ? (
                      <span key={`el-${i}`} className="px-1 text-gray-400 text-xs">…</span>
                    ) : (
                      <button key={p} onClick={() => goPage(p)}
                        className={`min-w-[28px] h-[28px] px-1 text-xs rounded-lg border transition-colors ${pagination.page === p
                          ? 'bg-brand-700 text-white border-brand-700 font-semibold'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                          }`}>
                        {p}
                      </button>
                    )
                  )}
                </div>
                <span className="sm:hidden text-xs text-gray-500 px-2">
                  {pagination.page}/{pagination.totalPages}
                </span>

                <button onClick={() => goPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => goPage(pagination.totalPages)} disabled={pagination.page === pagination.totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
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