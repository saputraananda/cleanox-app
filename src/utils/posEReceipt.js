import { jsPDF } from 'jspdf';
import { formatIdr, formatServiceDateParts } from './posCustomerOrderMessage.js';
import {
  isGeneralCleaningCategory,
  isGcPricingPending,
} from './posGeneralCleaningBilling.js';

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

const PAGE_WIDTH_MM = 58;
const MARGIN_MM = 3;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const PENDING_TOTAL_TEXT = 'Menyesuaikan total jam pengerjaan';

function toNumber(value) {
  return Number(value || 0);
}

function estimateHeightMm(itemCount, addressLinesCount, customerAddressLines) {
  const base = 78;
  const perItem = 9;
  const companyExtra = Math.max(0, addressLinesCount - 1) * 3.2;
  const customerExtra = Math.max(0, customerAddressLines - 1) * 3.2;
  return Math.max(120, base + itemCount * perItem + companyExtra + customerExtra);
}

function wrapText(doc, text, maxWidthMm, fontSize) {
  doc.setFontSize(fontSize);
  const raw = String(text || '').trim() || '-';
  return doc.splitTextToSize(raw, maxWidthMm);
}

function drawCentered(doc, text, y, fontSize, style = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(fontSize);
  const lines = wrapText(doc, text, CONTENT_WIDTH_MM, fontSize);
  doc.text(lines, PAGE_WIDTH_MM / 2, y, { align: 'center' });
  return y + lines.length * (fontSize * 0.4);
}

function drawLeftRight(doc, left, right, y, fontSize) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.text(String(left), MARGIN_MM, y);
  doc.text(String(right), PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' });
  return y + fontSize * 0.45;
}

function drawDivider(doc, y) {
  doc.setDrawColor(120);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
  doc.setLineDashPattern([], 0);
  return y + 3;
}

/**
 * @param {{ transaction: object, items: array, logoDataUrl?: string|null }} params
 */
export async function downloadPosEReceiptPdf({ transaction, items = [], logoDataUrl = null }) {
  if (!transaction) throw new Error('Data transaksi tidak tersedia');

  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const company = CLEANOX_RECEIPT_COMPANY;
  const customerAddressLines = wrapText(
    new jsPDF({ unit: 'mm', format: [PAGE_WIDTH_MM, 100] }),
    transaction.customer_address || '-',
    CONTENT_WIDTH_MM,
    7
  );

  const heightMm = estimateHeightMm(
    itemRows.length,
    company.addressLines.length,
    customerAddressLines.length
  );

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_WIDTH_MM, heightMm],
  });

  let y = 4;

  if (logoDataUrl) {
    try {
      const logoW = 22;
      const logoH = 10;
      doc.addImage(logoDataUrl, 'PNG', (PAGE_WIDTH_MM - logoW) / 2, y, logoW, logoH);
      y += logoH + 2;
    } catch {
      // continue without logo
    }
  }

  for (const line of company.addressLines) {
    y = drawCentered(doc, line, y, 6.5) + 0.4;
  }
  y = drawCentered(doc, `Telepon: ${company.whatsapp}`, y + 0.5, 6.5) + 1;

  y = drawDivider(doc, y);

  const { dateLine, timeLine } = formatServiceDateParts(transaction.service_date);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(String(transaction.transaction_no || '-'), MARGIN_MM, y);
  y += 3.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`${dateLine}`, MARGIN_MM, y);
  y += 2.8;
  doc.text(`Jam: ${timeLine}`, MARGIN_MM, y);
  y += 3.5;

  y = drawDivider(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Customer', MARGIN_MM, y);
  y += 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const nameLines = wrapText(doc, transaction.customer_name || '-', CONTENT_WIDTH_MM, 7);
  doc.text(nameLines, MARGIN_MM, y);
  y += nameLines.length * 2.8;
  doc.setFontSize(6.5);
  doc.text(String(transaction.customer_phone || '-'), MARGIN_MM, y);
  y += 2.8;
  const addrLines = wrapText(doc, transaction.customer_address || '-', CONTENT_WIDTH_MM, 6.5);
  doc.text(addrLines, MARGIN_MM, y);
  y += addrLines.length * 2.6 + 1;

  y = drawDivider(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Layanan', MARGIN_MM, y);
  y += 3.2;

  const crew = Math.max(1, Number(transaction.total_people || 1));

  for (const item of itemRows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const titleLines = wrapText(doc, item.service_name || `Service #${item.service_id}`, CONTENT_WIDTH_MM, 7);
    doc.text(titleLines, MARGIN_MM, y);
    y += titleLines.length * 2.7;

    if (item.promo_name_snapshot) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      const promoLines = wrapText(doc, `Promo: ${item.promo_name_snapshot}`, CONTENT_WIDTH_MM, 6);
      doc.text(promoLines, MARGIN_MM, y);
      y += promoLines.length * 2.4;
    }

    if (item.original_price_snapshot != null) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(148, 163, 184);
      doc.text(`List: ${formatIdr(item.original_price_snapshot)}`, MARGIN_MM, y);
      doc.setTextColor(15, 23, 42);
      y += 2.4;
    }

    const isGcItem = isGeneralCleaningCategory(item.category_name);
    if (pendingGc && isGcItem) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      const rateLines = wrapText(
        doc,
        `${formatIdr(item.final_price_snapshot)} / ${crew} Teknisi / Jam`,
        CONTENT_WIDTH_MM,
        6.5
      );
      doc.text(rateLines, MARGIN_MM, y);
      y += rateLines.length * 2.5 + 1.2;
    } else {
      const qty = Math.max(1, toNumber(item.qty));
      const unit = formatIdr(item.final_price_snapshot);
      y = drawLeftRight(doc, `${qty} x ${unit}`, formatIdr(item.line_total), y, 6.5);
      y += 1.2;
    }
  }

  y = drawDivider(doc, y + 0.5);

  if (pendingGc) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const pendingLines = wrapText(doc, PENDING_TOTAL_TEXT, CONTENT_WIDTH_MM, 7);
    doc.text(pendingLines, MARGIN_MM, y);
    y += pendingLines.length * 2.8 + 1;
  } else {
    y = drawLeftRight(doc, 'Subtotal', formatIdr(transaction.subtotal_amount), y, 7);
    y = drawLeftRight(doc, 'Diskon', formatIdr(transaction.discount_amount), y, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('TOTAL', MARGIN_MM, y);
    doc.text(formatIdr(transaction.final_amount), PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' });
    y += 4;
  }

  y = drawDivider(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Pembayaran', MARGIN_MM, y);
  doc.text(pendingGc ? 'Menunggu konfirmasi' : 'LUNAS', PAGE_WIDTH_MM - MARGIN_MM, y, {
    align: 'right',
  });
  y += 4;

  y = drawDivider(doc, y);

  y = drawCentered(doc, company.footerThanks, y + 0.5, 6.5) + 1;
  y = drawCentered(doc, 'E-Receipt Cleanox', y, 6, 'italic');

  const filename = `ereceipt-${transaction.transaction_no || transaction.id || 'pos'}.pdf`;
  doc.save(filename);
}

export function loadImageAsDataUrl(src) {
  return new Promise((resolve, reject) => {
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
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Gagal memuat logo'));
    img.src = src;
  });
}
