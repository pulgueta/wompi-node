declare global {
  interface Window {
    WidgetCheckout?: new (options: Record<string, unknown>) => {
      open: (cb?: (result: unknown) => void) => void;
    };
  }
}

export function loadWompiWidget(url = 'https://checkout.wompi.co/widget.js'): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`) as HTMLScriptElement | null;
    if (existing && (existing as any)._loaded) return resolve();
    const script = existing ?? document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      (script as any)._loaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Wompi widget'));
    if (!existing) document.head.appendChild(script);
  });
}

export async function openWompiCheckout(options: Record<string, unknown>, cb?: (result: unknown) => void) {
  await loadWompiWidget();
  if (!window.WidgetCheckout) throw new Error('Wompi WidgetCheckout not available');
  const checkout = new window.WidgetCheckout(options);
  checkout.open(cb);
}

