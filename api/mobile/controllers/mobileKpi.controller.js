import cleanoxPool from '../../shared/db/cleanox.js';
import { getActiveCutoffPeriod, cutoffStart, cutoffEnd } from '../../shared/utils/posCutoffPeriod.js';

const TARGET_HOURS_PER_MONTH = 208;
const DURATION_PICKUP_MENIT = 30;
const DURATION_PENGANTARAN_MENIT = 30;
const DEFAULT_CUCI_JEMUR_MENIT = 45;
const DEFAULT_PACKING_MENIT = 15;
const DEFAULT_TOTAL_MENIT = 45;

/**
 * GET /api/mobile-tasks/my-kpi
 * Menghitung akumulasi jam kerja teknisi (mobile worker) terhadap target 208 jam/bulan
 */
export const getMyKpi = async (req, res) => {
  try {
    const employeeId = req.user?.id;
    const employeeName = req.user?.name || '';
    if (!employeeId) {
      return res.status(401).json({ message: 'User tidak terotentikasi' });
    }

    // Resolve periode cutoff
    const reqYear = req.query.year ? Number(req.query.year) : null;
    const reqMonth = req.query.month ? Number(req.query.month) : null;
    let yr;
    let mo;
    if (reqYear && reqMonth) {
      yr = reqYear;
      mo = reqMonth;
    } else {
      const active = getActiveCutoffPeriod();
      yr = active.yr;
      mo = active.mo;
    }

    const dateStart = cutoffStart(yr, mo);
    const dateEnd = cutoffEnd(yr, mo);

    // 1. Lookup durasi layanan dari mst_services
    const [serviceRows] = await cleanoxPool.query(
      `SELECT id, name, durasi_cuci_menit, durasi_jemur_menit, durasi_packing_menit, durasi_blower_menit, total_durasi_kerja_menit
       FROM mst_services`
    );
    const serviceById = new Map();
    const serviceByName = new Map();
    for (const s of serviceRows) {
      serviceById.set(s.id, s);
      serviceByName.set(String(s.name || '').toLowerCase().trim(), s);
    }

    // 2. Query Cleanox Only assignments (Home Service & Take Home)
    const [cleanoxTasks] = await cleanoxPool.query(
      `SELECT
        a.id AS assignment_id,
        a.assignment_status,
        a.completed_at,
        t.id AS transaction_id,
        t.transaction_no,
        t.service_date,
        t.service_mode,
        ti.id AS item_id,
        ti.service_id,
        ti.qty,
        s.name AS service_name,
        s.durasi_cuci_menit,
        s.durasi_jemur_menit,
        s.durasi_packing_menit,
        s.durasi_blower_menit,
        s.total_durasi_kerja_menit
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       INNER JOIN tr_transaction_items ti ON ti.transaction_id = t.id
       LEFT JOIN mst_services s ON s.id = ti.service_id
       WHERE a.employee_id = ?
         AND (
           (t.service_date >= ? AND t.service_date <= ?)
           OR (a.completed_at >= ? AND a.completed_at <= ?)
         )
         AND a.assignment_status IN ('Done', 'Completed', 'In_Schedule', 'On_Progress')`,
      [employeeId, dateStart, dateEnd, dateStart, `${dateEnd} 23:59:59`]
    );

    let cleanoxMinutes = 0;
    const countedItemIds = new Set();

    for (const row of cleanoxTasks) {
      const itemKey = `${row.assignment_id}_${row.item_id}`;
      if (countedItemIds.has(itemKey)) continue;
      countedItemIds.add(itemKey);

      let dur = 0;
      if (row.total_durasi_kerja_menit != null && row.total_durasi_kerja_menit > 0) {
        dur = Number(row.total_durasi_kerja_menit);
      } else {
        const c = Number(row.durasi_cuci_menit) || 0;
        const j = Number(row.durasi_jemur_menit) || 0;
        const p = Number(row.durasi_packing_menit) || 0;
        const b = Number(row.durasi_blower_menit) || 0;
        dur = c + j + p + b;
      }
      if (dur === 0) dur = DEFAULT_TOTAL_MENIT;

      cleanoxMinutes += dur;
    }

    // 3. Query Waschen production (jika nama cocok)
    let waschenMinutes = 0;
    let waschenItemsCount = 0;
    if (employeeName && employeeName.trim()) {
      const escapedName = `%${employeeName.trim()}%`;
      const [waschenRows] = await cleanoxPool.query(
        `SELECT
          id,
          no_nota,
          nama_item,
          pickup_by,
          pickup_at,
          cuci_jemur_by,
          cuci_jemur_at,
          packing_by,
          packing_at,
          pengantaran_by,
          pengantaran_at,
          tgl_terima
         FROM tr_rekap_transaksi_reguler_waschen
         WHERE (
           (pickup_at >= ? AND pickup_at <= ?)
           OR (cuci_jemur_at >= ? AND cuci_jemur_at <= ?)
           OR (packing_at >= ? AND packing_at <= ?)
           OR (pengantaran_at >= ? AND pengantaran_at <= ?)
           OR (tgl_terima >= ? AND tgl_terima <= ?)
         )
         AND (
           pickup_by LIKE ?
           OR cuci_jemur_by LIKE ?
           OR packing_by LIKE ?
           OR pengantaran_by LIKE ?
         )`,
        [
          dateStart, `${dateEnd} 23:59:59`,
          dateStart, `${dateEnd} 23:59:59`,
          dateStart, `${dateEnd} 23:59:59`,
          dateStart, `${dateEnd} 23:59:59`,
          dateStart, dateEnd,
          escapedName, escapedName, escapedName, escapedName
        ]
      );

      for (const row of waschenRows) {
        let isMatched = false;
        const s = serviceByName.get(String(row.nama_item || '').toLowerCase().trim()) || null;

        const pPickup = String(row.pickup_by || '').toLowerCase();
        const pCuciJemur = String(row.cuci_jemur_by || '').toLowerCase();
        const pPacking = String(row.packing_by || '').toLowerCase();
        const pPengantaran = String(row.pengantaran_by || '').toLowerCase();
        const empLower = employeeName.toLowerCase().trim();

        if (pPickup.includes(empLower)) {
          waschenMinutes += DURATION_PICKUP_MENIT;
          isMatched = true;
        }
        if (pCuciJemur.includes(empLower)) {
          const cuciMenit = s?.durasi_cuci_menit != null ? Number(s.durasi_cuci_menit) : 30;
          const jemurMenit = s?.durasi_jemur_menit != null ? Number(s.durasi_jemur_menit) : 15;
          waschenMinutes += (cuciMenit + jemurMenit) || DEFAULT_CUCI_JEMUR_MENIT;
          isMatched = true;
        }
        if (pPacking.includes(empLower)) {
          const packingMenit = s?.durasi_packing_menit != null ? Number(s.durasi_packing_menit) : DEFAULT_PACKING_MENIT;
          waschenMinutes += packingMenit;
          isMatched = true;
        }
        if (pPengantaran.includes(empLower)) {
          waschenMinutes += DURATION_PENGANTARAN_MENIT;
          isMatched = true;
        }

        if (isMatched) waschenItemsCount += 1;
      }
    }

    const totalMinutes = cleanoxMinutes + waschenMinutes;
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    const achievementPct = Math.round((totalHours / TARGET_HOURS_PER_MONTH) * 1000) / 10;

    return res.json({
      success: true,
      kpi: {
        worker: {
          id: employeeId,
          name: employeeName,
        },
        period: {
          year: yr,
          month: mo,
          date_start: dateStart,
          date_end: dateEnd,
        },
        target_hours: TARGET_HOURS_PER_MONTH,
        total_minutes: totalMinutes,
        total_hours: totalHours,
        achievement_pct: achievementPct,
        remaining_hours: Math.max(0, Math.round((TARGET_HOURS_PER_MONTH - totalHours) * 10) / 10),
        breakdown: {
          cleanox_only: {
            minutes: cleanoxMinutes,
            hours: Math.round((cleanoxMinutes / 60) * 10) / 10,
            tasks_count: cleanoxTasks.length,
          },
          waschen: {
            minutes: waschenMinutes,
            hours: Math.round((waschenMinutes / 60) * 10) / 10,
            items_count: waschenItemsCount,
          },
        },
      },
    });
  } catch (err) {
    console.error('Error in getMyKpi:', err);
    return res.status(500).json({ message: err.message || 'Gagal memuat KPI' });
  }
};
