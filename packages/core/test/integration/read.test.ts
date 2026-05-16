import { describe, it, expect } from "vitest";
import { WompiClient } from "../../src/client";

/**
 * Integration tests against the real Wompi sandbox.
 *
 * They are gated on `WOMPI_PUBLIC_KEY`, so the default `pnpm test` / CI run —
 * which has no credentials — skips the whole suite. To run them, put sandbox
 * credentials in the repo-root `.env.local` (loaded by `test/setup.ts`):
 *
 *   WOMPI_PUBLIC_KEY=pub_test_...
 *   WOMPI_PRIVATE_KEY=prv_test_...
 *   WOMPI_INTEGRITY_KEY=test_integrity_...
 *
 * The client is built lazily inside each test: `describe.skipIf` still runs the
 * describe body to collect tests, so constructing it at the top level would
 * throw on the empty key even when the suite is skipped.
 */
const publicKey = process.env.WOMPI_PUBLIC_KEY;

const sandboxClient = () =>
  new WompiClient({
    publicKey: publicKey ?? "",
    privateKey: process.env.WOMPI_PRIVATE_KEY,
    sandbox: true,
  });

describe.skipIf(!publicKey)("sandbox · read-only endpoints", () => {
  it("getMerchant returns the presigned acceptance token", async () => {
    const [error, response] = await sandboxClient().merchants.getMerchant();

    expect(error).toBeNull();
    expect(response?.data.presigned_acceptance?.acceptance_token).toBeTruthy();
  });

  it("getFinancialInstitutions returns the PSE bank list", async () => {
    const [error, response] = await sandboxClient().pse.getFinancialInstitutions();

    expect(error).toBeNull();
    expect(Array.isArray(response?.data)).toBe(true);
  });

  it("tokenizeCard issues a token for the 4242 test card", async () => {
    const [error, response] = await sandboxClient().tokens.tokenizeCard({
      number: "4242424242424242",
      cvc: "123",
      exp_month: "12",
      exp_year: "29",
      card_holder: "Pedro Pérez",
    });

    expect(error).toBeNull();
    expect(response?.data.id).toBeTruthy();
  });
});
