import { jsPDF } from 'jspdf';
import { isGcPricingPending } from './posGeneralCleaningBilling.js';
import { transactionHasMeterPending } from './posMeterServices.js';
import {
  CLEANOX_RECEIPT_COMPANY,
  drawA4LandscapeHeader,
  drawCompanyBlock,
  drawCustomerBox,
  drawFooter,
  drawItemsTable,
  drawTotalsBox,
  drawTransactionMeta,
  loadImageAsDataUrl as loadImageAsDataUrlFromLayout,
} from './posPdfLayout.js';

export { CLEANOX_RECEIPT_COMPANY };
export const loadImageAsDataUrl = loadImageAsDataUrlFromLayout;

const E_RECEIPT_FOOTER_TEXT =
  'Terima kasih atas kepercayaan Anda. Jadwalkan pembersihan rutin berikutnya dan nikmati rumah yang selalu bersih dan segar bersama Cleanox.';

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
 * E-Receipt A4 landscape — same layout as internal invoice,
 * without jumlah teknisi and without assigned technicians list.
 * @param {{ transaction: object, items?: array, logoDataUrl?: string|{ dataUrl: string, width?: number, height?: number }|null }} params
 */
export async function downloadPosEReceiptPdf({ transaction, items = [], logoDataUrl = null }) {
  if (!transaction) throw new Error('Data transaksi tidak tersedia');

  const logo = normalizeLogoInput(logoDataUrl);

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const pendingMeter = transactionHasMeterPending(itemRows);
  const crew = Math.max(1, Number(transaction.total_people || 1));

  let y = drawA4LandscapeHeader(doc, {
    logoDataUrl: logo.dataUrl,
    logoNaturalWidth: logo.width,
    logoNaturalHeight: logo.height,
    title: 'E-RECEIPT',
  });

  const companyBottom = drawCompanyBlock(doc, {
    company: CLEANOX_RECEIPT_COMPANY,
    startY: y,
    margin,
  });

  const metaBottom = drawTransactionMeta(doc, {
    transaction,
    pendingGc,
    startY: y,
    margin,
    contentW,
    includeCrewCount: false,
    includePaymentStatus: false,
  });

  y = Math.max(companyBottom, metaBottom) + 6;
  y = drawCustomerBox(doc, { transaction, margin, contentW, y, comfortableSpacing: true });

  y = drawItemsTable(doc, {
    items: itemRows,
    pendingGc,
    crew,
    margin,
    contentW,
    pageH,
    y,
  });

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 4;

  drawTotalsBox(doc, {
    transaction,
    pendingGc,
    pendingMeter,
    pageW,
    margin,
    y,
    showPaymentBadge: true,
  });

  drawFooter(doc, {
    pageW,
    pageH,
    margin,
    footerNote: E_RECEIPT_FOOTER_TEXT,
    multiline: true,
  });

  const filename = `ereceipt-${transaction.transaction_no || transaction.id || 'pos'}.pdf`;
  doc.save(filename);
}
