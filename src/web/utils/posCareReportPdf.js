import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import cleanoxLogo from '../../assets/cleanox.png';
import cleanoxMascot from '../../assets/cleanox-mascot.png';
import { CARE_REPORT_TIPS, detectReportCategory } from './posCareReportTips.js';
import { CARE_REPORT_FONTS, setFont } from './posCareReportFonts.js';

/**
 * ============================================================
 * DESIGN TOKENS - COLORS (RGB format sesuai PRD section 3.1)
 * ============================================================
 */
const COLORS = {
  navy: [5, 64, 107],           // #05406B - Judul, garis header, pill, footer kiri
  textDark: [15, 23, 42],       // #0F172A - Nilai metadata, judul item, teks tips
  textMuted: [100, 116, 139],   // #64748B - Sublabel, label, catatan penutup
  textLight: [148, 163, 184],   // #94A3B8 - Label metadata, placeholder
  infoFill: [241, 246, 251],    // #F1F6FB - Kotak metadata (tanpa border)
  photoFill: [238, 241, 245],   // #EEF1F5 - Frame foto
  photoBorder: [203, 213, 225], // #CBD5E1 - Border putus-putus frame foto
  before: [180, 35, 24],        // #B42318 - Badge BEFORE
  after: [46, 125, 70],         // #2E7D46 - Badge AFTER
  tipsFill: [244, 248, 236],    // #F4F8EC - Kotak tips
  tipsBorder: [217, 230, 189],  // #D9E6BD - Border tips
  lime: [132, 184, 20],         // #84B814 - Nomor tips, sparkle
  cardBorder: [226, 232, 240],  // #E2E8F0 - Border kartu QR
  white: [255, 255, 255],       // Putih
};

/**
 * ============================================================
 * LAYOUT CONSTANTS (semua dalam mm, sesuai PRD section 4)
 * ============================================================
 */
const LAYOUT = {
  page: {
    width: 210,    // A4 portrait
    height: 297,
  },
  margin: 13,      // Kiri-kanan margin
  contentWidth: 184, // 210 - (13 * 2)

  // Header section (PRD 4.1)
  header: {
    logoX: 13,
    logoY: 11,
    logoHeight: 14,
    logoWidth: 24.89, // Rasio 16:9 dari cleanox.png (1920x1080)
    titleX: 198,
    titleBaselineY: 18,
    subtitleX: 198,
    subtitleBaselineY: 22.5,
    lineY: 28.3,
    lineWidth: 0.7,
  },

  // Metadata boxes (4 kotak, PRD 4.2)
  metadata: {
    y: 32.9,
    height: 14.6,
    radius: 2.8,
    boxes: [
      { label: 'NAMA CUSTOMER', x: 13, width: 53.7 },
      { label: 'NO. NOTA', x: 69.2, width: 41.1 },
      { label: 'TANGGAL LAYANAN', x: 112.8, width: 41.1 },
      { label: 'TEKNISI', x: 156.6, width: 41.6 },
    ],
    labelOffsetX: 3.2,
    labelBaselineY: 37.3,
    valueOffsetX: 3.2,
    valueBaselineY: 43.0,
  },

  // Kategori pill & Section Title (PRD 4.3 & 4.4)
  category: {
    labelX: 13,
    labelY: 53.5,
    pillX: 41,
    pillY: 49.5,
    pillHeight: 6,
    pillRadius: 3,
  },
  sectionTitle: {
    sparkleX: 13,
    sparkleY: 62.5,
    sparkleSize: 4.5,
    titleX: 20,
    titleBaselineY: 66,
  },

  // Items block (PRD 4.5)
  items: {
    firstItemY: 69.6,
    itemPitch: 62.3, // Pitch per item
    leftMaxWidth: 52,
    labelOffset: 3.0,
    titleOffset: 7.5,
    titleLineHeight: 5.2,
    beforeX: 68.5,
    afterX: 131.7,
    photoSize: 58,
    photoRadius: 3,
    photoBadgeOffsetX: 2.5,
    photoBadgeOffsetY: 2.8,
    beforeBadgeWidth: 16,
    beforeBadgeHeight: 4.8,
    afterBadgeWidth: 14.2,
    afterBadgeHeight: 4.8,
  },

  // Tips box (PRD 4.6)
  tips: {
    x: 13,
    width: 184,
    defaultY: 204.4,
    radius: 3.5,
    borderWidth: 0.3,
    titleOffsetX: 5.3,
    titleOffsetY: 8.0,
    col1CircleX: 20.8,
    col2CircleX: 110.3,
    col1TextX: 25.6,
    col2TextX: 115.0,
    textWidth: 70,
    circleRadius: 2.5,
    firstRowOffset: 14.8,
    lineHeight: 3.9,
    rowGap: 2.7,
  },

  // Mascot (PRD 4.7)
  mascot: {
    height: 24,
    width: 19.2, // Rasio 0.8 dari cleanox-mascot.png (1080x1350)
    rightX: 191.7,
    offsetAboveBox: 14.4,
  },

  // Footer cards (PRD 4.8)
  footer: {
    defaultY: 254.1,
    cardHeight: 27.4,
    gap: 4.1,
    leftX: 13,
    leftWidth: 108.5,
    leftRadius: 5,
    rightX: 125.6,
    rightWidth: 72.4,
    rightRadius: 4,
    // Right card QR & Booking
    qrX: 130,
    qrY: 4.2,
    qrSize: 19,
    qrTextX: 153.4,
  },

  // Closing note (PRD 4.9)
  closingNote: {
    offsetBelowFooter: 4.5,
  },
};

