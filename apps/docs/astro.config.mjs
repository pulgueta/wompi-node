// @ts-check
import { defineConfig, envField } from "astro/config";

import vercel from "@astrojs/vercel";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://wompi.pulgueta.com",

  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  integrations: [react()],

  env: {
    schema: {
      // The live examples no longer use maintainer Wompi keys — each visitor
      // brings their own sandbox keys, forwarded per request as headers (see
      // `src/lib/wompi-credentials.ts`). Only the optional Upstash credentials
      // for rate limiting remain server-side; the site always builds without
      // them and the limiter degrades to a no-op when they are absent.
      UPSTASH_REDIS_REST_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      UPSTASH_REDIS_REST_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
