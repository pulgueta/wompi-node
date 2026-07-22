/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { initConvexTest } from "./setup.test.js";
import { api } from "./_generated/api.js";

const BATCH = {
  wompiPayoutId: "payout_1",
  reference: "payroll-2026-07",
  status: "PENDING",
  paymentType: "PAYROLL",
  transactionsTotal: 2,
  transactionsSuccess: 2,
  transactionsFailed: 0,
  amountInCents: 1_500_000,
};

describe("dispersion records", () => {
  test("record upserts by wompiPayoutId (idempotent retries)", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.dispersions.record, BATCH);
    const second = await t.mutation(api.dispersions.record, {
      ...BATCH,
      // A retried action may carry drifted counts; the original row wins.
      transactionsSuccess: 0,
    });

    expect(second._id).toBe(first._id);
    expect(second.transactionsSuccess).toBe(2);

    const all = await t.query(api.dispersions.list, {});
    expect(all).toHaveLength(1);
  });
});

describe("payout webhook updates", () => {
  test("patches status once and finalizes on terminal statuses", async () => {
    const t = initConvexTest();
    await t.mutation(api.dispersions.record, BATCH);

    // Redelivered status: no change, callbacks must not fire.
    const same = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING",
    });
    expect(same.changed).toBe(false);

    const moved = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING_APPROVAL",
    });
    expect(moved.changed).toBe(true);
    expect(moved.dispersion.finalizedAt).toBeUndefined();

    const before = Date.now();
    const finalized = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "TOTAL_PAYMENT",
    });
    expect(finalized.changed).toBe(true);
    expect(finalized.dispersion.finalizedAt).toBeGreaterThanOrEqual(before - 1_000);

    const again = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "TOTAL_PAYMENT",
    });
    expect(again.changed).toBe(false);
  });

  test("creates a minimal row for payouts it never recorded", async () => {
    const t = initConvexTest();

    const result = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_external",
      status: "REJECTED",
      reference: "made-in-dashboard",
      paymentType: "PROVIDERS",
      amountInCents: 900_000,
      transactionsTotal: 3,
      eventTimestamp: 200,
    });

    expect(result.changed).toBe(true);
    expect(result.dispersion.reference).toBe("made-in-dashboard");
    expect(result.dispersion.paymentType).toBe("PROVIDERS");
    expect(result.dispersion.amountInCents).toBe(900_000);
    expect(result.dispersion.transactionsTotal).toBe(3);
    // Terminal on arrival still finalizes.
    expect(result.dispersion.finalizedAt).toBeDefined();
  });

  test("upserts transactions by wompiTransactionId", async () => {
    const t = initConvexTest();
    const dispersion = await t.mutation(api.dispersions.record, BATCH);

    const inserted = await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "ptx_1",
      status: "PROCESSING",
      amountInCents: 1_000_000,
      payeeName: "John Doe",
      payeeKey: "@JOHNDOE",
    });
    expect(inserted.changed).toBe(true);
    expect(inserted.dispersionChanged).toBe(false);
    expect(inserted.transaction.dispersionId).toBe(dispersion._id);

    // Redelivery of the same status is a no-op.
    const redelivered = await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "ptx_1",
      status: "PROCESSING",
      amountInCents: 1_000_000,
    });
    expect(redelivered.changed).toBe(false);

    const failed = await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "ptx_1",
      status: "FAILED",
      amountInCents: 1_000_000,
      failureReason: "Cuenta inexistente",
    });
    expect(failed.changed).toBe(true);
    expect(failed.transaction.status).toBe("FAILED");
    expect(failed.transaction.failureReason).toBe("Cuenta inexistente");
    expect(failed.transaction.updatedAt).toBeGreaterThanOrEqual(inserted.transaction.updatedAt);

    const transactions = await t.query(api.dispersions.listTransactions, {
      dispersionId: dispersion._id,
    });
    expect(transactions).toHaveLength(1);
  });

  test("a transaction event lazily creates its unknown parent batch", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_external",
      wompiTransactionId: "ptx_ext_1",
      status: "APPROVED",
      amountInCents: 500_000,
    });
    expect(first.dispersionChanged).toBe(true);
    expect(first.dispersion.status).toBe("PENDING");
    expect(first.dispersion.transactionsTotal).toBe(0);

    // The parent now exists; a sibling event must not recreate it.
    const second = await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_external",
      wompiTransactionId: "ptx_ext_2",
      status: "APPROVED",
      amountInCents: 500_000,
    });
    expect(second.dispersionChanged).toBe(false);
    expect(second.dispersion._id).toBe(first.dispersion._id);
  });
});

