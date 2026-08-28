export const WASCHEN_REFERRAL_OTHER = '__other__';

export function normalizeWaschenReferralEmployeeName(value) {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  return text || null;
}

export function isValidWaschenReferralEmployeeName(value) {
  const normalized = normalizeWaschenReferralEmployeeName(value);
  if (!normalized || normalized.length < 2) return false;
  if (/\d/.test(normalized)) return false;
  return true;
}

export function referralEmployeeNameGroupKey(value) {
  const normalized = normalizeWaschenReferralEmployeeName(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function assertValidWaschenReferralEmployeeName(value) {
  const normalized = normalizeWaschenReferralEmployeeName(value);
  if (!normalized) {
    throw Object.assign(new Error('Nama pegawai Waschen wajib diisi'), { status: 400 });
  }
  if (normalized.length < 2) {
    throw Object.assign(new Error('Nama pegawai minimal 2 karakter'), { status: 400 });
  }
  if (/\d/.test(normalized)) {
    throw Object.assign(new Error('Nama pegawai hanya boleh huruf (tanpa angka)'), { status: 400 });
  }
  return normalized;
}
