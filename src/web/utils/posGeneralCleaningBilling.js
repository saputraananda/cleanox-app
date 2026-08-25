export function isGeneralCleaningCategory(categoryName) {
  if (!categoryName) return false;
  return String(categoryName).trim().toLowerCase() === 'general cleaning';
}

export function parseGcCrewSizeFromServiceName(serviceName) {
  if (!serviceName) return null;
  const match = String(serviceName).match(/\/\s*(\d+)\s*Teknisi/i);
  if (!match) return null;
  const size = Number(match[1]);
  return Number.isFinite(size) && size >= 1 ? size : null;
}

export function transactionHasGeneralCleaning(items = []) {
  return (items || []).some((item) => isGeneralCleaningCategory(item?.category_name));
}

export function isGcPricingPending(transaction, items = []) {
  return (
    transactionHasGeneralCleaning(items) && !transaction?.pricing_finalized_at
  );
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calculateGcBillingHours({ startedAt, completedAt }) {
  const start = toDate(startedAt);
  const end = toDate(completedAt);
  if (!start || !end) {
    throw new Error('Durasi pengerjaan tidak valid');
  }

  const elapsedMs = end.getTime() - start.getTime();
  if (!(elapsedMs > 0)) {
    throw new Error('Durasi pengerjaan tidak valid');
  }

  let hours = elapsedMs / 3_600_000;
  hours = Math.ceil(hours * 100) / 100;
  if (hours < 0.01) hours = 0.01;
  return hours;
}

export function computeGcLineTotals({
  basePrice,
  promoType = null,
  promoValue = null,
  billingHours,
}) {
  const base = Number(basePrice || 0);
  const hours = Number(billingHours || 0);
  const rawPromoValue = Number(promoValue || 0);
  const discountPerUnit =
    promoType === 'persen'
      ? (base * rawPromoValue) / 100
      : promoType === 'nominal'
        ? rawPromoValue
        : 0;
  const safeDiscountPerUnit = Math.min(base, Math.max(0, discountPerUnit));
  const rateFinal = Math.max(0, base - safeDiscountPerUnit);
  const lineTotal = rateFinal * hours;
  const promoDiscountAmount = safeDiscountPerUnit * hours;

  return {
    rateFinal,
    lineTotal,
    billingHours: hours,
    discountPerUnit: safeDiscountPerUnit,
    promoDiscountAmount,
  };
}

export function getGcCrewSizeFromItems(items = [], services = []) {
  const crewSizes = [];
  for (const item of items || []) {
    const service =
      services.find((row) => Number(row.id) === Number(item.service_id)) || null;
    const categoryName = item.category_name || service?.category_name || null;
    if (!isGeneralCleaningCategory(categoryName)) continue;
    const name = item.service_name || service?.name || '';
    const crew = parseGcCrewSizeFromServiceName(name);
    if (crew == null) return { ok: false, error: 'Nama service General Cleaning tidak valid' };
    crewSizes.push(crew);
  }
  if (!crewSizes.length) return { ok: true, crewSize: null, hasGc: false };
  const unique = [...new Set(crewSizes)];
  if (unique.length > 1) {
    return { ok: false, error: 'Paket General Cleaning harus ukuran teknisi yang sama' };
  }
  return { ok: true, crewSize: unique[0], hasGc: true };
}
