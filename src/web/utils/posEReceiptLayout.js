import {
  formatCompletionDate,
  formatDimensionDecimal,
  formatServiceDateParts,
  formatShortCompletionDate,
  getMaxTakeHomeDays,
  parseItemMeterDimensions,
  resolveTakeHomeDays,
} from './posCustomerOrderMessage.js';
import { isMeterPricedService } from './posMeterServices.js';
import { PDF_HEADER_RGB, wrap } from './posPdfLayout.js';

/** Portrait A4: full-width cropped kop is ~42mm; allow headroom. */
export const E_RECEIPT_KOP_MAX_HEIGHT_MM = 50;

export const TAKE_HOME_THANK_YOU_TEXT =
  'Terima kasih telah mempercayakan barang Anda kepada Cleanox. Kami akan mengabari via WhatsApp saat barang siap diantar kembali.';

export const TAKE_HOME_NOTES = [
  '• Estimasi dihitung dari tanggal pickup, sesuai durasi tiap item.',
  '• Estimasi selesai order mengikuti item dengan pengerjaan terlama.',
  '• Barang diantar kembali setelah semua item selesai; jadwal antar dikonfirmasi admin via WhatsApp.',
  '• Estimasi dapat bertambah saat cuaca ekstrem / hujan terus-menerus.',
  '• Item per meter (karpet, dll.) dihitung dari luas: P × L × harga per m².',
];

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
 * Includes blue TAKE HOME pill badge when in Take Home mode.
 * @returns {number} nextY
 */
