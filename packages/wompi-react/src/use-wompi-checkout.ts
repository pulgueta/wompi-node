import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    WidgetCheckout?: new (options: Record<string, unknown>) => {
      open: (cb?: (result: unknown) => void) => void;
    };
  }
}

type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';

function useScript(src: string) {
  const [status, setStatus] = useState<ScriptStatus>('idle');
  useEffect(() => {
    if (!src) return;
    let script = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (script && (script as any)._loaded) {
      setStatus('ready');
      return;
    }
    if (!script) {
      script = document.createElement('script');
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
    const onLoad = () => {
      (script as any)._loaded = true;
      setStatus('ready');
    };
    const onError = () => setStatus('error');
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    setStatus('loading');
    return () => {
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
    };
  }, [src]);
  return status;
}

export function useWompiCheckout(widgetUrl = 'https://checkout.wompi.co/widget.js') {
  const status = useScript(widgetUrl);
  const checkoutRef = useRef<any | null>(null);

  const open = useCallback((options: Record<string, unknown>, cb?: (r: unknown) => void) => {
    if (status !== 'ready' || !window.WidgetCheckout) return;
    checkoutRef.current = new window.WidgetCheckout(options);
    checkoutRef.current.open(cb);
  }, [status]);

  return { status, open };
}

