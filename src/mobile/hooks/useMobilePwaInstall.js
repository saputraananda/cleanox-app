import { useCallback, useEffect, useRef, useState } from 'react';

const getIsInstalled = () => {
  if (typeof window === 'undefined') return false;
  const standaloneMq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = window.navigator.standalone === true;
  return standaloneMq || iosStandalone;
};

const getIsIos = (installed) => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !installed;
};

export default function useMobilePwaInstall() {
  const deferredPromptRef = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => getIsInstalled());
  const [isIos, setIsIos] = useState(() => getIsIos(getIsInstalled()));

  useEffect(() => {
    const syncInstalled = () => {
      const installed = getIsInstalled();
      setIsInstalled(installed);
      setIsIos(getIsIos(installed));
    };

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPromptRef.current = event;
      setCanInstall(true);
    };

    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
      setIsIos(false);
    };

    syncInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return 'unavailable';

    deferredPromptRef.current = null;
    setCanInstall(false);

    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    return outcome === 'accepted' ? 'accepted' : 'dismissed';
  }, []);

  return {
    canInstall,
    isInstalled,
    isIos,
    promptInstall,
  };
}
