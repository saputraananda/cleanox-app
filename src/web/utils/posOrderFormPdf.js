import { jsPDF } from 'jspdf';
import { formatServiceDateParts } from './posCustomerOrderMessage.js';
import {
  isGeneralCleaningCategory,
  isGcPricingPending,
} from './posGeneralCleaningBilling.js';
import { isMeterPricingPending } from './posMeterServices.js';
import {
  PDF_HEADER_RGB,
  PENDING_TOTAL_TEXT,
  fitLogoDimensionsMm,
  formatMoney,
  wrap,
} from './posPdfLayout.js';

const ORDER_FORM_DISCLAIMER_LINES = [
  '* Dokumen ini merupakan konfirmasi jadwal layanan,',
  '* Total dapat berubah menyesuaikan jumlah item aktual yang dikerjakan di lokasi',
];

/** @returns {{ width: number }} horizontal space used including gap */
function drawCalendarIcon(doc, x, y, sizeMm = 3.5, rgb = PDF_HEADER_RGB) {
  const headerH = sizeMm * 0.28;
  const bodyH = sizeMm * 0.82;
  const bodyY = y + headerH * 0.55;

  doc.setDrawColor(...rgb);
  doc.setLineWidth(0.22);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, bodyY, sizeMm, bodyH, 0.35, 0.35, 'FD');
  doc.setFillColor(...rgb);
  doc.rect(x, y, sizeMm, headerH, 'F');

  const dotY = bodyY + bodyH * 0.42;
  doc.circle(x + sizeMm * 0.32, dotY, 0.22, 'F');
  doc.circle(x + sizeMm * 0.68, dotY, 0.22, 'F');

  return { width: sizeMm + 1.2 };
}

function drawJadwalTercatatLabel(
  doc,
  x,
  baselineY,
  { withIcon = false, rgb = PDF_HEADER_RGB } = {}
) {
  let textX = x;
  if (withIcon) {
    const icon = drawCalendarIcon(doc, x, baselineY - 2.8, 3.5, rgb);
    textX = x + icon.width;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...rgb);
  doc.text('Jadwal Tercatat', textX, baselineY);
}

function normalizeLogoInput(logoDataUrl) {
  if (!logoDataUrl) {
    return { dataUrl: null, width: null, height: null };
  }
  if (typeof logoDataUrl === 'string') {
    return { dataUrl: logoDataUrl, width: null, height: null };
  }
  return {
    dataUrl: logoDataUrl.dataUrl ?? null,
    width: logoDataUrl.width ?? null,
    height: logoDataUrl.height ?? null,
  };
}

function formatQtyLabel(item, pendingGc) {
  if (pendingGc && isGeneralCleaningCategory(item.category_name)) return '—';
  if (isMeterPricingPending({ satuanName: item.satuan_name, unitLabel: item.unit_label, meter: item.meter })) {
    return String(item.qty ?? 1);
  }
  if (item.meter != null && item.meter !== '') {
    return `${item.qty ?? 1} × ${Number(item.meter)} m`;
  }
  const qty = Number(item.qty ?? 1);
  return Number.isFinite(qty) ? qty.toFixed(2) : '1.00';
}

const NUM_CELL_PAD = 3;

function getOrderFormTableColumns(tableInnerW) {
  const COL_NO = 10;
  const COL_QTY = 26;
  const COL_PRICE = 38;
  const COL_TOTAL = 38;
  const COL_SERVICE = tableInnerW - COL_NO - COL_QTY - COL_PRICE - COL_TOTAL;

  return [
    { key: 'no', label: 'No', w: COL_NO, headerAlign: 'left', cellAlign: 'left' },
    { key: 'service', label: 'Layanan', w: COL_SERVICE, headerAlign: 'left', cellAlign: 'left' },
    { key: 'qty', label: 'Qty', w: COL_QTY, headerAlign: 'numeric', cellAlign: 'numeric' },
    { key: 'price', label: 'Harga Satuan', w: COL_PRICE, headerAlign: 'numeric', cellAlign: 'numeric' },
    { key: 'total', label: 'Total', w: COL_TOTAL, headerAlign: 'center', cellAlign: 'center' },
  ];
}

