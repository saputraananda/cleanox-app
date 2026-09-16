import { io } from 'socket.io-client';

const STORAGE_KEY = 'cleanox_pwa_build_id';

function isMobileWorkerOrStandalone() {
  if (typeof window === 'undefined') return false;
  const pathOk = window.location.pathname.startsWith('/mobile-worker');
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  return pathOk || standalone;
}

/**
 * Connects to Socket.IO and reloads the PWA/mobile-worker when buildId changes
 * after a Hostinger deploy + Node restart.
 */
export function startPwaAutoReload() {
  if (import.meta.env.DEV) return;
  if (!isMobileWorkerOrStandalone()) return;

  const socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  socket.on('app:version', (payload) => {
    const buildId = payload?.buildId;
    if (!buildId) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, buildId);
      return;
    }

    if (stored !== buildId) {
      localStorage.setItem(STORAGE_KEY, buildId);
      window.location.reload();
    }
  });
}
