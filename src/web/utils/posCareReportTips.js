/**
 * Master Tips Perawatan Cleanox Care Report
 */

export const CARE_REPORT_CATEGORIES = {
  SOFA: 'sofa',
  KASUR: 'kasur',
  BATHROOM: 'bathroom',
  GENERAL: 'general',
};

export const CARE_REPORT_TIPS = {
  [CARE_REPORT_CATEGORIES.SOFA]: {
    label: 'Deep Clean Sofa Kursi',          // Label untuk pill kategori
    itemSubLabel: 'Deep Clean Sofa',         // Sublabel untuk item (berbeda dari label)
    itemPrefix: 'Item',                      // Prefix "Item n" atau "Area n"
    title: 'Tips Perawatan Sofa di Rumah',
    tips: [
      'Jangan duduki sofa sebelum benar-benar kering. Ikuti estimasi waktu kering dari teknisi.',
      'Buka jendela atau nyalakan kipas agar sirkulasi udara lancar dan sofa tidak lembap.',
      'Vakum permukaan sofa seminggu sekali untuk mengangkat debu dan remah makanan.',
      'Ada tumpahan? Segera tekan dengan kain bersih. Jangan digosok agar noda tidak melebar.',
      'Hindari sinar matahari langsung terlalu lama agar warna kain tidak cepat pudar.',
      'Gunakan alas atau cover saat makan di sofa atau jika ada hewan peliharaan.',
    ],
  },
  [CARE_REPORT_CATEGORIES.KASUR]: {
    label: 'Deep Clean Kasur',
    itemSubLabel: 'Deep Clean Kasur',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Kasur di Rumah',
    tips: [
      'Pastikan kasur kering sempurna sebelum dipasang sprei kembali.',
      'Ganti dan cuci sprei serta sarung bantal setiap 1–2 minggu.',
      'Gunakan pelindung kasur (mattress protector) agar terhindar dari noda dan cairan.',
      'Buka jendela kamar di pagi hari agar udara segar dan kasur tidak lembap.',
      'Putar posisi kasur (kepala–kaki) setiap 3 bulan agar tidak cepat cekung, jika jenis kasur memungkinkan.',
      'Hindari makan dan minum di atas kasur untuk mencegah noda dan tungau.',
    ],
  },
  [CARE_REPORT_CATEGORIES.BATHROOM]: {
    label: 'General Cleaning',
    itemSubLabel: 'General Cleaning',
    itemPrefix: 'Area',                      // Perbedaan: gunakan "Area" bukan "Item"
    title: 'Tips Perawatan Kamar Mandi & Toilet',
    tips: [
      'Keringkan lantai setelah dipakai agar tidak licin dan tidak mudah berjamur.',
      'Sikat kloset dan wastafel minimal seminggu sekali.',
      'Buka ventilasi atau nyalakan exhaust fan agar kamar mandi tidak lembap.',
      'Bersihkan nat keramik secara rutin agar tidak menghitam.',
      'Jangan mencampur pembersih yang berbeda, misalnya pemutih dengan pembersih asam, karena berbahaya.',
      'Ganti atau cuci keset kamar mandi secara berkala.',
    ],
  },
  [CARE_REPORT_CATEGORIES.GENERAL]: {
    label: 'General Cleaning',
    itemSubLabel: 'General Cleaning',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Rumah Bersih & Sehat',
    tips: [
      'Bersihkan perabotan secara berkala untuk mencegah penumpukan debu.',
      'Buka ventilasi ruangan setiap pagi untuk menjaga sirkulasi udara segar.',
      'Segera bersihkan tumpahan cairan agar tidak meninggalkan noda membandel.',
      'Gunakan cairan pembersih yang aman bagi keluarga dan hewan peliharaan.',
      'Hindari kelembapan berlebih di ruangan tertutup untuk mencegah jamur.',
      'Jadwalkan pembersihan berkala secara rutin bersama Cleanox.',
    ],
  },
};

/**
 * Mendeteksi kategori tips terbaik berdasarkan nama layanan / item yang ada
 */
export function detectReportCategory(items = []) {
  const allNames = items
    .map((item) => `${item.service_name || ''} ${item.category_name || ''}`)
    .join(' ')
    .toLowerCase();

  if (allNames.includes('sofa') || allNames.includes('kursi') || allNames.includes('chair')) {
    return CARE_REPORT_CATEGORIES.SOFA;
  }
  if (allNames.includes('kasur') || allNames.includes('springbed') || allNames.includes('mattress') || allNames.includes('bed')) {
    return CARE_REPORT_CATEGORIES.KASUR;
  }
  if (allNames.includes('toilet') || allNames.includes('kamar mandi') || allNames.includes('bathroom') || allNames.includes('kloset')) {
    return CARE_REPORT_CATEGORIES.BATHROOM;
  }
  return CARE_REPORT_CATEGORIES.GENERAL;
}
