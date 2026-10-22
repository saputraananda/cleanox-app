/**
 * Font embedding module untuk Cleanox Care Report PDF
 * Handles Poppins font registration dengan fallback ke Helvetica
 *
 * SETUP: Pastikan @fontsource/poppins sudah diinstall
 * npm install @fontsource/poppins
 *
 * Kemudian import di main.js atau layout component:
 * import '@fontsource/poppins/400.css';  // Regular
 * import '@fontsource/poppins/500.css';  // Medium
 * import '@fontsource/poppins/600.css';  // SemiBold
 * import '@fontsource/poppins/700.css';  // Bold
 */

let poppinsBinaryCache = null;

async function loadFontBinary(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

/**
 * Register Poppins font ke jsPDF document
 * Panggil SEKALI sebelum render PDF, bukan berulang kali
 *
 * @param {jsPDF} doc - jsPDF document instance
 * @returns {Promise<boolean>} true jika font berhasil registered, false jika fallback ke Helvetica
 */
export async function registerCareReportFonts(doc) {
  try {
    const fontList = doc.getFontList ? doc.getFontList() : {};
    if (fontList && fontList.Poppins) {
      return true;
    }

    if (!poppinsBinaryCache) {
      const [regular, medium, bold] = await Promise.all([
        loadFontBinary('/fonts/Poppins-Regular.ttf'),
        loadFontBinary('/fonts/Poppins-Medium.ttf'),
        loadFontBinary('/fonts/Poppins-Bold.ttf'),
      ]);
      poppinsBinaryCache = { regular, medium, bold };
    }

    doc.addFileToVFS('Poppins-Regular.ttf', poppinsBinaryCache.regular);
    doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');

    doc.addFileToVFS('Poppins-Medium.ttf', poppinsBinaryCache.medium);
    doc.addFont('Poppins-Medium.ttf', 'Poppins', 'medium');

    doc.addFileToVFS('Poppins-Bold.ttf', poppinsBinaryCache.bold);
    doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');

    return true;
  } catch (err) {
    console.warn('Poppins font embedding failed, using Helvetica fallback:', err);
    return false;
  }
}

/**
 * Get font name dengan fallback
 * @param {string} fontWeight - 'normal' | 'medium' | 'semibold' | 'bold'
 * @returns {string} Font name untuk digunakan di doc.setFont()
 */
export function getFontName(fontWeight = 'normal') {
  const fontMap = {
    normal: 'Poppins',
    regular: 'Poppins',
    medium: 'Poppins',
    semibold: 'Poppins',
    bold: 'Poppins',
  };

  return fontMap[fontWeight] || 'helvetica';
}

/**
 * Get font weight untuk jsPDF
 * @param {string} cssWeight - '400' | '500' | '600' | '700'
 * @returns {string} Weight untuk doc.setFont() second parameter
 */
export function getJsPdfFontWeight(cssWeight = '400') {
  const weightMap = {
    '400': 'normal',
    '500': 'normal', // Poppins medium (jsPDF tidak distinguish 500)
    '600': 'bold',   // Approximate semibold as bold
    '700': 'bold',
  };

  return weightMap[cssWeight] || 'normal';
}

/**
 * Design tokens untuk Care Report PDF
 * Semua nilai font dalam pt (points)
 */
export const CARE_REPORT_FONTS = {
  // Header
  titleMain: { family: 'Poppins', weight: '600', size: 17, charSpace: 0.3 }, // CLEANOX CARE REPORT
  titleSub: { family: 'Poppins', weight: '400', size: 8.5 },                  // Laporan Hasil Layanan

  // Metadata boxes
  metaLabel: { family: 'Poppins', weight: '400', size: 7.5, uppercase: true },
  metaValue: { family: 'Poppins', weight: '400', size: 9.5 },

  // Category pill
  categoryLabel: { family: 'Poppins', weight: '400', size: 8 },
  categoryPill: { family: 'Poppins', weight: '400', size: 7.5 },

  // Section title
  sectionTitle: { family: 'Poppins', weight: '700', size: 12 },

  // Item
  itemLabel: { family: 'Poppins', weight: '400', size: 8 },
  itemTitle: { family: 'Poppins', weight: '600', size: 11 },
  itemSubtitle: { family: 'Poppins', weight: '400', size: 8.5 },

  // Badge
  badgeText: { family: 'Poppins', weight: '700', size: 7, charSpace: 0.3 },

  // Photo placeholder
  photoPlaceholder: { family: 'Poppins', weight: '400', size: 7.5 },

  // Tips
  tipsTitle: { family: 'Poppins', weight: '600', size: 10.5 },
  tipsText: { family: 'Poppins', weight: '400', size: 8.5 },
  tipsNumber: { family: 'Poppins', weight: '700', size: 7 },

  // Footer
  scheduleLabel: { family: 'Poppins', weight: '400', size: 7.2 },
  scheduleMonth: { family: 'Poppins', weight: '700', size: 14 },
  scheduleNote: { family: 'Poppins', weight: '400', size: 7.5 },

  // QR
  qrScanText: { family: 'Poppins', weight: '600', size: 7.8 },
  qrSubText: { family: 'Poppins', weight: '400', size: 7.2 },

  // Closing note
  closingNote: { family: 'Poppins', weight: '400', size: 6.8 },
};

/**
 * Helper untuk set font di PDF dengan fallback
 * @param {jsPDF} doc
 * @param {Object} fontSpec - { family, weight, size, charSpace?, uppercase? }
 */
export function setFont(doc, fontSpec) {
  const { family = 'Poppins', weight = '400', size = 12, charSpace = 0 } = fontSpec;

  try {
    const fontList = doc.getFontList ? doc.getFontList() : {};
    const hasPoppins = Boolean(fontList && fontList.Poppins);
    const fontName = family === 'Poppins' && hasPoppins ? 'Poppins' : 'helvetica';
    const fontStyle = getJsPdfFontWeight(weight);

    doc.setFont(fontName, fontStyle);
    doc.setFontSize(size);
    doc.setCharSpace(charSpace || 0);
  } catch (err) {
    // Fallback to helvetica
    doc.setFont('helvetica', weight === '700' || weight === '600' ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setCharSpace(charSpace || 0);
  }
}
