import {
  formatIdr,
  formatPhoneDisplay,
  formatServiceDateParts,
  formatAddressLines,
  formatPromoPart,
  formatBasePricePart,
  resolveTakeHomeDays,
  getMaxTakeHomeDays,
  formatCompletionDate,
  parseItemMeterDimensions,
  formatDimensionDecimal,
} from './posCustomerOrderMessage.js';

import { isGeneralCleaningCategory, transactionHasGeneralCleaning } from './posGeneralCleaningBilling.js';

import { formatItemQtyLabel, isMeterPricingPending } from './posMeterServices.js';

import { TEMP_TOTAL_LABEL, getPendingTotalNote } from './posPendingTotals.js';



const WORKER_LINE_PREFIX = '👨🏼‍🔧';



export function formatWorkerShortName(fullName) {

  if (!fullName) return 'worker';

  const tokens = String(fullName).trim().split(/\s+/).filter(Boolean);

  const token = tokens.length ? tokens[tokens.length - 1] : fullName;

  return token.toLowerCase().replace(/\s+/g, '');

}



export function formatWorkerMention(worker) {

  const shortName = formatWorkerShortName(worker?.full_name || worker?.employee_name);

  const phone = formatPhoneDisplay(worker?.phone_number || worker?.employee_phone);

  if (phone && phone !== '-') {

    return `@~${shortName} @${phone}`;

  }

  return `@~${shortName}`;

}



export function formatWorkerMentions(workers = []) {

  if (!workers?.length) {

    return `${WORKER_LINE_PREFIX} -`;

  }

  return `${WORKER_LINE_PREFIX} ${workers.map(formatWorkerMention).join(' ')}`;

}



export { isGeneralCleaningCategory };



export function formatGroupTotalLine(items = [], finalAmount, { pricingFinalized = false } = {}) {

  const list = (items || []).filter((item) => item?.service_name);

  if (!list.length) {

    return `📌Total = ${formatIdr(finalAmount || 0)}`;

  }



  const hasGc = transactionHasGeneralCleaning(list);

  const meterPending = list.some((item) =>
    isMeterPricingPending({
      satuanName: item?.satuan_name,
      unitLabel: item?.unit_label,
      meter: item?.meter,
    })
  );

  const note = getPendingTotalNote({ gcPending: hasGc && !pricingFinalized, meterPending });

  if (note) {

    return `📌${TEMP_TOTAL_LABEL} = ${formatIdr(finalAmount || 0)} ${note}`;

  }



  return `📌Total = ${formatIdr(finalAmount || 0)}`;

}



export function formatGroupGeneralCleaningItemLine(item, totalPeople) {

  const serviceName = item?.service_name || '-';

  const finalPrice = item?.final_price_per_unit ?? item?.final_price ?? 0;

  const teknisi = Math.max(1, Number(totalPeople || 1));

  return `* ${serviceName}\n${formatIdr(finalPrice)} / ${teknisi} Teknisi / Jam `;

}



export function formatGroupStandardItemLine(item) {

  const serviceName = item?.service_name || '-';

  const qty = Math.max(1, Number(item?.qty || 1));

  const qtyPart = formatItemQtyLabel({ ...item, qty });

  const basePart = formatBasePricePart(item);

  const finalPrice = Number(item?.final_price_per_unit ?? item?.final_price ?? 0);

  const lineTotal = Number(item?.line_total ?? finalPrice * qty);

  const promoPart = formatPromoPart(item);



  if (promoPart) {

    return `* ${serviceName} = ${basePart}  ${promoPart} ${formatIdr(finalPrice)} x ${qtyPart} = ${formatIdr(lineTotal)}`;

  }



  return `* ${serviceName} = ${basePart} ${formatIdr(finalPrice)} x ${qtyPart} = ${formatIdr(lineTotal)}`;

}



export function formatGroupItemLine(item, totalPeople) {

  if (isGeneralCleaningCategory(item?.category_name)) {

    return formatGroupGeneralCleaningItemLine(item, totalPeople);

  }

  return formatGroupStandardItemLine(item);

}



export function formatGroupItemLines(items = [], totalPeople) {

  if (!items?.length) return ['-'];

  return items.map((item) => formatGroupItemLine(item, totalPeople));

}



