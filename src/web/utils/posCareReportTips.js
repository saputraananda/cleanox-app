/**
 * Master Tips Perawatan Cleanox Care Report
 * Berisi konfigurasi default (fallback) dan helper deteksi kategori.
 */

export const CARE_REPORT_CATEGORIES = {
  SOFA: 'sofa',
  KASUR: 'kasur',
  KARPET: 'karpet',
  GORDYN: 'gordyn',
  MOBIL: 'mobil',
  BATHROOM: 'bathroom',
  GENERAL: 'general',
  BABY: 'baby',
  SEPATU_TAS: 'sepatu_tas',
};

export const CARE_REPORT_TIPS = {
  [CARE_REPORT_CATEGORIES.SOFA]: {
    category_key: 'sofa',
    label: 'Deep Clean Sofa Kursi',
    itemSubLabel: 'Deep Clean Sofa',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Sofa di Rumah',
    keywords: ['sofa', 'kursi', 'chair', 'sofabed', 'dudukan'],
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
    category_key: 'kasur',
    label: 'Deep Clean Kasur',
    itemSubLabel: 'Deep Clean Kasur',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Kasur di Rumah',
    keywords: ['kasur', 'bed', 'springbed', 'mattress', 'headboard', 'bantal', 'guling'],
    tips: [
      'Pastikan kasur kering sempurna sebelum dipasang sprei kembali.',
      'Ganti dan cuci sprei serta sarung bantal setiap 1–2 minggu.',
      'Gunakan pelindung kasur (mattress protector) agar terhindar dari noda dan cairan.',
      'Buka jendela kamar di pagi hari agar udara segar dan kasur tidak lembap.',
      'Putar posisi kasur (kepala–kaki) setiap 3 bulan agar tidak cepat cekung, jika jenis kasur memungkinkan.',
      'Hindari makan dan minum di atas kasur untuk mencegah noda dan tungau.',
    ],
  },
  [CARE_REPORT_CATEGORIES.KARPET]: {
    category_key: 'karpet',
    label: 'Deep Clean Karpet',
    itemSubLabel: 'Deep Clean Karpet',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Karpet di Rumah',
    keywords: ['karpet', 'carpet', 'rug', 'sajadah'],
    tips: [
      'Jangan langsung diinjak dengan kaki basah sebelum serat karpet kering total.',
      'Vakum karpet 2–3 kali seminggu mengikuti arah serat benang untuk mencegah penumpukan debu.',
      'Lepas alas kaki luar rumah saat melangkah di atas karpet agar tidak membawa kotoran kasar.',
      'Segera bersihkan tumpahan noda dari arah luar ke dalam agar noda tidak menyebar ke serat lain.',
      'Putar posisi karpet setiap 6 bulan agar bagian yang sering diinjak tidak cepat tipis sepihak.',
      'Hindari meletakkan karpet di area yang terlalu lembap agar tidak memicu bau apek dan jamur.',
    ],
  },
  [CARE_REPORT_CATEGORIES.GORDYN]: {
    category_key: 'gordyn',
    label: 'Deep Clean Gordyn',
    itemSubLabel: 'Deep Clean Gordyn',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Gordyn di Rumah',
    keywords: ['gordyn', 'gorden', 'curtain', 'vitrase'],
    tips: [
      'Biarkan jendela sedikit terbuka setelah pencucian agar kain gordyn terangin-anginkan sempurna.',
      'Sedot debu ringan pada lipatan gordyn sebulan sekali menggunakan sikat halus vacuum.',
      'Buka gordyn di siang hari agar sirkulasi udara dan cahaya matahari masuk membunuh bakteri ruangan.',
      'Tarik tali pengait gordyn dengan lembut dan hindari menarik kainnya langsung agar jahitan awet.',
      'Jauhkan tanaman basah atau pendingin udara yang bocor dari kontak langsung dengan kain gordyn.',
      'Lakukan pencucian mendalam berkala minimal 6 bulan sekali untuk mencegah alergi debu.',
    ],
  },
  [CARE_REPORT_CATEGORIES.MOBIL]: {
    category_key: 'mobil',
    label: 'Interior Detailing Mobil',
    itemSubLabel: 'Interior Mobil',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Interior Mobil',
    keywords: ['mobil', 'interior mobil', 'car', 'plafon', 'bagasi', 'trunk'],
    tips: [
      'Biarkan kaca mobil terbuka sedikit selama beberapa jam pertama agar uap lembap cepat keluar.',
      'Bersihkan sampah dan remah makanan di sela jok mobil secara rutin setelah perjalanan.',
      'Gunakan sunshade pada kaca depan saat parkir di tempat terbuka agar jok tidak cepat retak.',
      'Bersihkan karpet dasar mobil dengan vacuum portabel minimal seminggu sekali.',
      'Jika terkena tumpahan cairan berbau, segera lap dan serap sebelum meresap ke dalam busa jok.',
      'Gunakan pengharum mobil beraroma lembut dan hindari bahan kimia cair keras yang merusak jok.',
    ],
  },
  [CARE_REPORT_CATEGORIES.BATHROOM]: {
    category_key: 'bathroom',
    label: 'General Cleaning',
    itemSubLabel: 'General Cleaning',
    itemPrefix: 'Area',
    title: 'Tips Perawatan Kamar Mandi & Toilet',
    keywords: ['toilet', 'kamar mandi', 'bathroom', 'kloset', 'keramik', 'wc'],
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
    category_key: 'general',
    label: 'General Cleaning',
    itemSubLabel: 'General Cleaning',
    itemPrefix: 'Area',
    title: 'Tips Perawatan Rumah Bersih & Sehat',
    keywords: ['general', 'rumah', 'deep cleaning gc', 'bersih'],
    tips: [
      'Bersihkan perabotan secara berkala untuk mencegah penumpukan debu.',
      'Buka ventilasi ruangan setiap pagi untuk menjaga sirkulasi udara segar.',
      'Segera bersihkan tumpahan cairan agar tidak meninggalkan noda membandel.',
      'Gunakan cairan pembersih yang aman bagi keluarga dan hewan peliharaan.',
      'Hindari kelembapan berlebih di ruangan tertutup untuk mencegah jamur.',
      'Jadwalkan pembersihan berkala secara rutin bersama Cleanox.',
    ],
  },
  [CARE_REPORT_CATEGORIES.BABY]: {
    category_key: 'baby',
    label: 'Baby Equipment Care',
    itemSubLabel: 'Peralatan Bayi',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Stroller & Perlengkapan Bayi',
    keywords: ['stroller', 'bayi', 'baby', 'car seat', 'baby box'],
    tips: [
      'Pastikan kain stroller dan car seat benar-benar kering sebelum digunakan kembali oleh si kecil.',
      'Bersihkan remah camilan dan sisa susu dari lipatan kursi stroller setelah bepergian.',
      'Gunakan cairan pembersih berbahan food grade atau ramah bayi saat membersihkan tray makanan.',
      'Simpan stroller di tempat yang kering dan tertutup agar tidak terkena debu saat tidak digunakan.',
      'Hindari meninggalkan stroller di bagasi mobil yang panas dalam waktu lama.',
      'Lakukan deep cleaning dan sanitasi berkala secara rutin demi kesehatan kulit sensitif si kecil.',
    ],
  },
  [CARE_REPORT_CATEGORIES.SEPATU_TAS]: {
    category_key: 'sepatu_tas',
    label: 'Shoes & Bag Care',
    itemSubLabel: 'Sepatu / Tas',
    itemPrefix: 'Item',
    title: 'Tips Perawatan Sepatu & Tas',
    keywords: ['sepatu', 'tas', 'koper', 'bag', 'shoes', 'sneakers', 'leather'],
    tips: [
      'Angin-anginkan sepatu atau tas setelah dipakai, jangan langsung dimasukkan ke tempat tertutup.',
      'Gunakan silica gel di dalam lemari atau kotak penyimpanan untuk mencegah tumbuhnya jamur.',
      'Untuk bahan kulit (leather), gunakan lotion/pelembap khusus kulit secara berkala agar tidak pecah.',
      'Hindari menjemur langsung di bawah terik matahari terik agar warna tidak memudar.',
      'Gunakan bantalan penyangga (bag pillow/shoe tree) agar bentuk tas atau sepatu tetap tegak.',
      'Sikat debu kering menggunakan sikat berbulu halus setelah beraktivitas luar ruangan.',
    ],
  },
};

