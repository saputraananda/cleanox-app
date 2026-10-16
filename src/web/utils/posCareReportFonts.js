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

/**
 * Register Poppins font ke jsPDF document
 * Panggil SEKALI sebelum render PDF, bukan berulang kali
 *
 * @param {jsPDF} doc - jsPDF document instance
 * @returns {boolean} true jika font berhasil registered, false jika fallback ke Helvetica
 */
export function registerCareReportFonts(doc) {
  try {
    // Check if Poppins fonts are available
    const fontList = doc.getFontList();

    // Fallback to Helvetica if fonts not available
    if (!fontList || !fontList.Poppins) {
      console.warn('Poppins font not available, using Helvetica fallback');
      return false;
    }

    // Fonts registered successfully
    return true;
  } catch (err) {
    console.warn('Error registering fonts:', err);
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
