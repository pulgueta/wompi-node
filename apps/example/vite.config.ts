import { defineConfig, loadEnv } from "vite";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, __dirname, "WOMPI_"), ...process.env };
  let tunnelHostname: string | undefined;

  try {
    tunnelHostname = new URL(env.WOMPI_EXAMPLE_ORIGIN ?? "").hostname || undefined;
  } catch {
    tunnelHostname = undefined;
  }

  return {
    resolve: { tsconfigPaths: true },
    plugins: [tailwindcss(), tanstackStart(), viteReact(), nitro()],
    // The tunnel host comes from WOMPI_EXAMPLE_ORIGIN in .env.local.
    ...(tunnelHostname
      ? { server: { allowedHosts: [tunnelHostname] } }
      : {}),
  };
});
