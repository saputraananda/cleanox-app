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

export function buildTotalsSummary({ transaction, gcPending = false, meterPending = false }) {
  const pending = Boolean(gcPending || meterPending);
  return {
    pending,
    rows: [
      { label: 'Subtotal', amount: Number(transaction?.subtotal_amount || 0) },
      { label: 'Diskon', amount: Number(transaction?.discount_amount || 0) },
      { label: 'Biaya Transport', amount: Number(transaction?.transport_fee || 0) },
    ],
    totalLabel: pending ? TEMP_TOTAL_LABEL : 'TOTAL',
    totalAmount: Number(transaction?.final_amount || 0),
    note: getPendingTotalNote({ gcPending, meterPending }),
  };
}
