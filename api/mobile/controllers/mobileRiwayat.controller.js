import cleanoxPool from '../../shared/db/cleanox.js';

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export const listMyRiwayat = async (req, res) => {
  const employeeId = req.user?.id;
  const daysRaw = Number(req.query.days);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? Math.floor(daysRaw) : 30;

  try {
    const items = [];

    const [assignments] = await cleanoxPool.query(
      `SELECT
        a.id,
        a.assignment_status,
        a.responded_at,
        a.started_at,
        a.completed_at,
        a.assignment_note,
        a.recommended_employee_name,
        t.transaction_no,
        t.customer_name
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.employee_id = ?
         AND (
           a.responded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           OR a.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           OR a.completed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         )`,
      [employeeId, days, days, days]
    );

    for (const row of assignments) {
      const customer = row.customer_name || 'Customer';
      const txNo = row.transaction_no || `#${row.id}`;

      if (row.responded_at && row.assignment_status === 'Rejected') {
        items.push({
          id: `task-reject-${row.id}`,
          type: 'task_reject',
          title: 'Task ditolak',
          description: `${txNo} • ${customer}${row.assignment_note ? ` — ${row.assignment_note}` : ''}`,
          occurred_at: toIso(row.responded_at),
          meta: {
            assignment_id: row.id,
            recommended_employee_name: row.recommended_employee_name,
          },
        });
      }

      if (
        row.responded_at &&
        ['In_Schedule', 'On_Progress', 'Done'].includes(row.assignment_status)
      ) {
        items.push({
          id: `task-accept-${row.id}`,
          type: 'task_accept',
          title: 'Task diterima (In Schedule)',
          description: `${txNo} • ${customer}`,
          occurred_at: toIso(row.responded_at),
          meta: { assignment_id: row.id },
        });
      }

      if (row.started_at) {
        items.push({
          id: `task-start-${row.id}`,
          type: 'task_start',
          title: 'Pengerjaan dimulai (On Progress)',
          description: `${txNo} • ${customer}`,
          occurred_at: toIso(row.started_at),
          meta: { assignment_id: row.id },
        });
      }

      if (row.completed_at) {
        items.push({
          id: `task-complete-${row.id}`,
          type: 'task_complete',
          title: 'Pengerjaan selesai (Done)',
          description: `${txNo} • ${customer}`,
          occurred_at: toIso(row.completed_at),
          meta: { assignment_id: row.id },
        });
      }
    }

    const [attendanceRows] = await cleanoxPool.query(
      `SELECT id, check_in_at, check_out_at, attendance_date
       FROM tr_worker_attendance
       WHERE worker_id = ?
         AND (
           check_in_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           OR check_out_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         )`,
      [employeeId, days, days]
    );

    for (const row of attendanceRows) {
      if (row.check_in_at) {
        items.push({
          id: `attendance-in-${row.id}`,
          type: 'attendance_check_in',
          title: 'Absensi check-in',
          description: 'Check-in & foto QC tercatat',
          occurred_at: toIso(row.check_in_at),
          meta: { attendance_id: row.id },
        });
      }
      if (row.check_out_at) {
        items.push({
          id: `attendance-out-${row.id}`,
          type: 'attendance_check_out',
          title: 'Absensi check-out',
          description: 'Check-out tercatat',
          occurred_at: toIso(row.check_out_at),
          meta: { attendance_id: row.id },
        });
      }
    }

    const [kebersihanPhotos] = await cleanoxPool.query(
      `SELECT
        p.id,
        p.uploaded_at,
        a.name AS area_name,
        r.id AS report_id
       FROM tr_worker_kebersihan_photos p
       INNER JOIN tr_worker_kebersihan_reports r ON r.id = p.report_id
       INNER JOIN mst_kebersihan_areas a ON a.id = p.area_id
       WHERE r.worker_id = ?
         AND p.uploaded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [employeeId, days]
    );

    for (const row of kebersihanPhotos) {
      items.push({
        id: `kebersihan-upload-${row.id}`,
        type: 'kebersihan_upload',
        title: 'Foto kebersihan diunggah',
        description: `Area ${row.area_name || '—'}`,
        occurred_at: toIso(row.uploaded_at),
        meta: { photo_id: row.id, report_id: row.report_id },
      });
    }

    const [kebersihanDone] = await cleanoxPool.query(
      `SELECT id, completed_at, report_date
       FROM tr_worker_kebersihan_reports
       WHERE worker_id = ?
         AND status = 'Completed'
         AND completed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [employeeId, days]
    );

    for (const row of kebersihanDone) {
      items.push({
        id: `kebersihan-complete-${row.id}`,
        type: 'kebersihan_complete',
        title: 'Kebersihan selesai',
        description: 'Checklist 4 area hari ini lengkap',
        occurred_at: toIso(row.completed_at),
        meta: { report_id: row.id },
      });
    }

    const [scheduleEvents] = await cleanoxPool.query(
      `SELECT
        e.id,
        e.event_type,
        e.old_service_date,
        e.new_service_date,
        e.message,
        e.created_at,
        e.assignment_id,
        t.transaction_no,
        t.customer_name
       FROM tr_worker_task_events e
       INNER JOIN tr_transactions t ON t.id = e.transaction_id
       WHERE e.employee_id = ?
         AND e.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [employeeId, days]
    );

    for (const row of scheduleEvents) {
      const customer = row.customer_name || 'Customer';
      const txNo = row.transaction_no || `#${row.id}`;
      if (row.event_type === 'reschedule') {
        items.push({
          id: `task-reschedule-${row.id}`,
          type: 'task_reschedule',
          title: 'Jadwal dipindah',
          description: row.message || `${txNo} • ${customer}`,
          occurred_at: toIso(row.created_at),
          meta: {
            assignment_id: row.assignment_id,
            old_service_date: row.old_service_date,
            new_service_date: row.new_service_date,
          },
        });
      } else if (row.event_type === 'cancel') {
        items.push({
          id: `task-cancel-${row.id}`,
          type: 'task_cancel',
          title: 'Task dibatalkan',
          description: row.message || `${txNo} • ${customer}`,
          occurred_at: toIso(row.created_at),
          meta: { assignment_id: row.assignment_id },
        });
      }
    }

    items.sort((a, b) => {
      const ta = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
      const tb = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
      return tb - ta;
    });

    return res.json({ days, items });
  } catch (error) {
    console.error('[mobileRiwayat/listMyRiwayat]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil riwayat aktivitas' });
  }
};
