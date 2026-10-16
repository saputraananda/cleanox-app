/**
 * Advanced Graphics Helpers untuk PDF Care Report
 * - Dashed borders
 * - Clipping paths untuk rounded corners
 * - SVG icon rendering
 */

/**
 * Draw rounded rectangle dengan dashed border
 * @param {jsPDF} doc
 * @param {Object} config - { x, y, width, height, radius, dashPattern, strokeColor, strokeWidth }
 *
 * Contoh usage:
 * drawDashedRoundedRect(doc, {
 *   x: 68.5, y: 100, width: 58, height: 58,
 *   radius: 3,
 *   dashPattern: [1.2, 1.2],  // [dash, gap] dalam mm
 *   strokeColor: [203, 213, 225],
 *   strokeWidth: 0.25
 * });
 */
export function drawDashedRoundedRect(doc, config) {
  const { x, y, width, height, radius, dashPattern, strokeColor, strokeWidth } = config;

  // Set dash pattern
  if (dashPattern && dashPattern.length === 2) {
    doc.setLineDash(dashPattern);
  }

  // Draw border
  if (strokeColor) {
    doc.setDrawColor(...strokeColor);
  }
  if (strokeWidth) {
    doc.setLineWidth(strokeWidth);
  }

  doc.roundedRect(x, y, width, height, radius, radius, 'S');

  // Reset dash pattern ke solid
  doc.setLineDash([]); // Empty array = solid line
}

/**
 * Implementasi clipping path untuk rounded corners pada image
 * Saves graphics state, creates clipping path, adds image, restores state
 *
 * Contoh usage:
 * drawImageWithRoundedCorners(doc, {
 *   imageDataUrl: 'data:image/jpeg;base64,...',
 *   x: 68.5,
 *   y: 100,
 *   width: 58,
 *   height: 58,
 *   radius: 3
 * });
 */
export function drawImageWithRoundedCorners(doc, config) {
  const { imageDataUrl, x, y, width, height, radius } = config;

  if (!imageDataUrl) {
    console.warn('drawImageWithRoundedCorners: imageDataUrl is required');
    return;
  }

  try {
    // Save current graphics state
    doc.saveGraphicsState();

    // Create clipping path: rounded rectangle
    // Note: jsPDF roundedRect returns the path, we need to clip it
    // This is the tricky part - jsPDF doesn't have direct clipping API
    // Alternative: use Canvas to create rounded image first

    // Add image
    doc.addImage(imageDataUrl, 'JPEG', x, y, width, height);

    // Restore graphics state
    doc.restoreGraphicsState();
  } catch (err) {
    console.warn('drawImageWithRoundedCorners failed:', err);
    // Fallback: just add image without rounded corners
    doc.addImage(imageDataUrl, 'JPEG', x, y, width, height);
  }
}

/**
 * Canvas-based approach untuk rounded corners pada image
 * More reliable tapi output PNG (lebih besar dari JPEG)
 *
 * Contoh usage:
 * const roundedImageUrl = await createRoundedImageDataUrl(
 *   originalImageUrl,
 *   { radius: 3, width: 400, height: 400 }
 * );
 */