/**
 * Mendeteksi kategori tips terbaik berdasarkan nama layanan / item yang ada.
 * Mendukung masterTipsList dari database secara dinamis.
 *
 * @param {Array} items - List items dari transaksi
 * @param {Array|null} masterTipsList - List master tips dari API (opsional)
 * @returns {string} categoryKey
 */
export function detectReportCategory(items = [], masterTipsList = null) {
  const allNames = items
    .map((item) => `${item.service_name || ''} ${item.category_name || ''}`)
    .join(' ')
    .toLowerCase();

  // 1. Jika ada daftar tips dinamis dari database, gunakan keywords dari database
  if (Array.isArray(masterTipsList) && masterTipsList.length > 0) {
    for (const cat of masterTipsList) {
      const keywords = Array.isArray(cat.keywords)
        ? cat.keywords
        : typeof cat.keywords === 'string'
        ? JSON.parse(cat.keywords || '[]')
        : [];

      for (const kw of keywords) {
        if (kw && allNames.includes(String(kw).toLowerCase())) {
          return cat.category_key;
        }
      }
    }
  }

  // 2. Fallback jika masterTipsList belum dimuat / menggunakan data lokal
  const fallbackCategories = Object.values(CARE_REPORT_TIPS);
  for (const cat of fallbackCategories) {
    if (cat.category_key === CARE_REPORT_CATEGORIES.GENERAL) continue;
    for (const kw of cat.keywords || []) {
      if (allNames.includes(kw)) {
        return cat.category_key;
      }
    }
  }

  return CARE_REPORT_CATEGORIES.GENERAL;
}
