export const TAKEHOME_STAGE_ORDER = [
  'diambil',
  'dicuci',
  'packing',
  'diantar',
  'pengantaran',
];

export const TAKEHOME_STAGE_LABELS = {
  diambil: 'Diambil',
  dicuci: 'Dicuci',
  packing: 'Packing',
  diantar: 'Diantar',
  pengantaran: 'Pengantaran',
};

export const SERVICE_MODES = ['home_service', 'take_home'];

export function isValidServiceMode(value) {
  return SERVICE_MODES.includes(String(value || '').trim());
}

export function isValidTakehomeStage(stage) {
  return TAKEHOME_STAGE_ORDER.includes(String(stage || '').trim());
}

export function stageColumns(stage) {
  return {
    by: `${stage}_by`,
    at: `${stage}_at`,
    file: `${stage}_photo_file`,
    path: `${stage}_photo_path`,
  };
}

export function parseWorkersJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Array.isArray(value) ? value : [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isStageFilled(row, stage) {
  if (!row || !isValidTakehomeStage(stage)) return false;
  const cols = stageColumns(stage);
  return Boolean(row[cols.at] && row[cols.path]);
}

export function getNextTakehomeStage(row) {
  for (const stage of TAKEHOME_STAGE_ORDER) {
    if (!isStageFilled(row, stage)) return stage;
  }
  return null;
}

export function isAllTakehomeStagesComplete(row) {
  if (!row) return false;
  return TAKEHOME_STAGE_ORDER.every((stage) => isStageFilled(row, stage));
}

export function mapTakehomeProgressDto(row, { photoPathBuilder } = {}) {
  if (!row) return null;

  const stages = TAKEHOME_STAGE_ORDER.map((stage) => {
    const cols = stageColumns(stage);
    const photoFile = row[cols.file] || null;
    const rawPath = row[cols.path] || null;
    const photoPath =
      photoFile && typeof photoPathBuilder === 'function'
        ? photoPathBuilder(photoFile)
        : rawPath;
    return {
      key: stage,
      label: TAKEHOME_STAGE_LABELS[stage],
      filled: isStageFilled(row, stage),
      by: parseWorkersJson(row[cols.by]),
      at: row[cols.at] || null,
      photo_file: photoFile,
      photo_path: photoPath,
    };
  });

  const nextStage = getNextTakehomeStage(row);

  return {
    id: row.id,
    transaction_id: row.transaction_id,
    status: row.status || null,
    next_stage: nextStage,
    all_complete: isAllTakehomeStagesComplete(row),
    stages,
    updated_at: row.updated_at || null,
  };
}

export function normalizeWorkersInput(workers, fallbackWorker = null) {
  let input = workers;

  if (typeof input === 'string' && input.trim()) {
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        input = parsed;
      } catch {
        // keep as comma-separated string below
      }
    }
  }

  if (Array.isArray(input) && input.length > 0) {
    return input
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim();
          if (!name) return null;
          return { employee_id: null, employee_name: name };
        }
        const employeeId = item?.employee_id != null ? Number(item.employee_id) : null;
        const employeeName = String(item?.employee_name || item?.full_name || item?.name || '').trim();
        if (!employeeName) return null;
        return {
          employee_id: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
          employee_name: employeeName,
        };
      })
      .filter(Boolean);
  }

  if (typeof input === 'string' && input.trim()) {
    return input
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((employee_name) => ({ employee_id: null, employee_name }));
  }

  if (fallbackWorker?.employee_name) {
    return [
      {
        employee_id: fallbackWorker.employee_id != null ? Number(fallbackWorker.employee_id) : null,
        employee_name: String(fallbackWorker.employee_name),
      },
    ];
  }

  return [];
}

/** Parse request body workers (array | JSON string | comma names). */
export function parseWorkersBody(raw, fallbackWorker = null) {
  return normalizeWorkersInput(raw, fallbackWorker);
}

export function mergeWorkers(existing, incoming) {
  const current = parseWorkersJson(existing);
  const next = [...current];
  for (const worker of incoming) {
    const already = next.some((item) => {
      if (worker.employee_id && item.employee_id) {
        return Number(item.employee_id) === Number(worker.employee_id);
      }
      return String(item.employee_name || '').toLowerCase() === String(worker.employee_name || '').toLowerCase();
    });
    if (!already) next.push(worker);
  }
  return next;
}

export function stagesFromIndex(startIdx) {
  if (startIdx < 0) return [];
  return TAKEHOME_STAGE_ORDER.slice(startIdx);
}
