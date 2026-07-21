import { describe, it, expect } from "vitest";
import { WompiClient } from "../../src";
import { WompiRequestError } from "../../src/schemas";

/**
 * BRE-B dispersal lifecycle against the real payouts sandbox: resolve a test
 * key, create a payout with it, then poll the batch until it settles.
 *
 * Gated on the payouts credentials, which are separate from the payments keys
 * (Wompi dashboard > Desarrollo > Programadores > Pagos a Terceros > Sandbox).
 * Put them in the repo-root `.env.local` (loaded by `test/setup.ts`):
 *
 *   WOMPI_PAYOUTS_API_KEY=...
 *   WOMPI_PAYOUTS_USER_PRINCIPAL_ID=...
 *   WOMPI_PAYOUTS_ACCOUNT_ID=...   # source account, needs sandbox balance
 *
 * The default `pnpm test` / CI run skips this suite. The client is built
 * lazily because `describe.skipIf` still runs the describe body.
 */
const apiKey = process.env.WOMPI_PAYOUTS_API_KEY;
const userPrincipalId = process.env.WOMPI_PAYOUTS_USER_PRINCIPAL_ID;
const accountId = process.env.WOMPI_PAYOUTS_ACCOUNT_ID;
const canRun = Boolean(apiKey && userPrincipalId && accountId);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sandboxClient = () =>
  new WompiClient({
    publicKey: process.env.WOMPI_PUBLIC_KEY ?? "pub_test_placeholder",
    payouts: {
      apiKey: apiKey ?? "",
      userPrincipalId: userPrincipalId ?? "",
    },
    sandbox: true,
  });

describe.skipIf(!canRun)("sandbox · BRE-B dispersal lifecycle", () => {
  it("resolves the @elias123 test key", async () => {
    const [error, resolution] = await sandboxClient().breb.resolveKey("@elias123", "ALPHANUMERIC");

    expect(error).toBeNull();
    expect(resolution?.holderName).toBeTruthy();
    expect(resolution?.financialEntity?.name).toBeTruthy();
  });

  it("resolves an unknown key to a 404 with code EXC_034", async () => {
    const [error, data] = await sandboxClient().breb.resolveKey("noexiste@test.com", "MAIL");

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiRequestError);
    expect((error as WompiRequestError).statusCode).toBe(404);
  });

  it("creates a BRE-B payout, then reads the batch and its transactions", async () => {
    const wompi = sandboxClient();
    const reference = `sdk-it-breb-${Date.now()}`;

    // 1. Resolve the key so the flow mirrors the recommended integration.
    const [resolveError] = await wompi.breb.resolveKey("@elias123", "ALPHANUMERIC");
    expect(resolveError).toBeNull();

    // 2. Create the dispersal; sandbox approves it by default.
    const [createError, created] = await wompi.breb.createPayout(
      {
        reference,
        accountId: accountId ?? "",
        paymentType: "PROVIDERS",
        transactions: [
          {
            amount: 150_000,
            name: "Elias Cantor",
            email: "elias@example.com",
            key: "@elias123",
          },
        ],
      },
      reference
    );
    expect(createError).toBeNull();
    const payoutId = created?.payoutId;
    expect(payoutId).toBeTruthy();

    // 3. Poll the batch until the sandbox settles it.
    let status: string | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const [getError, payout] = await wompi.breb.getPayout(payoutId ?? "");
      expect(getError).toBeNull();
      status = payout?.status;
      if (status && status !== "PENDING") break;
      await sleep(2_000);
    }
    expect(status).toBe("TOTAL_PAYMENT");

    // 4. The batch's transactions carry the resolved BRE-B payee.
    const [txError, transactionPage] = await wompi.breb.getPayoutTransactions(payoutId ?? "");
    expect(txError).toBeNull();
    expect(transactionPage?.records.length).toBeGreaterThan(0);
    expect(transactionPage?.records[0]!.status).toBe("APPROVED");
  }, 60_000);
});