/**
 * ============================================================
 * HELPER FUNCTIONS - Graphics & Drawing
 * ============================================================
 */

/**
 * Draw rounded rectangle card
 */
function drawCard(doc, { x, y, width, height, radius, fillColor, borderColor, borderWidth }) {
  if (fillColor) {
    doc.setFillColor(...fillColor);
  }
  if (borderColor) {
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(borderWidth || 0.25);
  }
  const style = fillColor && borderColor ? 'FD' : fillColor ? 'F' : 'S';
  doc.roundedRect(x, y, width, height, radius, radius, style);
}

/**
 * Draw pill/badge
 */
function drawPill(doc, { x, y, width, height, text, fillColor, textColor, radius, fontSize, fontWeight, charSpace }) {
  doc.setFillColor(...fillColor);
  doc.roundedRect(x, y, width, height, radius, radius, 'F');

  doc.setTextColor(...textColor);
  setFont(doc, { family: 'Poppins', weight: fontWeight || '400', size: fontSize, charSpace: charSpace || 0 });
  doc.text(text, x + width / 2, y + height / 2 + 0.2, { align: 'center', baseline: 'middle' });
}

/**
 * Draw vector icon: sparkle, calendar, camera
 */
function drawIcon(doc, name, x, y, size, color) {
  const cx = x + size / 2;
  const cy = y + size / 2;

  switch (name) {
    case 'sparkle': {
      // 4-pointed star (sparkle icon) sesuai template Cleanox Care Report
      const r = size / 2;
      const inner = r * 0.24;
      doc.setFillColor(...color);

      // Bintang utama (vertikal + horizontal triangles)
      doc.triangle(cx, cy - r, cx + inner, cy, cx - inner, cy, 'F');
      doc.triangle(cx, cy + r, cx + inner, cy, cx - inner, cy, 'F');
      doc.triangle(cx - r, cy, cx, cy - inner, cx, cy + inner, 'F');
      doc.triangle(cx + r, cy, cx, cy - inner, cx, cy + inner, 'F');

      // Sparkle kecil di kanan atas
      const s2cx = cx + r * 0.85;
      const s2cy = cy - r * 0.65;
      const r2 = r * 0.42;
      const in2 = r2 * 0.24;
      doc.triangle(s2cx, s2cy - r2, s2cx + in2, s2cy, s2cx - in2, s2cy, 'F');
      doc.triangle(s2cx, s2cy + r2, s2cx + in2, s2cy, s2cx - in2, s2cy, 'F');
      doc.triangle(s2cx - r2, s2cy, s2cx, s2cy - in2, s2cx, s2cy + in2, 'F');
      doc.triangle(s2cx + r2, s2cy, s2cx, s2cy - in2, s2cx, s2cy + in2, 'F');
      break;
    }

    case 'calendar': {
      // Kalender outline icon elegan
      const calW = 4.2;
      const calH = 4.2;
      doc.setDrawColor(...color);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, calW, calH, 0.6, 0.6, 'S');
      // Garis tab header kalender
      doc.line(x, y + 1.3, x + calW, y + 1.3);
      // Ring kalender di atas
      doc.line(x + 1.1, y - 0.4, x + 1.1, y + 0.3);
      doc.line(x + calW - 1.1, y - 0.4, x + calW - 1.1, y + 0.3);
      break;
    }

    case 'camera': {
      // Kamera outline icon untuk placeholder foto
      doc.setDrawColor(...color);
      doc.setLineWidth(0.35);
      doc.roundedRect(cx - 7, cy - 4, 14, 10, 1.2, 1.2, 'S');
      doc.circle(cx, cy + 1, 3.2, 'S');
      doc.rect(cx - 5, cy - 5.5, 3.5, 1.5, 'S');
      break;
    }

    default:
      console.warn(`Icon '${name}' tidak dikenal`);
  }
}

