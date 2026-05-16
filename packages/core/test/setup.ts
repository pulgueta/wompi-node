/**
 * Vitest global setup — runs once before any test file.
 *
 * Loads the repo-root `.env.local` (when present) into `process.env` so the
 * sandbox integration suites can read their Wompi credentials. Unit tests do
 * not depend on it: when the file is missing, those suites self-skip through
 * `describe.skipIf(!process.env.WOMPI_PUBLIC_KEY)`.
 *
 * `process.loadEnvFile` is available on Node >= 20.12; the `typeof` guard keeps
 * older runtimes from crashing the whole suite.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../../.env.local");

if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}
