import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { resolveAvatarUrl } from '../../shared/utils/avatar.js';
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

// ── COLOR PALETTE (Strictly Matched to Konfirmasi_Jadwal_Cleanox_3-5_Layanan.pdf) ──
const COLOR_PRIMARY_NAVY = [13, 46, 92];       // #0D2E5C (Deep Navy for titles, total, and main accents)
const COLOR_CARD_NAVY    = [15, 53, 114];      // #0F3572 (Schedule Card Background)
const COLOR_CARD_MUTED   = [147, 197, 253];    // #93C5FD (Schedule Card Label)
const COLOR_TEXT_DARK    = [15, 23, 42];       // #0F172A (Slate 900)
const COLOR_TEXT_BODY    = [51, 65, 85];       // #334155 (Slate 700)
const COLOR_TEXT_MUTED   = [100, 116, 139];    // #64748B (Slate 500)
const COLOR_BORDER       = [226, 232, 240];    // #E2E8F0 (Slate 200)
const COLOR_BORDER_LIGHT = [241, 245, 249];    // #F1F5F9 (Slate 100)

const COLOR_GREEN_BADGE_BG   = [235, 248, 238]; // #EBF8EE
const COLOR_GREEN_BADGE_BRD  = [187, 247, 208]; // #BBF7D0
const COLOR_GREEN_TEXT       = [22, 163, 74];   // #16A34A (Green 600)

const COLOR_AMBER_BOX_BG  = [254, 249, 231];    // #FEF9E7
const COLOR_AMBER_BOX_BRD = [254, 240, 199];    // #FEF0C7
const COLOR_AMBER_TEXT    = [146, 64, 14];      // #92400E (Amber 800)

const DEFAULT_WA_NUMBER = '0851-2233-3381';
const DEFAULT_WA_LINK   = 'https://wa.me/6285122333381';

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

        const radius = size * 0.16; // 16% rounded corner
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
    canvas.width = 160;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    // Light grey rounded background
    ctx.fillStyle = '#F8FAFC';
    const radius = 24;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(160 - radius, 0);
    ctx.quadraticCurveTo(160, 0, 160, radius);
    ctx.lineTo(160, 160 - radius);
    ctx.quadraticCurveTo(160, 160, 160 - radius, 160);
    ctx.lineTo(radius, 160);
    ctx.quadraticCurveTo(0, 160, 0, 160 - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Person head outline
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 6;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(80, 56, 22, 0, Math.PI * 2);
    ctx.stroke();

    // Person shoulders outline
    ctx.beginPath();
    ctx.arc(80, 134, 38, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Small text "Foto"
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Foto', 80, 142);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Robust technician avatar loader:
 * 1. Uses preloaded base64 from backend if available (worker.avatar_data_url).
 * 2. Fetches via /api/avatar-proxy with Blob -> FileReader to bypass any browser CORS tainted canvas limitations.
 * 3. Falls back gracefully to the clean person outline placeholder.
 */
async function loadWorkerAvatar(worker) {
  // 1. Check if backend already sent the preloaded base64 data URL
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

  // 2. Fetch via proxy or same-origin endpoint
  let targetUrl = String(rawPath).trim();
  if (!targetUrl.startsWith('data:')) {
    // If it's a relative path or an absolute SuperApp URL, use the avatar proxy
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
    // Fallback if network or proxy unavailable
    return createPersonPlaceholderDataUrl();
  }
}

async function generateQrDataUrl(text) {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 180,
      color: {
        dark: '#0D2E5C',
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

function drawGreenCheckCircle(doc, cx, cy, radius = 2.4) {
  doc.setFillColor(...COLOR_GREEN_TEXT);
  doc.circle(cx, cy, radius, 'F');

  // Checkmark symbol inside
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.42);
  doc.line(cx - radius * 0.45, cy - radius * 0.05, cx - radius * 0.1, cy + radius * 0.35);
  doc.line(cx - radius * 0.1, cy + radius * 0.35, cx + radius * 0.5, cy - radius * 0.35);
}

function drawCalendarIconVector(doc, x, y, size = 3.6) {
  doc.setDrawColor(...COLOR_CARD_MUTED);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y + size * 0.2, size, size * 0.8, 0.4, 0.4, 'S');
  doc.line(x, y + size * 0.45, x + size, y + size * 0.45);
  doc.line(x + size * 0.28, y, x + size * 0.28, y + size * 0.2);
  doc.line(x + size * 0.72, y, x + size * 0.72, y + size * 0.2);
}

function drawClockIconVector(doc, x, y, size = 3.6) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  doc.setDrawColor(...COLOR_CARD_MUTED);
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, r, 'S');
  doc.line(cx, cy, cx, cy - r * 0.6);
  doc.line(cx, cy, cx + r * 0.5, cy);
}

