import { formatServiceDateParts } from './posCustomerOrderMessage.js';
import { isGeneralCleaningCategory } from './posGeneralCleaningBilling.js';
import { formatItemQtyLabel, isMeterPricingPending } from './posMeterServices.js';
import { buildTotalsSummary } from './posPendingTotals.js';

export const CLEANOX_RECEIPT_COMPANY = {
  name: 'Cleanox',
  addressLines: [
    'Jalan No.14 Blok Q3, Harjamukti',
    'Kec. Cimanggis, Kota Depok',
    'Jawa Barat 16454',
  ],
  whatsapp: '6285122333381',
  footerThanks: 'Terima kasih telah menggunakan layanan Cleanox.',
};

export const PDF_HEADER_RGB = [12, 41, 93];
export const PENDING_TOTAL_TEXT = 'Menyesuaikan total jam pengerjaan';
export const PENDING_METER_TOTAL_TEXT = 'Menyesuaikan total ukuran meter';
export const PENDING_PRICE_TOTAL_TEXT = 'Menyesuaikan total harga';

export function toNumber(value) {
  return Number(value || 0);
}

export function formatMoney(amount) {
  const n = Math.round(toNumber(amount));
  return `Rp ${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function wrap(doc, text, maxWidth, fontSize) {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(String(text || '-').trim() || '-', maxWidth);
}

export function loadImageAsDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width,
          height,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Gagal memuat logo'));
    img.src = src;
  });
}

export function fitLogoDimensionsMm(naturalWidth, naturalHeight, maxWidth, maxHeight) {
  if (!naturalWidth || !naturalHeight) {
    return { width: maxWidth, height: maxHeight };
  }
  const aspect = naturalWidth / naturalHeight;
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return { width, height };
}

/** @returns {number} y after header (content start) */
export function drawA4LandscapeHeader(
  doc,
  {
    logoDataUrl = null,
    logoNaturalWidth = null,
    logoNaturalHeight = null,
    logoMaxWidth = 28,
    logoMaxHeight = 16,
    title = '',
  } = {}
) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const headerH = 28;

  doc.setFillColor(...PDF_HEADER_RGB);
  doc.rect(0, 0, pageW, headerH, 'F');

  if (logoDataUrl) {
    try {
      const { width, height } = fitLogoDimensionsMm(
        logoNaturalWidth,
        logoNaturalHeight,
        logoMaxWidth,
        logoMaxHeight
      );
      const logoY = (headerH - height) / 2;
      doc.addImage(logoDataUrl, 'PNG', margin, logoY, width, height);
    } catch {
      // skip logo
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(title || ''), pageW - margin, 16, { align: 'right' });

  return 36;
}

export function drawCompanyBlock(
  doc,
  { company = CLEANOX_RECEIPT_COMPANY, startY, margin = 14 } = {}
) {
  let y = startY;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(company.name, margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const line of company.addressLines) {
    doc.text(line, margin, y);
    y += 4;
  }
  doc.text(`Telepon: ${company.whatsapp}`, margin, y);
  y += 4;
  return y;
}

/** @returns {number} metaBottomY */
export function drawTransactionMeta(
  doc,
  {
    transaction,
    pendingGc = false,
    startY,
    margin = 14,
    contentW,
    includeCrewCount = false,
    includePaymentStatus = true,
  } = {}
) {
  const colW = contentW / 2 - 4;
  const metaX = margin + colW + 8;
  let metaY = startY;

  const { dateLine, timeLine } = formatServiceDateParts(transaction.service_date);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('Informasi Transaksi', metaX, metaY);
  metaY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  const metaLines = [
    ['No. Transaksi', String(transaction.transaction_no || '-')],
    ['Tanggal Layanan', `${dateLine} • ${timeLine}`],
    ['Status Order', String(transaction.status || '-')],
  ];
  if (includeCrewCount) {
    metaLines.push(['Jumlah Teknisi', String(transaction.total_people ?? '-')]);
  }
  if (includePaymentStatus) {
    metaLines.push([
      'Pembayaran',
      String(transaction.payment_status || '') === 'lunas' ? 'LUNAS' : 'BELUM LUNAS',
    ]);
  }
  metaLines.push([
    'Metode',
    String(
      transaction.payment_method?.label ||
        transaction.payment_method?.name ||
        '-'
    ),
  ]);

  for (const [label, value] of metaLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, metaX, metaY);
    doc.setFont('helvetica', 'normal');
    const valueLines = wrap(doc, value, colW - 28, 8.5);
    doc.text(valueLines, metaX + 36, metaY);
    metaY += Math.max(5, valueLines.length * 4);
  }

  return metaY;
}

export function drawCustomerBox(
  doc,
  { transaction, margin = 14, contentW, y, comfortableSpacing = false } = {}
) {
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);

  if (comfortableSpacing) {
    const addrLines = wrap(doc, transaction.customer_address || '-', contentW - 10, 8.5).slice(0, 3);
    const lineHeight = 4;
    const addrStart = 27;
    const bottomPadding = 6;
    const boxHeight = Math.max(34, addrStart + addrLines.length * lineHeight + bottomPadding);

    doc.roundedRect(margin, y, contentW, boxHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('CUSTOMER', margin + 4, y + 6);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(String(transaction.customer_name || '-'), margin + 4, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(String(transaction.customer_phone || '-'), margin + 4, y + 20);
    doc.text(addrLines, margin + 4, y + addrStart);
    return y + boxHeight + 6;
  }

  doc.roundedRect(margin, y, contentW, 28, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('CUSTOMER', margin + 4, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(String(transaction.customer_name || '-'), margin + 4, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(String(transaction.customer_phone || '-'), margin + 4, y + 19);
  const addr = wrap(doc, transaction.customer_address || '-', contentW - 10, 8);
  doc.text(addr.slice(0, 2), margin + 4, y + 24);
  return y + 34;
}

/** @returns {number} nextY */
export function drawItemsTable(
  doc,
  {
    items = [],
    pendingGc = false,
    crew = 1,
    margin = 14,
    contentW,
    pageH,
    y,
    /** Optional column widths [no, layanan, promo, qty, price, total]. Default = landscape invoice layout. */
    columnWidths = null,
  } = {}
) {
  const itemRows = Array.isArray(items) ? items : [];
  const wNo = columnWidths?.[0] ?? 10;
  const wService = columnWidths?.[1] ?? 90;
  const wPromo = columnWidths?.[2] ?? 45;
  const wQty = columnWidths?.[3] ?? 16;
  const wPrice = columnWidths?.[4] ?? 40;
  const wTotal =
    columnWidths?.[5] ?? contentW - wNo - wService - wPromo - wQty - wPrice;
  const cols = [
    { key: 'no', label: 'No', w: wNo },
    { key: 'service', label: 'Layanan', w: wService },
    { key: 'promo', label: 'Promo', w: wPromo },
    { key: 'qty', label: 'Qty', w: wQty },
    { key: 'price', label: 'Harga Satuan', w: wPrice },
    { key: 'total', label: 'Line Total', w: wTotal },
  ];

  doc.setFillColor(...PDF_HEADER_RGB);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let x = margin + 2;
  for (const col of cols) {
    doc.text(col.label, x + col.w / 2, y + 5.5, { align: 'center' });
    x += col.w;
  }
  y += 8;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  itemRows.forEach((item, index) => {
    if (y > pageH - 45) {
      doc.addPage();
      y = margin;
    }

    const isGcItem = isGeneralCleaningCategory(item.category_name);
    const pendingMeter = isMeterPricingPending({
      satuanName: item.satuan_name,
      unitLabel: item.unit_label,
      meter: item.meter,
    });
    const serviceText = String(item.service_name || `Service #${item.service_id}`);
    const promoText = String(item.promo_name_snapshot || '-');
    const texts =
      pendingGc && isGcItem
        ? [
            String(index + 1),
            serviceText,
            promoText,
            '—',
            `${formatMoney(item.final_price_snapshot)} / ${crew} Teknisi / Jam`,
            'Pending jam',
          ]
        : pendingMeter
          ? [
              String(index + 1),
              serviceText,
              promoText,
              String(item.qty ?? 1),
              formatMoney(item.final_price_snapshot),
              'Pending meter',
            ]
          : [
              String(index + 1),
              serviceText,
              promoText,
              formatItemQtyLabel(item),
              formatMoney(item.final_price_snapshot),
              formatMoney(item.line_total),
            ];

    const cellLines = texts.map((text, i) => wrap(doc, text, cols[i].w - 3, 8).slice(0, 2));
    const lineCount = Math.max(...cellLines.map((lines) => lines.length));
    const lineStep = 3.5;
    const rowH = 9 + (lineCount - 1) * lineStep;

    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, rowH, 'F');
    }

    let cx = margin + 2;
    cellLines.forEach((lines, i) => {
      const col = cols[i];
      const startY = y + 5.5 + ((lineCount - lines.length) * lineStep) / 2;
      lines.forEach((line, lineIdx) => {
        const lineY = startY + lineIdx * lineStep;
        if (col.key === 'service') {
          doc.text(line || '-', cx, lineY);
        } else {
          doc.text(line || '-', cx + col.w / 2, lineY, { align: 'center' });
        }
      });
      cx += col.w;
    });
    y += rowH;
  });

  if (itemRows.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('Tidak ada item layanan.', margin + 2, y + 6);
    y += 12;
  }

  return y;
}

