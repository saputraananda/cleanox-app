import { jsPDF } from 'jspdf';
import { isGcPricingPending } from './posGeneralCleaningBilling.js';
import { transactionHasMeterPending } from './posMeterServices.js';
import {
  CLEANOX_RECEIPT_COMPANY,
  drawItemsTable,
  drawTotalsBox,
  loadImageAsDataUrl as loadImageAsDataUrlFromLayout,
} from './posPdfLayout.js';
import {
  drawEReceiptCustomerAndInfo,
  drawEReceiptKop,
  drawEReceiptPrintedAt,
  drawEReceiptThanksNote,
  drawEReceiptTitleRow,
  loadEReceiptKopAsDataUrl,
} from './posEReceiptLayout.js';

export { CLEANOX_RECEIPT_COMPANY };
export const loadImageAsDataUrl = loadImageAsDataUrlFromLayout;
export { loadEReceiptKopAsDataUrl };

const E_RECEIPT_FOOTER_TEXT =
  'Terima kasih atas kepercayaan Anda. Jadwalkan pembersihan rutin berikutnya dan nikmati rumah yang selalu bersih dan segar bersama Cleanox.';

const TOTALS_BOX_W = 72;

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

/**
 * E-Receipt A4 portrait — full-width kop (aspect preserved) + 2-column body.
 * @param {{ transaction: object, items?: array, logoDataUrl?: string|{ dataUrl: string, width?: number, height?: number }|null }} params
 */
export async function downloadPosEReceiptPdf({ transaction, items = [], logoDataUrl = null }) {
  if (!transaction) throw new Error('Data transaksi tidak tersedia');

  const logo = normalizeLogoInput(logoDataUrl);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const pendingMeter = transactionHasMeterPending(itemRows);
  const crew = Math.max(1, Number(transaction.total_people || 1));

  // Portrait column widths (sum = contentW)
  const colNo = 8;
  const colService = 58;
  const colPromo = 28;
  const colQty = 12;
  const colPrice = 36;
  const colTotal = contentW - colNo - colService - colPromo - colQty - colPrice;

  let y = drawEReceiptKop(doc, {
    dataUrl: logo.dataUrl,
    naturalWidth: logo.width,
    naturalHeight: logo.height,
    pageW,
  });

  y = drawEReceiptTitleRow(doc, {
    transaction,
    margin,
    pageW,
    y,
  });

  y = drawEReceiptCustomerAndInfo(doc, {
    transaction,
    margin,
    contentW,
    y,
  });

  y = drawItemsTable(doc, {
    items: itemRows,
    pendingGc,
    crew,
    margin,
    contentW,
    pageH,
    y,
    columnWidths: [colNo, colService, colPromo, colQty, colPrice, colTotal],
  });

  const totalsBlockH = pendingGc || pendingMeter ? 40 : 58;
  const printedGap = 8;
  if (y + totalsBlockH + printedGap > pageH - 8) {
    doc.addPage();
    y = margin;
  }

  y += 4;
  const thanksMaxW = Math.max(60, contentW - TOTALS_BOX_W - 8);
  drawEReceiptThanksNote(doc, {
    text: E_RECEIPT_FOOTER_TEXT,
    x: margin,
    y: y + 8,
    maxWidth: thanksMaxW,
  });

  const totalsBottom = drawTotalsBox(doc, {
    transaction,
    pendingGc,
    pendingMeter,
    pageW,
    margin,
    y,
    showPaymentBadge: true,
  });

  drawEReceiptPrintedAt(doc, {
    pageW,
    pageH,
    margin,
    y: totalsBottom + 6,
  });

  const filename = `ereceipt-${transaction.transaction_no || transaction.id || 'pos'}.pdf`;
  doc.save(filename);
}