describe("dispersion queries", () => {
  test("get, getByReference and list answer from indexes", async () => {
    const t = initConvexTest();
    await t.mutation(api.dispersions.record, BATCH);
    await t.mutation(api.dispersions.record, {
      ...BATCH,
      wompiPayoutId: "payout_2",
      reference: "providers-2026-07",
      paymentType: "PROVIDERS",
    });
    await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_2",
      status: "TOTAL_PAYMENT",
    });

    const byId = await t.query(api.dispersions.get, { wompiPayoutId: "payout_2" });
    expect(byId?.status).toBe("TOTAL_PAYMENT");
    expect(await t.query(api.dispersions.get, { wompiPayoutId: "nope" })).toBeNull();

    const byReference = await t.query(api.dispersions.getByReference, {
      reference: "payroll-2026-07",
    });
    expect(byReference?.wompiPayoutId).toBe("payout_1");

    const pending = await t.query(api.dispersions.list, { status: "PENDING" });
    expect(pending).toHaveLength(1);
    expect(pending[0].wompiPayoutId).toBe("payout_1");

    const limited = await t.query(api.dispersions.list, { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  test("getByReference returns the most recent batch on reused references", async () => {
    const t = initConvexTest();
    await t.mutation(api.dispersions.record, BATCH);
    const reused = await t.mutation(api.dispersions.record, {
      ...BATCH,
      wompiPayoutId: "payout_reused",
    });

    const found = await t.query(api.dispersions.getByReference, {
      reference: "payroll-2026-07",
    });
    expect(found?._id).toBe(reused._id);
  });
});

describe("payout webhook events", () => {
  test("records deliveries without an environment field", async () => {
    const t = initConvexTest();

    // Payout event envelopes carry no environment, unlike payments events.
    const first = await t.mutation(api.webhooks.recordEvent, {
      checksum: "payout-abc",
      eventType: "payout.updated",
      timestamp: 1_700_000_000,
    });
    const second = await t.mutation(api.webhooks.recordEvent, {
      checksum: "payout-abc",
      eventType: "payout.updated",
      timestamp: 1_700_000_000,
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.eventId).toBe(first.eventId);
  });

  test("duplicates expose whether the first delivery finished applying", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.webhooks.recordEvent, {
      checksum: "payout-crash",
      eventType: "payout.updated",
      timestamp: 1_700_000_000,
    });

    // Outcome never marked — the apply crashed; a retry must be reprocessable.
    const retry = await t.mutation(api.webhooks.recordEvent, {
      checksum: "payout-crash",
      eventType: "payout.updated",
      timestamp: 1_700_000_000,
    });
    expect(retry.duplicate).toBe(true);
    expect(retry.outcome).toBeUndefined();

    await t.mutation(api.webhooks.markOutcome, { eventId: first.eventId, outcome: "applied" });

    const settled = await t.mutation(api.webhooks.recordEvent, {
      checksum: "payout-crash",
      eventType: "payout.updated",
      timestamp: 1_700_000_000,
    });
    expect(settled.outcome).toBe("applied");
  });
});

describe("stub enrichment", () => {
  test("record backfills a row a webhook stubbed first", async () => {
    const t = initConvexTest();

    // transaction.updated outran the create action: stub with empty identity.
    await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "txn_1",
      status: "APPROVED",
      amountInCents: 750_000,
    });

    const recorded = await t.mutation(api.dispersions.record, BATCH);

    expect(recorded.reference).toBe("payroll-2026-07");
    expect(recorded.paymentType).toBe("PAYROLL");
    expect(recorded.transactionsTotal).toBe(2);
    expect(recorded.amountInCents).toBe(1_500_000);

    const found = await t.query(api.dispersions.getByReference, {
      reference: "payroll-2026-07",
    });
    expect(found?.wompiPayoutId).toBe("payout_1");
  });

  test("record backfills validation counts after a payout webhook sets the total", async () => {
    const t = initConvexTest();

    await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING",
      reference: "payroll-2026-07",
      paymentType: "PAYROLL",
      transactionsTotal: 2,
    });

    const recorded = await t.mutation(api.dispersions.record, BATCH);

    expect(recorded.transactionsTotal).toBe(2);
    expect(recorded.transactionsSuccess).toBe(2);
    expect(recorded.transactionsFailed).toBe(0);
  });

  test("applyPayoutUpdate backfills identity even when the status is unchanged", async () => {
    const t = initConvexTest();

    await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "txn_1",
      status: "APPROVED",
      amountInCents: 750_000,
    });

    // Same status as the stub, but now the event names the batch.
    const enriched = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING",
      reference: "payroll-2026-07",
      paymentType: "PAYROLL",
      amountInCents: 1_500_000,
    });

    expect(enriched.changed).toBe(true);
    expect(enriched.dispersion.reference).toBe("payroll-2026-07");
    expect(enriched.dispersion.paymentType).toBe("PAYROLL");
    expect(enriched.dispersion.amountInCents).toBe(1_500_000);

    // Nothing left to fill: the redelivery is a clean no-op again.
    const redelivered = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING",
      reference: "payroll-2026-07",
      paymentType: "PAYROLL",
    });
    expect(redelivered.changed).toBe(false);
  });

  test.each(["PARTIAL_PAYMENT", "NOT_APPROVED", "AFE_REJECTED"])(
    "%s remains mutable without a documented finality guarantee",
    async (status) => {
      const t = initConvexTest();
      await t.mutation(api.dispersions.record, BATCH);

      const intermediate = await t.mutation(api.dispersions.applyPayoutUpdate, {
        wompiPayoutId: "payout_1",
        status,
      });
      expect(intermediate.changed).toBe(true);
      expect(intermediate.dispersion.finalizedAt).toBeUndefined();

      const finalized = await t.mutation(api.dispersions.applyPayoutUpdate, {
        wompiPayoutId: "payout_1",
        status: "TOTAL_PAYMENT",
      });
      expect(finalized.changed).toBe(true);
      expect(finalized.dispersion.status).toBe("TOTAL_PAYMENT");
      expect(finalized.dispersion.finalizedAt).toBeDefined();
    },
  );
});

