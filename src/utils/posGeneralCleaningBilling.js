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