export function drawEReceiptTitleRow(
  doc,
  { transaction, margin = 14, pageW, y } = {}
) {
  const isTakeHome = transaction?.service_mode === 'take_home';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('E-RECEIPT', margin, y + 6);

  if (isTakeHome) {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(margin, y + 8.5, 23, 4.8, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(29, 78, 216);
    doc.text('TAKE HOME', margin + 11.5, y + 12, { align: 'center' });
  }

  const noX = pageW - margin;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('No. Transaksi', noX, y + 2, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text(String(transaction?.transaction_no || '-'), noX, y + 8, { align: 'right' });

  return isTakeHome ? y + 17 : y + 14;
}

/**
 * Side-by-side CUSTOMER | INFORMASI TRANSAKSI boxes.
 * Handles Take Home mode with ALAMAT PICKUP & ANTAR and date-only pickup + estimasi selesai.
 * @returns {number} nextY
 */
export function drawEReceiptCustomerAndInfo(
  doc,
  { transaction, items = [], margin = 14, contentW, y } = {}
) {
  const isTakeHome = transaction?.service_mode === 'take_home';
  const gap = 4;
  const boxW = (contentW - gap) / 2;
  const leftX = margin;
  const rightX = margin + boxW + gap;
  const padX = 4;
  const PAD_TOP = 4;
  const PAD_BOTTOM = 4;
  const BODY_STEP = 5.8;
  const ADDR_LINE_STEP = 3.6;
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

  let infoRows = [];
  if (isTakeHome) {
    const itemRows = Array.isArray(items) && items.length > 0 ? items : (transaction?.items || []);
    const maxDays = getMaxTakeHomeDays(itemRows);
    const estLine = maxDays > 0 ? formatCompletionDate(transaction?.service_date, maxDays) : '-';

    infoRows = [
      ['Jenis Layanan', 'Take Home (Pickup & Antar)'],
      ['Tanggal Pickup', dateLine],
      ['Estimasi Selesai', estLine],
      ['Status Order', String(transaction?.status || '-')],
      ['Metode Pembayaran', paymentMethod],
    ];
  } else {
    infoRows = [
      ['Tanggal Layanan', `${dateLine} • ${timeLine}`],
      ['Status Order', String(transaction?.status || '-')],
      ['Metode Pembayaran', paymentMethod],
    ];
  }

  const infoValueLines = infoRows.map(([, value]) =>
    wrap(doc, value, boxW - labelW - padX * 2, 8)
  );

  const addrExtra = Math.max(0, addrLines.length - 1);
  const leftExtraForTakeHome = isTakeHome ? 4.5 : 0;
  const leftH =
    titleBaseline +
    AFTER_TITLE +
    BODY_STEP * (1 + 1 + Math.min(1, addrLines.length)) +
    ADDR_LINE_STEP * addrExtra +
    leftExtraForTakeHome +
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

  // Customer box content
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

  if (isTakeHome) {
    cy += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text('ALAMAT PICKUP & ANTAR', leftX + padX, cy);
    cy += 1;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  addrLines.forEach((line, idx) => {
    cy += idx === 0 ? (isTakeHome ? 3.5 : BODY_STEP) : ADDR_LINE_STEP;
    doc.text(String(line), leftX + padX, cy);
  });

  // Informasi Transaksi box content
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

    doc.setFont('helvetica', isTakeHome && label === 'Estimasi Selesai' ? 'bold' : 'normal');
    doc.setFontSize(8);
    if (isTakeHome && label === 'Estimasi Selesai') {
      doc.setTextColor(15, 23, 42);
    } else {
      doc.setTextColor(30, 41, 59);
    }

    valueLines.forEach((line, lineIdx) => {
      const lineY = iy + lineIdx * BODY_STEP;
      doc.text(String(line), rightX + padX + labelW, lineY);
    });
    iy += BODY_STEP * Math.max(1, valueLines.length);
  });

  return y + boxH + 5;
}

/**
 * 7-column items table for Take Home E-Receipt:
 * No | Item | Promo | Qty | Harga Satuan | Estimasi Selesai | Line Total
 */
export function drawTakeHomeItemsTable(
  doc,
  { items = [], transaction, margin = 12, contentW, pageH, y } = {}
) {
  const colNo = 8;
  const colItem = 52;
  const colPromo = 20;
  const colQty = 18;
  const colPrice = 30;
  const colEst = 28;
  const colTotal = contentW - (colNo + colItem + colPromo + colQty + colPrice + colEst);

  const colX = [
    margin,
    margin + colNo,
    margin + colNo + colItem,
    margin + colNo + colItem + colPromo,
    margin + colNo + colItem + colPromo + colQty,
    margin + colNo + colItem + colPromo + colQty + colPrice,
    margin + colNo + colItem + colPromo + colQty + colPrice + colEst,
  ];

  const drawHeader = (curY) => {
    doc.setFillColor(...PDF_HEADER_RGB);
    doc.rect(margin, curY, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    doc.text('No', colX[0] + colNo / 2, curY + 4.8, { align: 'center' });
    doc.text('Item', colX[1] + 2, curY + 4.8);
    doc.text('Promo', colX[2] + colPromo / 2, curY + 4.8, { align: 'center' });
    doc.text('Qty', colX[3] + colQty / 2, curY + 4.8, { align: 'center' });
    doc.text('Harga Satuan', colX[4] + colPrice - 2, curY + 4.8, { align: 'right' });
    doc.text('Estimasi Selesai', colX[5] + colEst / 2, curY + 4.8, { align: 'center' });
    doc.text('Line Total', colX[6] + colTotal - 2, curY + 4.8, { align: 'right' });

    return curY + 7;
  };

  let currentY = drawHeader(y);

  items.forEach((item, index) => {
    const serviceName = item?.service_name || item?.name || '-';
    const dims = parseItemMeterDimensions(item);
    const hasMeter =
      Boolean(dims.length && dims.width) ||
      isMeterPricedService({ satuanName: item?.satuan_name }) ||
      (item?.meter != null && Number(item?.meter) > 0);

    const nameLines = wrap(doc, serviceName, colItem - 4, 8);
    const itemDays = resolveTakeHomeDays(item);

    let rowH = 11;
    if (nameLines.length > 1) {
      rowH = Math.max(rowH, nameLines.length * 3.8 + 6.5);
    }

    if (currentY + rowH > pageH - 25) {
      doc.addPage();
      currentY = drawHeader(margin);
    }

    // No
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(String(index + 1), colX[0] + colNo / 2, currentY + 4.8, { align: 'center' });

    // Item name + subtitle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_HEADER_RGB);
    nameLines.forEach((nl, nidx) => {
      doc.text(String(nl), colX[1] + 2, currentY + 4.2 + nidx * 3.8);
    });

    const subY = currentY + 4.2 + nameLines.length * 3.8;
    if (hasMeter && (dims.length || dims.width || item?.meter)) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(29, 78, 216);
      const mVal = Number(item?.meter || (dims.length && dims.width ? dims.length * dims.width : 0));
      const mStr = formatDimensionDecimal(mVal);
      const dimStr =
        dims.length && dims.width
          ? `P ${formatDimensionDecimal(dims.length)} m × L ${formatDimensionDecimal(dims.width)} m = ${mStr} m²`
          : `${mStr} m²`;
      doc.text(dimStr, colX[1] + 2, subY);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      const sat = item?.satuan_name || 'pcs';
      doc.text(`Take Home • per ${sat}`, colX[1] + 2, subY);
    }

    // Promo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const promoText = item?.promo_name_snapshot || item?.promo_name || '-';
    doc.text(String(promoText), colX[2] + colPromo / 2, currentY + 4.8, { align: 'center' });

    // Qty
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    let qtyDisplay = `${Math.max(1, Number(item?.qty || 1))} ${item?.satuan_name || 'pcs'}`;
    if (hasMeter && item?.meter) {
      qtyDisplay = `${formatDimensionDecimal(item.meter)} m²`;
    }
    doc.text(qtyDisplay, colX[3] + colQty / 2, currentY + 4.8, { align: 'center' });

    // Harga Satuan
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const unitPrice = Number(
      item?.final_price_snapshot ?? item?.final_price_per_unit ?? item?.base_price ?? item?.price ?? 0
    );
    const priceDisplay = hasMeter
      ? `Rp ${unitPrice.toLocaleString('id-ID')} / m²`
      : `Rp ${unitPrice.toLocaleString('id-ID')}`;
    doc.text(priceDisplay, colX[4] + colPrice - 2, currentY + 4.8, { align: 'right' });

    // Estimasi Selesai (2 baris: hari & tgl, lalu x hari; strip jika null)
    if (itemDays != null && itemDays > 0) {
      const shortDate = formatShortCompletionDate(transaction?.service_date, itemDays);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(shortDate, colX[5] + colEst / 2, currentY + 4.2, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${itemDays} hari`, colX[5] + colEst / 2, currentY + 8, { align: 'center' });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('-', colX[5] + colEst / 2, currentY + 4.8, { align: 'center' });
    }

    // Line Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_HEADER_RGB);
    const lineTotal = Number(item?.line_total || 0);
    doc.text(`Rp ${lineTotal.toLocaleString('id-ID')}`, colX[6] + colTotal - 2, currentY + 4.8, {
      align: 'right',
    });

    // Bottom row border
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, currentY + rowH, margin + contentW, currentY + rowH);

    currentY += rowH;
  });

  return currentY;
}

/**
 * Thank-you note and CATATAN TAKE HOME box on the left.
 */
export function drawTakeHomeNotesBlock(doc, { x, y, maxWidth }) {
  let cy = y;

  // Thank-you note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const thanksLines = wrap(doc, TAKE_HOME_THANK_YOU_TEXT, maxWidth, 7.5);
  doc.text(thanksLines, x, cy);
  cy += thanksLines.length * 3.6 + 4;

  // Catatan Take Home box
  const boxW = maxWidth;
  const boxH = 34;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, cy, boxW, boxH, 2, 2, 'FD');

  let by = cy + 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('CATATAN TAKE HOME', x + 3.5, by);
  by += 4.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  TAKE_HOME_NOTES.forEach((bullet) => {
    const wrapped = wrap(doc, bullet, boxW - 7, 6.8);
    doc.text(wrapped, x + 3.5, by);
    by += wrapped.length * 3.3;
  });

  return cy + boxH;
}

/**
 * Green ESTIMASI SELESAI card + Summary Totals Box on the right.
 */
export function drawTakeHomeTotalsAndEstimation(
  doc,
  { transaction, items = [], pageW, margin = 12, y } = {}
) {
  const boxW = 78;
  const boxX = pageW - margin - boxW;
  let cy = y;

  const itemRows = Array.isArray(items) && items.length > 0 ? items : (transaction?.items || []);
  const maxDays = getMaxTakeHomeDays(itemRows);

  // 1. Green ESTIMASI SELESAI Box
  const estH = 14;
  doc.setFillColor(244, 251, 232);
  doc.setDrawColor(217, 240, 163);
  doc.roundedRect(boxX, cy, boxW, estH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(77, 124, 15);
  doc.text('ESTIMASI SELESAI', boxX + 4, cy + 4.5);

  let estDateStr = '-';
  if (maxDays > 0) {
    estDateStr = formatCompletionDate(transaction?.service_date, maxDays);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text(estDateStr, boxX + 4, cy + 10);

  if (maxDays > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(77, 124, 15);
    doc.text(`${maxDays} hari`, boxX + boxW - 4, cy + 10, { align: 'right' });
  }

  cy += estH + 3;

  // 2. Summary Box
  const calculatedSubtotal = itemRows.reduce((sum, it) => sum + Number(it?.line_total || 0), 0);
  const subtotal = Number(
    transaction?.subtotal_amount ?? transaction?.subtotal ?? calculatedSubtotal
  );
  const discount = Number(
    transaction?.discount_amount ?? transaction?.discount ?? 0
  );
  const transport = Number(
    transaction?.transport_fee ?? 0
  );
  const total = Number(
    transaction?.final_amount ?? transaction?.total_amount ?? Math.max(0, subtotal - discount + transport)
  );

  const rows = [
    { label: 'Subtotal', amount: subtotal },
    { label: 'Diskon', amount: discount },
    { label: 'Biaya Antar-Jemput', amount: transport },
  ];

  const summaryH = 40;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(boxX, cy, boxW, summaryH, 2, 2, 'FD');

  let sy = cy + 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  rows.forEach((row) => {
    doc.text(row.label, boxX + 4, sy);
    doc.text(`Rp ${row.amount.toLocaleString('id-ID')}`, boxX + boxW - 4, sy, { align: 'right' });
    sy += 5.5;
  });

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(boxX + 3, sy - 1, boxX + boxW - 3, sy - 1);
  sy += 4.5;

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('TOTAL', boxX + 4, sy);
  doc.text(`Rp ${total.toLocaleString('id-ID')}`, boxX + boxW - 4, sy, { align: 'right' });

  cy += summaryH + 3;

  // 3. Payment Status Badge
  const paymentStatus = String(transaction?.payment_status || '').toLowerCase();
  const isPaid = paymentStatus === 'lunas' || paymentStatus === 'paid';
  const badgeLabel = isPaid ? 'LUNAS' : 'BELUM LUNAS';
  const badgeH = 7.5;

  if (isPaid) {
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.setTextColor(22, 163, 74);
  } else {
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(254, 205, 211);
    doc.setTextColor(225, 29, 72);
  }

  doc.roundedRect(boxX, cy, boxW, badgeH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(badgeLabel, boxX + boxW / 2, cy + 5.2, { align: 'center' });

  return cy + badgeH;
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
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');
  const dateStr = `${day}/${month}/${year}, ${hours}.${mins}.${secs}`;

  doc.text(`Dicetak: ${dateStr}`, pageW - margin, safeY, { align: 'right' });
}
