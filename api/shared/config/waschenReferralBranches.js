export const WASCHEN_REFERRAL_BRANCHES = [
  {
    code: 'raffles_hills',
    label: 'Waschen Raffles Hills',
    employee_ids: [145, 187, 166, 184],
  },
  {
    code: 'kota_wisata',
    label: 'Waschen Kota Wisata',
    employee_ids: [150, 154, 183],
  },
  {
    code: 'citra_gran',
    label: 'Waschen Citra Gran',
    employee_ids: [148, 174, 167],
  },
  {
    code: 'legenda_wisata',
    label: 'Waschen Legenda Wisata',
    employee_ids: [157],
  },
  {
    code: 'canadian',
    label: 'Waschen Canadian',
    employee_ids: [206],
  },
];

export function listWaschenReferralBranches() {
  return WASCHEN_REFERRAL_BRANCHES.map(({ code, label }) => ({ code, label }));
}

export function getWaschenReferralBranch(code) {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return null;
  return WASCHEN_REFERRAL_BRANCHES.find((row) => row.code === normalized) || null;
}

export function assertValidWaschenReferralBranch(code) {
  const branch = getWaschenReferralBranch(code);
  if (!branch) {
    throw Object.assign(new Error('Cabang Waschen wajib dipilih'), { status: 400 });
  }
  return branch;
}

export function getWaschenReferralBranchEmployeeIds(code) {
  const branch = assertValidWaschenReferralBranch(code);
  return branch.employee_ids;
}

export function isEmployeeInWaschenReferralBranch(employeeId, branchCode) {
  const branch = getWaschenReferralBranch(branchCode);
  if (!branch) return false;
  return branch.employee_ids.includes(Number(employeeId));
}
