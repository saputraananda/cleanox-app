import { jsPDF } from 'jspdf';
import { isGcPricingPending } from './posGeneralCleaningBilling.js';
import {
  CLEANOX_RECEIPT_COMPANY,
  drawA4LandscapeHeader,
  drawCompanyBlock,
  drawCrewHighlightBox,
  drawCustomerBox,
  drawFooter,
  drawItemsTable,
  drawTotalsBox,
  drawTransactionMeta,
} from './posPdfLayout.js';

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

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const itemRows = Array.isArray(items) ? items : [];
  const pendingGc = isGcPricingPending(transaction, itemRows);
  const crew = Math.max(1, Number(transaction.total_people || 1));

  let y = drawA4LandscapeHeader(doc, {
    logoDataUrl,
    title: 'INVOICE INTERNAL',
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
    includeCrewCount: true,
  });

  y = Math.max(companyBottom, metaBottom) + 6;
  y = drawCustomerBox(doc, { transaction, margin, contentW, y });

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
  y += 8;

  const crewStartY = y;
  drawCrewHighlightBox(doc, {
    transaction,
    assignments,
    margin,
    contentW,
    y: crewStartY,
    maxWidthRatio: 0.55,
  });

  drawTotalsBox(doc, {
    transaction,
    pendingGc,
    pageW,
    margin,
    y: crewStartY,
  });

  drawFooter(doc, {
    pageW,
    pageH,
    margin,
    footerNote: `Dokumen ini untuk keperluan laporan internal Cleanox. ${CLEANOX_RECEIPT_COMPANY.footerThanks}`,
  });

  const filename = `invoice-internal-${transaction.transaction_no || transaction.id || 'pos'}.pdf`;
  doc.save(filename);
}
