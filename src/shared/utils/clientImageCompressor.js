/**
 * Client-side image compression utility using HTML5 Canvas.
 * Compresses and resizes images in the browser before uploading to the server,
 * avoiding the need for heavy server-side image processing libraries like Sharp.
 */

export async function compressImageClient(file, options = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.85,
    maxSizeBytes = 2 * 1024 * 1024, // 2 MB max
    mimeType = 'image/jpeg',
  } = options;

  if (!file || !(file instanceof Blob)) {
    return file;
  }

  // If not an image (e.g., pdf or doc), return untouched
  if (file.type && !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file); // Fallback to original on error
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = () => resolve(file); // Fallback to original on error
      img.onload = () => {
        let { width, height } = img;

        // Calculate aspect ratio scale
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let currentQuality = quality;
        const tryExport = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }

              if (blob.size <= maxSizeBytes || currentQuality <= 0.4) {
                const baseName = (file.name || 'image').replace(/\.[^/.]+$/, '');
                const ext = mimeType === 'image/webp' ? '.webp' : '.jpg';
                const outputName = `${baseName}${ext}`;
                const resultFile = new File([blob], outputName, {
                  type: mimeType,
                  lastModified: Date.now(),
                });
                resolve(resultFile);
              } else {
                currentQuality -= 0.1;
                tryExport();
              }
            },
            mimeType,
            currentQuality
          );
        };

        tryExport();
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}