/** @returns {number} y after totals box */
export function drawTotalsBox(
  doc,
  {
    transaction,
    pendingGc = false,
    pendingMeter = false,
    pageW,
    margin = 14,
    y,
    showPaymentBadge = false,
  } = {}
) {
  const boxW = 78;
  const boxX = pageW - margin - boxW;
  const boxY = y + 4;
  const summary = buildTotalsSummary({
    transaction,
    gcPending: pendingGc,
    meterPending: pendingMeter,
  });
  doc.setFont('helvetica', 'bold');
  const noteLines = summary.note ? wrap(doc, summary.note, boxW - 8, 8.5) : [];
  const boxH = 8 + 3 * 7 + 8 + noteLines.length * 4.5 + (showPaymentBadge ? 10 : 0) + 2;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

  let ty = boxY + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  for (const row of summary.rows) {
    doc.text(row.label, boxX + 4, ty);
    doc.text(formatMoney(row.amount), boxX + boxW - 4, ty, { align: 'right' });
    ty += 7;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text(summary.totalLabel, boxX + 4, ty);
  doc.text(formatMoney(summary.totalAmount), boxX + boxW - 4, ty, { align: 'right' });
  ty += 8;

  if (noteLines.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_HEADER_RGB);
    doc.text(noteLines, boxX + 4, ty - 2.5);
    ty += noteLines.length * 4.5;
  }

  if (showPaymentBadge) {
    const isPaid = String(transaction.payment_status || '').toLowerCase() === 'lunas';
    const badgeLabel = isPaid ? 'LUNAS' : 'BELUM LUNAS';
    const badgeY = ty + 1;
    const badgeH = 7;
    const badgePad = 2;

    if (isPaid) {
      doc.setFillColor(220, 252, 231);
      doc.setDrawColor(134, 239, 172);
      doc.setTextColor(21, 128, 61);
    } else {
      doc.setFillColor(254, 226, 226);
      doc.setDrawColor(252, 165, 165);
      doc.setTextColor(185, 28, 28);
    }

    doc.roundedRect(boxX + badgePad, badgeY, boxW - badgePad * 2, badgeH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(badgeLabel, boxX + boxW / 2, badgeY + 4.8, { align: 'center' });
  }

  return boxY + boxH;
}

export function drawFooter(
  doc,
  { pageW, pageH, margin = 14, footerNote = '', multiline = false, maxWidth } = {}
) {
  const footerMaxW = maxWidth ?? pageW - margin * 2 - 80;
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);

  let footerY = pageH - 10;
  if (multiline && footerNote) {
    const lines = wrap(doc, String(footerNote), footerMaxW, 8);
    footerY = pageH - 10 - (lines.length - 1) * 4;
    doc.text(lines, margin, footerY);
  } else {
    doc.text(String(footerNote || ''), margin, footerY);
  }

  doc.setFont('helvetica', 'normal');
  doc.text(
    `Dicetak: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
    pageW - margin,
    pageH - 10,
    { align: 'right' }
  );
}

/** Highlighted crew callout for internal invoice only. @returns {number} nextY */
export function drawCrewHighlightBox(
  doc,
  {
    transaction,
    assignments = [],
    margin = 14,
    contentW,
    y,
    maxWidthRatio = 0.55,
  } = {}
) {
  const activeWorkers = (Array.isArray(assignments) ? assignments : []).filter((row) =>
    ['Assigned', 'In_Schedule', 'On_Progress', 'Done'].includes(row.assignment_status)
  );
  const crewCount = Math.max(1, Number(transaction.total_people || 1));
  const boxW = contentW * maxWidthRatio;
  const names =
    activeWorkers.length === 0
      ? 'Belum ada teknisi ditugaskan'
      : activeWorkers.map((row) => row.employee_name || 'Worker').join('  |  ');
  const nameLines = wrap(doc, names, boxW - 12, 8);
  const boxH = 18 + nameLines.length * 4;

  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, y, boxW, boxH, 2, 2, 'FD');
  doc.setLineWidth(0.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('Teknisi yang Mengerjakan', margin + 5, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  let sub = `Jumlah Teknisi: ${crewCount}`;
  if (activeWorkers.length !== crewCount) {
    sub += `  ·  Ditugaskan: ${activeWorkers.length}`;
  }
  doc.text(sub, margin + 5, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(nameLines, margin + 5, y + 18);

  return y + boxH + 4;
}
