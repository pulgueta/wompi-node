/**
 * Shared contract for the live docs examples.
 *
 * The examples no longer ship with the maintainer's Wompi keys — those leaked
 * personal merchant data and there is no neutral shared sandbox to fall back
 * on. Instead every visitor brings their own **sandbox** credentials:
 *
 *   1. the browser keeps them in `sessionStorage`, so they live only in the
 *      current tab and vanish the moment it is closed (never `localStorage`);
 *   2. each request forwards them through the headers below, over HTTPS;
 *   3. the `/api/examples/*` routes use them for the lifetime of a single
 *      request and never persist or log them.
 *
 * This browser-forwarded transport exists only so the docs are self-serve. It
 * is **not** how the SDK is meant to be used: real integrations read the keys
 * from server environment variables and never expose secrets to the client.
 */
export interface WompiCredentials {
  publicKey: string;
  privateKey: string;
  integrityKey: string;
}

export type WompiCredentialsKey = keyof WompiCredentials;

/** Request headers that carry a visitor's sandbox keys to the example routes. */
export const WOMPI_CREDENTIAL_HEADERS = {
  publicKey: "x-wompi-public-key",
  privateKey: "x-wompi-private-key",
  integrityKey: "x-wompi-integrity-key",
} as const satisfies Record<WompiCredentialsKey, string>;

/** Builds the header map a browser request must send to an example route. */
export function credentialHeaders(credentials: Partial<WompiCredentials>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (credentials.publicKey) {
    headers[WOMPI_CREDENTIAL_HEADERS.publicKey] = credentials.publicKey;
  }
  if (credentials.privateKey) {
    headers[WOMPI_CREDENTIAL_HEADERS.privateKey] = credentials.privateKey;
  }
  if (credentials.integrityKey) {
    headers[WOMPI_CREDENTIAL_HEADERS.integrityKey] = credentials.integrityKey;
  }
  return headers;
}

/** Reads the sandbox keys a visitor attached to an example request. */
export function readCredentialHeaders(request: Request): Partial<WompiCredentials> {
  const read = (header: string) => request.headers.get(header)?.trim() || undefined;
  return {
    publicKey: read(WOMPI_CREDENTIAL_HEADERS.publicKey),
    privateKey: read(WOMPI_CREDENTIAL_HEADERS.privateKey),
    integrityKey: read(WOMPI_CREDENTIAL_HEADERS.integrityKey),
  };
}
