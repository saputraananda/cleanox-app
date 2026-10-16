import { useEffect, useState, useRef, useMemo } from 'react';
import { X, FileText, Image as ImageIcon, Sparkles, Upload, Check, AlertCircle, Calendar, User } from 'lucide-react';
import BodyPortal from '@web/components/BodyPortal.jsx';
import { CARE_REPORT_CATEGORIES, detectReportCategory } from '@web/utils/posCareReportTips.js';
import { downloadPosCareReportPdf } from '@web/utils/posCareReportPdf.js';

function getDefaultNextMaintenance(serviceDateStr, addMonths = 3) {
  const baseDate = serviceDateStr ? new Date(serviceDateStr) : new Date();
  if (Number.isNaN(baseDate.getTime())) return '';
  baseDate.setMonth(baseDate.getMonth() + addMonths);
  return baseDate.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Thumbnail foto yang dapat diklik admin
 */
function ThumbnailOption({ photo, isSelected, onSelect, color = 'rose' }) {
  const [loadError, setLoadError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(photo.url)}
      className={`relative h-13 w-13 rounded-xl overflow-hidden border-2 transition flex flex-col items-center justify-center bg-slate-50 ${
        isSelected
          ? color === 'rose'
            ? 'border-rose-600 ring-2 ring-rose-300'
            : 'border-emerald-600 ring-2 ring-emerald-300'
          : 'border-slate-200 hover:border-slate-400'
      }`}
      title={photo.label}
    >
      {!loadError && photo.url ? (
        <img
          src={photo.url}
          alt={photo.label}
          className="h-full w-full object-cover"
          onError={() => setLoadError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-1 text-center">
          <ImageIcon className="w-4 h-4 text-slate-400" />
          <span className="text-[8px] font-semibold text-slate-600 leading-tight line-clamp-1">
            {photo.label}
          </span>
        </div>
      )}
      {isSelected && (
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            color === 'rose' ? 'bg-rose-600/35' : 'bg-emerald-600/35'
          }`}
        >
          <Check className="w-4 h-4 text-white drop-shadow" />
        </div>
      )}
    </button>
  );
}

/**
 * Preview Utama 1:1
 */
function MainPhotoPreview({ url, kind, label }) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [url]);

  return (
    <div
      className={`relative aspect-square w-full max-w-[200px] mx-auto overflow-hidden rounded-xl border-2 border-dashed ${
        kind === 'before' ? 'border-rose-200 bg-rose-50/20' : 'border-emerald-200 bg-emerald-50/20'
      } flex items-center justify-center shadow-inner`}
    >
      {url && !loadError ? (
        <img
          src={url}
          alt={`Preview ${kind}`}
          className="h-full w-full object-cover"
          onError={() => setLoadError(true)}
        />
      ) : url ? (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <ImageIcon className="w-8 h-8 text-slate-400 mb-1" />
          <span className="text-xs font-bold text-slate-700">{label || 'Foto Terpilih'}</span>
          <span className="text-[10px] text-slate-400 mt-0.5">Tercatat untuk laporan</span>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center p-4 text-center ${
            kind === 'before' ? 'text-rose-300' : 'text-emerald-300'
          }`}
        >
          <ImageIcon className="w-8 h-8 mb-1" />
          <span className="text-xs font-semibold">Belum ada foto</span>
        </div>
      )}
    </div>
  );
}

