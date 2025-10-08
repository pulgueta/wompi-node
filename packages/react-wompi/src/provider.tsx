import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { WompiClient } from "@pulgueta/wompi/client";

type ScriptStatus = "idle" | "loading" | "ready" | "error";

function useScript(src: string): ScriptStatus {
  const statusRef = useRef<ScriptStatus>("idle");
  const [, force] = React.useReducer((c) => c + 1, 0);

  useEffect(() => {
    if (!src) return;
    let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        statusRef.current = "ready";
        force();
      };
      script.onerror = () => {
        statusRef.current = "error";
        force();
      };
      statusRef.current = "loading";
      document.head.appendChild(script);
      force();
    } else {
      statusRef.current = "ready";
      force();
    }
  }, [src]);

  return statusRef.current;
}

export type WompiProviderProps = {
  readonly publicKey: string;
  readonly environment?: "sandbox" | "production";
  readonly baseUrl?: string;
  readonly children?: React.ReactNode;
};

type WompiContextValue = {
  readonly client: WompiClient;
  readonly scriptStatus: ScriptStatus;
};

const WompiContext = createContext<WompiContextValue | null>(null);

export function WompiProvider(props: WompiProviderProps) {
  const { publicKey, environment = "sandbox", baseUrl, children } = props;

  const scriptSrc = environment === "sandbox" ?
    "https://cdn.wompi.co/libs/js/v1/" :
    "https://cdn.wompi.co/libs/js/v1/"; // both use same path, env controlled by keys

  const scriptStatus = useScript(scriptSrc);

  const client = useMemo(() => new WompiClient({ publicKey, environment, baseUrl }), [publicKey, environment, baseUrl]);

  const value = useMemo<WompiContextValue>(() => ({ client, scriptStatus }), [client, scriptStatus]);

  return <WompiContext.Provider value={value}>{children}</WompiContext.Provider>;
}

export function useWompi() {
  const ctx = useContext(WompiContext);
  if (!ctx) throw new Error("useWompi must be used within WompiProvider");
  return ctx;
}

