import { useEffect, useState, useRef, useMemo } from 'react';
import { X, FileText, Image as ImageIcon, Sparkles, Upload, Check, AlertCircle, Calendar, Plus, Trash2 } from 'lucide-react';
import BodyPortal from '@web/components/BodyPortal.jsx';

import api from '@shared/utils/api.js';
import { CARE_REPORT_CATEGORIES, CARE_REPORT_TIPS, detectReportCategory } from '@web/utils/posCareReportTips.js';
import { downloadPosCareReportPdf } from '@web/utils/posCareReportPdf.js';
import cleanoxMascot from '../../assets/cleanox-mascot.png';


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
  const [pageCategories, setPageCategories] = useState([]);
  const [tipsMasterList, setTipsMasterList] = useState([]);
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

    // Ambil master tips dari database
    api
      .get('/pos-master/care-report-tips')
      .then((res) => {
        const loaded = res.data?.tips || [];
        if (loaded.length > 0) {
          setTipsMasterList(loaded);
        }
      })
      .catch((err) => {
        console.warn('[PosCareReportModal] Gagal memuat tips dari DB, memakai fallback:', err);
      });

    // Default jadwal perawatan berikutnya (+3 bulan)
    setNextMaintenanceMonth(getDefaultNextMaintenance(transaction.service_date, 3));
    setPageCategories([]);

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

    // Jika transaksi hanya memiliki 1 layanan dan teknisi/customer mengambil > 1 foto, siapkan slot ke-2 otomatis
    if ((items || []).length === 1 && initialReportItems.length === 1) {
      const base = initialReportItems[0];
      const hasSecondBefore = (base.itemBeforeList?.length || 0) > 1 || (legacyBeforeList?.length || 0) > 1 || (customerPhotoList?.length || 0) > 1;
      const hasSecondAfter = (base.itemAfterList?.length || 0) > 1 || (legacyAfterList?.length || 0) > 1;
      if (hasSecondBefore || hasSecondAfter) {
        const secondBefore =
          base.itemBeforeList[1]?.url ||
          legacyBeforeList[1]?.url ||
          customerPhotoList[1]?.url ||
          '';
        const secondAfter =
          base.itemAfterList[1]?.url ||
          legacyAfterList[1]?.url ||
          '';

        initialReportItems.push({
          id: `${base.id}-slot-2`,
          itemName: base.itemName,
          serviceCategory: base.serviceCategory,
          beforePhoto: secondBefore,
          afterPhoto: secondAfter,
          itemBeforeList: base.itemBeforeList,
          itemAfterList: base.itemAfterList,
          isAdditionalSlot: true,
        });
      }
    }

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

  const isSingleService = (items || []).length === 1;
  const totalPages = Math.max(1, Math.ceil(reportItems.length / 2));

  // Sinkronkan pageCategories setiap kali reportItems atau tipsMasterList berubah
  useEffect(() => {
    if (!reportItems.length) return;
    setPageCategories((prev) => {
      const updated = [];
      for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        if (prev[pIdx]) {
          updated.push(prev[pIdx]);
        } else {
          // Deteksi kategori default untuk halaman ini berdasarkan item di halaman tersebut
          const pageItems = reportItems.slice(pIdx * 2, pIdx * 2 + 2);
          const detected = detectReportCategory(pageItems, tipsMasterList);
          updated.push(detected);
        }
      }
      return updated;
    });
  }, [reportItems, totalPages, tipsMasterList]);

  const handlePageCategoryChange = (pageIndex, newCategoryKey) => {
    setPageCategories((prev) => {
      const updated = [...prev];
      updated[pageIndex] = newCategoryKey;
      return updated;
    });
  };

  const handleAddPhotoSlot = () => {
    if (!isSingleService || reportItems.length === 0) return;
    const base = reportItems[0];
    const newIdx = reportItems.length;

    const nextBefore =
      base.itemBeforeList[newIdx]?.url ||
      legacyBeforeList[newIdx]?.url ||
      customerPhotoList[newIdx]?.url ||
      '';
    const nextAfter =
      base.itemAfterList[newIdx]?.url ||
      legacyAfterList[newIdx]?.url ||
      '';

    setReportItems((prev) => [
      ...prev,
      {
        id: `${base.id}-slot-${newIdx + 1}`,
        itemName: base.itemName,
        serviceCategory: base.serviceCategory,
        beforePhoto: nextBefore,
        afterPhoto: nextAfter,
        itemBeforeList: base.itemBeforeList,
        itemAfterList: base.itemAfterList,
        isAdditionalSlot: true,
      },
    ]);
  };

  const handleRemovePhotoSlot = (idxToRemove) => {
    setReportItems((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

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
      const pageCategoriesInfo = Array.from({ length: totalPages }).map((_, pIdx) => {
        const key = pageCategories[pIdx] || (tipsMasterList[0]?.category_key || CARE_REPORT_CATEGORIES.SOFA);
        return (
          tipsMasterList.find((t) => t.category_key === key) ||
          CARE_REPORT_TIPS[key] ||
          CARE_REPORT_TIPS.general
        );
      });

      await downloadPosCareReportPdf({
        transaction,
        items,
        reportItems,
        categoryKey: pageCategories[0] || CARE_REPORT_CATEGORIES.SOFA,
        categoryInfo: pageCategoriesInfo[0] || CARE_REPORT_TIPS.general,
        pageCategories: pageCategoriesInfo,
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
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0a3058] to-[#164e87] p-1 shadow-md overflow-hidden border border-sky-200">
                <img src={cleanoxMascot} alt="Maskot Cleanox" className="h-full w-full object-contain" />
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

            {/* Pengaturan Kategori & Tips Per Halaman */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-sky-600" />
                    Pilihan Kategori & Tips Per Halaman ({totalPages} Halaman PDF)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Setiap halaman PDF memuat 2 layanan/foto. Anda dapat menentukan kategori tips berbeda untuk masing-masing halaman.
                  </p>
                </div>
                {tipsMasterList.length > 0 && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                    Master DB ({tipsMasterList.length} Kategori)
                  </span>
                )}
              </div>

              {/* Grid Selector Per Halaman */}
              <div className={`grid gap-3 ${totalPages > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                {Array.from({ length: totalPages }).map((_, pIdx) => {
                  const pageItems = reportItems.slice(pIdx * 2, pIdx * 2 + 2);
                  const currentKey = pageCategories[pIdx] || CARE_REPORT_CATEGORIES.SOFA;
                  const currentTip =
                    tipsMasterList.find((t) => t.category_key === currentKey) ||
                    CARE_REPORT_TIPS[currentKey] ||
                    CARE_REPORT_TIPS.general;

                  return (
                    <div
                      key={`page-selector-${pIdx}`}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">
                            {pIdx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            Halaman {pIdx + 1}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          Slot #{pIdx * 2 + 1}{pageItems.length > 1 ? ` & #${pIdx * 2 + 2}` : ''}
                        </span>
                      </div>

                      {/* Ringkasan Layanan di Halaman Tersebut */}
                      <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100 flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Layanan pada lembar ini:
                        </span>
                        {pageItems.map((pi, itemSubIdx) => (
                          <span key={pi.id || itemSubIdx} className="font-semibold text-slate-700 truncate">
                            • {pi.itemName} {pi.isAdditionalSlot ? '(Foto Tambahan)' : ''}
                          </span>
                        ))}
                      </div>

                      {/* Dropdown Pilihan Kategori */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Kategori Tips:
                        </label>
                        <select
                          value={currentKey}
                          onChange={(e) => handlePageCategoryChange(pIdx, e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          {tipsMasterList.length > 0
                            ? tipsMasterList.map((tip) => (
                                <option key={tip.category_key} value={tip.category_key}>
                                  {tip.label} ({tip.title})
                                </option>
                              ))
                            : Object.values(CARE_REPORT_TIPS).map((tip) => (
                                <option key={tip.category_key} value={tip.category_key}>
                                  {tip.label} ({tip.title})
                                </option>
                              ))}
                        </select>
                      </div>

                      <div className="text-[10px] text-slate-500 pt-0.5">
                        Judul Tips PDF:{' '}
                        <span className="font-semibold text-slate-700">
                          {currentTip?.title || '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Jadwal Perawatan Berikutnya */}
              <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="sm:max-w-xs w-full">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Jadwal Perawatan Berikutnya
                  </label>
                  <input
                    type="text"
                    value={nextMaintenanceMonth}
                    onChange={(e) => setNextMaintenanceMonth(e.target.value)}
                    placeholder="Contoh: Januari 2027"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="text-right text-[11px] text-slate-400 sm:self-end">
                  Pengingat WhatsApp otomatis dihitung (+3 bulan)
                </div>
              </div>
            </div>

            {/* List Pilihan Foto Per Item Layanan */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Hasil Pengerjaan (Pilihan Foto Before & After)
                </h4>
                <span className="text-xs text-slate-500 font-medium">
                  {isSingleService
                    ? `1 Layanan (${reportItems.length} Slot Foto Before & After)`
                    : `${reportItems.length} layanan terdeteksi`}
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
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-lg border border-sky-100">
                          {isSingleService && reportItems.length > 1
                            ? `Foto #${idx + 1}`
                            : `Item ${idx + 1}`}
                        </span>
                        <div>
                          <h5 className="text-base font-bold text-slate-900">{item.itemName}</h5>
                          <p className="text-xs text-slate-500">{item.serviceCategory || 'Layanan Cleanox'}</p>
                        </div>
                      </div>
                      {isSingleService && idx > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhotoSlot(idx)}
                          className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl font-semibold border border-rose-200 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus Foto #{idx + 1}
                        </button>
                      )}
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

              {isSingleService && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleAddPhotoSlot}
                    className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50 text-sky-700 font-bold text-xs rounded-2xl transition shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Foto / Sudut Tambahan (Before & After) untuk Layanan Ini
                  </button>
                  <p className="mt-1.5 text-center text-[11px] text-slate-400">
                    Karena transaksi ini hanya memiliki 1 layanan, Anda dapat menambahkan foto Before & After dari sudut atau bagian lain untuk mengisi laporan.
                  </p>
                </div>
              )}
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
