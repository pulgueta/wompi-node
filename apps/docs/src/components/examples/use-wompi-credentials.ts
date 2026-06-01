import { useCallback, useEffect, useState } from "react";
import type { WompiCredentials } from "@/lib/wompi-credentials";

/**
 * Per-tab storage for a visitor's own Wompi sandbox keys.
 *
 * The keys are kept in `sessionStorage` (not `localStorage`) so they are scoped
 * to the current tab and discarded when it closes. A custom event keeps every
 * island that calls this hook — the panel and the example forms — in sync after
 * a save or clear, without a shared React tree.
 */
const STORAGE_KEY = "wompi-docs:credentials";
const CHANGE_EVENT = "wompi-docs:credentials-change";

function readStored(): WompiCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WompiCredentials>;
    if (!parsed.publicKey || !parsed.privateKey || !parsed.integrityKey) return null;
    return {
      publicKey: parsed.publicKey,
      privateKey: parsed.privateKey,
      integrityKey: parsed.integrityKey,
    };
  } catch {
    return null;
  }
}

export interface UseWompiCredentials {
  credentials: WompiCredentials | null;
  hasCredentials: boolean;
  save: (next: WompiCredentials) => void;
  clear: () => void;
}

export function useWompiCredentials(): UseWompiCredentials {
  const [credentials, setCredentials] = useState<WompiCredentials | null>(null);

  useEffect(() => {
    setCredentials(readStored());
    const sync = () => setCredentials(readStored());
    // `storage` fires for other tabs; the custom event covers this one.
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((next: WompiCredentials) => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setCredentials(next);
  }, []);

  const clear = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setCredentials(null);
  }, []);

  return { credentials, hasCredentials: credentials !== null, save, clear };
}