function drawPinIconVector(doc, x, y, size = 3.6) {
  const r = size * 0.38;
  const cx = x + size / 2;
  const cy = y + r + 0.2;
  doc.setDrawColor(...COLOR_CARD_MUTED);
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, r, 'S');
  doc.line(cx - r * 0.8, cy + r * 0.5, cx, y + size);
  doc.line(cx + r * 0.8, cy + r * 0.5, cx, y + size);
}

function drawShieldIconVector(doc, x, y, size = 3.8, rgb = COLOR_PRIMARY_NAVY) {
  doc.setDrawColor(...rgb);
  doc.setLineWidth(0.35);
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
  // Centang kecil di dalam perisai
  doc.line(cx - 0.7, y + h * 0.5, cx - 0.1, y + h * 0.72);
  doc.line(cx - 0.1, y + h * 0.72, cx + 0.8, y + h * 0.38);
}

// ── MAIN EXPORT: downloadPosOrderFormPdf ─────────────────────────────────────

/**
 * Cleanox Order Form — Formulir Konfirmasi Jadwal (Portrait A4).
 * Desain presisi 100% identik dengan Konfirmasi_Jadwal_Cleanox_3-5_Layanan.pdf.
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

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const { timeLine } = formatServiceDateParts(transaction.service_date);
  const formattedDate = formatLongDateId(transaction.service_date);
  const serviceTimeLabel = timeLine && timeLine !== '-' ? `${timeLine} WIB` : '09.00 WIB';

  // 1. Preload Assets (Logo, Mascot, QR, & Worker Avatars)
  const [logoBase64, mascotBase64, qrBase64] = await Promise.all([
    loadImageDataUrl(typeof logoDataUrl === 'string' ? logoDataUrl : logoDataUrl?.dataUrl),
    loadImageDataUrl(typeof mascotDataUrl === 'string' ? mascotDataUrl : mascotDataUrl?.dataUrl),
    generateQrDataUrl(
      `${DEFAULT_WA_LINK}?text=${encodeURIComponent(
        `Halo Admin Cleanox, saya ingin menanyakan jadwal pesanan No. ${transaction.transaction_no || transaction.id || ''}`
      )}`
    ),
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

  let y = margin;

  // ── 1. HEADER SECTION ─────────────────────────────────────────────────────
  // Logo Cleanox di kiri atas
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, y - 2, 34, 15);
    } catch {
      // fallback
    }
  }

  // Judul "KONFIRMASI JADWAL" & No. Nota di kanan atas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...COLOR_PRIMARY_NAVY);
  doc.text('KONFIRMASI JADWAL', pageW - margin, y + 4, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  const notaText = `Cleanox Indonesia · No. Nota ${transaction.transaction_no || '-'}`;
  doc.text(notaText, pageW - margin, y + 9.5, { align: 'right' });

  y += 18;

  // Thin separator line below header matching template
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);

  y += 5;

  // ── 2. GREETING & STATUS BADGE ────────────────────────────────────────────
  const customerName = transaction.customer_name || 'Customer';

  // Mascot with proper 4:5 aspect ratio (width: 12mm, height: 15mm)
  if (mascotBase64) {
    try {
      doc.addImage(mascotBase64, 'PNG', margin, y - 1, 12, 15);
    } catch {
      // fallback
    }
  }

  const textStartX = mascotBase64 ? margin + 15 : margin;

  // Greeting Lines (No unicode emoji to avoid broken characters)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_TEXT_DARK);
  doc.text('Halo Kak ', textStartX, y + 4.5);

  doc.setFont('helvetica', 'bold');
  const greetingPrefixW = doc.getTextWidth('Halo Kak ');
  doc.text(customerName, textStartX + greetingPrefixW, y + 4.5);

  doc.setFont('helvetica', 'normal');
  const fullGreetingLine1 = `Halo Kak ${customerName}`;
  const greetingLine1W = doc.getTextWidth(fullGreetingLine1);
  doc.text(
    ', jadwal layanan Cleanox untuk Kakak sudah',
    textStartX + greetingLine1W,
    y + 4.5
  );

  doc.text('terkonfirmasi. Sampai jumpa!', textStartX, y + 9.5);

  // Status Badge "✓ Jadwal Terkonfirmasi" di kanan
  const badgeW = 44;
  const badgeH = 7;
  const badgeX = pageW - margin - badgeW;
  const badgeY = y + 2.5;

  doc.setFillColor(...COLOR_GREEN_BADGE_BG);
  doc.setDrawColor(...COLOR_GREEN_BADGE_BRD);
  doc.setLineWidth(0.3);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3.5, 3.5, 'FD');

  drawGreenCheckCircle(doc, badgeX + 4.5, badgeY + badgeH / 2, 1.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_GREEN_TEXT);
  doc.text('Jadwal Terkonfirmasi', badgeX + 8.2, badgeY + 4.7);

  y += 17;

  // ── 3. SCHEDULE & LOCATION CARD (NAVY THEME) ──────────────────────────────
  const cardH = 35;
  doc.setFillColor(...COLOR_CARD_NAVY);
  doc.roundedRect(margin, y, contentW, cardH, 4.5, 4.5, 'F');

  const cardPadX = 7;
  const cardColW = (contentW - cardPadX * 2) / 2;

  // Tanggal Layanan
  drawCalendarIconVector(doc, margin + cardPadX, y + 5.5, 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_CARD_MUTED);
  doc.text('Tanggal', margin + cardPadX + 5, y + 8.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(formattedDate, margin + cardPadX, y + 14.5);

  // Jam Layanan
  const col2X = margin + cardPadX + cardColW + 4;
  drawClockIconVector(doc, col2X, y + 5.5, 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_CARD_MUTED);
  doc.text('Jam layanan', col2X + 5, y + 8.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(serviceTimeLabel, col2X, y + 14.5);

  // Alamat Lengkap
  const addrStartY = y + 21.5;
  drawPinIconVector(doc, margin + cardPadX, addrStartY, 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_CARD_MUTED);
  doc.text('Alamat', margin + cardPadX + 5, addrStartY + 2.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  const addrLines = wrap(doc, transaction.customer_address || '-', contentW - cardPadX * 2, 8.5);
  doc.text(addrLines.slice(0, 2), margin + cardPadX, addrStartY + 7.5);

  y += cardH + 7;

  // ── 4. RINCIAN LAYANAN & HARGA (TABLE) ────────────────────────────────────
  // Title with green money badge
  doc.setFillColor(...COLOR_GREEN_BADGE_BG);
  doc.roundedRect(margin, y - 0.5, 5, 5, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_GREEN_TEXT);
  doc.text('$', margin + 1.6, y + 3.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_PRIMARY_NAVY);
  doc.text('Rincian Layanan & Harga', margin + 7.5, y + 3.5);

  y += 7;

  // Table Columns Setup
  const colItemW = contentW * 0.48;
  const colQtyW  = contentW * 0.12;
  const colHrgW  = contentW * 0.20;
  const colSubW  = contentW * 0.20;

  const colItemX = margin;
  const colQtyX  = colItemX + colItemW;
  const colHrgX  = colQtyX + colQtyW;
  const colSubX  = colHrgX + colHrgW;

  // Table Header Line
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  doc.text('ITEM', colItemX + 1, y + 4);
  doc.text('QTY', colQtyX + colQtyW / 2, y + 4, { align: 'center' });
  doc.text('HARGA', colHrgX + colHrgW - 2, y + 4, { align: 'right' });
  doc.text('SUBTOTAL', colSubX + colSubW - 1, y + 4, { align: 'right' });

  y += 6;
  doc.line(margin, y, pageW - margin, y);

  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_TEXT_BODY);

  const rowHeight = 7;
  let computedSubtotalSum = 0;

  itemRows.forEach((item) => {
    y += rowHeight;

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

    const wrappedName = wrap(doc, itemName, colItemW - 4, 8.5);
    doc.text(wrappedName[0] || itemName, colItemX + 1, y - 1.5);
    doc.text(itemQty, colQtyX + colQtyW / 2, y - 1.5, { align: 'center' });
    doc.text(itemPrice, colHrgX + colHrgW - 2, y - 1.5, { align: 'right' });
    doc.text(itemTotal, colSubX + colSubW - 1, y - 1.5, { align: 'right' });

    // Subtle divider
    doc.setDrawColor(...COLOR_BORDER_LIGHT);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
  });

  if (itemRows.length === 0) {
    y += rowHeight;
    doc.setTextColor(...COLOR_TEXT_MUTED);
    doc.text('Tidak ada item layanan.', colItemX + 1, y - 1.5);
    doc.line(margin, y, pageW - margin, y);
  }

  y += 4;

  // ── TOTALS SUMMARY ────────────────────────────────────────────────────────
  const summary = buildTotalsSummary({
    transaction,
    gcPending: pendingGc,
    meterPending: transactionHasMeterPending(itemRows),
  });

  const summaryLabelX = colHrgX + colHrgW - 4;
  const summaryValueX = colSubX + colSubW - 1;

  // Subtotal row (guaranteed non-zero if items exist)
  const subtotalAmount =
    Number(transaction.subtotal) ||
    (computedSubtotalSum > 0 ? computedSubtotalSum : Number(summary.subtotal) || 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  doc.text('Subtotal', summaryLabelX, y, { align: 'right' });
  doc.setTextColor(...COLOR_TEXT_DARK);
  doc.text(formatMoney(subtotalAmount), summaryValueX, y, { align: 'right' });
  y += 5;

  // Biaya Transport row (jika ada)
  const transportAmount = Number(transaction.shipping_cost || transaction.transport_fee || 0);
  if (transportAmount > 0) {
    doc.setTextColor(...COLOR_TEXT_MUTED);
    doc.text('Biaya transport', summaryLabelX, y, { align: 'right' });
    doc.setTextColor(...COLOR_TEXT_DARK);
    doc.text(formatMoney(transportAmount), summaryValueX, y, { align: 'right' });
    y += 5;
  }

  // Diskon row (jika ada)
  const discountAmount = Number(transaction.discount_total || transaction.discount_amount || 0);
  if (discountAmount > 0) {
    const promoName = transaction.promo_name || 'promo';
    doc.setTextColor(...COLOR_TEXT_MUTED);
    doc.text(`Diskon [${promoName}]`, summaryLabelX, y, { align: 'right' });
    doc.setTextColor(220, 38, 38); // merah
    doc.text(`- ${formatMoney(discountAmount)}`, summaryValueX, y, { align: 'right' });
    y += 5;
  }

  // Grand Total Row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRIMARY_NAVY);
  doc.text('TOTAL', summaryLabelX, y + 1, { align: 'right' });
  doc.setFontSize(12.5);
  doc.text(formatMoney(summary.totalAmount), summaryValueX, y + 1, { align: 'right' });
  y += 8;

  // ── 5. DISCLAIMER NOTE BOX ────────────────────────────────────────────────
  const disclaimerH = 8.5;
  doc.setFillColor(...COLOR_AMBER_BOX_BG);
  doc.setDrawColor(...COLOR_AMBER_BOX_BRD);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, disclaimerH, 2.5, 2.5, 'FD');

  drawShieldIconVector(doc, margin + 3.5, y + 2.2, 3.2, COLOR_AMBER_TEXT);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_AMBER_TEXT);
  const disclaimerNote =
    'Harga final akan diinformasikan setelah teknisi melakukan pengecekan di lokasi, sebelum pengerjaan dimulai.';
  doc.text(disclaimerNote, margin + 9, y + 5.5);

  y += disclaimerH + 6;

  // ── 6. PERSIAPAN SEBELUM TIM DATANG ───────────────────────────────────────
  drawGreenCheckCircle(doc, margin + 2.5, y + 2.5, 2.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_PRIMARY_NAVY);
  doc.text('Persiapan Sebelum Tim Datang', margin + 7, y + 3.2);

  y += 7;

  // 4 Checklist items horizontal
  const checklistItems = [
    'Kosongkan area sekitar\nitem',
    'Siapkan akses listrik &\nair',
    'Info lokasi parkir / akses\nmasuk',
    'Amankan hewan\npeliharaan',
  ];

  const checkColW = contentW / 4;
  checklistItems.forEach((text, idx) => {
    const itemX = margin + idx * checkColW;
    drawGreenCheckCircle(doc, itemX + 2.2, y + 2.2, 1.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_TEXT_BODY);
    const lines = text.split('\n');
    doc.text(lines[0], itemX + 5.5, y + 2.2);
    if (lines[1]) {
      doc.text(lines[1], itemX + 5.5, y + 5.5);
    }
  });

  y += 13;

  // ── 7. TIM TEKNISI YANG AKAN DATANG ───────────────────────────────────────
  drawShieldIconVector(doc, margin + 0.5, y, 3.6, COLOR_PRIMARY_NAVY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_PRIMARY_NAVY);
  doc.text('Tim Teknisi yang Akan Datang', margin + 6.5, y + 3.2);

  y += 6;

  // Technician Cards Grid (2 columns x up to 2 rows)
  const cardGridGap = 4;
  const techCardW = (contentW - cardGridGap) / 2;
  const techCardH = 23; // Roomy height matching template

  if (activeAssignments.length === 0) {
    // Placeholder jika belum ada teknisi yang di-assign
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, 14, 3, 3, 'FD');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_TEXT_MUTED);
    doc.text('Teknisi akan segera ditugaskan oleh Admin Cleanox.', margin + 6, y + 8.5);
    y += 18;
  } else {
    activeAssignments.forEach((worker, idx) => {
      const colIdx = idx % 2;
      const rowIdx = Math.floor(idx / 2);

      const cardX = margin + colIdx * (techCardW + cardGridGap);
      const cardY = y + rowIdx * (techCardH + 3.5);

      // Card Container
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...COLOR_BORDER);
      doc.setLineWidth(0.35);
      doc.roundedRect(cardX, cardY, techCardW, techCardH, 3, 3, 'FD');

      // Foto Avatar Teknisi (posisi agak ke bawah sedikit agar seimbang vertikal)
      const avatarDataUrl = workerAvatars[idx];
      const avatarSize = 16.5;
      const avatarX = cardX + 3.2;
      const avatarY = cardY + 3.25;

      if (avatarDataUrl) {
        try {
          doc.addImage(avatarDataUrl, 'PNG', avatarX, avatarY, avatarSize, avatarSize);
        } catch {
          // fallback
        }
      }

      // Border halus di sekitar avatar
      doc.setDrawColor(...COLOR_BORDER);
      doc.setLineWidth(0.2);
      doc.roundedRect(avatarX, avatarY, avatarSize, avatarSize, 2, 2, 'S');

      // Informasi Pekerja di samping foto
      const infoX = avatarX + avatarSize + 4;
      const wName = worker.employee_name || 'Teknisi';
      const wRole = worker.position_name || 'Teknisi Deep Cleaning';
      const wCode = worker.employee_code ? `ID: [${worker.employee_code}]` : `ID: [CLX-${String(worker.employee_id || idx + 1).padStart(3, '0')}]`;

      // 1. Nama Teknisi (Bold Navy)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLOR_PRIMARY_NAVY);
      const shortName = wrap(doc, wName, techCardW - avatarSize - 9, 9.5)[0] || wName;
      doc.text(shortName, infoX, cardY + 5.8);

      // 2. Role / Posisi
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLOR_TEXT_MUTED);
      doc.text(wRole, infoX, cardY + 9.8);

      // 3. ID Karyawan
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // #94A3B8
      doc.text(wCode, infoX, cardY + 13.8);

      // 4. Pill Badge Terverifikasi
      const vBadgeW = 23;
      const vBadgeH = 4.6;
      const vBadgeX = infoX;
      const vBadgeY = cardY + 15.6;

      doc.setFillColor(...COLOR_GREEN_BADGE_BG);
      doc.setDrawColor(...COLOR_GREEN_BADGE_BRD);
      doc.setLineWidth(0.2);
      doc.roundedRect(vBadgeX, vBadgeY, vBadgeW, vBadgeH, 1.8, 1.8, 'FD');

      drawGreenCheckCircle(doc, vBadgeX + 2.3, vBadgeY + vBadgeH / 2, 1.2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(...COLOR_GREEN_TEXT);
      doc.text('Terverifikasi', vBadgeX + 4.8, vBadgeY + 3.2);
    });

    const totalRows = Math.ceil(activeAssignments.length / 2);
    y += totalRows * (techCardH + 3.5) + 2;
  }

  // Subtext teknisi
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_TEXT_MUTED);
  doc.text('Jumlah teknisi 2–4 orang sesuai order. Mohon cocokkan nama & foto saat tim tiba.', margin, y + 2.5);

  y += 8;

  // ── 8. FOOTER / KONTAK WHATSAPP ───────────────────────────────────────────
  // Anchored safely at bottom
  const footerY = Math.max(y + 2, pageH - 25);

  // QR Code di kiri
  const qrSize = 17.5;
  if (qrBase64) {
    try {
      doc.addImage(qrBase64, 'PNG', margin, footerY - 1, qrSize, qrSize);
    } catch {
      // fallback
    }
  }

  const contactX = qrBase64 ? margin + qrSize + 4.5 : margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_PRIMARY_NAVY);
  doc.text('Perlu ubah jadwal atau ada pertanyaan?', contactX, footerY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_TEXT_BODY);
  const promptText = 'Hubungi Admin Cleanox via WhatsApp ';
  doc.text(promptText, contactX, footerY + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR_PRIMARY_NAVY);
  doc.text(
    DEFAULT_WA_NUMBER,
    contactX + doc.getTextWidth(promptText),
    footerY + 10.5
  );

  // Simpan File PDF
  const filename = `Konfirmasi_Jadwal_Cleanox_${transaction.transaction_no || transaction.id || 'order'}.pdf`;
  doc.save(filename);
}
