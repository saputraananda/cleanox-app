import { formatItemQtyLabel, isMeterPricingPending } from './posMeterServices.js';
import { TEMP_TOTAL_LABEL, getPendingTotalNote } from './posPendingTotals.js';

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
  const qtyPart = formatItemQtyLabel({ ...item, qty: Math.max(1, toNumber(item?.qty || 1)) });
  const basePart = formatBasePricePart(item);
  const finalPrice = toNumber(item?.final_price_per_unit);
  const lineTotal = toNumber(item?.line_total);
  const promoPart = formatPromoPart(item);

  if (promoPart) {
    return `- ${serviceName} = ${basePart}  ${promoPart} ${formatIdr(finalPrice)} x ${qtyPart} = ${formatIdr(lineTotal)}`;
  }

  return `- ${serviceName} = ${basePart} ${formatIdr(finalPrice)} x ${qtyPart} = ${formatIdr(lineTotal)}`;
}

export function formatCustomerTotalLine(items = [], finalAmount, { pricingFinalized = false } = {}) {
  const hasGc = (items || []).some((item) => isGeneralCleaningCategory(item?.category_name));
  const meterPending = (items || []).some((item) =>
    isMeterPricingPending({
      satuanName: item?.satuan_name,
      unitLabel: item?.unit_label,
      meter: item?.meter,
    })
  );
  const note = getPendingTotalNote({ gcPending: hasGc && !pricingFinalized, meterPending });
  if (note) {
    return `📌${TEMP_TOTAL_LABEL} = ${formatIdr(finalAmount)} ${note}`;
  }
  return `📌Total = ${formatIdr(finalAmount)}`;
}

export function resolveTakeHomeDays(item) {
  if (item?.takehome_days != null && Number(item.takehome_days) > 0) {
    return Number(item.takehome_days);
  }
  if (item?.sla_hari != null && Number(item.sla_hari) > 0) {
    return Number(item.sla_hari);
  }
  if (String(item?.duration_unit || '').toLowerCase() === 'hari' && Number(item?.duration_value) > 0) {
    return Number(item.duration_value);
  }
  return null;
}

export function getMaxTakeHomeDays(items = []) {
  let maxDays = 0;
  for (const it of items || []) {
    const d = resolveTakeHomeDays(it);
    if (d != null && d > maxDays) {
      maxDays = d;
    }
  }
  return maxDays;
}

export function formatCompletionDate(serviceDate, days) {
  if (!days || days <= 0) return '-';
  const d = parseServiceDate(serviceDate);
  if (!d) return '-';
  const target = new Date(d);
  target.setDate(target.getDate() + Number(days));
  return target.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortCompletionDate(serviceDate, days) {
  if (!days || days <= 0) return '-';
  const d = parseServiceDate(serviceDate);
  if (!d) return '-';
  const target = new Date(d);
  target.setDate(target.getDate() + Number(days));
  return target.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function parseItemMeterDimensions(item) {
  let length = item?.meter_length != null && item?.meter_length !== '' ? Number(item.meter_length) : null;
  let width = item?.meter_width != null && item?.meter_width !== '' ? Number(item.meter_width) : null;
  if ((length == null || width == null) && item?.unit_label) {
    const match = String(item.unit_label).match(/P\s*([\d,.]+)\s*m?\s*[×x*]\s*L\s*([\d,.]+)/i);
    if (match) {
      length = Number(match[1].replace(',', '.'));
      width = Number(match[2].replace(',', '.'));
    }
  }
  return {
    length: Number.isFinite(length) && length > 0 ? length : null,
    width: Number.isFinite(width) && width > 0 ? width : null,
  };
}

export function formatDimensionDecimal(val) {
  if (val == null || !Number.isFinite(Number(val))) return '-';
  const n = Number(val);
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export function formatTakeHomeCustomerItemLine(item, index) {
  const serviceName = item?.service_name || '-';
  const finalPrice = toNumber(item?.final_price_per_unit ?? item?.base_price ?? 0);
  const lineTotal = toNumber(item?.line_total ?? 0);
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
    return `${index + 1}. ${serviceName} — P ${pStr} m × L ${lStr} m = ${luasStr} m² × ${formatIdr(finalPrice)} = ${formatIdr(lineTotal)}`;
  } else if (meterVal) {
    const luasStr = formatDimensionDecimal(meterVal);
    return `${index + 1}. ${serviceName} — ${luasStr} m² × ${formatIdr(finalPrice)} = ${formatIdr(lineTotal)}`;
  }

  const qty = Math.max(1, toNumber(item?.qty || 1));
  const unit = item?.satuan_name || item?.unit_label || 'pcs';
  return `${index + 1}. ${serviceName} — ${qty} ${unit} × ${formatIdr(finalPrice)} = ${formatIdr(lineTotal)}`;
}

export function buildCustomerOrderMessage({
  customerName,
  customerPhone,
  customerAddress,
  serviceDate,
  serviceMode = 'home_service',
  transactionNo = '-',
  items = [],
  totalPeople,
  finalAmount,
  subtotalAmount,
  discountAmount,
  transportFee,
  paymentStatus = 'belum_lunas',
  pricingFinalized = false,
}) {
  if (serviceMode === 'take_home') {
    const { dateLine } = formatServiceDateParts(serviceDate);
    const maxDays = getMaxTakeHomeDays(items);
    const estDateLine = formatCompletionDate(serviceDate, maxDays);
    const itemLines = (items || []).map((it, idx) => formatTakeHomeCustomerItemLine(it, idx));
    const subtotal =
      subtotalAmount != null
        ? toNumber(subtotalAmount)
        : (items || []).reduce((acc, it) => acc + toNumber(it.line_total || 0), 0);
    const diskon = discountAmount != null ? toNumber(discountAmount) : 0;
    const transport = transportFee != null ? toNumber(transportFee) : 0;
    const total = finalAmount != null ? toNumber(finalAmount) : subtotal - diskon + transport;
    const isPaid = String(paymentStatus || '').toLowerCase() === 'lunas';
    const statusText = isPaid ? 'LUNAS' : 'BELUM LUNAS';

    return [
      `Halo Kak ${customerName || '-'} 👋`,
      'Terima kasih sudah menggunakan layanan Cleanox 💙',
      '',
      'Berikut nota pesanan Kakak:',
      '',
      `🧾 No. Transaksi: ${transactionNo || '-'}`,
      '📦 Layanan: Take Home (Pickup & Antar)',
      `📅 Tanggal Pickup: ${dateLine}`,
      `✅ Estimasi Selesai: ${estDateLine}`,
      `📍 Alamat Pickup & Antar: ${customerAddress || '-'}`,
      '',
      'Rincian Item:',
      ...(itemLines.length ? itemLines : ['-']),
      '',
      `Subtotal: ${formatIdr(subtotal)}`,
      `Diskon: ${formatIdr(diskon)}`,
      `Biaya Antar-Jemput: ${formatIdr(transport)}`,
      `TOTAL: ${formatIdr(total)}`,
      `Status: ${statusText}`,
      '',
      '📌 Catatan:',
      '* Barang akan diantar kembali setelah semua item selesai. Admin akan menghubungi Kakak untuk konfirmasi jadwal antar.',
      '* Estimasi dapat bertambah jika cuaca ekstrem / hujan terus-menerus.',
      '',
      '------------------------------------------------',
      'Cleanox Indonesia',
      'Total Care For Happy Life',
    ].join('\n');
  }

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
