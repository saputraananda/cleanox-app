import {

  formatIdr,

  formatPhoneDisplay,

  formatServiceDateParts,

  formatAddressLines,

  formatPromoPart,

  formatBasePricePart,

} from './posCustomerOrderMessage.js';

import { isGeneralCleaningCategory, transactionHasGeneralCleaning } from './posGeneralCleaningBilling.js';



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

  if (hasGc && !pricingFinalized) {

    return '📌Total = Menyesuaikan total jam pengerjaan';

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

  const meter = item?.meter == null || item?.meter === '' ? null : Number(item.meter);

  const qtyPart =
    meter != null && Number.isFinite(meter) && meter > 0
      ? `${qty} x ${meter} m`
      : String(qty);

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



export function buildGroupOrderMessage({

  customerName,

  customerPhone,

  customerAddress,

  serviceDate,

  items = [],

  totalPeople,

  notes,

  workers = [],

  finalAmount,

  pricingFinalized = false,

}) {

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


