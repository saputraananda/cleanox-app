function toNumber(value) {
  return Number(value || 0);
}

export function formatIdr(amount) {
  return `Rp ${toNumber(amount).toLocaleString('id-ID', {
    maximumFractionDigits: 0,
  })}`;
}

export function formatPhoneDisplay(phone) {
  if (!phone) return '-';
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return String(phone).trim() || '-';
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith('62') && digits.length >= 9) digits = `62${digits}`;

  if (digits.startsWith('62') && digits.length >= 11) {
    const local = digits.slice(2);
    if (local.length >= 10) {
      return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
    }
    return `+62 ${local}`;
  }

  return String(phone).startsWith('+') ? String(phone).trim() : `+${digits}`;
}

function parseServiceDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();

  // ISO with timezone (Z or ±HH:MM) — interpret as absolute instant
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && (/[zZ]$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text))) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Datetime without timezone — treat as Asia/Jakarta wall clock
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (match) {
    const isoLocal = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+07:00`;
    const parsed = new Date(isoLocal);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const parsed = new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00+07:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatServiceDateParts(serviceDate) {
  const date = parseServiceDate(serviceDate);
  if (!date) {
    return { dateLine: '-', timeLine: '-' };
  }

  const dateLine = date.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeLine = date
    .toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(':', '.');

  return { dateLine, timeLine };
}

export function formatAddressLines(address) {
  if (!address || !String(address).trim()) return ['-'];
  const parts = String(address)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : ['-'];
}

export function formatPromoPart(item) {
  const promoType = item?.promo_type || null;
  const promoValue = item?.promo_value;
  if (!promoType || promoValue == null || promoValue === '') return '';

  if (promoType === 'persen') {
    return `(Disc ${toNumber(promoValue)}%)`;
  }
  if (promoType === 'nominal') {
    return `(Disc ${formatIdr(promoValue)})`;
  }
  return '';
}

export function formatBasePricePart(item) {
  const basePrice = toNumber(item?.base_price);
  const original = item?.original_price ?? item?.original_price_snapshot;
  if (original != null && original !== '' && Number.isFinite(Number(original))) {
    return `~${formatIdr(original)}~ ${formatIdr(basePrice)}`;
  }
  return formatIdr(basePrice);
}

function isGeneralCleaningCategory(categoryName) {
  if (!categoryName) return false;
  return String(categoryName).trim().toLowerCase() === 'general cleaning';
}

export function formatCustomerGeneralCleaningItemLine(item, totalPeople) {
  const serviceName = item?.service_name || '-';
  const finalPrice = toNumber(item?.final_price_per_unit ?? item?.final_price ?? 0);
  const teknisi = Math.max(1, Number(totalPeople || 1));
  return `- ${serviceName}\n${formatIdr(finalPrice)} / ${teknisi} Teknisi / Jam `;
}

export function formatItemLine(item, totalPeople) {
  if (isGeneralCleaningCategory(item?.category_name)) {
    return formatCustomerGeneralCleaningItemLine(item, totalPeople);
  }

  const serviceName = item?.service_name || '-';
  const qty = Math.max(1, toNumber(item?.qty || 1));
  const basePart = formatBasePricePart(item);
  const finalPrice = toNumber(item?.final_price_per_unit);
  const lineTotal = toNumber(item?.line_total);
  const promoPart = formatPromoPart(item);

  if (promoPart) {
    return `- ${serviceName} = ${basePart}  ${promoPart} ${formatIdr(finalPrice)} x ${qty} = ${formatIdr(lineTotal)}`;
  }

  return `- ${serviceName} = ${basePart} ${formatIdr(finalPrice)} x ${qty} = ${formatIdr(lineTotal)}`;
}

export function formatCustomerTotalLine(items = [], finalAmount, { pricingFinalized = false } = {}) {
  const hasGc = (items || []).some((item) => isGeneralCleaningCategory(item?.category_name));
  if (hasGc && !pricingFinalized) {
    return '📌Total = Menyesuaikan total jam pengerjaan';
  }
  return `📌Total = ${formatIdr(finalAmount)}`;
}

export function buildCustomerOrderMessage({
  customerName,
  customerPhone,
  customerAddress,
  serviceDate,
  items = [],
  totalPeople,
  finalAmount,
  pricingFinalized = false,
}) {
  const { dateLine, timeLine } = formatServiceDateParts(serviceDate);
  const addressLines = formatAddressLines(customerAddress);
  const itemLines = (items || []).map((item) => formatItemLine(item, totalPeople));

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
    ...(itemLines.length ? itemLines : ['-']),
    '',
    formatCustomerTotalLine(items, finalAmount, { pricingFinalized }),
  ].join('\n');
}
