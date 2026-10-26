import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { registerCareReportFonts } from './posCareReportFonts.js';
import { formatServiceDateParts } from './posCustomerOrderMessage.js';
import {
  isGeneralCleaningCategory,
  isGcPricingPending,
} from './posGeneralCleaningBilling.js';
import {
  formatItemQtyLabel,
  isMeterPricingPending,
  transactionHasMeterPending,
} from './posMeterServices.js';
import { buildTotalsSummary } from './posPendingTotals.js';
import {
  formatMoney,
  wrap,
} from './posPdfLayout.js';

// ── COLOR PALETTE (From Spesifikasi Template — Konfirmasi Jadwal Cleanox) ──
const COLOR_NAVY_CLEANOX   = [2, 65, 108];    // #02416C (Judul, kotak jadwal, nama customer & teknisi, garis header, TOTAL)
const COLOR_HIJAU_CLEANOX  = [147, 194, 15];  // #93C20F (Ikon judul section, bulatan centang Persiapan)
const COLOR_TEXT_MAIN      = [31, 42, 55];    // #1F2A37 (Isi tabel, kalimat sapaan, poin persiapan)
const COLOR_TEXT_MUTED     = [107, 119, 133]; // #6B7785 (No. Nota, header tabel, jabatan & ID teknisi, catatan kecil)
const COLOR_TEXT_SUBTOTAL  = [75, 85, 99];    // #4B5563 (Baris Subtotal)
const COLOR_LINE           = [227, 232, 238]; // #E3E8EE (Garis tabel, border kartu teknisi)
const COLOR_GREEN_TEXT     = [46, 158, 79];   // #2E9E4F (Teks badge Jadwal Terkonfirmasi & Terverifikasi)
const COLOR_GREEN_BG       = [230, 246, 234]; // #E6F6EA (Latar badge)
const COLOR_TOTAL_BG       = [238, 244, 250]; // #EEF4FA (Baris TOTAL)
const COLOR_AMBER_TEXT     = [154, 91, 18];   // #9A5B12 (Teks kotak "Harga final…")
const COLOR_AMBER_BG       = [255, 248, 236]; // #FFF8EC (Latar kotak catatan)
const COLOR_AMBER_BORDER   = [243, 217, 168]; // #F3D9A8 (Border kotak catatan)
const COLOR_WHITE          = [255, 255, 255]; // #FFFFFF (Latar halaman, teks di kotak navy)
const COLOR_CARD_MUTED     = [186, 230, 253]; // #BAE6FD (Label Tanggal / Jam / Alamat di kotak navy)

const DEFAULT_WA_NUMBER = '0851-2233-3381';
const DEFAULT_WA_LINK   = 'https://wa.me/6285122333381';

// ── HELPER: Typography (100% Poppins with fallback) ─────────────────────────

function applyFont(doc, weight = 'normal', size = 8, charSpace = 0) {
  const fontList = doc.getFontList ? doc.getFontList() : {};
  const hasPoppins = Boolean(fontList && fontList.Poppins);
  const family = hasPoppins ? 'Poppins' : 'helvetica';

  let style = 'normal';
  if (weight === 'bold' || weight === 700 || weight === '700') {
    style = 'bold';
  } else if (weight === 'medium' || weight === 500 || weight === '500') {
    style = hasPoppins ? 'medium' : 'normal';
  } else if (weight === 'italic') {
    style = hasPoppins ? 'normal' : 'italic';
  }

  doc.setFont(family, style);
  if (size != null) doc.setFontSize(size);
  if (doc.setCharSpace) doc.setCharSpace(charSpace || 0);
}

// ── HELPER: Image & Avatar Loaders ──────────────────────────────────────────

