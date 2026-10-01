export const TEMP_TOTAL_LABEL = 'Total Sementara';
export const PENDING_GC_NOTE = '+ GC Menyesuaikan total jam pengerjaan';
export const PENDING_METER_NOTE = '+ Menyesuaikan total ukuran meter';
export const PENDING_GC_METER_NOTE = '+ GC menyesuaikan jam & ukuran meter';

/** @returns {string|null} */
export function getPendingTotalNote({ gcPending = false, meterPending = false } = {}) {
  if (gcPending && meterPending) return PENDING_GC_METER_NOTE;
  if (gcPending) return PENDING_GC_NOTE;
  if (meterPending) return PENDING_METER_NOTE;
  return null;
}