function getTotalColumnBounds(margin, tablePad, columns) {
  let x = margin + tablePad;
  for (const col of columns) {
    if (col.key === 'total') {
      return {
        x,
        w: col.w,
        centerX: x + col.w / 2,
        rightX: x + col.w - NUM_CELL_PAD,
      };
    }
    x += col.w;
  }
  return { x, w: 38, centerX: x + 19, rightX: x + 35 };
}

function drawTableHeaderCell(doc, text, x, colW, y, align, fontSize = 8) {
  doc.setFontSize(fontSize);
  if (align === 'numeric') {
    doc.text(text, x + colW - NUM_CELL_PAD, y, { align: 'right' });
    return;
  }
  if (align === 'center') {
    doc.text(text, x + colW / 2, y, { align: 'center' });
    return;
  }
  doc.text(text, x, y);
}

function drawTableBodyCell(doc, text, x, colW, y, align) {
  const lines = wrap(doc, text, colW - NUM_CELL_PAD, 8);
  const line = lines[0] || '-';
  if (align === 'numeric') {
    doc.text(line, x + colW - NUM_CELL_PAD, y, { align: 'right' });
    return;
  }
  if (align === 'center') {
    doc.text(line, x + colW / 2, y, { align: 'center' });
    return;
  }
  doc.text(line, x, y);
}

/**
 * Cleanox Order Form — Formulir Penjadwalan (portrait A4).
 * @param {{ transaction: object, items?: array, logoDataUrl?: string|{ dataUrl: string, width?: number, height?: number }|null }} params
 */