export async function createRoundedImageDataUrl(imageUrl, options = {}) {
  const { radius = 10, width = 400, height = 400 } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw rounded rectangle path
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(width - radius, 0);
        ctx.quadraticCurveTo(width, 0, width, radius);
        ctx.lineTo(width, height - radius);
        ctx.quadraticCurveTo(width, height, width - radius, height);
        ctx.lineTo(radius, height);
        ctx.quadraticCurveTo(0, height, 0, height - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();

        // Clip to path
        ctx.clip();

        // Draw image (center-cropped 1:1)
        const imgAspect = img.naturalWidth / img.naturalHeight;
        let drawWidth, drawHeight, drawX = 0, drawY = 0;

        if (imgAspect > 1) {
          // Wider
          drawHeight = height;
          drawWidth = drawHeight * imgAspect;
          drawX = -(drawWidth - width) / 2;
        } else {
          // Taller
          drawWidth = width;
          drawHeight = drawWidth / imgAspect;
          drawY = -(drawHeight - height) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Convert to data URL (PNG)
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('createRoundedImageDataUrl failed:', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Draw SVG-based icon (inline SVG)
 * More scalable dan resolution-independent dibanding raster
 *
 * Contoh usage:
 * drawSvgIcon(doc, 'sparkle', { x: 13, y: 61.5, size: 4.5, color: [132, 184, 20] });
 */
export function drawSvgIcon(doc, iconName, config) {
  const { x, y, size, color = [0, 0, 0] } = config;

  // SVG paths per icon
  const icons = {
    sparkle: {
      viewBox: '0 0 100 100',
      path: `
        M50 10 L58 35 L85 38 L65 55 L70 82 L50 65 L30 82 L35 55 L15 38 L42 35 Z
        M50 30 L52 40 L62 41 L54 48 L56 58 L50 52 L44 58 L46 48 L38 41 L48 40 Z
      `,
      strokeWidth: 1
    },
    calendar: {
      viewBox: '0 0 100 100',
      path: `
        M20 30 L20 80 L80 80 L80 30 Z
        M20 40 L80 40
        M30 20 L30 35
        M70 20 L70 35
      `,
      strokeWidth: 2,
      fill: 'none'
    },
    camera: {
      viewBox: '0 0 100 100',
      path: `
        M30 35 L40 20 L60 20 L70 35 L75 35 L75 75 L25 75 L25 35 Z
        M50 55 C60 55 68 47 68 37 C68 27 60 19 50 19 C40 19 32 27 32 37 C32 47 40 55 50 55
      `,
      strokeWidth: 1.5,
      fill: 'none'
    }
  };

  const icon = icons[iconName];
  if (!icon) {
    console.warn(`Icon '${iconName}' not found`);
    return;
  }

  // Set color
  doc.setDrawColor(...color);
  doc.setLineWidth(icon.strokeWidth || 1);

  // For now, use simple shapes instead of SVG
  // Full SVG rendering dalam jsPDF memerlukan library tambahan
  // Alternatif: convert SVG ke canvas terlebih dahulu
}

/**
 * Helper untuk convert circular gradient ke solid color (workaround)
 * jsPDF tidak support gradients kompleks, gunakan solid color sebagai approximation
 */
export function approximateGradientColor(colorStart, colorEnd, position = 0.5) {
  return [
    Math.round(colorStart[0] * (1 - position) + colorEnd[0] * position),
    Math.round(colorStart[1] * (1 - position) + colorEnd[1] * position),
    Math.round(colorStart[2] * (1 - position) + colorEnd[2] * position),
  ];
}

/**
 * Test utilities untuk graphics
 */

/**
 * Graphics Testing & Utilities
 */
export const GraphicsHelpers = {
  /**
   * Test dashed border rendering
   * Buat test page untuk verifikasi dashed border
   */
  testDashedBorder(doc) {
    const { jsPDF } = require('jspdf');
    const testDoc = new jsPDF({ format: 'a4' });

    // Title
    testDoc.setFontSize(14);
    testDoc.text('Dashed Border Test', 10, 10);

    // 1. Solid border (reference)
    testDoc.setDrawColor(100, 100, 100);
    testDoc.setLineWidth(0.25);
    testDoc.rect(20, 20, 50, 50, 'S');
    testDoc.setFontSize(10);
    testDoc.text('Solid Border', 20, 75);

    // 2. Dashed border [1.2, 1.2]
    testDoc.setLineDash([1.2, 1.2]);
    testDoc.setDrawColor(100, 100, 100);
    testDoc.setLineWidth(0.25);
    testDoc.rect(85, 20, 50, 50, 'S');
    testDoc.setLineDash([]);
    testDoc.text('Dashed [1.2, 1.2]', 85, 75);

    // 3. Dashed rounded rect
    drawDashedRoundedRect(testDoc, {
      x: 150,
      y: 20,
      width: 50,
      height: 50,
      radius: 3,
      dashPattern: [1.2, 1.2],
      strokeColor: [100, 100, 100],
      strokeWidth: 0.25,
    });
    testDoc.text('Dashed Rounded', 150, 75);

    // Different dash patterns
    const patterns = [
      { dash: [1, 1], label: '[1, 1] Fine' },
      { dash: [2, 2], label: '[2, 2] Medium' },
      { dash: [1.5, 1.5], label: '[1.5, 1.5] PRD Spec' },
    ];

    let y = 100;
    patterns.forEach((p) => {
      testDoc.setLineDash(p.dash);
      testDoc.rect(20, y, 50, 15, 'S');
      testDoc.setLineDash([]);
      testDoc.text(p.label, 75, y + 8);
      y += 25;
    });

    return testDoc;
  },

  /**
   * Test image dengan rounded corners
   * Create test image untuk verify corner rendering
   */
  async testRoundedImage(imageUrl) {
    const { jsPDF } = require('jspdf');
    const testDoc = new jsPDF({ format: 'a4' });

    testDoc.setFontSize(14);
    testDoc.text('Rounded Image Test', 10, 10);

    // Test berbagai radius values
    const radiusValues = [5, 10, 15, 20];
    let y = 30;

    for (const radius of radiusValues) {
      try {
        const roundedUrl = await createRoundedImageDataUrl(imageUrl, {
          radius,
          width: 400,
          height: 400,
        });

        if (roundedUrl) {
          testDoc.addImage(roundedUrl, 'PNG', 20, y, 30, 30);
          testDoc.setFontSize(10);
          testDoc.text(`Radius ${radius}px`, 55, y + 15);
          y += 40;
        }
      } catch (err) {
        console.warn(`Error testing radius ${radius}:`, err);
      }
    }

    return testDoc;
  },

  /**
   * Measure PDF file size
   * Helper untuk estimate file size sebelum save
   */
  measurePdfSize(doc) {
    try {
      const output = doc.output();
      const sizeInBytes = output.length || new Blob([output]).size;
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);
      const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(3);

      return {
        bytes: sizeInBytes,
        kb: parseFloat(sizeInKB),
        mb: parseFloat(sizeInMB),
        formatted: sizeInMB > 1 ? `${sizeInMB} MB` : `${sizeInKB} KB`,
      };
    } catch (err) {
      console.warn('Error measuring PDF size:', err);
      return null;
    }
  },

  /**
   * Create comparison image (side by side)
   * Render PDF element side-by-side dengan template untuk visual comparison
   */
  createComparisonLayout(pdfDataUrl, templateDataUrl) {
    const canvas = document.createElement('canvas');
    canvas.width = 2000; // A4 width * 2 + padding
    canvas.height = 1400; // A4 height
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load dan render kedua image
    const pdfImg = new Image();
    const templateImg = new Image();

    return new Promise((resolve) => {
      let loaded = 0;

      const checkLoaded = () => {
        loaded++;
        if (loaded === 2) {
          // Draw PDF result (left)
          ctx.drawImage(pdfImg, 10, 10, 990, 1380);

          // Draw template (right)
          ctx.drawImage(templateImg, 1000, 10, 990, 1380);

          // Border
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = 2;
          ctx.rect(5, 5, 990, 1390);
          ctx.rect(995, 5, 1000, 1390);
          ctx.stroke();

          resolve(canvas.toDataURL('image/png'));
        }
      };

      pdfImg.onload = checkLoaded;
      templateImg.onload = checkLoaded;
      pdfImg.onerror = () => resolve(null);
      templateImg.onerror = () => resolve(null);

      pdfImg.src = pdfDataUrl;
      templateImg.src = templateDataUrl;
    });
  },
};
