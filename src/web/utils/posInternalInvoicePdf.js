import { jsPDF } from 'jspdf';
import { formatServiceDateParts } from './posCustomerOrderMessage.js';
import { CLEANOX_RECEIPT_COMPANY } from './posEReceipt.js';
import {
  isGeneralCleaningCategory,
  isGcPricingPending,
} from './posGeneralCleaningBilling.js';

function toNumber(value) {
  return Number(value || 0);
}

function formatMoney(amount) {
  const n = Math.round(toNumber(amount));
  return `Rp ${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function wrap(doc, text, maxWidth, fontSize) {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(String(text || '-').trim() || '-', maxWidth);
}

const PENDING_TOTAL_TEXT = 'Menyesuaikan total jam pengerjaan';

/**
 * Internal invoice / laporan A4 landscape for admin reporting.
 * @param {{ transaction: object, items?: array, assignments?: array, logoDataUrl?: string|null }} params
 */
export async function downloadPosInternalInvoicePdf({
  transaction,
  items = [],
  assignments = [],
  logoDataUrl = null,
}) {
  if (!transaction) throw new Error('Data transaksi tidak tersedia');

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth(); // 297
  const pageH = doc.internal.pageSize.getHeight(); // 210
  const margin = 14;
  const contentW = pageW - margin * 2;
  const company = CLEANOX_RECEIPT_COMPANY;
  const itemRows = Array.isArray(items) ? items : [];
  const workerRows = Array.isArray(assignments) ? assignments : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const crew = Math.max(1, Number(transaction.total_people || 1));

  let y = margin;

  // Header bar — biru dongker
  doc.setFillColor(12, 41, 93);
  doc.rect(0, 0, pageW, 28, 'F');

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, 6, 28, 12);
    } catch {
      // skip logo
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RECIEPT', pageW - margin, 16, { align: 'right' });

  y = 36;
  doc.setTextColor(30, 41, 59);

  // Company + meta two columns
  const colW = contentW / 2 - 4;
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

  const { dateLine, timeLine } = formatServiceDateParts(transaction.service_date);
  let metaY = 36;
  const metaX = margin + colW + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Informasi Transaksi', metaX, metaY);
  metaY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const metaLines = [
    [`No. Transaksi`, String(transaction.transaction_no || '-')],
    [`Tanggal Layanan`, `${dateLine} • ${timeLine}`],
    [`Status Order`, String(transaction.status || '-')],
    [`Jumlah Orang`, String(transaction.total_people ?? '-')],
    [`Pembayaran`, pendingGc ? 'Menunggu konfirmasi' : 'LUNAS'],
  ];
  for (const [label, value] of metaLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, metaX, metaY);
    doc.setFont('helvetica', 'normal');
    const valueLines = wrap(doc, value, colW - 28, 8.5);
    doc.text(valueLines, metaX + 32, metaY);
    metaY += Math.max(5, valueLines.length * 4);
  }

  y = Math.max(y, metaY) + 6;

  // Customer box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
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
  y += 34;

  // Items table header
  const cols = [
    { key: 'no', label: 'No', w: 10 },
    { key: 'service', label: 'Layanan', w: 90 },
    { key: 'promo', label: 'Promo', w: 45 },
    { key: 'qty', label: 'Qty', w: 16 },
    { key: 'price', label: 'Harga Satuan', w: 40 },
    { key: 'total', label: 'Line Total', w: contentW - 10 - 90 - 45 - 16 - 40 },
  ];

  doc.setFillColor(12, 41, 93);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let x = margin + 2;
  for (const col of cols) {
    let align = 'left';
    if (['qty', 'price'].includes(col.key)) align = 'right';
    if (col.key === 'total') align = 'center';
    const tx =
      align === 'right' ? x + col.w - 2 : align === 'center' ? x + col.w / 2 : x;
    doc.text(
      col.label,
      tx,
      y + 5.5,
      align === 'left' ? undefined : { align }
    );
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

    const rowH = 9;
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, rowH, 'F');
    }

    const isGcItem = isGeneralCleaningCategory(item.category_name);
    const cells =
      pendingGc && isGcItem
        ? [
            { text: String(index + 1), w: cols[0].w, align: 'left' },
            {
              text: String(item.service_name || `Service #${item.service_id}`),
              w: cols[1].w,
              align: 'left',
            },
            { text: String(item.promo_name_snapshot || '-'), w: cols[2].w, align: 'left' },
            { text: '—', w: cols[3].w, align: 'right' },
            {
              text: `${formatMoney(item.final_price_snapshot)} / ${crew} Teknisi / Jam`,
              w: cols[4].w,
              align: 'right',
            },
            { text: 'Pending jam', w: cols[5].w, align: 'center' },
          ]
        : [
            { text: String(index + 1), w: cols[0].w, align: 'left' },
            {
              text: String(item.service_name || `Service #${item.service_id}`),
              w: cols[1].w,
              align: 'left',
            },
            { text: String(item.promo_name_snapshot || '-'), w: cols[2].w, align: 'left' },
            { text: String(item.qty ?? 1), w: cols[3].w, align: 'right' },
            { text: formatMoney(item.final_price_snapshot), w: cols[4].w, align: 'right' },
            { text: formatMoney(item.line_total), w: cols[5].w, align: 'center' },
          ];

    let cx = margin + 2;
    for (const cell of cells) {
      const lines = wrap(doc, cell.text, cell.w - 3, 8);
      const textY = y + 5.5;
      if (cell.align === 'right') {
        doc.text(lines[0] || '-', cx + cell.w - 2, textY, { align: 'right' });
      } else if (cell.align === 'center') {
        doc.text(lines[0] || '-', cx + cell.w / 2, textY, { align: 'center' });
      } else {
        doc.text(lines[0] || '-', cx, textY);
      }
      cx += cell.w;
    }
    y += rowH;
  });

  if (itemRows.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('Tidak ada item layanan.', margin + 2, y + 6);
    y += 12;
  }

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Workers summary (internal)
  const activeWorkers = workerRows.filter((row) =>
    ['Assigned', 'In_Schedule', 'On_Progress', 'Done'].includes(row.assignment_status)
  );
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Pekerja Ditugaskan', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (activeWorkers.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('-', margin, y);
    y += 5;
  } else {
    doc.setTextColor(30, 41, 59);
    const workerText = activeWorkers
      .map((row) => row.employee_name || 'Worker')
      .join('  |  ');
    const workerLines = wrap(doc, workerText, contentW * 0.55, 8);
    doc.text(workerLines, margin, y);
    y += workerLines.length * 4 + 2;
  }

  // Totals box (right)
  const boxW = 78;
  const boxX = pageW - margin - boxW;
  const boxY = y + 4;
  const boxH = pendingGc ? 28 : 36;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

  if (pendingGc) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(12, 41, 93);
    const pendingLines = wrap(doc, PENDING_TOTAL_TEXT, boxW - 8, 9);
    doc.text(pendingLines, boxX + 4, boxY + 12);
  } else {
    const totals = [
      ['Subtotal', formatMoney(transaction.subtotal_amount)],
      ['Diskon', formatMoney(transaction.discount_amount)],
      ['TOTAL', formatMoney(transaction.final_amount)],
    ];
    let ty = boxY + 8;
    for (const [label, value] of totals) {
      const isTotal = label === 'TOTAL';
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      doc.setFontSize(isTotal ? 11 : 9);
      doc.setTextColor(isTotal ? 12 : 51, isTotal ? 41 : 65, isTotal ? 93 : 85);
      doc.text(label, boxX + 4, ty);
      doc.text(value, boxX + boxW - 4, ty, { align: 'right' });
      ty += isTotal ? 8 : 7;
    }
  }

  // Footer
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(
    'Dokumen ini untuk keperluan laporan internal Cleanox. ' + company.footerThanks,
    margin,
    pageH - 10
  );
  doc.setFont('helvetica', 'normal');
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`, pageW - margin, pageH - 10, {
    align: 'right',
  });

  const filename = `invoice-internal-${transaction.transaction_no || transaction.id || 'pos'}.pdf`;
  doc.save(filename);
}