/**
 * Camera placeholder jika foto tidak ada
 */
function drawCameraPlaceholder(doc, x, y, size, label = 'Foto (1:1)') {
  const cx = x + size / 2;
  const cy = y + size / 2 - 2;

  drawIcon(doc, 'camera', cx - 8, cy - 8, 16, COLORS.textLight);

  setFont(doc, CARE_REPORT_FONTS.photoPlaceholder);
  doc.setTextColor(...COLORS.textLight);
  doc.text(label, cx, cy + 10, { align: 'center' });
}

/**
 * Draw photo frame dengan foto atau placeholder
 */
function drawPhotoFrame(doc, { x, y, size, image, type }) {
  // Background fill
  doc.setFillColor(...COLORS.photoFill);
  doc.roundedRect(x, y, size, size, LAYOUT.items.photoRadius, LAYOUT.items.photoRadius, 'F');

  // Dashed border (1.2mm dash, 1.2mm gap)
  doc.setDrawColor(...COLORS.photoBorder);
  doc.setLineWidth(0.25);
  doc.setLineDash([1.2, 1.2]);
  doc.roundedRect(x, y, size, size, LAYOUT.items.photoRadius, LAYOUT.items.photoRadius, 'S');
  doc.setLineDash([]); // Reset solid

  // Render Image
  if (image) {
    try {
      doc.addImage(image, 'JPEG', x + 0.3, y + 0.3, size - 0.6, size - 0.6);
    } catch (err) {
      console.warn('Gagal render photo:', err);
      drawCameraPlaceholder(doc, x, y, size, `Foto ${type} (1:1)`);
    }
  } else {
    drawCameraPlaceholder(doc, x, y, size, `Foto ${type} (1:1)`);
  }

  // Badge BEFORE / AFTER
  const isBefore = type === 'Before';
  const badgeWidth = isBefore ? LAYOUT.items.beforeBadgeWidth : LAYOUT.items.afterBadgeWidth;
  const badgeHeight = isBefore ? LAYOUT.items.beforeBadgeHeight : LAYOUT.items.afterBadgeHeight;
  const badgeColor = isBefore ? COLORS.before : COLORS.after;
  const badgeText = isBefore ? 'BEFORE' : 'AFTER';

  drawPill(doc, {
    x: x + LAYOUT.items.photoBadgeOffsetX,
    y: y + LAYOUT.items.photoBadgeOffsetY,
    width: badgeWidth,
    height: badgeHeight,
    text: badgeText,
    fillColor: badgeColor,
    textColor: COLORS.white,
    radius: 2.4,
    fontSize: 6.2,
    fontWeight: '700',
    charSpace: 0.3,
  });
}

/**
 * Crop gambar ke rasio 1:1 dengan rounded corners
 */