export function formatTakeHomeInternalItemLine(item, index) {
  const serviceName = item?.service_name || '-';
  const { length, width } = parseItemMeterDimensions(item);
  const meterVal =
    item?.meter != null && Number(item.meter) > 0
      ? Number(item.meter)
      : length && width
        ? length * width
        : null;

  if (length && width && meterVal) {
    const pStr = formatDimensionDecimal(length);
    const lStr = formatDimensionDecimal(width);
    const luasStr = formatDimensionDecimal(meterVal);
    const qty = Math.max(1, Number(item?.qty || 1));
    return `${index + 1}. ${serviceName} – ${qty} lembar, P ${pStr} m × L ${lStr} m (${luasStr} m²)`;
  } else if (meterVal) {
    const luasStr = formatDimensionDecimal(meterVal);
    const qty = Math.max(1, Number(item?.qty || 1));
    return `${index + 1}. ${serviceName} – ${qty} lembar (${luasStr} m²)`;
  }

  const qty = Math.max(1, Number(item?.qty || 1));
  const unit = item?.satuan_name || item?.unit_label || 'pcs';
  return `${index + 1}. ${serviceName} – ${qty} ${unit}`;
}

export function buildGroupOrderMessage({
  customerName,
  customerPhone,
  customerAddress,
  serviceDate,
  serviceMode = 'home_service',
  transactionNo = '-',
  items = [],
  totalPeople,
  notes,
  workers = [],
  finalAmount,
  paymentStatus = 'belum_lunas',
  pricingFinalized = false,
}) {
  if (serviceMode === 'take_home') {
    const { dateLine, timeLine } = formatServiceDateParts(serviceDate);
    const maxDays = getMaxTakeHomeDays(items);
    const estDateLine = formatCompletionDate(serviceDate, maxDays);
    const itemLines = (items || []).map((it, idx) => formatTakeHomeInternalItemLine(it, idx));
    const mapsUrl =
      customerAddress && String(customerAddress).trim() && String(customerAddress).trim() !== '-'
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}`
        : '-';
    const isPaid = String(paymentStatus || '').toLowerCase() === 'lunas';
    const statusText = isPaid ? 'LUNAS' : 'BELUM LUNAS';
    const total = finalAmount != null ? Number(finalAmount || 0) : 0;
    const jamText =
      timeLine && timeLine !== '-' && timeLine !== '00.00'
        ? timeLine
        : 'sesuai janji dgn customer';
    const teknisiNames =
      (workers || []).map((w) => w.full_name || w.name).filter(Boolean).join(', ') || '-';
    const noteText = notes && String(notes).trim() ? String(notes).trim() : '-';

    return [
      'CLEANOX TAKE HOME',
      '',
      `No. Transaksi: ${transactionNo || '-'}`,
      `Tanggal Pickup: ${dateLine}`,
      `Perkiraan Jam: ${jamText}`,
      `Estimasi Selesai: ${estDateLine}`,
      '',
      '👤 Customer',
      `Nama: ${customerName || '-'}`,
      `No. HP: ${customerPhone || '-'}`,
      `Alamat: ${customerAddress || '-'}`,
      `Maps: ${mapsUrl}`,
      '',
      `📦 Item yang Diambil (${items.length} item)`,
      ...(itemLines.length ? itemLines : ['-']),
      '',
      `📝 Catatan Customer: ${noteText}`,
      '',
      '✅ Checklist',
      '* Cocokkan jumlah & jenis item dengan daftar di atas',
      '* Ukur ulang karpet (P × L) dan infokan ke admin',
      '* Update foto dan progress di Dashboard Cleanox',
      '* Beri marker di setiap barang sesuai nomor nota',
      '',
      `Status Pembayaran: ${statusText} – ${formatIdr(total)}`,
      '',
      `👨🏼🔧: ${teknisiNames}`,
    ].join('\n');
  }

  const { dateLine, timeLine } = formatServiceDateParts(serviceDate);
  const addressLines = formatAddressLines(customerAddress);
  const itemLines = formatGroupItemLines(items, totalPeople);
  const noteContent = notes && String(notes).trim() ? String(notes).trim() : '-';

  return [
    'Cleanox Order',
    '',
    dateLine,
    timeLine,
    '',
    customerName || '-',
    formatPhoneDisplay(customerPhone),
    '',
    'Alamat: ',
    ...addressLines,
    '',
    'Berikut layanan yang dipilih:',
    ...itemLines,
    '',
    formatGroupTotalLine(items, finalAmount, { pricingFinalized }),
    '',
    'Note: ',
    noteContent,
    '',
    formatWorkerMentions(workers),
  ].join('\n');
}


