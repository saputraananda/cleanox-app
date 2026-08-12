import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchMorningWorkUnlock } from '@mobile/utils/morningWorkUnlock.js';

export default function MorningWorkUnlockGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const status = await fetchMorningWorkUnlock();
        if (!cancelled) setUnlocked(Boolean(status.unlocked));
      } catch {
        if (!cancelled) setUnlocked(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-100 flex justify-center">
        <div className="w-full max-w-[430px] min-h-[100dvh] bg-white flex items-center justify-center px-6">
          <p className="text-sm text-slate-500 text-center">Memeriksa syarat kerja pagi...</p>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return <Navigate to="/mobile-worker" replace />;
  }

  return children;
}