describe("out-of-order deliveries", () => {
  test("a stale non-terminal payout status never overwrites a settled batch", async () => {
    const t = initConvexTest();
    await t.mutation(api.dispersions.record, BATCH);
    await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "TOTAL_PAYMENT",
    });

    const stale = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING",
    });

    expect(stale.changed).toBe(false);
    expect(stale.dispersion.status).toBe("TOTAL_PAYMENT");
    expect(stale.dispersion.finalizedAt).toBeDefined();
  });

  test("a stale non-terminal transaction status never overwrites a settled one", async () => {
    const t = initConvexTest();

    await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "txn_1",
      status: "APPROVED",
      amountInCents: 750_000,
    });

    const stale = await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "txn_1",
      status: "PROCESSING",
      amountInCents: 750_000,
    });

    expect(stale.changed).toBe(false);
    expect(stale.transaction.status).toBe("APPROVED");
  });

  test("an older payout event cannot regress a newer non-terminal status", async () => {
    const t = initConvexTest();
    await t.mutation(api.dispersions.record, BATCH);

    await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING_APPROVAL",
      eventTimestamp: 100,
    });
    await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING",
      eventTimestamp: 200,
    });
    const stale = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING_APPROVAL",
      eventTimestamp: 150,
    });

    expect(stale.changed).toBe(false);
    expect(stale.dispersion.status).toBe("PENDING");
  });

  test("an older terminal payout event cannot replace a newer terminal status", async () => {
    const t = initConvexTest();
    await t.mutation(api.dispersions.record, BATCH);

    await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "TOTAL_PAYMENT",
      eventTimestamp: 200,
    });
    const stale = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "REJECTED",
      eventTimestamp: 100,
    });

    expect(stale.changed).toBe(false);
    expect(stale.dispersion.status).toBe("TOTAL_PAYMENT");
  });

  test("an older transaction event cannot regress a newer processing status", async () => {
    const t = initConvexTest();

    await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "txn_1",
      status: "PENDING",
      amountInCents: 750_000,
      eventTimestamp: 100,
    });
    await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "txn_1",
      status: "PROCESSING",
      amountInCents: 750_000,
      eventTimestamp: 200,
    });
    const stale = await t.mutation(api.dispersions.applyTransactionUpdate, {
      wompiPayoutId: "payout_1",
      wompiTransactionId: "txn_1",
      status: "PENDING",
      amountInCents: 750_000,
      eventTimestamp: 150,
    });

    expect(stale.changed).toBe(false);
    expect(stale.transaction.status).toBe("PROCESSING");
  });

  test("payout events replace provisional totals and amounts with authoritative values", async () => {
    const t = initConvexTest();
    await t.mutation(api.dispersions.record, BATCH);

    const corrected = await t.mutation(api.dispersions.applyPayoutUpdate, {
      wompiPayoutId: "payout_1",
      status: "PENDING",
      transactionsTotal: 1,
      amountInCents: 500_000,
      eventTimestamp: 200,
    });

    expect(corrected.changed).toBe(true);
    expect(corrected.dispersion.transactionsTotal).toBe(1);
    expect(corrected.dispersion.amountInCents).toBe(500_000);
    expect(corrected.dispersion.transactionsSuccess).toBe(2);
    expect(corrected.dispersion.transactionsFailed).toBe(0);
  });
});

