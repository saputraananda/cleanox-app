import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function formatStamp(date) {
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatCoord(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toFixed(5);
}

function LiveTimestamp({ align = 'right' }) {
  const [ts, setTs] = useState(() => formatStamp(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTs(formatStamp(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  if (align === 'left') {
    return (
      <div
        className="absolute left-3 bottom-3 px-2.5 py-1.5 rounded-xl text-white pointer-events-none select-none"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <div className="text-[11px] font-extrabold">{ts}</div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-[6px] bg-black/55 text-white text-[12px] font-mono font-bold pointer-events-none select-none">
      {ts}
    </div>
  );
}

/**
 * In-browser take-photo modal with burned-in timestamp.
 * variant="ikm" → white portrait sheet (Absensi); default → dark 4/3 shutter UI.
 * Optional GPS via includeLocation → onCapture(file, meta?).
 * locationDisplayMode="label" → overlay/burn uses resolveLocationLabel instead of coords.
 */
export default function MobileCameraCapture({
  open,
  title = 'Ambil Foto',
  onCapture,
  onClose,
  initialFacingMode = 'environment',
  includeLocation = false,
  variant = 'default',
  confirmLabel = 'Ambil Foto',
  locationDisplayMode = 'coords',
  resolveLocationLabel = null,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [camError, setCamError] = useState(null);
  const [facingMode, setFacingMode] = useState(initialFacingMode);
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [gpsMeta, setGpsMeta] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const isIkm = variant === 'ikm';
  const useLocationLabel = includeLocation && locationDisplayMode === 'label';

  useEffect(() => {
    if (!open) return undefined;

    setFacingMode(initialFacingMode);
    setReady(false);
    setCamError(null);
    setGpsStatus(includeLocation ? 'loading' : 'idle');
    setGpsMeta(null);
    setGpsError('');
    return undefined;
  }, [open, initialFacingMode, includeLocation]);

  useEffect(() => {
    if (!open || !includeLocation) return undefined;

    let cancelled = false;
    setGpsStatus('loading');
    setGpsError('');

    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('Browser tidak mendukung GPS.');
      return undefined;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        let locationName = null;

        if (useLocationLabel) {
          if (typeof resolveLocationLabel !== 'function') {
            setGpsMeta(null);
            setGpsStatus('error');
            setGpsError('Aturan lokasi absensi belum siap.');
            return;
          }
          locationName = resolveLocationLabel(latitude, longitude);
          if (!locationName) {
            setGpsMeta(null);
            setGpsStatus('error');
            setGpsError('Lokasi absensi belum siap.');
            return;
          }
        }

        setGpsMeta({
          latitude,
          longitude,
          locationName,
        });
        setGpsStatus('ready');
      },
      (err) => {
        if (cancelled) return;
        setGpsMeta(null);
        setGpsStatus('error');
        setGpsError(err?.message || 'Gagal mengambil lokasi GPS.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => {
      cancelled = true;
    };
  }, [open, includeLocation, useLocationLabel, resolveLocationLabel]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Browser ini tidak mendukung akses kamera.');
      return undefined;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video
            .play()
            .then(() => {
              if (!cancelled) {
                setReady(true);
                setCamError(null);
              }
            })
            .catch(() => {
              if (!cancelled) setCamError('Tidak dapat memutar preview kamera.');
            });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setReady(false);
          setCamError(`Tidak dapat mengakses kamera: ${err.message || err}`);
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facingMode]);

  if (!open || typeof document === 'undefined') return null;

  const flipCamera = () => {
    setReady(false);
    setCamError(null);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;

    if (includeLocation && (gpsStatus !== 'ready' || !gpsMeta)) {
      setGpsError(gpsError || 'Lokasi GPS wajib siap sebelum mengambil foto.');
      return;
    }

    if (useLocationLabel && !gpsMeta?.locationName) {
      setGpsError('Lokasi absensi belum siap sebelum mengambil foto.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    if (facingMode === 'user') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const stamp = formatStamp(new Date());
    const latText = formatCoord(gpsMeta?.latitude);
    const lngText = formatCoord(gpsMeta?.longitude);
    let locationLine = null;
    if (includeLocation) {
      if (useLocationLabel) {
        locationLine = gpsMeta?.locationName || null;
      } else if (latText && lngText) {
        locationLine = `${latText}, ${lngText}`;
      }
    }
    const lines = locationLine ? [stamp, locationLine] : [stamp];

    const fontSize = Math.max(14, Math.floor(canvas.width / 28));
    const lineGap = Math.floor(fontSize * 0.35);
    ctx.font = `bold ${fontSize}px monospace`;
    const maxTextWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const pad = 10;
    const boxHeight = lines.length * fontSize + (lines.length - 1) * lineGap + pad;
    const boxX = isIkm ? pad + 6 : canvas.width - maxTextWidth - pad * 2 - 6;
    const boxY = canvas.height - boxHeight - pad - 6;
    const textX = isIkm ? boxX + pad : canvas.width - maxTextWidth - pad - 6;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(boxX, boxY, maxTextWidth + pad * 2, boxHeight);
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, index) => {
      const textY = boxY + pad + fontSize * (index + 1) + lineGap * index - 4;
      ctx.fillText(line, textX, textY);
    });

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        if (includeLocation) {
          onCapture?.(file, {
            latitude: gpsMeta.latitude,
            longitude: gpsMeta.longitude,
            locationName: gpsMeta.locationName || null,
          });
          return;
        }
        onCapture?.(file);
      },
      'image/jpeg',
      0.9
    );
  };

  const handleClose = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose?.();
  };

  const captureDisabled =
    !ready ||
    Boolean(camError) ||
    (includeLocation && gpsStatus !== 'ready') ||
    (useLocationLabel && !gpsMeta?.locationName);

  const gpsReadyLabel = useLocationLabel
    ? `GPS siap · ${gpsMeta?.locationName || '-'}`
    : `GPS siap · ${formatCoord(gpsMeta?.latitude)}, ${formatCoord(gpsMeta?.longitude)}`;

  const flipButton = (
    <button
      type="button"
      onClick={flipCamera}
      disabled={Boolean(camError)}
      className={
        isIkm
          ? 'absolute top-2 right-2 w-9 h-9 rounded-full bg-black/50 grid place-items-center text-white disabled:opacity-30'
          : 'w-11 h-11 rounded-full bg-white/10 text-white/70 grid place-items-center hover:bg-white/20 hover:text-white transition disabled:opacity-30'
      }
      aria-label="Balik kamera"
    >
      {isIkm ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 7h-3.5L14 4h-4L7.5 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4v6h6" />
          <path d="M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      )}
    </button>
  );

  const videoBlock = (
    <>
      <video
        ref={videoRef}
        className={isIkm ? 'w-full h-full object-cover' : 'absolute inset-0 w-full h-full object-cover'}
        style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
        playsInline
        muted
        autoPlay={isIkm || undefined}
        onLoadedMetadata={
          isIkm
            ? () => {
                setReady(true);
                videoRef.current?.play?.().catch(() => {});
              }
            : undefined
        }
        onCanPlay={isIkm ? () => setReady(true) : undefined}
      />
      {ready ? <LiveTimestamp align={isIkm ? 'left' : 'right'} /> : null}
      {isIkm ? flipButton : null}
      {includeLocation ? (
        <div className={`absolute ${isIkm ? 'top-12' : 'top-3'} left-3 right-3 text-[10.5px] font-semibold`}>
          <div
            className={`inline-flex max-w-full rounded-[8px] px-2.5 py-1.5 ${
              gpsStatus === 'ready'
                ? 'bg-[#163A22]/85 text-white'
                : gpsStatus === 'error'
                  ? 'bg-rose-500/80 text-white'
                  : 'bg-black/55 text-white/85'
            }`}
          >
            {gpsStatus === 'ready'
              ? gpsReadyLabel
              : gpsStatus === 'error'
                ? `GPS gagal · ${gpsError || 'aktifkan izin lokasi'}`
                : 'Mengambil lokasi GPS...'}
          </div>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="hidden" />
    </>
  );

  if (isIkm) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:p-4">
        <div className="w-full max-w-[430px] max-h-[calc(100dvh-24px)] bg-white rounded-[18px] overflow-hidden shadow-[0_12px_60px_rgba(0,0,0,.35)] flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div className="text-[13px] font-extrabold text-slate-900 truncate pr-3">{title}</div>
            <button
              type="button"
              onClick={handleClose}
              className="w-9 h-9 rounded-[12px] grid place-items-center border border-slate-200 bg-white text-slate-600"
              aria-label="Tutup kamera"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>

          <div className="p-3 sm:p-4 overflow-y-auto">
            {camError ? (
              <div className="mb-3 text-[11.5px] font-semibold px-3 py-2 rounded-xl bg-red-50 text-red-900 border border-red-100">
                {camError}
              </div>
            ) : null}

            <div className="rounded-[16px] overflow-hidden bg-black relative aspect-[3/4] sm:aspect-[4/5]">
              {camError ? (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div className="text-white/50 text-[11px] leading-relaxed">Kamera tidak tersedia</div>
                </div>
              ) : (
                videoBlock
              )}
            </div>

            {!ready && !camError ? (
              <div className="mt-2 text-[11px] font-semibold text-slate-500">Menyiapkan kamera…</div>
            ) : null}

            <div className="mt-3 text-[11px] text-slate-500 font-medium leading-[1.5]">
              Foto diambil langsung dari kamera dan akan otomatis diberi timestamp.
            </div>
            {includeLocation ? (
              <div className="mt-2 text-[11px] font-semibold text-slate-600">
                {gpsStatus === 'ready'
                  ? gpsReadyLabel
                  : gpsStatus === 'error'
                    ? `GPS gagal · ${gpsError || 'aktifkan izin lokasi'}`
                    : 'Mengambil lokasi GPS...'}
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-1.5">
              <button
                type="button"
                onClick={handleClose}
                className="h-[40px] rounded-[12px] border border-slate-200 bg-white text-slate-700 text-[12px] font-extrabold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={capture}
                disabled={captureDisabled}
                className="h-[40px] rounded-[12px] bg-[#163A22] text-white text-[12px] font-extrabold disabled:opacity-50"
              >
                {!ready
                  ? 'Menyiapkan...'
                  : includeLocation && gpsStatus !== 'ready'
                    ? 'Menyiapkan GPS...'
                    : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-[360px] bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <span className="text-white text-[14px] font-bold truncate pr-2">{title}</span>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/10 text-white/70 grid place-items-center hover:bg-white/20 hover:text-white transition"
            aria-label="Tutup kamera"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>

        <div className="relative w-full" style={{ aspectRatio: '4/3', background: '#111' }}>
          {camError ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <div>
                <div className="text-red-400 text-[13px] font-semibold mb-1">Kamera Tidak Tersedia</div>
                <div className="text-white/50 text-[11px] leading-relaxed">{camError}</div>
              </div>
            </div>
          ) : (
            videoBlock
          )}
        </div>

        <div className="flex-shrink-0 flex justify-between items-center px-8 py-5">
          <button
            type="button"
            onClick={handleClose}
            className="w-11 h-11 rounded-full bg-white/10 text-white/60 grid place-items-center hover:bg-white/20 transition"
            aria-label="Batal"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="12,4 6,10 12,16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={capture}
            disabled={captureDisabled}
            className="w-[68px] h-[68px] rounded-full border-4 border-white grid place-items-center shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-40"
            aria-label="Ambil foto"
          >
            <div className="w-[52px] h-[52px] rounded-full bg-white" />
          </button>

          {flipButton}
        </div>
      </div>
    </div>,
    document.body
  );
}