export async function downloadPosOrderFormPdf({ transaction, items = [], logoDataUrl = null }) {
  if (!transaction) throw new Error('Data transaksi tidak tersedia');

  const logo = normalizeLogoInput(logoDataUrl);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  const tablePad = 2;
  const tableInnerW = contentW - tablePad * 2;
  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const { dateLine, timeLine } = formatServiceDateParts(transaction.service_date);
  const hasServiceTime = Boolean(timeLine && timeLine !== '-');
  const printedAt = new Date();

  let y = margin;

  if (logo.dataUrl) {
    try {
      const { width, height } = fitLogoDimensionsMm(
        logo.width,
        logo.height,
        26,
        14
      );
      doc.addImage(logo.dataUrl, 'PNG', margin, y, width, height);
    } catch {
      // skip
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('CLEANOX ORDER', pageW / 2, y + 8, { align: 'center' });
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text('Formulir Penjadwalan Layanan Cleanox', pageW / 2, y, { align: 'center' });
  y += 10;

  const scheduleBoxH = hasServiceTime ? 22 : 18;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(margin, y, contentW * 0.42, scheduleBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('STATUS', margin + 4, y + 6);
  drawJadwalTercatatLabel(doc, margin + 4, y + 11);

  const rightBoxX = margin + contentW * 0.45;
  const rightBoxW = contentW * 0.55;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightBoxX, y, rightBoxW, scheduleBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TANGGAL PENJADWALAN', rightBoxX + 4, y + 6);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const scheduleDateLines = wrap(doc, dateLine || '-', rightBoxW - 8, 10);
  doc.text(scheduleDateLines.slice(0, 2), rightBoxX + 4, y + 12);
  if (hasServiceTime) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${timeLine} WIB`, rightBoxX + 4, y + 18);
  }
  y += scheduleBoxH + 10;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  const addrBody = wrap(doc, transaction.customer_address || '-', contentW - 10, 9);
  const addrLineHeight = 4.5;
  const addrStartY = 19;
  const addrBoxH = Math.max(32, addrStartY + addrBody.length * addrLineHeight + 8);
  doc.roundedRect(margin, y, contentW, addrBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(String(transaction.customer_name || '-'), margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  doc.text(String(transaction.customer_phone || '-'), margin + 4, y + 13);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(addrBody, margin + 4, y + addrStartY);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Alamat Utama', margin + 4, y + addrBoxH - 3);
  y += addrBoxH + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('DETAIL LAYANAN', margin, y);
  y += 6;

  const columns = getOrderFormTableColumns(tableInnerW);
  const totalCol = getTotalColumnBounds(margin, tablePad, columns);
  const summaryValueX = totalCol.rightX;
  const summaryLabelX = totalCol.rightX - 42;

  doc.setFillColor(...PDF_HEADER_RGB);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let cx = margin + tablePad;
  for (const col of columns) {
    const headerFontSize = col.key === 'price' ? 7.5 : 8;
    drawTableHeaderCell(doc, col.label, cx, col.w, y + 5.5, col.headerAlign, headerFontSize);
    cx += col.w;
  }
  y += 8;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  itemRows.forEach((item, index) => {
    if (y > pageH - 55) {
      doc.addPage();
      y = margin;
    }
    const rowH = 10;
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, rowH, 'F');
    }

    const isGcPending = pendingGc && isGeneralCleaningCategory(item.category_name);
    const isMeterPending = isMeterPricingPending({
      satuanName: item.satuan_name,
      unitLabel: item.unit_label,
      meter: item.meter,
    });
    const rowCells = [
      { text: String(index + 1), col: columns[0] },
      {
        text: String(item.service_name || `Service #${item.service_id}`),
        col: columns[1],
      },
      { text: formatQtyLabel(item, pendingGc), col: columns[2] },
      {
        text: isGcPending
          ? `${formatMoney(item.final_price_snapshot)} / jam`
          : formatMoney(item.final_price_snapshot),
        col: columns[3],
      },
      {
        text: isGcPending || isMeterPending ? 'Pending' : formatMoney(item.line_total),
        col: columns[4],
      },
    ];

    let x = margin + tablePad;
    for (const cell of rowCells) {
      drawTableBodyCell(doc, cell.text, x, cell.col.w, y + 6.5, cell.col.cellAlign);
      x += cell.col.w;
    }
    y += rowH;
  });

  if (itemRows.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('Tidak ada item layanan.', margin + tablePad, y + 6);
    y += 12;
  }

  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  if (pendingGc) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('Biaya Transport', summaryLabelX, y, { align: 'right' });
    doc.text(formatMoney(transaction.transport_fee || 0), summaryValueX, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_HEADER_RGB);
    const pendingLines = wrap(doc, PENDING_TOTAL_TEXT, 48, 9);
    doc.text(pendingLines, summaryLabelX, y + 4);
    y += pendingLines.length * 5 + 6;
  } else {
    const rows = [
      ['Subtotal', formatMoney(transaction.subtotal_amount)],
      ['Diskon', formatMoney(transaction.discount_amount)],
      ['Biaya Transport', formatMoney(transaction.transport_fee || 0)],
      ['TOTAL', formatMoney(transaction.final_amount)],
    ];
    for (const [label, value] of rows) {
      const isTotal = label === 'TOTAL';
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      doc.setFontSize(isTotal ? 11 : 9);
      doc.setTextColor(isTotal ? 12 : 51, isTotal ? 41 : 65, isTotal ? 93 : 85);
      doc.text(label, summaryLabelX, y, { align: 'right' });
      doc.text(value, summaryValueX, y, { align: 'right' });
      y += isTotal ? 7 : 6;
    }
  }

  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  drawJadwalTercatatLabel(doc, margin, y, { withIcon: true });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `No. Transaksi: ${transaction.transaction_no || '-'}`,
    pageW - margin,
    y,
    { align: 'right' }
  );
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimerLineHeight = 4.5;
  ORDER_FORM_DISCLAIMER_LINES.forEach((line, index) => {
    doc.text(line, margin, y + index * disclaimerLineHeight);
  });
  y += ORDER_FORM_DISCLAIMER_LINES.length * disclaimerLineHeight + 4;

  doc.setFontSize(8);
  doc.text(
    `Dicetak: ${printedAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
    margin,
    Math.max(y, pageH - 12)
  );

  const filename = `Cleanox_Order_Penjadwalan_${transaction.transaction_no || transaction.id || 'pos'}.pdf`;
  doc.save(filename);
}