describe("payout webhook retention", () => {
  test("normalizes millisecond payout timestamps so processed events can expire", async () => {
    const t = initConvexTest();

    await t.mutation(api.webhooks.recordEvent, {
      checksum: "payout-ms-timestamp",
      eventType: "payout.updated",
      timestamp: 1_747_673_128_600,
    });

    const deleted = await t.mutation(api.webhooks.cleanup, {
      olderThanTimestamp: 1_800_000_000,
    });

    expect(deleted).toBe(1);
  });

  test("deduplicates and applies a payout delivery in one component mutation", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.webhooks.processPayoutUpdate, {
      checksum: "payout-atomic",
      eventType: "payout.updated",
      timestamp: 1_747_673_128_600,
      payout: {
        wompiPayoutId: "payout-atomic",
        status: "PENDING",
        reference: "providers-atomic",
        paymentType: "PROVIDERS",
        transactionsTotal: 1,
        amountInCents: 500_000,
      },
    });
    const duplicate = await t.mutation(api.webhooks.processPayoutUpdate, {
      checksum: "payout-atomic",
      eventType: "payout.updated",
      timestamp: 1_747_673_129_600,
      payout: {
        wompiPayoutId: "payout-atomic",
        status: "REJECTED",
      },
    });

    expect(first).toEqual({ duplicate: false, outcome: "applied" });
    expect(duplicate).toEqual({ duplicate: true, outcome: "applied" });
    const dispersion = await t.query(api.dispersions.get, {
      wompiPayoutId: "payout-atomic",
    });
    expect(dispersion?.status).toBe("PENDING");
  });

  test("deduplicates and applies a transaction delivery in one component mutation", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.webhooks.processPayoutTransactionUpdate, {
      checksum: "transaction-atomic",
      eventType: "transaction.updated",
      timestamp: 1_747_673_128_600,
      transaction: {
        wompiPayoutId: "payout-atomic",
        wompiTransactionId: "transaction-atomic",
        status: "PROCESSING",
        amountInCents: 500_000,
        payeeName: "John Doe",
      },
    });
    const duplicate = await t.mutation(api.webhooks.processPayoutTransactionUpdate, {
      checksum: "transaction-atomic",
      eventType: "transaction.updated",
      timestamp: 1_747_673_129_600,
      transaction: {
        wompiPayoutId: "payout-atomic",
        wompiTransactionId: "transaction-atomic",
        status: "FAILED",
        amountInCents: 500_000,
      },
    });

    expect(first).toEqual({ duplicate: false, outcome: "applied" });
    expect(duplicate).toEqual({ duplicate: true, outcome: "applied" });
    const dispersion = await t.query(api.dispersions.get, {
      wompiPayoutId: "payout-atomic",
    });
    const transactions = await t.query(api.dispersions.listTransactions, {
      dispersionId: dispersion!._id,
    });
    expect(transactions[0]?.status).toBe("PROCESSING");
  });
});
