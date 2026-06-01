import pkg from "@pulgueta/wompi/package.json";

/** Single source of truth for site-wide metadata, links and SEO defaults. */
export const site = {
  name: "@pulgueta/wompi",
  shortName: "Wompi SDK",
  tagline: "The unofficial Wompi SDK for Node.js",
  description:
    "An open-source, fully-typed SDK to integrate Wompi payments in Node.js — error-first, validated with Zod, covering transactions, tokens, payment sources, payment links and PSE.",
  /** Always reflects the published package version — sourced from the SDK's package.json. */
  version: pkg.version,
  /** Keep in sync with `astro.config.mjs` `site`. */
  url: "https://wompi.pulgueta.com",
  repo: "https://github.com/pulgueta/wompi-node",
  issues: "https://github.com/pulgueta/wompi-node/issues",
  npm: "https://www.npmjs.com/package/@pulgueta/wompi",
  wompiSite: "https://wompi.co",
  wompiDocs: "https://docs.wompi.co",
  author: {
    name: "Andrés Rodríguez",
    url: "https://github.com/pulgueta",
  },
} as const;
