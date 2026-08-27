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
  formatMoney,
  wrap,
} from './posPdfLayout.js';

function formatLongDateId(date = new Date()) {
  return date.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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

/**
 * Cleanox Order Form — Formulir Penjadwalan (portrait A4).
 * @param {{ transaction: object, items?: array, logoDataUrl?: string|null }} params
 */
export async function downloadPosOrderFormPdf({ transaction, items = [], logoDataUrl = null }) {
  if (!transaction) throw new Error('Data transaksi tidak tersedia');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const { dateLine, timeLine } = formatServiceDateParts(transaction.service_date);
  const printedAt = new Date();

  let y = margin;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, y, 26, 11);
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

  // Status + tanggal penjadwalan row
  const boxH = 18;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(margin, y, contentW * 0.42, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('STATUS', margin + 4, y + 6);
  doc.setFontSize(11);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('Jadwal Tercatat', margin + 4, y + 13);

  const rightBoxX = margin + contentW * 0.45;
  const rightBoxW = contentW * 0.55;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightBoxX, y, rightBoxW, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TANGGAL PENJADWALAN', rightBoxX + 4, y + 6);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatLongDateId(printedAt), rightBoxX + 4, y + 13);
  y += boxH + 10;

  const sectionTitle = (letter, title) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_HEADER_RGB);
    doc.text(`${letter}. ${title}`, margin, y);
    y += 6;
  };

  const fieldPair = (label, value, x, width) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    const lines = wrap(doc, value, width, 10);
    doc.text(lines, x, y + 5);
    return lines.length;
  };

  // A. CUSTOMER
  sectionTitle('A', 'CUSTOMER');
  const colW = (contentW - 8) / 2;
  const leftLines = fieldPair('NAMA CUSTOMER', transaction.customer_name || '-', margin, colW);
  fieldPair('NOMOR TELEPON', transaction.customer_phone || '-', margin + colW + 8, colW);
  y += Math.max(12, 6 + leftLines * 5);

  // B. DETAIL JADWAL
  sectionTitle('B', 'DETAIL JADWAL');
  const dayLines = fieldPair('HARI, TANGGAL', dateLine || '-', margin, colW);
  fieldPair(
    'JAM LAYANAN',
    timeLine && timeLine !== '-' ? `${timeLine} WIB` : '-',
    margin + colW + 8,
    colW
  );
  y += Math.max(12, 6 + dayLines * 5);

  // C. ALAMAT LENGKAP
  sectionTitle('C', 'ALAMAT LENGKAP');
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  const addrHeader = `${transaction.customer_name || '-'} | ${transaction.customer_phone || '-'}`;
  const addrBody = wrap(doc, transaction.customer_address || '-', contentW - 10, 9);
  const addrBoxH = 10 + addrBody.length * 4.5 + 8;
  doc.roundedRect(margin, y, contentW, addrBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(addrHeader, margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(addrBody, margin + 4, y + 12);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Alamat Utama', margin + 4, y + addrBoxH - 3);
  y += addrBoxH + 8;

  // D. DETAIL LAYANAN
  sectionTitle('D', 'DETAIL LAYANAN');

  const cols = [
    { label: 'No', w: 12 },
    { label: 'Layanan', w: contentW - 12 - 28 - 38 - 38 },
    { label: 'Qty', w: 28 },
    { label: 'Harga Satuan', w: 38 },
    { label: 'Total', w: 38 },
  ];

  doc.setFillColor(...PDF_HEADER_RGB);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let cx = margin + 2;
  for (const col of cols) {
    const align = col.label === 'Layanan' || col.label === 'No' ? 'left' : 'right';
    const tx = align === 'right' ? cx + col.w - 2 : cx;
    doc.text(col.label, tx, y + 5.5, align === 'left' ? undefined : { align });
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
    const cells = [
      { text: String(index + 1), w: cols[0].w, align: 'left' },
      {
        text: String(item.service_name || `Service #${item.service_id}`),
        w: cols[1].w,
        align: 'left',
      },
      { text: formatQtyLabel(item, pendingGc), w: cols[2].w, align: 'right' },
      {
        text: isGcPending
          ? `${formatMoney(item.final_price_snapshot)} / jam`
          : formatMoney(item.final_price_snapshot),
        w: cols[3].w,
        align: 'right',
      },
      {
        text: isGcPending || isMeterPending ? 'Pending' : formatMoney(item.line_total),
        w: cols[4].w,
        align: 'right',
      },
    ];

    let x = margin + 2;
    for (const cell of cells) {
      const lines = wrap(doc, cell.text, cell.w - 3, 8);
      if (cell.align === 'right') {
        doc.text(lines[0] || '-', x + cell.w - 2, y + 6.5, { align: 'right' });
      } else {
        doc.text(lines[0] || '-', x, y + 6.5);
      }
      x += cell.w;
    }
    y += rowH;
  });

  if (itemRows.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('Tidak ada item layanan.', margin + 2, y + 6);
    y += 12;
  }

  y += 4;
  const summaryX = pageW - margin - 70;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  if (pendingGc) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_HEADER_RGB);
    const pendingLines = wrap(doc, PENDING_TOTAL_TEXT, 70, 9);
    doc.text(pendingLines, summaryX, y + 4);
    y += pendingLines.length * 5 + 6;
  } else {
    const rows = [
      ['Subtotal', formatMoney(transaction.subtotal_amount)],
      ['Diskon', formatMoney(transaction.discount_amount)],
      ['TOTAL', formatMoney(transaction.final_amount)],
    ];
    for (const [label, value] of rows) {
      const isTotal = label === 'TOTAL';
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      doc.setFontSize(isTotal ? 11 : 9);
      doc.setTextColor(isTotal ? 12 : 51, isTotal ? 41 : 65, isTotal ? 93 : 85);
      doc.text(label, summaryX, y);
      doc.text(value, pageW - margin, y, { align: 'right' });
      y += isTotal ? 7 : 6;
    }
  }

  y += 8;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_HEADER_RGB);
  doc.text('✓ Jadwal Tercatat', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(
    `No. Transaksi: ${transaction.transaction_no || '-'}`,
    pageW - margin,
    y,
    { align: 'right' }
  );
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const note = wrap(
    doc,
    'Dokumen ini adalah bukti penjadwalan layanan dari Cleanox Home and Office Cleaning. Mohon simpan sebagai referensi jadwal kunjungan Anda.',
    contentW,
    8
  );
  doc.text(note, margin, y);
  y += note.length * 4 + 4;

  doc.setFontSize(8);
  doc.text(
    `Dicetak: ${printedAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
    margin,
    Math.max(y, pageH - 12)
  );

  const filename = `Cleanox_Order_Penjadwalan_${transaction.transaction_no || transaction.id || 'pos'}.pdf`;
  doc.save(filename);
}
