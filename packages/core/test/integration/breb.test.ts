import { describe, it, expect } from "vitest";
import { WompiPayoutsClient } from "../../src";
import { WompiPayoutApiError } from "../../src/schemas";

/**
 * BRE-B dispersal lifecycle against the real Payouts sandbox: resolve a magic
 * test key, create a payout paying that key, poll the batch until it settles
 * and read its transactions back.
 *
 * Gated on the two Payouts credentials, supplied through the repo-root
 * `.env.local` (loaded by `test/setup.ts`):
 *
 *   WOMPI_PAYOUTS_API_KEY=...
 *   WOMPI_PAYOUTS_USER_PRINCIPAL_ID=...
 *
 * The default `pnpm test` / CI run — which has no credentials — skips the
 * suite. The client is built lazily because `describe.skipIf` still runs the
 * describe body.
 */
const apiKey = process.env.WOMPI_PAYOUTS_API_KEY;
const userPrincipalId = process.env.WOMPI_PAYOUTS_USER_PRINCIPAL_ID;
const canRun = Boolean(apiKey && userPrincipalId);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TERMINAL_PAYOUT_STATUSES = new Set(["TOTAL_PAYMENT", "REJECTED"]);

const sandboxClient = () =>
  new WompiPayoutsClient({
    apiKey: apiKey ?? "",
    userPrincipalId: userPrincipalId ?? "",
    sandbox: true,
  });

describe.skipIf(!canRun)("sandbox · BRE-B dispersal lifecycle", () => {
  it("resolves the @elias123 test key", async () => {
    const [error, resolution] = await sandboxClient().resolveBrebKey("@elias123", "ALPHANUMERIC");

    expect(error).toBeNull();
    expect(resolution?.holderName).toBeTruthy();
    expect(resolution?.financialEntity?.name).toBeTruthy();
  });

  it("resolves an unknown key to a 404 with code EXC_034", async () => {
    const [error, data] = await sandboxClient().resolveBrebKey("noexiste@test.com", "MAIL");

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiPayoutApiError);
    expect((error as WompiPayoutApiError).statusCode).toBe(404);
    expect((error as WompiPayoutApiError).code).toBe("EXC_034");
  });

  it("creates a BRE-B payout, then reads the batch and its transactions", async () => {
    const payouts = sandboxClient();
    const reference = `sdk-it-breb-${Date.now()}`;

    // 1. Pick the sandbox origin account and top it up so the batch clears.
    const [accountsError, accounts] = await payouts.listAccounts();
    expect(accountsError).toBeNull();
    const account = accounts?.[0];
    expect(account?.id).toBeTruthy();

    const [rechargeError] = await payouts.rechargeAccountBalance({
      accountId: account?.id ?? "",
      amountInCents: 10_000_000,
    });
    expect(rechargeError).toBeNull();

    // 2. Resolve the key so the flow mirrors the recommended integration.
    const [resolveError] = await payouts.resolveBrebKey("@elias123", "ALPHANUMERIC");
    expect(resolveError).toBeNull();

    // 3. Create the dispersal; the sandbox approves it by default.
    const [createError, created] = await payouts.createPayout(
      {
        reference,
        accountId: account?.id ?? "",
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
      { idempotencyKey: reference }
    );
    expect(createError).toBeNull();
    const payoutId = created?.payoutId;
    expect(payoutId).toBeTruthy();

    // 4. Poll until the sandbox settles the batch.
    let status: string | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const [getError, payout] = await payouts.getPayout(payoutId ?? "", {
        apiVersion: "v2",
      });
      expect(getError).toBeNull();
      status = payout?.status;
      if (status && TERMINAL_PAYOUT_STATUSES.has(status)) break;
      await sleep(2_000);
    }
    expect(status).toBe("TOTAL_PAYMENT");

    // 5. The batch's transactions carry the resolved BRE-B payee.
    const [txError, txPage] = await payouts.listPayoutTransactions(
      payoutId ?? "",
      {},
      { apiVersion: "v2" }
    );
    expect(txError).toBeNull();
    expect(txPage?.records.length).toBeGreaterThan(0);
    expect(txPage?.records[0]!.status).toBe("APPROVED");
  }, 90_000);
});