export function cropImageToSquareDataUrl(src, options = {}) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);

    const { radius = 15, outputWidth = 800 } = options;
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
        canvas.width = outputWidth;
        canvas.height = outputWidth;
        const ctx = canvas.getContext('2d');

        // Rounded path
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(outputWidth - radius, 0);
        ctx.quadraticCurveTo(outputWidth, 0, outputWidth, radius);
        ctx.lineTo(outputWidth, outputWidth - radius);
        ctx.quadraticCurveTo(outputWidth, outputWidth, outputWidth - radius, outputWidth);
        ctx.lineTo(radius, outputWidth);
        ctx.quadraticCurveTo(0, outputWidth, 0, outputWidth - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();
        ctx.clip();

        // Draw cropped image
        ctx.drawImage(img, sx, sy, side, side, 0, 0, outputWidth, outputWidth);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        console.warn('Error dalam cropImageToSquareDataUrl:', err);
        resolve(src);
      }
    };
    img.onerror = () => {
      console.warn('Error loading image:', src);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Memuat gambar sebagai DataURL
 */
export async function loadImageAsDataUrl(src) {
  if (!src) return null;
  if (typeof src === 'string' && src.startsWith('data:')) return src;

  try {
    const res = await fetch(src);
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
      if (dataUrl) return dataUrl;
    }
  } catch {
    // fallback ke HTMLImageElement
  }

  return new Promise((resolve) => {
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
 * Measure tips height secara dinamis sesuai PRD Section 4.6
 */
function measureTipsBox(doc, tips) {
  setFont(doc, CARE_REPORT_FONTS.tipsText);

  const tipLines = tips.map((tip) => doc.splitTextToSize(tip, LAYOUT.tips.textWidth));
  const rowHeights = [];

  for (let r = 0; r < 3; r++) {
    const l1 = tipLines[r * 2] ? tipLines[r * 2].length : 1;
    const l2 = tipLines[r * 2 + 1] ? tipLines[r * 2 + 1].length : 1;
    const maxL = Math.max(l1, l2);
    const gap = r < 2 ? LAYOUT.tips.rowGap : 0;
    const rH = maxL * LAYOUT.tips.lineHeight + gap;
    rowHeights.push({ rH, maxL, gap });
  }

  // Tinggi kotak = 12.5 + sum(rowHeights) + 4.3 mm
  const sumRows = rowHeights.reduce((acc, row) => acc + row.rH, 0);
  const totalBoxHeight = 12.5 + sumRows + 4.3;

  return {
    boxHeight: Math.max(45.6, totalBoxHeight),
    tipLines,
    rowHeights,
  };
}

/**
 * ============================================================
 * SECTION RENDERERS
 * ============================================================
 */

/**
 * 1. Render Header (PRD 4.1)
 */
function renderHeader(doc, { logoData }) {
  const headerLayout = LAYOUT.header;

  // Logo Cleanox di kiri (proporsi 16:9, tinggi 14mm, lebar 24.89mm)
  if (logoData) {
    doc.addImage(logoData, 'PNG', headerLayout.logoX, headerLayout.logoY, headerLayout.logoWidth, headerLayout.logoHeight);
  }

  // Judul di kanan (rata kanan di x = 198)
  setFont(doc, CARE_REPORT_FONTS.titleMain);
  doc.setTextColor(...COLORS.navy);
  doc.text('CLEANOX CARE REPORT', headerLayout.titleX, headerLayout.titleBaselineY, { align: 'right' });

  // Subjudul di kanan (rata kanan di x = 198)
  setFont(doc, CARE_REPORT_FONTS.titleSub);
  doc.setTextColor(...COLORS.textMuted);
  doc.text('Laporan Hasil Layanan Cleanox Indonesia', headerLayout.subtitleX, headerLayout.subtitleBaselineY, { align: 'right' });

  // Garis pemisah header (x = 13 sampai x = 198)
  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(headerLayout.lineWidth);
  doc.line(LAYOUT.margin, headerLayout.lineY, headerLayout.titleX, headerLayout.lineY);
}

/**
 * 2. Render Metadata Info (4 Kotak, PRD 4.2)
 */
function renderMetadata(doc, { transaction, technicianName }) {
  const metaLayout = LAYOUT.metadata;

  const infoList = [
    { label: 'NAMA CUSTOMER', value: transaction.customer_name || '-' },
    { label: 'NO. NOTA', value: transaction.transaction_no || `TRX-${transaction.id}` },
    { label: 'TANGGAL LAYANAN', value: formatDateId(transaction.service_date) },
    { label: 'TEKNISI', value: technicianName || '-' },
  ];

  infoList.forEach((info, idx) => {
    const box = metaLayout.boxes[idx];

    // Card background
    drawCard(doc, {
      x: box.x,
      y: metaLayout.y,
      width: box.width,
      height: metaLayout.height,
      radius: metaLayout.radius,
      fillColor: COLORS.infoFill,
    });

    // Label
    setFont(doc, CARE_REPORT_FONTS.metaLabel);
    doc.setTextColor(...COLORS.textLight);
    doc.text(info.label, box.x + metaLayout.labelOffsetX, metaLayout.labelBaselineY);

    // Value
    setFont(doc, CARE_REPORT_FONTS.metaValue);
    doc.setTextColor(...COLORS.textDark);
    const splitVal = doc.splitTextToSize(String(info.value), box.width - 6.4);
    doc.text(splitVal[0] || '-', box.x + metaLayout.valueOffsetX, metaLayout.valueBaselineY);
  });
}

/**
 * 3. Render Category Pill & Section Title (PRD 4.3 & 4.4)
 */
function renderCategoryAndTitle(doc, { categoryInfo }) {
  const catLayout = LAYOUT.category;
  const secLayout = LAYOUT.sectionTitle;

  // Label "Kategori layanan:"
  setFont(doc, CARE_REPORT_FONTS.categoryLabel);
  doc.setTextColor(...COLORS.textMuted);
  doc.text('Kategori layanan:', catLayout.labelX, catLayout.labelY);

  // Pill Kategori
  const pillText = categoryInfo.label;
  setFont(doc, CARE_REPORT_FONTS.categoryPill);
  const pillW = doc.getTextWidth(pillText) + 8;

  drawPill(doc, {
    x: catLayout.pillX,
    y: catLayout.pillY,
    width: pillW,
    height: catLayout.pillHeight,
    text: pillText,
    fillColor: COLORS.navy,
    textColor: COLORS.white,
    radius: catLayout.pillRadius,
    fontSize: 7.5,
    fontWeight: '400',
  });

  // Section title "Hasil Pengerjaan" dengan ikon sparkle lime
  drawIcon(doc, 'sparkle', secLayout.sparkleX, secLayout.sparkleY, secLayout.sparkleSize, COLORS.lime);

  setFont(doc, CARE_REPORT_FONTS.sectionTitle);
  doc.setTextColor(...COLORS.navy);
  doc.text('Hasil Pengerjaan', secLayout.titleX, secLayout.titleBaselineY);
}

/**
 * 4. Render Items (Before/After Photos, PRD 4.5)
 * @returns {number} bottomY
 */
function renderItems(doc, { reportItems, categoryInfo }) {
  const itemsLayout = LAYOUT.items;
  let bottomY = itemsLayout.firstItemY;

  reportItems.forEach((item, itemIdx) => {
    const itemTop = itemsLayout.firstItemY + itemIdx * itemsLayout.itemPitch;
    const itemPrefix = categoryInfo.itemPrefix || 'Item';

    // Label "Item n" / "Area n"
    setFont(doc, CARE_REPORT_FONTS.itemLabel);
    doc.setTextColor(...COLORS.textLight);
    doc.text(`${itemPrefix} ${itemIdx + 1}`, LAYOUT.margin, itemTop + itemsLayout.labelOffset);

    // Judul Item (maksimal 2 baris)
    setFont(doc, CARE_REPORT_FONTS.itemTitle);
    doc.setTextColor(...COLORS.textDark);
    const titleLines = doc.splitTextToSize(item.itemName || `${itemPrefix} ${itemIdx + 1}`, itemsLayout.leftMaxWidth);
    const displayedTitleLines = titleLines.slice(0, 2);
    displayedTitleLines.forEach((tLine, tIdx) => {
      doc.text(tLine, LAYOUT.margin, itemTop + itemsLayout.titleOffset + tIdx * itemsLayout.titleLineHeight);
    });

    // Sublabel
    const subtitleY = itemTop + itemsLayout.titleOffset + displayedTitleLines.length * itemsLayout.titleLineHeight;
    setFont(doc, CARE_REPORT_FONTS.itemSubtitle);
    doc.setTextColor(...COLORS.textMuted);
    doc.text(categoryInfo.itemSubLabel || item.serviceCategory || '-', LAYOUT.margin, subtitleY);

    // Frame foto BEFORE & AFTER (y sejajar dengan itemTop)
    drawPhotoFrame(doc, {
      x: itemsLayout.beforeX,
      y: itemTop,
      size: itemsLayout.photoSize,
      image: item.before1x1,
      type: 'Before',
    });

    drawPhotoFrame(doc, {
      x: itemsLayout.afterX,
      y: itemTop,
      size: itemsLayout.photoSize,
      image: item.after1x1,
      type: 'After',
    });

    bottomY = itemTop + itemsLayout.photoSize;
  });

  return bottomY;
}

/**
 * 5. Render Tips Box & Mascot (PRD 4.6 & 4.7)
 * @returns {number} tipsBottomY
 */
function renderTips(doc, { categoryInfo, mascotData, tipsStartY }) {
  const tipsLayout = LAYOUT.tips;
  const { boxHeight, tipLines, rowHeights } = measureTipsBox(doc, categoryInfo.tips);

  // Tips Card background
  drawCard(doc, {
    x: tipsLayout.x,
    y: tipsStartY,
    width: tipsLayout.width,
    height: boxHeight,
    radius: tipsLayout.radius,
    fillColor: COLORS.tipsFill,
    borderColor: COLORS.tipsBorder,
    borderWidth: tipsLayout.borderWidth,
  });

  // Judul Tips
  setFont(doc, CARE_REPORT_FONTS.tipsTitle);
  doc.setTextColor(...COLORS.navy);
  doc.text(categoryInfo.title, tipsLayout.x + tipsLayout.titleOffsetX, tipsStartY + tipsLayout.titleOffsetY);

  // Render 6 tips dalam grid 2 kolom x 3 baris
  let currentRowY = tipsStartY + tipsLayout.firstRowOffset;

  for (let r = 0; r < 3; r++) {
    const idxCol1 = r * 2;
    const idxCol2 = r * 2 + 1;

    // Col 1 - Nomor & Teks
    doc.setFillColor(...COLORS.lime);
    doc.circle(tipsLayout.col1CircleX, currentRowY, tipsLayout.circleRadius, 'F');

    setFont(doc, CARE_REPORT_FONTS.tipsNumber);
    doc.setTextColor(...COLORS.white);
    doc.text(String(idxCol1 + 1), tipsLayout.col1CircleX, currentRowY + 0.1, { align: 'center', baseline: 'middle' });

    setFont(doc, CARE_REPORT_FONTS.tipsText);
    doc.setTextColor(...COLORS.textDark);
    const lines1 = tipLines[idxCol1] || [];
    lines1.forEach((lineText, lIdx) => {
      doc.text(lineText, tipsLayout.col1TextX, currentRowY - 0.8 + lIdx * tipsLayout.lineHeight);
    });

    // Col 2 - Nomor & Teks
    doc.setFillColor(...COLORS.lime);
    doc.circle(tipsLayout.col2CircleX, currentRowY, tipsLayout.circleRadius, 'F');

    setFont(doc, CARE_REPORT_FONTS.tipsNumber);
    doc.setTextColor(...COLORS.white);
    doc.text(String(idxCol2 + 1), tipsLayout.col2CircleX, currentRowY + 0.1, { align: 'center', baseline: 'middle' });

    setFont(doc, CARE_REPORT_FONTS.tipsText);
    doc.setTextColor(...COLORS.textDark);
    const lines2 = tipLines[idxCol2] || [];
    lines2.forEach((lineText, lIdx) => {
      doc.text(lineText, tipsLayout.col2TextX, currentRowY - 0.8 + lIdx * tipsLayout.lineHeight);
    });

    // Next row offset
    currentRowY += rowHeights[r].rH;
  }

  // Mascot di atas kotak tips (PRD 4.7)
  if (mascotData) {
    const mascotLayout = LAYOUT.mascot;
    const mascotX = mascotLayout.rightX - mascotLayout.width;
    const mascotY = tipsStartY - mascotLayout.offsetAboveBox;
    doc.addImage(mascotData, 'PNG', mascotX, mascotY, mascotLayout.width, mascotLayout.height);
  }

  return tipsStartY + boxHeight;
}

/**
 * 6. Render Footer Cards (Jadwal & QR Code, PRD 4.8)
 * @returns {number} footerBottomY
 */
function renderFooter(doc, { nextMaintenanceMonth, qrData, footerStartY }) {
  const footerLayout = LAYOUT.footer;

  // KARTU KIRI: Jadwal Perawatan (Navy)
  drawCard(doc, {
    x: footerLayout.leftX,
    y: footerStartY,
    width: footerLayout.leftWidth,
    height: footerLayout.cardHeight,
    radius: footerLayout.leftRadius,
    fillColor: COLORS.navy,
  });

  // Icon kalender outline
  drawIcon(doc, 'calendar', 18.3, footerStartY + 6.2, 4.2, COLORS.white);

  // Label "Jadwal perawatan berikutnya"
  setFont(doc, CARE_REPORT_FONTS.scheduleLabel);
  doc.setTextColor(186, 230, 253); // #BAE6FD
  doc.text('Jadwal perawatan berikutnya', 24.5, footerStartY + 9.2);

  // Bulan Jadwal (Bold 14pt)
  setFont(doc, CARE_REPORT_FONTS.scheduleMonth);
  doc.setTextColor(...COLORS.white);
  doc.text(nextMaintenanceMonth || '-', 18.3, footerStartY + 16.5);

  // Catatan WhatsApp
  setFont(doc, CARE_REPORT_FONTS.scheduleNote);
  doc.setTextColor(203, 213, 225); // #CBD5E1
  doc.text('Kami akan mengingatkan Kakak lewat WhatsApp.', 18.3, footerStartY + 22.2);

  // KARTU KANAN: QR Code & Booking (White with Border)
  drawCard(doc, {
    x: footerLayout.rightX,
    y: footerStartY,
    width: footerLayout.rightWidth,
    height: footerLayout.cardHeight,
    radius: footerLayout.rightRadius,
    fillColor: COLORS.white,
    borderColor: COLORS.cardBorder,
    borderWidth: 0.3,
  });

  // QR Code
  if (qrData) {
    doc.addImage(qrData, 'PNG', footerLayout.qrX, footerStartY + footerLayout.qrY, footerLayout.qrSize, footerLayout.qrSize);
  }

  // Teks Booking
  setFont(doc, CARE_REPORT_FONTS.qrScanText);
  doc.setTextColor(...COLORS.textDark);
  doc.text('Scan untuk booking ulang', footerLayout.qrTextX, footerStartY + 9.5);

  setFont(doc, CARE_REPORT_FONTS.qrSubText);
  doc.setTextColor(...COLORS.textDark);
  doc.text('WhatsApp 0851-2233-3381', footerLayout.qrTextX, footerStartY + 14.5);
  doc.text('cleanoxindonesia.com', footerLayout.qrTextX, footerStartY + 19.5);

  return footerStartY + footerLayout.cardHeight;
}

/**
 * 7. Render Closing Note (PRD 4.9)
 */
function renderClosingNote(doc, footerBottomY) {
  const closingY = footerBottomY + LAYOUT.closingNote.offsetBelowFooter;
  setFont(doc, CARE_REPORT_FONTS.closingNote);
  doc.setTextColor(...COLORS.textMuted);

  const noteText = 'Terima kasih telah mempercayakan perawatan rumah Anda kepada Cleanox. Total Care for Happy Life.';
  doc.text(noteText, LAYOUT.page.width / 2, closingY, {
    align: 'center',
  });
}

/**
 * ============================================================
 * MAIN PAGE RENDERER
 * ============================================================
 */
function renderCareReportPage(
  doc,
  {
    transaction,
    reportItems,
    logoData,
    mascotData,
    qrData,
    technicianName,
    categoryInfo,
    nextMaintenanceMonth,
  }
) {
  // 1. Header
  renderHeader(doc, { logoData });

  // 2. Metadata (4 Kotak)
  renderMetadata(doc, { transaction, technicianName });

  // 3. Category Pill & Section Title
  renderCategoryAndTitle(doc, { categoryInfo });

  // 4. Items (Before & After Photos)
  const itemsBottomY = renderItems(doc, { reportItems, categoryInfo });

  // 5. Tips Box (dimulai di bawah item, nilai dasar 204.4)
  const tipsStartY = Math.max(LAYOUT.tips.defaultY, itemsBottomY + 14.5);
  const tipsBottomY = renderTips(doc, { categoryInfo, mascotData, tipsStartY });

  // 6. Footer Cards (Jadwal & QR)
  const footerStartY = tipsBottomY + LAYOUT.footer.gap;
  const footerBottomY = renderFooter(doc, { nextMaintenanceMonth, qrData, footerStartY });

  // 7. Closing Note
  renderClosingNote(doc, footerBottomY);
}

/**
 * Configuration untuk PDF generation
 */
const PDF_CONFIG = {
  roundedCorners: {
    enabled: true,
    radius: 15,
    outputWidth: 800,
  },
  jpegQuality: 0.92,
  enableLogging: false,
};

/**
 * Generate dan unduh PDF Cleanox Care Report
 */
export async function downloadPosCareReportPdf({
  transaction,
  items = [],
  reportItems = [],
  technicianName = '',
  categoryKey = null,
  nextMaintenanceMonth = '',
  config = {},
}) {
  if (!transaction) throw new Error('Data transaksi tidak ditemukan');

  const finalConfig = { ...PDF_CONFIG, ...config };
  const log = (msg) => finalConfig.enableLogging && console.log('[PDF]', msg);

  log('Starting PDF generation...');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Aset logo, maskot, QR
  log('Loading assets...');
  const [logoData, mascotData, qrData] = await Promise.all([
    loadImageAsDataUrl(cleanoxLogo),
    loadImageAsDataUrl(cleanoxMascot),
    generateQrDataUrl('https://wa.me/6285122333381'),
  ]);

  // Siapkan foto cropped 1:1
  log('Processing photos...');
  const processedReportItems = await Promise.all(
    reportItems.map(async (item) => {
      const [before1x1, after1x1] = await Promise.all([
        item.beforePhoto
          ? cropImageToSquareDataUrl(item.beforePhoto, finalConfig.roundedCorners)
          : null,
        item.afterPhoto
          ? cropImageToSquareDataUrl(item.afterPhoto, finalConfig.roundedCorners)
          : null,
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

  // Render halaman pertama (maksimal 2 item per halaman)
  renderCareReportPage(doc, {
    transaction,
    reportItems: processedReportItems.slice(0, 2),
    logoData,
    mascotData,
    qrData,
    technicianName: technicianName || '-',
    categoryInfo,
    nextMaintenanceMonth,
  });

  // Render halaman berikutnya bila item > 2
  if (processedReportItems.length > 2) {
    for (let i = 2; i < processedReportItems.length; i += 2) {
      doc.addPage();
      renderCareReportPage(doc, {
        transaction,
        reportItems: processedReportItems.slice(i, i + 2),
        logoData,
        mascotData,
        qrData,
        technicianName: technicianName || '-',
        categoryInfo,
        nextMaintenanceMonth,
      });
    }
  }

  // Unduh PDF
  const safeNota = String(transaction.transaction_no || transaction.id || 'trx').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Cleanox_Care_Report_${safeNota}.pdf`;

  log(`Saving PDF as: ${filename}`);
  doc.save(filename);
  log('PDF generation complete!');
}
