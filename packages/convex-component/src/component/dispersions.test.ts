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
    });

    expect(result.changed).toBe(true);
    expect(result.dispersion.reference).toBe("made-in-dashboard");
    expect(result.dispersion.paymentType).toBe("PROVIDERS");
    expect(result.dispersion.amountInCents).toBe(900_000);
    expect(result.dispersion.transactionsTotal).toBe(0);
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
});
