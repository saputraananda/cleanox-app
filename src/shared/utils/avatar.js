/**
 * Helper resolusi URL avatar / pas foto karyawan.
 * Menghubungkan path relatif dari database SuperApp (/assets/avatars/...)
 * ke host server backend SuperApp.
 */
const DEFAULT_SUPERAPP_HOST = 'https://api.waschenalora.com';

export function resolveAvatarUrl(path) {
  if (!path || typeof path !== 'string') return null;

  const trimmed = path.trim();
  if (!trimmed) return null;

  // Sudah berupa absolute URL atau data URI
  if (/^(?:https?:|\/\/|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const base = (
    import.meta.env.VITE_SUPERAPP_URL ||
    import.meta.env.VITE_SUPERAPP_API_URL ||
    DEFAULT_SUPERAPP_HOST
  ).replace(/\/+$/, '');

  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${cleanPath}`;
}

export function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
