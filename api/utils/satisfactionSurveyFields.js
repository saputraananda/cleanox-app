/**
 * Survey field constants aligned with satisfaction-cleanox (layanan.php / csat.php / nps.php / feedback.php).
 * Keep in sync manually with src/utils/satisfactionSurveyFields.js and the PHP app.
 */

export const SURVEY_LAYANAN_OPTIONS = [
  'DeepCleaning Bed',
  'General Cleaning',
  'FastCleaning Bed',
  'Sofa Kain Standar',
  'Sofa Kulit Jumbo',
  'Sofa Kain Jumbo',
  'Sofa Kulit Standar',
  'Sofabed Kain',
  'Sofabed Lipat Kain',
  'Sofabed Kulit',
  'Sofabed Lipat Kulit',
  'Karpet',
  'Kursi Kulit',
  'Kursi Kain',
  'Full-Interior Car Cleaning',
  'Kursi Mobil Kain',
  'Kursi Mobil Kulit',
];

export const CSAT_LABELS = {
  1: 'Sangat Tidak Puas',
  2: 'Tidak Puas',
  3: 'Biasa Saja',
  4: 'Puas',
  5: 'Sangat Puas',
};

export const SURVEY_FEEDBACK_TAGS = [
  'Edukasi Teknisi',
  'Kerapihan Pengerjaan',
  'Komunikasi Tim',
  'Respons Admin',
  'Penanganan Keluhan',
  'Hasil Akhir Pembersihan',
  'Detail Pengerjaan',
  'Profesionalitas Tim',
  'Ketelitian Kerja',
];

export const SURVEY_FEEDBACK_TEXT_MAX = 2000;

export function npsCategoryFromScore(score) {
  const n = Number(score);
  if (!Number.isInteger(n) || n < 0 || n > 10) return null;
  if (n <= 6) return 'Detractor';
  if (n <= 8) return 'Passive';
  return 'Promoter';
}

export function csatLabelFromScore(score) {
  const n = Number(score);
  return CSAT_LABELS[n] || null;
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeLayananList(value) {
  const seen = new Set();
  const clean = [];
  for (const item of toList(value)) {
    if (!SURVEY_LAYANAN_OPTIONS.includes(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    clean.push(item);
  }
  return clean;
}

export function normalizeTagsList(value) {
  const seen = new Set();
  const clean = [];
  for (const item of toList(value)) {
    if (!SURVEY_FEEDBACK_TAGS.includes(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    clean.push(item);
  }
  return clean;
}

export function joinSurveyList(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.join(', ');
}

export function normalizeFeedbackText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.length > SURVEY_FEEDBACK_TEXT_MAX
    ? text.slice(0, SURVEY_FEEDBACK_TEXT_MAX)
    : text;
}