export default function PosCareReportModal({
  isOpen,
  onClose,
  transaction,
  items = [],
  customerPhotos = [],
  assignments = [],
  legacyEvidence = null,
  customerPreviewMap = {},
  evidencePreviewMap = {},
}) {
  const [reportItems, setReportItems] = useState([]);
  const [technicianName, setTechnicianName] = useState('');
  const [categoryKey, setCategoryKey] = useState(CARE_REPORT_CATEGORIES.SOFA);
  const [nextMaintenanceMonth, setNextMaintenanceMonth] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const customFileInputRef = useRef({});

  // 1. Kumpulkan semua foto customer
  const customerPhotoList = useMemo(() => {
    return (customerPhotos || []).map((cp, idx) => ({
      id: `cust-${cp.id || idx}`,
      url: customerPreviewMap[String(cp.id)] || cp.photo_path || '',
      label: `Customer #${idx + 1}`,
      source: 'customer',
    }));
  }, [customerPhotos, customerPreviewMap]);

  // 2. Kumpulkan legacy evidence
  const legacyBeforeList = useMemo(() => {
    return (legacyEvidence?.before_photos || []).map((p, idx) => {
      const key = `legacy-before-${p?.id ?? idx}`;
      return {
        id: `legacy-bef-${p?.id || idx}`,
        url: evidencePreviewMap[key] || p.photo_path || '',
        label: `Bukti Bef #${idx + 1}`,
        source: 'legacy_before',
      };
    });
  }, [legacyEvidence, evidencePreviewMap]);

  const legacyAfterList = useMemo(() => {
    return (legacyEvidence?.after_photos || []).map((p, idx) => {
      const key = `legacy-after-${p?.id ?? idx}`;
      return {
        id: `legacy-aft-${p?.id || idx}`,
        url: evidencePreviewMap[key] || p.photo_path || '',
        label: `Bukti Aft #${idx + 1}`,
        source: 'legacy_after',
      };
    });
  }, [legacyEvidence, evidencePreviewMap]);

  // Inisialisasi data ketika modal dibuka
  useEffect(() => {
    if (!isOpen || !transaction) return;

    // Deteksi teknisi otomatis dari assignment Done atau Assigned
    const doneWorker = (assignments || []).find((a) => a.assignment_status === 'Done');
    const anyWorker = (assignments || []).find((a) => ['Assigned', 'On_Progress'].includes(a.assignment_status));
    setTechnicianName(doneWorker?.employee_name || anyWorker?.employee_name || '');

    // Deteksi kategori tips
    const detected = detectReportCategory(items);
    setCategoryKey(detected);

    // Default jadwal perawatan berikutnya (+3 bulan)
    setNextMaintenanceMonth(getDefaultNextMaintenance(transaction.service_date, 3));

    // Siapkan draft reportItems dengan pilihan default
    const initialReportItems = (items || []).map((item, idx) => {
      // Evidence foto per item
      const itemBeforeList = (item.evidence?.before_photos || []).map((p, pIdx) => {
        const key = `item-${item.id}-before-${p?.id ?? pIdx}`;
        return {
          id: `item-bef-${item.id}-${p?.id || pIdx}`,
          url: evidencePreviewMap[key] || p.photo_path || '',
          label: `Teknisi Bef #${pIdx + 1}`,
          source: 'item_before',
        };
      });

      const itemAfterList = (item.evidence?.after_photos || []).map((p, pIdx) => {
        const key = `item-${item.id}-after-${p?.id ?? pIdx}`;
        return {
          id: `item-aft-${item.id}-${p?.id || pIdx}`,
          url: evidencePreviewMap[key] || p.photo_path || '',
          label: `Teknisi Aft #${pIdx + 1}`,
          source: 'item_after',
        };
      });

      // Cari foto before awal: prioritaskan foto teknisi -> legacy -> customer
      let initialBefore = '';
      if (itemBeforeList.length > 0) {
        initialBefore = itemBeforeList[0].url;
      } else if (legacyBeforeList.length > idx) {
        initialBefore = legacyBeforeList[idx].url;
      } else if (legacyBeforeList.length > 0) {
        initialBefore = legacyBeforeList[0].url;
      } else if (customerPhotoList.length > idx) {
        initialBefore = customerPhotoList[idx].url;
      } else if (customerPhotoList.length > 0) {
        initialBefore = customerPhotoList[0].url;
      }

      // Cari foto after awal: prioritaskan foto teknisi -> legacy
      let initialAfter = '';
      if (itemAfterList.length > 0) {
        initialAfter = itemAfterList[0].url;
      } else if (legacyAfterList.length > idx) {
        initialAfter = legacyAfterList[idx].url;
      } else if (legacyAfterList.length > 0) {
        initialAfter = legacyAfterList[0].url;
      }

      return {
        id: item.id,
        itemName: item.service_name || `Item ${idx + 1}`,
        serviceCategory: item.category_name || '',
        beforePhoto: initialBefore,
        afterPhoto: initialAfter,
        itemBeforeList,
        itemAfterList,
      };
    });

    setReportItems(initialReportItems);
    setError('');
  }, [
    isOpen,
    transaction,
    items,
    assignments,
    customerPhotoList,
    legacyBeforeList,
    legacyAfterList,
  ]);

  if (!isOpen) return null;

  // Handle upload custom file untuk before/after
  const handleCustomUpload = (itemIndex, targetKind, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setReportItems((prev) => {
        const updated = [...prev];
        if (targetKind === 'before') {
          updated[itemIndex].beforePhoto = dataUrl;
        } else {
          updated[itemIndex].afterPhoto = dataUrl;
        }
        return updated;
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGeneratePdf = async () => {
    setGenerating(true);
    setError('');
    try {
      await downloadPosCareReportPdf({
        transaction,
        items,
        reportItems,
        technicianName,
        categoryKey,
        nextMaintenanceMonth,
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal menghasilkan PDF Cleanox Care Report');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
        <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto">
          {/* Header Modal */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-sky-50/60 via-white to-emerald-50/60 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0a3058] text-white shadow-md">
                <FileText className="w-5 h-5 text-sky-300" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  Cleanox Care Report
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    <Sparkles className="w-3 h-3 text-emerald-600" /> Maskot Baru
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih foto Before & After dan sesuaikan informasi laporan sebelum mengunduh PDF.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Konten */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Pengaturan Global Laporan */}
            <div className="grid gap-4 md:grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              {/* Teknisi */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Nama Teknisi
                </label>
                <input
                  type="text"
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Kategori Tips */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                  Kategori Layanan (Tips)
                </label>
                <select
                  value={categoryKey}
                  onChange={(e) => setCategoryKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value={CARE_REPORT_CATEGORIES.SOFA}>Deep Clean Sofa Kursi</option>
                  <option value={CARE_REPORT_CATEGORIES.KASUR}>Deep Clean Kasur</option>
                  <option value={CARE_REPORT_CATEGORIES.BATHROOM}>General Cleaning (Kamar Mandi & Toilet)</option>
                  <option value={CARE_REPORT_CATEGORIES.GENERAL}>General Cleaning (Umum)</option>
                </select>
              </div>

              {/* Jadwal Perawatan Berikutnya */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Jadwal Perawatan Berikutnya
                </label>
                <input
                  type="text"
                  value={nextMaintenanceMonth}
                  onChange={(e) => setNextMaintenanceMonth(e.target.value)}
                  placeholder="Contoh: Januari 2027"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* List Pilihan Foto Per Item Layanan */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Hasil Pengerjaan (Pilihan Foto Before & After)
                </h4>
                <span className="text-xs text-slate-500">
                  {reportItems.length} layanan terdeteksi
                </span>
              </div>

              {reportItems.map((item, idx) => {
                // Sumber BEFORE: Item before + Legacy before + Customer photos
                const availableBefore = [
                  ...(item.itemBeforeList || []),
                  ...legacyBeforeList,
                  ...customerPhotoList,
                ];

                // Sumber AFTER: Item after + Legacy after
                const availableAfter = [
                  ...(item.itemAfterList || []),
                  ...legacyAfterList,
                ];

                return (
                  <div
                    key={item.id || idx}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md">
                          Item {idx + 1}
                        </span>
                        <h5 className="text-base font-bold text-slate-900 mt-1">{item.itemName}</h5>
                        <p className="text-xs text-slate-500">{item.serviceCategory || 'Layanan Cleanox'}</p>
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      {/* ================= KOLOM BEFORE ================= */}
                      <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/30 p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                            BEFORE
                          </span>
                          <span className="text-xs text-slate-500 font-medium">Foto Sebelum Pengerjaan</span>
                        </div>

                        {/* Preview Box 1:1 */}
                        <MainPhotoPreview url={item.beforePhoto} kind="before" label="Foto Before" />

                        {/* Thumbnail Pilihan Before */}
                        <div className="space-y-2 pt-1">
                          <p className="text-[11px] font-semibold text-slate-600 uppercase">
                            Pilih dari sumber foto ({availableBefore.length} tersedia):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {availableBefore.map((p, pIdx) => {
                              const isSelected = item.beforePhoto === p.url;
                              return (
                                <ThumbnailOption
                                  key={`bef-${p.id || pIdx}`}
                                  photo={p}
                                  isSelected={isSelected}
                                  color="rose"
                                  onSelect={(chosenUrl) => {
                                    setReportItems((prev) => {
                                      const next = [...prev];
                                      next[idx].beforePhoto = chosenUrl;
                                      return next;
                                    });
                                  }}
                                />
                              );
                            })}

                            {/* Tombol Upload Sendiri */}
                            <input
                              type="file"
                              accept="image/*"
                              ref={(el) => (customFileInputRef.current[`before-${idx}`] = el)}
                              className="hidden"
                              onChange={(e) => handleCustomUpload(idx, 'before', e)}
                            />
                            <button
                              type="button"
                              onClick={() => customFileInputRef.current[`before-${idx}`]?.click()}
                              className="inline-flex h-13 w-13 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-500 hover:border-rose-400 hover:text-rose-600 transition"
                              title="Unggah Foto Before Baru"
                            >
                              <Upload className="w-4 h-4" />
                              <span className="text-[9px] font-bold mt-0.5">Upload</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* ================= KOLOM AFTER ================= */}
                      <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/30 p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                            AFTER
                          </span>
                          <span className="text-xs text-slate-500 font-medium">Foto Sesudah Pengerjaan</span>
                        </div>

                        {/* Preview Box 1:1 */}
                        <MainPhotoPreview url={item.afterPhoto} kind="after" label="Foto After" />

                        {/* Thumbnail Pilihan After */}
                        <div className="space-y-2 pt-1">
                          <p className="text-[11px] font-semibold text-slate-600 uppercase">
                            Pilih dari sumber foto ({availableAfter.length} tersedia):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {availableAfter.map((p, pIdx) => {
                              const isSelected = item.afterPhoto === p.url;
                              return (
                                <ThumbnailOption
                                  key={`aft-${p.id || pIdx}`}
                                  photo={p}
                                  isSelected={isSelected}
                                  color="emerald"
                                  onSelect={(chosenUrl) => {
                                    setReportItems((prev) => {
                                      const next = [...prev];
                                      next[idx].afterPhoto = chosenUrl;
                                      return next;
                                    });
                                  }}
                                />
                              );
                            })}

                            {/* Tombol Upload Sendiri */}
                            <input
                              type="file"
                              accept="image/*"
                              ref={(el) => (customFileInputRef.current[`after-${idx}`] = el)}
                              className="hidden"
                              onChange={(e) => handleCustomUpload(idx, 'after', e)}
                            />
                            <button
                              type="button"
                              onClick={() => customFileInputRef.current[`after-${idx}`]?.click()}
                              className="inline-flex h-13 w-13 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition"
                              title="Unggah Foto After Baru"
                            >
                              <Upload className="w-4 h-4" />
                              <span className="text-[9px] font-bold mt-0.5">Upload</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Modal */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0a3058] px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#0c3968] active:scale-[0.98] transition disabled:opacity-60"
            >
              {generating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Membuat PDF...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-sky-300" />
                  <span>Unduh Care Report PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
