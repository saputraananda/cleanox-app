export const HEAD_OFFICE_LABEL = 'Head Office Alora';
export const OUTSIDE_LABEL = 'sedang tugas diluar';
export const DEFAULT_ABSEN_RADIUS_KM = 2;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function resolveAttendanceLocationLabel(
  workerLat,
  workerLng,
  officeLat,
  officeLng,
  radiusKm = DEFAULT_ABSEN_RADIUS_KM
) {
  const lat = Number(workerLat);
  const lng = Number(workerLng);
  const oLat = Number(officeLat);
  const oLng = Number(officeLng);
  const radius = Number(radiusKm);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(oLat) ||
    !Number.isFinite(oLng) ||
    !Number.isFinite(radius)
  ) {
    return null;
  }

  const km = distanceKm(lat, lng, oLat, oLng);
  return km <= radius ? HEAD_OFFICE_LABEL : OUTSIDE_LABEL;
}
