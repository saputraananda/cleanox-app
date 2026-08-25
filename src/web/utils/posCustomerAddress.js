export function isBlankAddress(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return text === '' || text === '-';
}
