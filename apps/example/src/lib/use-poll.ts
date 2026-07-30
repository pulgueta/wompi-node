import { useEffect, useRef, useState } from "react";

/**
 * Polls a server function and keeps the latest result. An in-flight guard
 * skips ticks while the previous response is pending, so slow sandbox
 * responses never overlap. Errors keep the last good data — the demo
 * endpoints are all safe to retry.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  enabled = true,
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await fetcherRef.current();
        if (!cancelled) setData(result);
      } catch {
        // Transient sandbox failure; keep the last good data and retry.
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs, enabled]);

  return data;
}
