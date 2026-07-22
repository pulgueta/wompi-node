import { describe, it, expect } from "vitest";
import { WompiPayoutsClient } from "../../src";

/**
 * Payout batch lifecycle against the real Payouts sandbox: check health, pick
 * an origin account, top up its balance, resolve a destination bank, create an
 * immediate batch, poll it and read its transactions back.
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

describe.skipIf(!canRun)("sandbox · payout batch lifecycle", () => {
  it("creates an immediate batch, polls it and reads its transactions", async () => {
    const payouts = sandboxClient();

    // 1. The Payouts services must be up for the rest of the flow to mean anything.
    const [healthError, health] = await payouts.getHealth();
    expect(healthError).toBeNull();
    expect(health?.status).toBeDefined();

    // 2. Pick the sandbox origin account and top it up so the batch clears.
    const [accountsError, accounts] = await payouts.listAccounts();
    expect(accountsError).toBeNull();
    const account = accounts?.[0];
    expect(account?.id).toBeTruthy();

    const [rechargeError] = await payouts.rechargeAccountBalance({
      accountId: account?.id ?? "",
      amountInCents: 10_000_000,
    });
    expect(rechargeError).toBeNull();

    // 3. Resolve a destination bank from the sandbox bank list.
    const [banksError, banks] = await payouts.listBanks();
    expect(banksError).toBeNull();
    const bank = banks?.find((b) => b.allowedForOrigin !== false) ?? banks?.[0];
    expect(bank?.id).toBeTruthy();

    // 4. Create the batch. `transactionStatus` forces the sandbox outcome.
    const reference = `sdk-it-payout-${Date.now()}`;
    const [createError, created] = await payouts.createPayout(
      {
        reference,
        accountId: account?.id ?? "",
        paymentType: "OTHER",
        transactionStatus: "APPROVED",
        transactions: [
          {
            legalIdType: "CC",
            legalId: "1000000000",
            bankId: bank?.id ?? "",
            accountType: "AHORROS",
            accountNumber: "12345678",
            personType: "NATURAL",
            name: "John Doe",
            email: "buyer@example.com",
            amount: 150_000,
            reference: `${reference}-tx-1`,
          },
        ],
      },
      { idempotencyKey: reference }
    );
    expect(createError).toBeNull();
    const payoutId = created?.payoutId;
    expect(payoutId).toBeTruthy();

    // 5. Poll until the sandbox settles the batch.
    let status: string | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const [getError, fetched] = await payouts.getPayout(payoutId ?? "");
      expect(getError).toBeNull();
      status = fetched?.status;
      if (status && TERMINAL_PAYOUT_STATUSES.has(status)) break;
      await sleep(2_000);
    }
    expect(TERMINAL_PAYOUT_STATUSES.has(status ?? "")).toBe(true);

    // 6. The batch's transactions must be listable and carry our reference.
    const [txError, txPage] = await payouts.listPayoutTransactions(payoutId ?? "");
    expect(txError).toBeNull();
    expect(txPage?.records.length).toBeGreaterThan(0);
    expect(
      txPage?.records.some((transaction) => transaction.reference === `${reference}-tx-1`)
    ).toBe(true);

    const [referenceError, referencePage] = await payouts.listTransactionsByReference(reference);
    expect(referenceError).toBeNull();
    expect(referencePage?.records.length).toBeGreaterThan(0);

    const [listError, page] = await payouts.listPayouts({ reference });
    expect(listError).toBeNull();
    expect(page?.records.some((payout) => payout.id === payoutId)).toBe(true);
  }, 90_000);

  it("reads limits and lists payout batches", async () => {
    const payouts = sandboxClient();

    const [limitsError, limits] = await payouts.getLimits();
    expect(limitsError).toBeNull();
    expect(limits).toBeTruthy();

    const [listError, page] = await payouts.listPayouts({ limit: 5, page: 1 });
    expect(listError).toBeNull();
    expect(Array.isArray(page?.records)).toBe(true);
  });
});
