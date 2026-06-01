// Pulled straight from the published package manifest so the version shown in
// the UI always matches the SDK that ships — no manual bumps to keep in sync.
import { version } from "@pulgueta/wompi/package.json";

/** Single source of truth for site-wide metadata, links and SEO defaults. */
export const site = {
  name: "@pulgueta/wompi",
  shortName: "Wompi SDK",
  tagline: "The unofficial Wompi SDK for Node.js",
  description:
    "A fully typed, error-first Wompi SDK for Node.js. Validated with Zod, tree-shakeable, and built for transactions, tokens, payment sources, payment links and PSE.",
  /** Keep in sync with `astro.config.mjs` `site`. */
  url: "https://wompi-node.vercel.app",
  version,
  repo: "https://github.com/pulgueta/wompi-node",
  issues: "https://github.com/pulgueta/wompi-node/issues",
  npm: "https://www.npmjs.com/package/@pulgueta/wompi",
  wompiDocs: "https://docs.wompi.co",
  author: {
    name: "Andrés Rodríguez",
    url: "https://github.com/pulgueta",
  },
} as const;
