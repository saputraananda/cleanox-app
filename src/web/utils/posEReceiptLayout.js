import { formatServiceDateParts } from './posCustomerOrderMessage.js';
import { PDF_HEADER_RGB, wrap } from './posPdfLayout.js';

/** Portrait A4: full-width cropped kop is ~42mm; allow headroom. */
export const E_RECEIPT_KOP_MAX_HEIGHT_MM = 50;

/**
 * Load kop PNG and crop near-black padding so full-width draw is larger (not tiny) and not stretched.
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
export function loadEReceiptKopAsDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = w;
        srcCanvas.height = h;
        const sctx = srcCanvas.getContext('2d');
        sctx.drawImage(img, 0, 0);
        const { data } = sctx.getImageData(0, 0, w, h);

        let minX = w;
        let minY = h;
        let maxX = 0;
        let maxY = 0;
        const step = 4;
        const threshold = 22;
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const i = (y * w + x) * 4;
            if (data[i] > threshold || data[i + 1] > threshold || data[i + 2] > threshold) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }

        const pad = 6;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad);
        maxY = Math.min(h - 1, maxY + pad);

        const cw = Math.max(1, maxX - minX + 1);
        const ch = Math.max(1, maxY - minY + 1);
        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        out.getContext('2d').drawImage(srcCanvas, minX, minY, cw, ch, 0, 0, cw, ch);

        resolve({
          dataUrl: out.toDataURL('image/png'),
          width: cw,
          height: ch,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Gagal memuat kop surat'));
    img.src = src;
  });
}

/**
 * Full-width kop at top of E-Receipt — preserves aspect ratio (no stretch, no shrink-to-tiny).
 * @returns {number} y after kop + gap
 */
export function drawEReceiptKop(
  doc,
  {
    dataUrl = null,
    naturalWidth = null,
    naturalHeight = null,
    pageW,
    maxHeightMm = E_RECEIPT_KOP_MAX_HEIGHT_MM,
  } = {}
) {
  if (dataUrl) {
    try {
      const nw = Number(naturalWidth) || 4000;
      const nh = Number(naturalHeight) || 1000;
      const aspect = nw / Math.max(1, nh);

      let drawW = pageW;
      let drawH = drawW / aspect;
      let x = 0;

      // Only shrink if still taller than max — keep full width preference by capping height with width scale
      if (drawH > maxHeightMm) {
        drawH = maxHeightMm;
        drawW = drawH * aspect;
        x = (pageW - drawW) / 2;
      }

      doc.addImage(dataUrl, 'PNG', x, 0, drawW, drawH);
      return drawH + 3;
    } catch {
      // fall through
    }
  }
  return 10;
}

/**
 * Title left + transaction number right.
 * @returns {number} nextY
 */
export function drawEReceiptTitleRow(
  doc,
  { transaction, margin = 14, pageW, y } = {}
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('E-RECEIPT', margin, y + 6);

  const noX = pageW - margin;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('No. Transaksi', noX, y + 2, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text(String(transaction?.transaction_no || '-'), noX, y + 8, { align: 'right' });

  return y + 14;
}

/**
 * Side-by-side CUSTOMER | INFORMASI TRANSAKSI boxes.
 * Height hugs content; title+name use E-RECEIPT blue; uniform line spacing.
 * @returns {number} nextY
 */
export function drawEReceiptCustomerAndInfo(
  doc,
  { transaction, margin = 14, contentW, y } = {}
) {
  const gap = 4;
  const boxW = (contentW - gap) / 2;
  const leftX = margin;
  const rightX = margin + boxW + gap;
  const padX = 4;
  const PAD_TOP = 4;
  const PAD_BOTTOM = 4;
  const BODY_STEP = 5.8; // nama → HP → baris pertama alamat
  const ADDR_LINE_STEP = 3.6; // antar baris wrap alamat (lebih mepet)
  const AFTER_TITLE = 5.5;
  const titleBaseline = PAD_TOP + 2.5;
  const labelW = Math.min(36, Math.max(28, boxW * 0.42));

  const addrLines = wrap(doc, transaction?.customer_address || '-', boxW - padX * 2, 8).slice(
    0,
    3
  );
  const { dateLine, timeLine } = formatServiceDateParts(transaction?.service_date);
  const paymentMethod = String(
    transaction?.payment_method?.label || transaction?.payment_method?.name || '-'
  );
  const infoRows = [
    ['Tanggal Layanan', `${dateLine} • ${timeLine}`],
    ['Status Order', String(transaction?.status || '-')],
    ['Metode Pembayaran', paymentMethod],
  ];
  const infoValueLines = infoRows.map(([, value]) =>
    wrap(doc, value, boxW - labelW - padX * 2, 8)
  );

  // title + AFTER_TITLE + nama + phone + first addr (BODY) + remaining addr (ADDR)
  const addrExtra = Math.max(0, addrLines.length - 1);
  const leftH =
    titleBaseline +
    AFTER_TITLE +
    BODY_STEP * (1 + 1 + Math.min(1, addrLines.length)) +
    ADDR_LINE_STEP * addrExtra +
    PAD_BOTTOM;

  let rightExtraLines = 0;
  for (const lines of infoValueLines) {
    rightExtraLines += Math.max(1, lines.length);
  }
  const rightH =
    titleBaseline + AFTER_TITLE + BODY_STEP * rightExtraLines + PAD_BOTTOM;

  const boxH = Math.max(leftH, rightH);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(leftX, y, boxW, boxH, 2, 2, 'FD');
  doc.roundedRect(rightX, y, boxW, boxH, 2, 2, 'FD');

  // Customer
  let cy = y + titleBaseline;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('CUSTOMER', leftX + padX, cy);
  cy += AFTER_TITLE;
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text(String(transaction?.customer_name || '-'), leftX + padX, cy);
  cy += BODY_STEP;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(String(transaction?.customer_phone || '-'), leftX + padX, cy);
  addrLines.forEach((line, idx) => {
    cy += idx === 0 ? BODY_STEP : ADDR_LINE_STEP;
    doc.text(String(line), leftX + padX, cy);
  });

  // Informasi Transaksi
  let iy = y + titleBaseline;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('INFORMASI TRANSAKSI', rightX + padX, iy);
  iy += AFTER_TITLE;

  infoRows.forEach(([label], idx) => {
    const valueLines = infoValueLines[idx];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(label, rightX + padX, iy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    valueLines.forEach((line, lineIdx) => {
      const lineY = iy + lineIdx * BODY_STEP;
      doc.text(String(line), rightX + padX + labelW, lineY);
    });
    iy += BODY_STEP * Math.max(1, valueLines.length);
  });

  return y + boxH + 5;
}

/**
 * Thank-you note on the left of the totals area.
 */
export function drawEReceiptThanksNote(doc, { text, x, y, maxWidth }) {
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  const lines = wrap(doc, String(text || ''), maxWidth, 8);
  doc.text(lines, x, y);
  return y + lines.length * 4;
}

/**
 * Printed timestamp — place below content (not fixed to page bottom, avoids overlap).
 */
export function drawEReceiptPrintedAt(doc, { pageW, pageH, margin = 14, y = null }) {
  const textY = y != null ? y : pageH - 10;
  const safeY = Math.min(textY, pageH - 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Dicetak: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
    pageW - margin,
    safeY,
    { align: 'right' }
  );
}
