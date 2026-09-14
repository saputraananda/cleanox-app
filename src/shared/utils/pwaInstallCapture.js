const listeners = new Set();

let deferredPrompt = null;
let isInstalled =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true);
let started = false;

const emit = () => {
  const snapshot = {
    canInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
  };
  listeners.forEach((listener) => listener(snapshot));
};

const onBeforeInstallPrompt = (event) => {
  event.preventDefault();
  deferredPrompt = event;
  emit();
};

const onAppInstalled = () => {
  deferredPrompt = null;
  isInstalled = true;
  emit();
};

export function startPwaInstallCapture() {
  if (typeof window === 'undefined' || started) return;
  started = true;

  isInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
  emit();
}

export function getPwaInstallState() {
  return {
    canInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
  };
}

export function subscribePwaInstall(listener) {
  listeners.add(listener);
  listener(getPwaInstallState());
  return () => listeners.delete(listener);
}

export async function promptPwaInstall({ waitMs = 8000 } = {}) {
  const deadline = Date.now() + waitMs;
  while (!deferredPrompt && !isInstalled && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (isInstalled) return 'accepted';
  if (!deferredPrompt) return 'unavailable';

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  emit();

  await promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  if (outcome === 'accepted') {
    isInstalled = true;
    emit();
    return 'accepted';
  }

  emit();
  return 'dismissed';
}
