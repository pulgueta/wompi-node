// The version shown across the UI tracks the latest release published to npm,
// resolved once at build time. The workspace manifest can drift ahead of (or
// behind) what's actually published, so the registry is the source of truth.
// If the registry is unreachable (offline build, CI without network), it falls
// back to the bundled manifest version so the build never breaks.
import { version as manifestVersion } from "@pulgueta/wompi/package.json";

const NPM_LATEST = "https://registry.npmjs.org/@pulgueta/wompi/latest";

async function resolvePublishedVersion(): Promise<string> {
  try {
    const response = await fetch(NPM_LATEST, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return manifestVersion;

    const data: unknown = await response.json();
    const published = (data as { version?: unknown }).version;

    return typeof published === "string" ? published : manifestVersion;
  } catch {
    return manifestVersion;
  }
}

// Top-level await: runs at build (or once per dev session), never in the browser
// — `site` is only imported from server-rendered `.astro` frontmatter.
const version = await resolvePublishedVersion();

/** Single source of truth for site-wide metadata, links and SEO defaults. */
export const site = {
  name: "@pulgueta/wompi",
  shortName: "Wompi SDK",
  tagline: "Integrate Wompi in your Node.js applications with ease.",
  description:
    "A fully typed, error-first Wompi SDK for Node.js. Validated with Zod, tree-shakeable, and built for transactions, tokens, payment sources, payment links and PSE.",
  /** Keep in sync with `astro.config.mjs` `site`. */
  url: "https://wompi.pulgueta.com",
  version,
  repo: "https://github.com/pulgueta/wompi-node",
  issues: "https://github.com/pulgueta/wompi-node/issues",
  npm: "https://www.npmjs.com/package/@pulgueta/wompi",
  wompi: "https://wompi.co",
  wompiDocs: "https://docs.wompi.co",
  author: {
    name: "Andrés Rodríguez",
    url: "https://github.com/pulgueta",
  },
} as const;