function loadImageDataUrl(src) {
  if (!src) return Promise.resolve(null);
  if (typeof src === 'string' && src.startsWith('data:')) return Promise.resolve(src);

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
 * Clips an image Data URL into a rounded square canvas so it matches the template aesthetic.
 */
function cropRoundedAvatar(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const size = Math.min(natW, natH);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const sx = Math.max(0, (natW - size) / 2);
        // Portrait photos have faces near the top; capture with headroom so head sits lower
        const sy = natH > natW ? Math.max(0, (natH - size) * 0.15) : Math.max(0, (natH - size) / 2);

        const radius = size * 0.133; // 2mm / 15mm ≈ 13.3% rounded corner
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(size - radius, 0);
        ctx.quadraticCurveTo(size, 0, size, radius);
        ctx.lineTo(size, size - radius);
        ctx.quadraticCurveTo(size, size, size - radius, size);
        ctx.lineTo(radius, size);
        ctx.quadraticCurveTo(0, size, 0, size - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Clean person outline placeholder icon matching the template's "[Foto]" box.
 */
function createPersonPlaceholderDataUrl() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');

    // Light grey rounded background
    ctx.fillStyle = '#F8FAFC';
    const radius = 20;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(150 - radius, 0);
    ctx.quadraticCurveTo(150, 0, 150, radius);
    ctx.lineTo(150, 150 - radius);
    ctx.quadraticCurveTo(150, 150, 150 - radius, 150);
    ctx.lineTo(radius, 150);
    ctx.quadraticCurveTo(0, 150, 0, 150 - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Person head outline
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 5;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(75, 52, 20, 0, Math.PI * 2);
    ctx.stroke();

    // Person shoulders outline
    ctx.beginPath();
    ctx.arc(75, 126, 36, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Small text "Foto"
    applyFont(ctx, 'normal', 14);
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Foto', 75, 134);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Robust technician avatar loader:
 * 1. Uses preloaded base64 from backend if available (worker.avatar_data_url).
 * 2. Fetches via /api/avatar-proxy with Blob -> FileReader to bypass any browser CORS limitations.
 * 3. Falls back gracefully to the clean person outline placeholder.
 */
async function loadWorkerAvatar(worker) {
  if (
    worker?.avatar_data_url &&
    typeof worker.avatar_data_url === 'string' &&
    worker.avatar_data_url.startsWith('data:')
  ) {
    try {
      const cropped = await cropRoundedAvatar(worker.avatar_data_url);
      if (cropped) return cropped;
    } catch {
      // fallback to proxy
    }
  }

  const rawPath = worker?.profile_path || worker?.avatar || null;
  if (!rawPath) {
    return createPersonPlaceholderDataUrl();
  }

  let targetUrl = String(rawPath).trim();
  if (!targetUrl.startsWith('data:')) {
    targetUrl = `/api/avatar-proxy?path=${encodeURIComponent(targetUrl)}`;
  }

  try {
    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const cropped = await cropRoundedAvatar(dataUrl);
    return cropped || dataUrl;
  } catch {
    return createPersonPlaceholderDataUrl();
  }
}

async function generateQrDataUrl(text) {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 180,
      color: {
        dark: '#02416C',
        light: '#FFFFFF',
      },
    });
  } catch {
    return null;
  }
}

function formatLongDateId(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr);
  const date = new Date(raw.includes('T') || raw.includes(' ') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(dateStr);

  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function formatItemQty(item, pendingGc) {
  if (pendingGc && isGeneralCleaningCategory(item.category_name)) return '—';
  if (isMeterPricingPending({ satuanName: item.satuan_name, unitLabel: item.unit_label, meter: item.meter })) {
    return String(item.qty ?? 1);
  }
  if (item.meter != null && item.meter !== '') {
    return formatItemQtyLabel(item);
  }
  const qty = Number(item.qty ?? 1);
  return Number.isFinite(qty) ? (qty % 1 === 0 ? String(qty) : qty.toFixed(1)) : '1';
}

// ── VECTOR DRAWING UTILITIES ────────────────────────────────────────────────

function drawGreenCheckCircle(doc, cx, cy, radius = 1.4, color = COLOR_HIJAU_CLEANOX) {
  doc.setFillColor(...color);
  doc.circle(cx, cy, radius, 'F');

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(cx - radius * 0.45, cy - radius * 0.05, cx - radius * 0.1, cy + radius * 0.35);
  doc.line(cx - radius * 0.1, cy + radius * 0.35, cx + radius * 0.5, cy - radius * 0.35);
}

function drawCalendarIconVector(doc, x, y, size = 3.2) {
  doc.setDrawColor(...COLOR_CARD_MUTED);
  doc.setLineWidth(0.28);
  doc.roundedRect(x, y + size * 0.2, size, size * 0.8, 0.35, 0.35, 'S');
  doc.line(x, y + size * 0.45, x + size, y + size * 0.45);
  doc.line(x + size * 0.28, y, x + size * 0.28, y + size * 0.2);
  doc.line(x + size * 0.72, y, x + size * 0.72, y + size * 0.2);
}

function drawClockIconVector(doc, x, y, size = 3.2) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  doc.setDrawColor(...COLOR_CARD_MUTED);
  doc.setLineWidth(0.28);
  doc.circle(cx, cy, r, 'S');
  doc.line(cx, cy, cx, cy - r * 0.6);
  doc.line(cx, cy, cx + r * 0.5, cy);
}

function drawPinIconVector(doc, x, y, size = 3.2) {
  const r = size * 0.38;
  const cx = x + size / 2;
  const cy = y + r + 0.2;
  doc.setDrawColor(...COLOR_CARD_MUTED);
  doc.setLineWidth(0.28);
  doc.circle(cx, cy, r, 'S');
  doc.line(cx - r * 0.8, cy + r * 0.5, cx, y + size);
  doc.line(cx + r * 0.8, cy + r * 0.5, cx, y + size);
}

function drawShieldIconVector(doc, x, y, size = 3.2, rgb = COLOR_NAVY_CLEANOX) {
  doc.setDrawColor(...rgb);
  doc.setLineWidth(0.3);
  const w = size;
  const h = size * 1.15;
  const cx = x + w / 2;
  doc.lines(
    [
      [w / 2, 0],
      [0, h * 0.5],
      [-w / 2, h * 0.5],
      [-w / 2, -h * 0.5],
      [0, -h * 0.5],
    ],
    cx,
    y
  );
  doc.line(cx - 0.6, y + h * 0.5, cx - 0.1, y + h * 0.7);
  doc.line(cx - 0.1, y + h * 0.7, cx + 0.7, y + h * 0.35);
}

function drawSectionHeader(doc, iconType, title, x, y) {
  // Green accent square (11px ≈ 2.9mm)
  const iconSize = 3.0;
  doc.setFillColor(...COLOR_HIJAU_CLEANOX);
  doc.roundedRect(x, y - 0.2, iconSize, iconSize, 0.7, 0.7, 'F');

  if (iconType === 'dollar') {
    applyFont(doc, 'bold', 6.5);
    doc.setTextColor(255, 255, 255);
    doc.text('$', x + 1.0, y + 2.1);
  } else if (iconType === 'check') {
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.35);
    doc.line(x + 0.7, y + 1.4, x + 1.3, y + 2.2);
    doc.line(x + 1.3, y + 2.2, x + 2.3, y + 0.8);
  } else if (iconType === 'shield') {
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.line(x + 0.7, y + 1.3, x + 1.3, y + 2.1);
    doc.line(x + 1.3, y + 2.1, x + 2.3, y + 0.8);
  }

  applyFont(doc, 'bold', 9);
  doc.setTextColor(...COLOR_NAVY_CLEANOX);
  doc.text(title, x + iconSize + 2.2, y + 2.2);
}

// ── HELPER: Running Header for Subsequent Pages ──────────────────────────────

function renderRunningHeader(doc, { transaction, logoBase64, margin, rightEdge }) {
  const y = 7;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, y, 22.5, 12);
    } catch {
      // fallback
    }
  }

  applyFont(doc, 'bold', 10.5, 0.15);
  doc.setTextColor(...COLOR_NAVY_CLEANOX);
  doc.text('KONFIRMASI JADWAL', rightEdge, y + 5.5, { align: 'right' });
  if (doc.setCharSpace) doc.setCharSpace(0);

  applyFont(doc, 'normal', 6.6);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  const notaText = `Cleanox Indonesia · No. Nota ${transaction.transaction_no || '-'} (Lanjutan)`;
  doc.text(notaText, rightEdge, y + 10.0, { align: 'right' });

  const lineY = y + 14.0;
  doc.setDrawColor(...COLOR_NAVY_CLEANOX);
  doc.setLineWidth(0.32);
  doc.line(margin, lineY, rightEdge, lineY);

  return lineY + 4.5;
}

