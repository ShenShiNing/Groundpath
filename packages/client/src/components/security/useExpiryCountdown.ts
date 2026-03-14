import { useEffect, useMemo, useRef, useState } from 'react';

function getRemainingSeconds(expiresAt: string | null, now: number): number {
  if (!expiresAt) {
    return 0;
  }

  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
}

export function useExpiryCountdown(expiresAt: string | null, onExpired?: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  const hasNotifiedRef = useRef(false);

  const remainingSeconds = useMemo(() => getRemainingSeconds(expiresAt, now), [expiresAt, now]);

  useEffect(() => {
    hasNotifiedRef.current = false;

    if (!expiresAt) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (!expiresAt || remainingSeconds > 0 || hasNotifiedRef.current) {
      return;
    }

    hasNotifiedRef.current = true;
    onExpired?.();
  }, [expiresAt, onExpired, remainingSeconds]);

  return remainingSeconds;
}
