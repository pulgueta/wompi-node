// @ts-check
import { defineConfig, envField } from "astro/config";

import vercel from "@astrojs/vercel";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  // Used for canonical URLs, Open Graph metadata and the generated sitemap.
  // Change this to your production domain when you deploy.
  site: "https://wompi-node.vercel.app",

  adapter: vercel(),
  integrations: [react()],

  env: {
    schema: {
      // Wompi sandbox credentials for the live examples. They are optional so the
      // site always builds — the `/api/examples/*` routes degrade to a friendly
      // notice when a key is missing instead of crashing the request.
      WOMPI_PUBLIC_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      WOMPI_PRIVATE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      WOMPI_INTEGRITY_KEY: envField.string({
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