function renderTableColumnsHeader(doc, { margin, rightEdge, y, colItemX, colQtyX, colQtyW, colHrgX, colHrgW }) {
  doc.setDrawColor(...COLOR_LINE);
  doc.setLineWidth(0.25);
  doc.line(margin, y, rightEdge, y);

  applyFont(doc, 'normal', 6.2, 0.1);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  doc.text('ITEM', colItemX + 1, y + 3.8);
  doc.text('QTY', colQtyX + colQtyW / 2, y + 3.8, { align: 'center' });
  doc.text('HARGA', colHrgX + colHrgW - 1, y + 3.8, { align: 'right' });
  doc.text('SUBTOTAL', rightEdge - 1, y + 3.8, { align: 'right' });
  if (doc.setCharSpace) doc.setCharSpace(0);

  const nextY = y + 5.2;
  doc.line(margin, nextY, rightEdge, nextY);
  return nextY;
}

// ── MAIN EXPORT: downloadPosOrderFormPdf ─────────────────────────────────────

/**
 * Cleanox Order Form — Formulir Konfirmasi Jadwal (Portrait A5).
 * Desain presisi 100% identik dengan Spesifikasi_Template_Konfirmasi_Jadwal_Cleanox.xlsx
 *
 * @param {{
 *   transaction: object,
 *   items?: array,
 *   assignments?: array,
 *   logoDataUrl?: string|object|null,
 *   mascotDataUrl?: string|object|null,
 * }} params
 */
