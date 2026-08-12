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

function LiveTimestamp() {
  const [ts, setTs] = useState(() => formatStamp(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTs(formatStamp(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-[6px] bg-black/55 text-white text-[12px] font-mono font-bold pointer-events-none select-none">
      {ts}
    </div>
  );
}

/**
 * In-browser take-photo modal (IKM-style) with burned-in timestamp.
 * Optional GPS via includeLocation → onCapture(file, meta?).
 */
export default function MobileCameraCapture({
  open,
  title = 'Ambil Foto',
  onCapture,
  onClose,
  initialFacingMode = 'environment',
  includeLocation = false,
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
        setGpsMeta({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          locationName: null,
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
  }, [open, includeLocation]);

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
    const locationLine =
      includeLocation && latText && lngText ? `${latText}, ${lngText}` : null;
    const lines = locationLine ? [stamp, locationLine] : [stamp];

    const fontSize = Math.max(14, Math.floor(canvas.width / 28));
    const lineGap = Math.floor(fontSize * 0.35);
    ctx.font = `bold ${fontSize}px monospace`;
    const maxTextWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const pad = 10;
    const boxHeight = lines.length * fontSize + (lines.length - 1) * lineGap + pad;
    const boxX = canvas.width - maxTextWidth - pad * 2 - 6;
    const boxY = canvas.height - boxHeight - pad - 6;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(boxX, boxY, maxTextWidth + pad * 2, boxHeight);
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, index) => {
      const textY = boxY + pad + fontSize * (index + 1) + lineGap * index - 4;
      ctx.fillText(line, canvas.width - maxTextWidth - pad - 6, textY);
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
    !ready || Boolean(camError) || (includeLocation && gpsStatus !== 'ready');

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
            <>
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
                playsInline
                muted
              />
              {ready ? <LiveTimestamp /> : null}
              {includeLocation ? (
                <div className="absolute top-3 left-3 right-3 text-[10.5px] font-semibold">
                  <div
                    className={`inline-flex max-w-full rounded-[8px] px-2.5 py-1.5 ${
                      gpsStatus === 'ready'
                        ? 'bg-emerald-500/80 text-white'
                        : gpsStatus === 'error'
                          ? 'bg-rose-500/80 text-white'
                          : 'bg-black/55 text-white/85'
                    }`}
                  >
                    {gpsStatus === 'ready'
                      ? `GPS siap · ${formatCoord(gpsMeta?.latitude)}, ${formatCoord(gpsMeta?.longitude)}`
                      : gpsStatus === 'error'
                        ? `GPS gagal · ${gpsError || 'aktifkan izin lokasi'}`
                        : 'Mengambil lokasi GPS...'}
                  </div>
                </div>
              ) : null}
              <canvas ref={canvasRef} className="hidden" />
            </>
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

          <button
            type="button"
            onClick={flipCamera}
            disabled={Boolean(camError)}
            className="w-11 h-11 rounded-full bg-white/10 text-white/70 grid place-items-center hover:bg-white/20 hover:text-white transition disabled:opacity-30"
            aria-label="Balik kamera"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6" />
              <path d="M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
