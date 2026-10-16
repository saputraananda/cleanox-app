import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import cleanoxLogo from '../../assets/cleanox.png';
import cleanoxMascot from '../../assets/cleanox-mascot.png';
import { CARE_REPORT_TIPS, detectReportCategory } from './posCareReportTips.js';

const PRIMARY_NAVY = [10, 48, 88]; // #0a3058
const SECONDARY_NAVY = [15, 60, 105];
const TEXT_DARK = [15, 23, 42]; // #0f172a
const TEXT_MUTED = [100, 116, 139]; // #64748b
const TEXT_LIGHT_MUTED = [148, 163, 184]; // #94a3b8
const COLOR_RED = [220, 38, 38]; // #dc2626
const COLOR_GREEN = [22, 163, 74]; // #16a34a
const COLOR_MINT_BG = [240, 253, 244]; // #f0fdf4
const COLOR_MINT_BORDER = [187, 247, 208]; // #bbf7d0
const COLOR_GREEN_NUM = [101, 163, 13]; // #65a30d
const COLOR_FOOTER_NAVY = [9, 44, 76]; // #092c4c

/**
 * Memuat gambar dan meng-crop secara proporsional ke rasio 1:1 (Center square)
 */
export function cropImageToSquareDataUrl(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const side = Math.min(w, h);
        const sx = (w - side) / 2;
        const sy = (h - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Memuat gambar apa adanya sebagai DataURL
 */
export function loadImageAsDataUrl(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Generate QR code data URL
 */
export async function generateQrDataUrl(text = 'https://wa.me/6285122333381') {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 220,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('generateQrDataUrl error:', err);
    return null;
  }
}

/**
 * Helper gambar icon camera untuk placeholder
 */
function drawCameraPlaceholder(doc, x, y, size, label = 'Foto (1:1)') {
  const cx = x + size / 2;
  const cy = y + size / 2 - 2;

  doc.setDrawColor(...TEXT_LIGHT_MUTED);
  doc.setLineWidth(0.35);

  // Body kamera
  doc.roundedRect(cx - 7, cy - 4, 14, 10, 1.2, 1.2, 'S');
  // Lensa kamera
  doc.circle(cx, cy + 1, 3.2, 'S');
  // Tombol flash
  doc.rect(cx - 5, cy - 5.5, 3.5, 1.5, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_LIGHT_MUTED);
  doc.text(label, cx, cy + 10, { align: 'center' });
}

/**
 * Format tanggal Indonesia: DD Bulan YYYY
 */
function formatDateId(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Generate dan unduh PDF Cleanox Care Report
 */
export async function downloadPosCareReportPdf({
  transaction,
  items = [],
  reportItems = [], // Array item dengan photoBefore dan photoAfter terpilih
  technicianName = '',
  categoryKey = null,
  nextMaintenanceMonth = '',
}) {
  if (!transaction) throw new Error('Data transaksi tidak ditemukan');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const margin = 14;
  const contentW = pageW - margin * 2; // 182

  // Aset logo & maskot
  const [logoData, mascotData, qrData] = await Promise.all([
    loadImageAsDataUrl(cleanoxLogo),
    loadImageAsDataUrl(cleanoxMascot),
    generateQrDataUrl('https://wa.me/6285122333381'),
  ]);

  // Siapkan data foto crop 1:1
  const processedReportItems = await Promise.all(
    reportItems.map(async (item) => {
      const [before1x1, after1x1] = await Promise.all([
        item.beforePhoto ? cropImageToSquareDataUrl(item.beforePhoto) : null,
        item.afterPhoto ? cropImageToSquareDataUrl(item.afterPhoto) : null,
      ]);
      return {
        ...item,
        before1x1,
        after1x1,
      };
    })
  );

  // Kategori tips & teks
  const activeCategoryKey = categoryKey || detectReportCategory(items);
  const categoryInfo = CARE_REPORT_TIPS[activeCategoryKey] || CARE_REPORT_TIPS.general;

  // Render halaman pertama
  renderCareReportPage(doc, {
    transaction,
    reportItems: processedReportItems.slice(0, 2),
    pageNumber: 1,
    totalPages: Math.max(1, Math.ceil(processedReportItems.length / 2)),
    margin,
    contentW,
    pageW,
    pageH,
    logoData,
    mascotData,
    qrData,
    technicianName: technicianName || '-',
    categoryInfo,
    nextMaintenanceMonth,
  });

  // Jika ada item 3 dan 4, buat halaman berikutnya
  if (processedReportItems.length > 2) {
    for (let i = 2; i < processedReportItems.length; i += 2) {
      doc.addPage();
      const pageNum = Math.floor(i / 2) + 1;
      const totalPages = Math.ceil(processedReportItems.length / 2);
      renderCareReportPage(doc, {
        transaction,
        reportItems: processedReportItems.slice(i, i + 2),
        pageNumber: pageNum,
        totalPages,
        margin,
        contentW,
        pageW,
        pageH,
        logoData,
        mascotData,
        qrData,
        technicianName: technicianName || '-',
        categoryInfo,
        nextMaintenanceMonth,
      });
    }
  }

  const safeNota = String(transaction.transaction_no || transaction.id || 'trx').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Cleanox_Care_Report_${safeNota}.pdf`);
}

function renderCareReportPage(
  doc,
  {
    transaction,
    reportItems,
    margin,
    contentW,
    pageW: customPageW,
    pageH: customPageH,
    logoData,
    mascotData,
    qrData,
    technicianName,
    categoryInfo,
    nextMaintenanceMonth,
  }
) {
  const pageW = customPageW || doc.internal.pageSize.getWidth();
  const pageH = customPageH || doc.internal.pageSize.getHeight();

  // -------------------------------------------------------------
  // 1. HEADER
  // -------------------------------------------------------------
  const headerY = 12;

  // Logo Cleanox di kiri
  if (logoData) {
    doc.addImage(logoData, 'PNG', margin, headerY, 34, 11);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...PRIMARY_NAVY);
    doc.text('Cleanox', margin, headerY + 8);
  }

  // Judul di kanan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(...PRIMARY_NAVY);
  doc.text('CLEANOX CARE REPORT', pageW - margin, headerY + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Laporan Hasil Layanan Cleanox Indonesia', pageW - margin, headerY + 9.5, { align: 'right' });

  // -------------------------------------------------------------
  // 2. METADATA INFO (4 BOXES)
  // -------------------------------------------------------------
  const infoY = 27;
  const colGap = 2.5;
  const colW = (contentW - colGap * 3) / 4;
  const boxH = 14;

  const infoList = [
    { label: 'NAMA CUSTOMER', value: transaction.customer_name || '-' },
    { label: 'NO. NOTA', value: transaction.transaction_no || `TRX-${transaction.id}` },
    { label: 'TANGGAL LAYANAN', value: formatDateId(transaction.service_date) },
    { label: 'TEKNISI', value: technicianName || '-' },
  ];

  infoList.forEach((info, idx) => {
    const boxX = margin + idx * (colW + colGap);

    // Box background
    doc.setFillColor(248, 250, 252); // #f8fafc
    doc.setDrawColor(226, 232, 240); // #e2e8f0
    doc.setLineWidth(0.25);
    doc.roundedRect(boxX, infoY, colW, boxH, 1.8, 1.8, 'FD');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...TEXT_LIGHT_MUTED);
    doc.text(info.label, boxX + 3.2, infoY + 4.5);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...TEXT_DARK);
    const splitVal = doc.splitTextToSize(String(info.value), colW - 6.4);
    doc.text(splitVal[0] || '-', boxX + 3.2, infoY + 9.5);
  });

  // -------------------------------------------------------------
  // 3. CATEGORY BADGE
  // -------------------------------------------------------------
  const pillY = 44.5;
  const badgeText = `Kategori layanan:   ${categoryInfo.label}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const textWidth = doc.getTextWidth(badgeText);
  const pillW = textWidth + 8;
  const pillH = 6;

  doc.setFillColor(...PRIMARY_NAVY);
  doc.roundedRect(margin, pillY, pillW, pillH, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.text(badgeText, margin + 4, pillY + 4.2);

  // -------------------------------------------------------------
  // 4. SECTION HASIL PENGERJAAN
  // -------------------------------------------------------------
  const secTitleY = 55.5;

  // Star Icon
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(234, 179, 8); // Gold sparkle
  doc.text('✦', margin, secTitleY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PRIMARY_NAVY);
  doc.text('Hasil Pengerjaan', margin + 4.5, secTitleY);

  // -------------------------------------------------------------
  // 5. LIST HASIL ITEM (ITEM 1 & ITEM 2)
  // -------------------------------------------------------------
  let currentItemY = 60.5;
  const itemRowH = 59; // Tinggi alokasi per item

  reportItems.forEach((item, itemIdx) => {
    const itemNum = itemIdx + 1;

    // Subtitle item
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...TEXT_LIGHT_MUTED);
    doc.text(`Item ${itemNum}`, margin, currentItemY + 3.5);

    // Title item
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_DARK);
    doc.text(item.itemName || `Layanan ${itemNum}`, margin, currentItemY + 7.8);

    // Sub layanan
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(item.serviceCategory || categoryInfo.label, margin, currentItemY + 11.8);

    // Frame Foto Before & After
    const photoBoxY = currentItemY + 14.5;
    const photoSize = 42; // Rasio 1:1
    const frameGap = 12;

    // ==================== BEFORE ====================
    const beforeX = margin + 35;
    // Badge Before
    doc.setFillColor(...COLOR_RED);
    doc.roundedRect(beforeX, photoBoxY, 17, 4.5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(255, 255, 255);
    doc.text('BEFORE', beforeX + 8.5, photoBoxY + 3.2, { align: 'center' });

    // Square Before Box
    const beforePhotoY = photoBoxY + 5.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(beforeX, beforePhotoY, photoSize, photoSize, 2, 2, 'FD');

    if (item.before1x1) {
      try {
        doc.addImage(item.before1x1, 'JPEG', beforeX + 0.3, beforePhotoY + 0.3, photoSize - 0.6, photoSize - 0.6);
      } catch (err) {
        console.warn('Gagal render before photo', err);
        drawCameraPlaceholder(doc, beforeX, beforePhotoY, photoSize, 'Foto Before (1:1)');
      }
    } else {
      drawCameraPlaceholder(doc, beforeX, beforePhotoY, photoSize, 'Foto Before (1:1)');
    }

    // ==================== AFTER ====================
    const afterX = beforeX + photoSize + frameGap;
    // Badge After
    doc.setFillColor(...COLOR_GREEN);
    doc.roundedRect(afterX, photoBoxY, 15, 4.5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(255, 255, 255);
    doc.text('AFTER', afterX + 7.5, photoBoxY + 3.2, { align: 'center' });

    // Square After Box
    const afterPhotoY = photoBoxY + 5.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(afterX, afterPhotoY, photoSize, photoSize, 2, 2, 'FD');

    if (item.after1x1) {
      try {
        doc.addImage(item.after1x1, 'JPEG', afterX + 0.3, afterPhotoY + 0.3, photoSize - 0.6, photoSize - 0.6);
      } catch (err) {
        console.warn('Gagal render after photo', err);
        drawCameraPlaceholder(doc, afterX, afterPhotoY, photoSize, 'Foto After (1:1)');
      }
    } else {
      drawCameraPlaceholder(doc, afterX, afterPhotoY, photoSize, 'Foto After (1:1)');
    }

    currentItemY += itemRowH;
  });

  // -------------------------------------------------------------
  // 6. TIPS PERAWATAN DI RUMAH + MASKOT KUCING CLEANOX
  // -------------------------------------------------------------
  const tipsY = 184;
  const tipsH = 54;

  // Box Mint
  doc.setFillColor(...COLOR_MINT_BG);
  doc.setDrawColor(...COLOR_MINT_BORDER);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, tipsY, contentW, tipsH, 3, 3, 'FD');

  // Title Tips
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(22, 101, 52); // Dark forest green
  doc.text(categoryInfo.title, margin + 5, tipsY + 6.5);

  // 6 Poin Tips (2 Kolom x 3 Baris)
  const tipColW = 67;
  const col1X = margin + 5;
  const col2X = margin + 74;
  const startRowY = tipsY + 11.5;
  const rowSpacing = 13.5;

  categoryInfo.tips.forEach((tipText, idx) => {
    const isCol2 = idx % 2 === 1;
    const rowIndex = Math.floor(idx / 2);
    const tx = isCol2 ? col2X : col1X;
    const ty = startRowY + rowIndex * rowSpacing;

    // Lingkaran Hijau Nomor
    doc.setFillColor(...COLOR_GREEN_NUM);
    doc.circle(tx + 2.2, ty + 2.2, 2.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(255, 255, 255);
    doc.text(String(idx + 1), tx + 2.2, ty + 3.1, { align: 'center' });

    // Teks Tips
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(...TEXT_DARK);
    const wrapped = doc.splitTextToSize(tipText, tipColW);
    doc.text(wrapped, tx + 6.2, ty + 2.8);
  });

  // Maskot Kucing Cleanox Baru di sudut kanan Tips
  if (mascotData) {
    // Maskot ditempatkan di kanan bawah/atas kartu tips secara proporsional
    const mascotW = 32;
    const mascotH = 40;
    const mascotX = pageW - margin - mascotW - 1;
    const mascotY = tipsY + 9;
    doc.addImage(mascotData, 'PNG', mascotX, mascotY, mascotW, mascotH);
  }

  // -------------------------------------------------------------
  // 7. FOOTER CARD (NAVY)
  // -------------------------------------------------------------
  const footerY = 243;
  const footerH = 29;

  doc.setFillColor(...COLOR_FOOTER_NAVY);
  doc.roundedRect(margin, footerY, contentW, footerH, 2.5, 2.5, 'F');

  // Sisi Kiri: Jadwal Perawatan Berikutnya
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(186, 230, 253); // Sky-200
  doc.text('📅  Jadwal perawatan berikutnya', margin + 6, footerY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(nextMaintenanceMonth || '[Bulan YYYY]', margin + 6, footerY + 14.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(203, 213, 225); // Slate-300
  doc.text('Kami akan mengingatkan Kakak lewat WhatsApp.', margin + 6, footerY + 21);

  // Sisi Kanan: QR Code & Booking Ulang
  const qrBoxX = pageW - margin - 72;
  const qrSize = 19;
  const qrY = footerY + 5;

  if (qrData) {
    // Background putih kecil di sekitar QR code
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(qrBoxX, qrY, qrSize, qrSize, 1.2, 1.2, 'F');
    doc.addImage(qrData, 'PNG', qrBoxX + 0.8, qrY + 0.8, qrSize - 1.6, qrSize - 1.6);
  }

  const qrTextX = qrBoxX + qrSize + 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(255, 255, 255);
  doc.text('Scan untuk booking ulang', qrTextX, qrY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(226, 232, 240);
  doc.text('WhatsApp 0851-2233-3381', qrTextX, qrY + 10.5);
  doc.text('cleanoxindonesia.com', qrTextX, qrY + 15);

  // -------------------------------------------------------------
  // 8. CLOSING THANKS NOTE
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    'Terima kasih telah mempercayakan perawatan rumah Anda kepada Cleanox. Total Care for Happy Life.',
    pageW / 2,
    pageH - 9,
    { align: 'center' }
  );
}
