export type LoadWompiOptions = {
  readonly environment?: "sandbox" | "production";
};

export function loadWompi(options: LoadWompiOptions = {}) {
  const env = options.environment ?? "sandbox";
  const src = "https://cdn.wompi.co/libs/js/v1/"; // environment controlled via keys
  if (typeof document === "undefined") return Promise.reject(new Error("loadWompi must be run in a browser"));
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) return Promise.resolve(true);
  return new Promise<boolean>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load Wompi script"));
    document.head.appendChild(script);
  });
}

