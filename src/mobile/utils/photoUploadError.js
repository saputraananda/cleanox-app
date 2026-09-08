const TITLES = {
  task: 'Upload Foto Task Gagal',
  grooming: 'Upload Foto Grooming Gagal',
  'attendance-check-in': 'Absen Masuk Gagal',
  'attendance-check-out': 'Absen Pulang Gagal',
  kebersihan: 'Upload Foto Kebersihan Gagal',
};

const FALLBACKS = {
  task: 'Gagal menyimpan foto evidence. Coba ambil foto lagi.',
  grooming: 'Gagal menyimpan foto grooming. Coba unggah ulang.',
  'attendance-check-in': 'Gagal menyimpan absen masuk. Coba lagi.',
  'attendance-check-out': 'Gagal menyimpan absen pulang. Coba lagi.',
  kebersihan: 'Gagal mengunggah foto kebersihan. Coba unggah ulang.',
};

function buildDescription(categoryLabel, detail, action) {
  return `Jenis: ${categoryLabel}\n\nPenyebab: ${detail}\n\nYang perlu dilakukan: ${action}`;
}

/**
 * @param {unknown} err
 * @param {string} [fallbackDetail]
 * @returns {{ category: string, categoryLabel: string, detail: string, action: string }}
 */
function classifyPhotoUploadError(err, fallbackDetail) {
  const code = err?.code;
  const rawMessage = String(err?.message || '');
  const isTimeout =
    code === 'ECONNABORTED' || rawMessage.toLowerCase().includes('timeout');

  if (isTimeout) {
    return {
      category: 'timeout',
      categoryLabel: 'Koneksi timeout',
      detail: 'Upload terlalu lama / sinyal lemah sehingga waktu tunggu habis.',
      action: 'Periksa sinyal internet, lalu foto ulang atau unggah ulang.',
    };
  }

  if (!err?.response) {
    return {
      category: 'network',
      categoryLabel: 'Masalah jaringan',
      detail: 'Perangkat tidak terhubung ke server (offline atau sinyal putus).',
      action: 'Pastikan koneksi internet aktif, lalu coba unggah lagi.',
    };
  }

  const status = Number(err.response?.status) || 0;
  const serverMessageRaw = err.response?.data?.message;
  const serverMessage =
    typeof serverMessageRaw === 'string' ? serverMessageRaw.trim() : '';

  if (
    (serverMessage && /melebihi\s*5\s*MB/i.test(serverMessage)) ||
    (serverMessage && /LIMIT_FILE_SIZE/i.test(serverMessage)) ||
    status === 413
  ) {
    return {
      category: 'file_size',
      categoryLabel: 'Ukuran foto terlalu besar',
      detail: serverMessage || 'Ukuran foto melebihi batas 5 MB.',
      action: 'Ambil ulang foto (jangan dari galeri file besar), lalu unggah lagi.',
    };
  }

  if (serverMessage && /harus berupa gambar/i.test(serverMessage)) {
    return {
      category: 'file_type',
      categoryLabel: 'Jenis file tidak didukung',
      detail: serverMessage,
      action: 'Ambil foto lewat kamera aplikasi, lalu unggah lagi.',
    };
  }

  if (serverMessage && (/GPS/i.test(serverMessage) || /lokasi/i.test(serverMessage))) {
    return {
      category: 'gps',
      categoryLabel: 'Lokasi GPS diperlukan',
      detail: serverMessage,
      action: 'Aktifkan izin lokasi / GPS, pastikan sinyal GPS didapat, lalu coba lagi.',
    };
  }

  if (serverMessage && status >= 400 && status < 500) {
    return {
      category: 'rule',
      categoryLabel: 'Tidak bisa diproses',
      detail: serverMessage,
      action: 'Ikuti petunjuk di atas, perbaiki dulu, lalu coba lagi.',
    };
  }

  if (status >= 500 || err.response) {
    return {
      category: 'server',
      categoryLabel: 'Gangguan server',
      detail: serverMessage || 'Server gagal menyimpan foto saat ini.',
      action: 'Tunggu sebentar lalu coba unggah lagi. Jika berulang, hubungi admin.',
    };
  }

  return {
    category: 'unknown',
    categoryLabel: 'Upload gagal',
    detail: fallbackDetail || 'Gagal mengunggah foto. Coba lagi.',
    action: 'Coba unggah ulang. Jika tetap gagal, hubungi admin.',
  };
}

/**
 * Map axios/upload error ke title + description yang dikenali worker.
 * @param {unknown} err
 * @param {'task'|'grooming'|'attendance-check-in'|'attendance-check-out'|'kebersihan'} context
 * @returns {{ title: string, description: string, category: string, categoryLabel: string }}
 */
export function resolvePhotoUploadError(err, context) {
  const title = TITLES[context] || 'Upload Foto Gagal';
  const fallback = FALLBACKS[context] || 'Gagal mengunggah foto. Coba lagi.';
  const classified = classifyPhotoUploadError(err, fallback);

  return {
    title,
    description: buildDescription(
      classified.categoryLabel,
      classified.detail,
      classified.action
    ),
    category: classified.category,
    categoryLabel: classified.categoryLabel,
  };
}