export async function downloadPosOrderFormPdf({
  transaction,
  items = [],
  assignments = [],
  logoDataUrl = null,
  mascotDataUrl = null,
}) {
  if (!transaction) throw new Error('Data transaksi tidak tersedia');

  // Spesifikasi Kertas: A5 portrait (148 x 210 mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const pageW = doc.internal.pageSize.getWidth();   // 148 mm
  const pageH = doc.internal.pageSize.getHeight();  // 210 mm
  const margin = 8;                                 // Margin kiri & kanan: 8 mm
  const marginTop = 7;                              // Margin atas: 7 mm
  const contentW = 132;                             // Lebar area konten: 132 mm (148 - 8 - 8)
  const rightEdge = margin + contentW;              // 140 mm

  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const { timeLine } = formatServiceDateParts(transaction.service_date);
  const formattedDate = formatLongDateId(transaction.service_date);
  const serviceTimeLabel = timeLine && timeLine !== '-' ? `${timeLine} WIB` : '09.00 WIB';

  // 1. Preload Poppins Fonts, Assets (Logo, Mascot, QR, & Worker Avatars)
  const [logoBase64, mascotBase64, qrBase64] = await Promise.all([
    loadImageDataUrl(typeof logoDataUrl === 'string' ? logoDataUrl : logoDataUrl?.dataUrl),
    loadImageDataUrl(typeof mascotDataUrl === 'string' ? mascotDataUrl : mascotDataUrl?.dataUrl),
    generateQrDataUrl(
      `${DEFAULT_WA_LINK}?text=${encodeURIComponent(
        `Halo Admin Cleanox, saya ingin menanyakan jadwal pesanan No. ${transaction.transaction_no || transaction.id || ''}`
      )}`
    ),
    registerCareReportFonts(doc),
  ]);

  // Preload worker avatars (up to 4 technicians)
  const activeAssignments = (Array.isArray(assignments) ? assignments : [])
    .filter((a) => a && ['Assigned', 'In_Schedule', 'On_Progress', 'Done'].includes(a.assignment_status || 'Assigned'))
    .slice(0, 4);

  const workerAvatars = await Promise.all(
    activeAssignments.map(async (worker) => {
      return await loadWorkerAvatar(worker);
    })
  );

  let y = marginTop;

  // ── 1. HEADER SECTION (Spesifikasi Baris 5-8) ──────────────────────────────
  // Logo Cleanox (HD) di kiri: x=8, y=7, w=25.5, h=13.5 mm (tinggi dikunci 13.5 mm)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, y, 25.5, 13.5);
    } catch {
      // fallback
    }
  }

  // Judul "KONFIRMASI JADWAL": Poppins Bold 12 pt, #02416C, rata kanan di x=140 mm
  applyFont(doc, 'bold', 12, 0.15);
  doc.setTextColor(...COLOR_NAVY_CLEANOX);
  doc.text('KONFIRMASI JADWAL', rightEdge, y + 6.5, { align: 'right' });
  if (doc.setCharSpace) doc.setCharSpace(0);

  // No. Nota: Poppins Regular 6.6 pt, #6B7785, rata kanan di x=140 mm
  applyFont(doc, 'normal', 6.6);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  const notaText = `Cleanox Indonesia · No. Nota ${transaction.transaction_no || '-'}`;
  doc.text(notaText, rightEdge, y + 11.5, { align: 'right' });

  // Garis bawah header: x=8..140 mm, y=24 mm, tebal 0.32 mm (0.9 px), #02416C
  y = 24;
  doc.setDrawColor(...COLOR_NAVY_CLEANOX);
  doc.setLineWidth(0.32);
  doc.line(margin, y, rightEdge, y);

  // ── 2. GREETING & BADGE (Spesifikasi Baris 9-11) ───────────────────────────
  // Maskot kucing: x=8, y=27.4, w=13, h=13.7 mm
  const mascotY = 27.4;
  if (mascotBase64) {
    try {
      doc.addImage(mascotBase64, 'PNG', margin, mascotY, 13, 13.7);
    } catch {
      // fallback
    }
  }

  // Kalimat sapaan: x=24 mm, jarak 3 mm dari maskot (100% Poppins)
  const textStartX = 24;
  const customerName = transaction.customer_name || 'Customer';

  // Baris 1: Halo Kak [Nama Customer],
  applyFont(doc, 'normal', 8.4);
  doc.setTextColor(...COLOR_TEXT_MAIN);
  doc.text('Halo Kak ', textStartX, 31.8);
  const prefixW = doc.getTextWidth('Halo Kak ');

  applyFont(doc, 'bold', 11);
  doc.setTextColor(...COLOR_NAVY_CLEANOX);
  doc.text(customerName, textStartX + prefixW, 31.8);
  const nameW = doc.getTextWidth(customerName);

  // Baris 2 & 3: sapaan & jadwal layanan terkonfirmasi
  applyFont(doc, 'normal', 8.4);
  doc.setTextColor(...COLOR_TEXT_MAIN);

  if (textStartX + prefixW + nameW + doc.getTextWidth(', jadwal layanan Cleanox') <= 98) {
    doc.text(', jadwal layanan Cleanox', textStartX + prefixW + nameW, 31.8);
    doc.text('untuk Kakak sudah terkonfirmasi. Sampai jumpa!', textStartX, 36.5);
  } else {
    doc.text('jadwal layanan Cleanox untuk Kakak sudah', textStartX, 36.2);
    doc.text('terkonfirmasi. Sampai jumpa!', textStartX, 40.5);
  }

  // Badge "Jadwal Terkonfirmasi": Poppins Bold 6.8 pt, #2E9E4F
  const badgeW = 36;
  const badgeH = 5.4;
  const badgeX = rightEdge - badgeW;
  const badgeY = 32.5;

  doc.setFillColor(...COLOR_GREEN_BG);
  doc.setDrawColor(...COLOR_GREEN_TEXT);
  doc.setLineWidth(0.2);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.7, 2.7, 'FD');

  drawGreenCheckCircle(doc, badgeX + 3.2, badgeY + badgeH / 2, 1.3, COLOR_GREEN_TEXT);

  applyFont(doc, 'bold', 6.8);
  doc.setTextColor(...COLOR_GREEN_TEXT);
  doc.text('Jadwal Terkonfirmasi', badgeX + 6.0, badgeY + 3.7);

  // ── 3. KOTAK JADWAL NAVY (Spesifikasi Baris 12) ────────────────────────────
  y = 44;
  const cardPadX = 4.5;
  const cardColW = (contentW - cardPadX * 2) / 2; // ≈ 61.5 mm

  applyFont(doc, 'normal', 8.6);
  const addrLines = wrap(doc, transaction.customer_address || '-', contentW - cardPadX * 2, 8.6);
  const isMultiLineAddr = addrLines.length > 1;
  const cardH = isMultiLineAddr ? 29.5 : 26.1;

  doc.setFillColor(...COLOR_NAVY_CLEANOX);
  doc.roundedRect(margin, y, contentW, cardH, 3.5, 3.5, 'F');

  // Tanggal Layanan (Col 1)
  const col1X = margin + cardPadX;
  drawCalendarIconVector(doc, col1X, y + 3.8, 3.0);
  applyFont(doc, 'normal', 6.6);
  doc.setTextColor(...COLOR_CARD_MUTED);
  doc.text('Tanggal', col1X + 4.2, y + 6.2);

  applyFont(doc, 'bold', 9.6);
  doc.setTextColor(255, 255, 255);
  doc.text(formattedDate, col1X, y + 11.2);

  // Jam Layanan (Col 2)
  const col2X = margin + cardPadX + cardColW + 2;
  drawClockIconVector(doc, col2X, y + 3.8, 3.0);
  applyFont(doc, 'normal', 6.6);
  doc.setTextColor(...COLOR_CARD_MUTED);
  doc.text('Jam layanan', col2X + 4.2, y + 6.2);

  applyFont(doc, 'bold', 9.6);
  doc.setTextColor(255, 255, 255);
  doc.text(serviceTimeLabel, col2X, y + 11.2);

  // Alamat Lengkap
  const addrStartY = y + 15.5;
  drawPinIconVector(doc, col1X, addrStartY, 3.0);
  applyFont(doc, 'normal', 6.6);
  doc.setTextColor(...COLOR_CARD_MUTED);
  doc.text('Alamat', col1X + 4.2, addrStartY + 2.3);

  applyFont(doc, 'normal', 8.6);
  doc.setTextColor(255, 255, 255);
  doc.text(addrLines[0] || '-', col1X, addrStartY + 6.5);
  if (isMultiLineAddr) {
    doc.text(addrLines[1], col1X, addrStartY + 10.0);
  }

  y += cardH + 4.0;

  // ── 4. RINCIAN LAYANAN & HARGA (Spesifikasi Baris 13-15) ───────────────────
  drawSectionHeader(doc, 'dollar', 'Rincian Layanan & Harga', margin, y);
  y += 5.5;

  // Table Columns Setup: ITEM: 64 mm, QTY: 16 mm, HARGA: 26 mm, SUBTOTAL: 26 mm
  const colItemW = 64;
  const colQtyW  = 16;
  const colHrgW  = 26;
  const colSubW  = 26;

  const colItemX = margin;
  const colQtyX  = colItemX + colItemW;
  const colHrgX  = colQtyX + colQtyW;
  const colSubX  = colHrgX + colHrgW;

  y = renderTableColumnsHeader(doc, { margin, rightEdge, y, colItemX, colQtyX, colQtyW, colHrgX, colHrgW });

  // Table Rows: Poppins Regular 7.4 pt, #1F2A37
  applyFont(doc, 'normal', 7.4);
  doc.setTextColor(...COLOR_TEXT_MAIN);

  const rowBaseHeight = 6.0;
  let computedSubtotalSum = 0;

  const ensurePageSpace = (neededHeight) => {
    if (y + neededHeight > 184) {
      doc.addPage();
      y = renderRunningHeader(doc, { transaction, logoBase64, margin, rightEdge });
      return true;
    }
    return false;
  };

  itemRows.forEach((item) => {
    const isGcPending = pendingGc && isGeneralCleaningCategory(item.category_name);
    const isMeterPending = isMeterPricingPending({
      satuanName: item.satuan_name,
      unitLabel: item.unit_label,
      meter: item.meter,
    });

    const itemName = String(item.service_name || `Service #${item.service_id}`);
    const itemQty = formatItemQty(item, pendingGc);
    const itemPrice = isGcPending
      ? `${formatMoney(item.final_price_snapshot)} / jam`
      : formatMoney(item.final_price_snapshot);
    const lineTotalVal = Number(item.line_total) || 0;
    computedSubtotalSum += lineTotalVal;
    const itemTotal = isGcPending || isMeterPending ? 'Pending' : formatMoney(lineTotalVal);

    const wrappedName = wrap(doc, itemName, colItemW - 3, 7.4);
    const isMultiLine = wrappedName.length > 1;
    const currentRowH = isMultiLine ? 8.5 : rowBaseHeight;

    // Cek batas bawah sebelum merender baris item
    if (y + currentRowH > 184) {
      doc.addPage();
      y = renderRunningHeader(doc, { transaction, logoBase64, margin, rightEdge });
      drawSectionHeader(doc, 'dollar', 'Rincian Layanan & Harga (Lanjutan)', margin, y);
      y += 5.5;
      y = renderTableColumnsHeader(doc, { margin, rightEdge, y, colItemX, colQtyX, colQtyW, colHrgX, colHrgW });
      applyFont(doc, 'normal', 7.4);
      doc.setTextColor(...COLOR_TEXT_MAIN);
    }

    y += currentRowH;

    if (isMultiLine) {
      doc.text(wrappedName[0], colItemX + 1, y - 4.6);
      doc.text(wrappedName[1], colItemX + 1, y - 1.4);
    } else {
      doc.text(wrappedName[0] || itemName, colItemX + 1, y - 1.5);
    }
    doc.text(itemQty, colQtyX + colQtyW / 2, y - 1.5, { align: 'center' });
    doc.text(itemPrice, colHrgX + colHrgW - 1, y - 1.5, { align: 'right' });
    doc.text(itemTotal, rightEdge - 1, y - 1.5, { align: 'right' });

    // Subtle divider
    doc.setDrawColor(...COLOR_LINE);
    doc.setLineWidth(0.18);
    doc.line(margin, y, rightEdge, y);
  });

  if (itemRows.length === 0) {
    y += rowBaseHeight;
    doc.setTextColor(...COLOR_TEXT_MUTED);
    doc.text('Tidak ada item layanan.', colItemX + 1, y - 1.5);
    doc.line(margin, y, rightEdge, y);
  }

  y += 2.5;

  // ── TOTALS SUMMARY & BARIS TOTAL ──────────────────────────────────────────
  const summary = buildTotalsSummary({
    transaction,
    gcPending: pendingGc,
    meterPending: transactionHasMeterPending(itemRows),
  });

  const summaryLabelX = colHrgX + colHrgW - 2;
  const summaryValueX = rightEdge - 1;

  const subtotalAmount =
    Number(transaction.subtotal) ||
    (computedSubtotalSum > 0 ? computedSubtotalSum : Number(summary.subtotal) || 0);

  const transportAmount = Number(transaction.shipping_cost || transaction.transport_fee || 0);
  const discountAmount = Number(transaction.discount_total || transaction.discount_amount || 0);

  // Pastikan ada ruang cukup untuk ringkasan Totals
  const totalBoxH = 7.8;
  let totalsNeededH = totalBoxH + 3.2;
  if (transportAmount > 0 || discountAmount > 0) totalsNeededH += 4.5;
  if (transportAmount > 0) totalsNeededH += 4.5;
  if (discountAmount > 0) totalsNeededH += 4.5;
  ensurePageSpace(totalsNeededH);

  // Subtotal row
  if (transportAmount > 0 || discountAmount > 0) {
    applyFont(doc, 'normal', 7.4);
    doc.setTextColor(...COLOR_TEXT_SUBTOTAL);
    doc.text('Subtotal', summaryLabelX, y + 2.5, { align: 'right' });
    doc.setTextColor(...COLOR_TEXT_MAIN);
    doc.text(formatMoney(subtotalAmount), summaryValueX, y + 2.5, { align: 'right' });
    y += 4.5;
  }

  // Biaya Transport row
  if (transportAmount > 0) {
    applyFont(doc, 'normal', 7.4);
    doc.setTextColor(...COLOR_TEXT_SUBTOTAL);
    doc.text('Biaya transport', summaryLabelX, y + 2.5, { align: 'right' });
    doc.setTextColor(...COLOR_TEXT_MAIN);
    doc.text(formatMoney(transportAmount), summaryValueX, y + 2.5, { align: 'right' });
    y += 4.5;
  }

  // Diskon row
  if (discountAmount > 0) {
    const promoName = transaction.promo_name || 'promo';
    applyFont(doc, 'normal', 7.4);
    doc.setTextColor(...COLOR_TEXT_SUBTOTAL);
    doc.text(`Diskon [${promoName}]`, summaryLabelX, y + 2.5, { align: 'right' });
    doc.setTextColor(220, 38, 38);
    doc.text(`- ${formatMoney(discountAmount)}`, summaryValueX, y + 2.5, { align: 'right' });
    y += 4.5;
  }

  // Baris TOTAL: Poppins Bold 8.8 pt, #02416C, latar #EEF4FA
  doc.setFillColor(...COLOR_TOTAL_BG);
  doc.roundedRect(margin, y + 1, contentW, totalBoxH, 1.8, 1.8, 'F');

  applyFont(doc, 'bold', 8.8);
  doc.setTextColor(...COLOR_NAVY_CLEANOX);
  doc.text('TOTAL', summaryLabelX, y + 5.8, { align: 'right' });
  doc.text(formatMoney(summary.totalAmount), summaryValueX, y + 5.8, { align: 'right' });

  y += totalBoxH + 3.2;

  // ── 5. KOTAK CATATAN HARGA (Spesifikasi Baris 16) ──────────────────────────
  const disclaimerH = 9.2;
  ensurePageSpace(disclaimerH + 3.8);

  doc.setFillColor(...COLOR_AMBER_BG);
  doc.setDrawColor(...COLOR_AMBER_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, y, contentW, disclaimerH, 2.0, 2.0, 'FD');

  drawShieldIconVector(doc, margin + 2.8, y + 2.2, 2.8, COLOR_AMBER_TEXT);

  applyFont(doc, 'normal', 6.0);
  doc.setTextColor(...COLOR_AMBER_TEXT);
  const disclaimerNote =
    'Harga final akan diinformasikan setelah teknisi melakukan pengecekan di lokasi, sebelum pengerjaan dimulai.';
  doc.text(disclaimerNote, margin + 7.2, y + 5.6, { maxWidth: contentW - 10 });

  y += disclaimerH + 3.8;

  // ── 6. PERSIAPAN SEBELUM TIM DATANG (Spesifikasi Baris 17-18) ──────────────
  ensurePageSpace(5.2 + 9.5 + 4.0);
  drawSectionHeader(doc, 'check', 'Persiapan Sebelum Tim Datang', margin, y);
  y += 5.2;

  const checklistItems = [
    'Kosongkan area\nsekitar item',
    'Siapkan akses\nlistrik & air',
    'Info lokasi parkir\n/ akses masuk',
    'Amankan hewan\npeliharaan',
  ];

  const checkColW = 31.5;
  const checkGap  = 2.0;

  checklistItems.forEach((text, idx) => {
    const itemX = margin + idx * (checkColW + checkGap);
    drawGreenCheckCircle(doc, itemX + 1.6, y + 1.8, 1.3, COLOR_HIJAU_CLEANOX);

    applyFont(doc, 'normal', 6.6);
    doc.setTextColor(...COLOR_TEXT_MAIN);
    const lines = text.split('\n');
    doc.text(lines[0], itemX + 4.2, y + 2.2);
    if (lines[1]) {
      doc.text(lines[1], itemX + 4.2, y + 5.4);
    }
  });

  y += 9.5;

  // ── 7. TIM TEKNISI YANG AKAN DATANG (Spesifikasi Baris 19-22) ──────────────
  const techCardW = 64.8;
  const techCardH = 20.4;
  const techCardGap = 2.4;

  const techRows = Math.ceil(activeAssignments.length / 2);
  const techNeededH = 4.8 + (techRows > 0 ? techRows * (techCardH + 2.5) : 15) + 6.0;
  ensurePageSpace(techNeededH);

  drawSectionHeader(doc, 'shield', 'Tim Teknisi yang Akan Datang', margin, y);
  y += 4.8;

  if (activeAssignments.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...COLOR_LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, contentW, 12, 2.6, 2.6, 'FD');

    applyFont(doc, 'italic', 7.4);
    doc.setTextColor(...COLOR_TEXT_MUTED);
    doc.text('Teknisi akan segera ditugaskan oleh Admin Cleanox.', margin + 4, y + 7.2);
    y += 15;
  } else {
    activeAssignments.forEach((worker, idx) => {
      const colIdx = idx % 2;
      const rowIdx = Math.floor(idx / 2);

      const cardX = margin + colIdx * (techCardW + techCardGap);
      const cardY = y + rowIdx * (techCardH + 2.5);

      // Kartu Container: putih, border #E3E8EE
      doc.setFillColor(...COLOR_WHITE);
      doc.setDrawColor(...COLOR_LINE);
      doc.setLineWidth(0.25);
      doc.roundedRect(cardX, cardY, techCardW, techCardH, 2.6, 2.6, 'FD');

      // Foto Avatar Teknisi: 15 x 15 mm, sudut 2 mm
      const avatarDataUrl = workerAvatars[idx];
      const avatarSize = 15.0;
      const avatarX = cardX + 2.7;
      const avatarY = cardY + 2.6;

      if (avatarDataUrl) {
        try {
          doc.addImage(avatarDataUrl, 'PNG', avatarX, avatarY, avatarSize, avatarSize);
        } catch {
          // fallback
        }
      }

      // Border halus di sekitar avatar
      doc.setDrawColor(...COLOR_LINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(avatarX, avatarY, avatarSize, avatarSize, 2.0, 2.0, 'S');

      // Informasi Pekerja: 100% Poppins
      const infoX = cardX + 20.2;
      const wName = worker.employee_name || 'Teknisi';
      const wRole = 'Teknisi Cleanox'; // Sesuai instruksi: selalu "Teknisi Cleanox"
      const rawCode = worker.employee_code || (worker.employee_id ? `CLX-${String(worker.employee_id).padStart(3, '0')}` : `${idx + 1}`);
      const cleanCode = String(rawCode).replace(/^\[|\]$/g, '');
      const wCode = `ID: ${cleanCode}`;

      // 1. Nama Teknisi: Poppins Bold 7.8 pt, #02416C
      applyFont(doc, 'bold', 7.8);
      doc.setTextColor(...COLOR_NAVY_CLEANOX);
      const shortName = wrap(doc, wName, techCardW - avatarSize - 7, 7.8)[0] || wName;
      doc.text(shortName, infoX, cardY + 5.2);

      // 2. Role / Jabatan: Poppins Regular 6.2 pt, #6B7785
      applyFont(doc, 'normal', 6.2);
      doc.setTextColor(...COLOR_TEXT_MUTED);
      doc.text(wRole, infoX, cardY + 8.8);

      // 3. ID Karyawan: Poppins Regular 6.2 pt, #6B7785
      doc.text(wCode, infoX, cardY + 12.2);

      // 4. Badge "Terverifikasi": Poppins Bold 5.8 pt, #2E9E4F
      const vBadgeW = 20.0;
      const vBadgeH = 3.8;
      const vBadgeX = infoX;
      const vBadgeY = cardY + 13.8;

      doc.setFillColor(...COLOR_GREEN_BG);
      doc.setDrawColor(...COLOR_GREEN_TEXT);
      doc.setLineWidth(0.18);
      doc.roundedRect(vBadgeX, vBadgeY, vBadgeW, vBadgeH, 1.9, 1.9, 'FD');

      drawGreenCheckCircle(doc, vBadgeX + 2.0, vBadgeY + vBadgeH / 2, 0.9, COLOR_GREEN_TEXT);

      applyFont(doc, 'bold', 5.8);
      doc.setTextColor(...COLOR_GREEN_TEXT);
      doc.text('Terverifikasi', vBadgeX + 4.2, vBadgeY + 2.7);
    });

    const totalRows = Math.ceil(activeAssignments.length / 2);
    y += totalRows * (techCardH + 2.5) + 1.0;
  }

  // Catatan jumlah teknisi: Poppins Regular 6.4 pt, #6B7785
  applyFont(doc, 'normal', 6.4);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  doc.text('Jumlah teknisi 2–4 orang sesuai order. Mohon cocokkan nama & foto saat tim tiba.', margin, y + 2.2);

  // ── 8. FOOTER / KONTAK WHATSAPP (Spesifikasi Baris 23-24) ──────────────────
  const footerNeededH = 20.0;
  if (y + footerNeededH > 206) {
    doc.addPage();
    y = renderRunningHeader(doc, { transaction, logoBase64, margin, rightEdge });
  }

  const footerY = Math.max(186, y + 3.5);

  // QR WhatsApp: x=9, y=footerY, w=15, h=15 mm
  const qrSize = 15.0;
  if (qrBase64) {
    try {
      doc.addImage(qrBase64, 'PNG', 9, footerY, qrSize, qrSize);
    } catch {
      // fallback
    }
  }

  // Teks footer (100% Poppins): x=28, y=footerY, w=112, h=15 mm
  const contactX = 28;

  // Baris 1: Poppins Bold 7.6 pt, #02416C
  applyFont(doc, 'bold', 7.6);
  doc.setTextColor(...COLOR_NAVY_CLEANOX);
  doc.text('Perlu ubah jadwal atau ada pertanyaan?', contactX, footerY + 5.0);

  // Baris 2: Poppins Regular 7.6 pt, #1F2A37; Nomor WA: Poppins Bold #02416C
  applyFont(doc, 'normal', 7.6);
  doc.setTextColor(...COLOR_TEXT_MAIN);
  const promptText = 'Hubungi Admin Cleanox via WhatsApp ';
  const promptW = doc.getTextWidth(promptText);
  doc.text(promptText, contactX, footerY + 9.5);

  applyFont(doc, 'bold', 7.6);
  doc.setTextColor(...COLOR_NAVY_CLEANOX);
  doc.text(DEFAULT_WA_NUMBER, contactX + promptW, footerY + 9.5);

  // ── 9. PENOMORAN HALAMAN (Jika Multi-Page) ─────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  if (totalPages > 1) {
    for (let i = 1; i <= totalPages; i += 1) {
      doc.setPage(i);
      applyFont(doc, 'normal', 6.0);
      doc.setTextColor(...COLOR_TEXT_MUTED);
      doc.text(`Halaman ${i} dari ${totalPages}`, rightEdge, 206, { align: 'right' });
    }
  }

  // Simpan File PDF
  const filename = `Konfirmasi_Jadwal_Cleanox_${transaction.transaction_no || transaction.id || 'order'}.pdf`;
  doc.save(filename);
  return doc;
}
