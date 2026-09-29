/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { initConvexTest, modules } from "./setup.test.js";
import schema from "./schema.js";
import { api } from "./_generated/api.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const SWEEP = { olderThanMs: 10 * MINUTE_MS, expireAfterMs: 26 * HOUR_MS };

const CONFIG = {
  maxRetries: 3,
  retryScheduleMs: [1_000],
  onExhausted: "mark_unpaid" as const,
  leaseMs: 10 * MINUTE_MS,
};

type Harness = ReturnType<typeof initConvexTest>;

async function seed(t: Harness) {
  const customer = await t.mutation(api.customers.upsert, {
    userId: "user_1",
    email: "ada@example.com",
  });
  await t.mutation(api.products.sync, {
    products: [
      {
        key: "pro-monthly",
        name: "Pro",
        type: "subscription" as const,
        amountInCents: 2_990_000,
        interval: "month" as const,
      },
      {
        key: "sticker-pack",
        name: "Sticker pack",
        type: "one_time" as const,
        amountInCents: 500_000,
      },
    ],
  });
  return customer;
}

/** A pending checkout. With `transactionId`, Wompi already has a transaction for it. */
async function checkout(
  t: Harness,
  customerId: string,
  reference: string,
  transactionId?: string,
) {
  const payment = await t.mutation(api.payments.createCheckout, {
    reference,
    customerId: customerId as never,
    userId: "user_1",
    productKey: "sticker-pack",
  });
  if (transactionId) {
    await t.mutation(api.billing.applyTransaction, {
      reference,
      wompiTransactionId: transactionId,
      wompiStatus: "PENDING",
      config: CONFIG,
    });
  }
  return payment;
}

const references = (payments: { reference: string }[]) =>
  payments.map((payment) => payment.reference);

describe("claimStalePending", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("gives no payment that is younger than the sweep age", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    await checkout(t, customer._id, "wmpk_fresh", "tx_fresh");

    vi.advanceTimersByTime(9 * MINUTE_MS);
    expect(await t.mutation(api.payments.claimStalePending, SWEEP)).toEqual({
      payments: [],
      hasMore: false,
    });

    vi.advanceTimersByTime(2 * MINUTE_MS);
    const { payments } = await t.mutation(
      api.payments.claimStalePending,
      SWEEP,
    );
    expect(references(payments)).toEqual(["wmpk_fresh"]);
  });

  test("gives only pending payments", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    await checkout(t, customer._id, "wmpk_pending", "tx_pending");
    await checkout(t, customer._id, "wmpk_approved");
    await t.mutation(api.billing.applyTransaction, {
      reference: "wmpk_approved",
      wompiTransactionId: "tx_approved",
      wompiStatus: "APPROVED",
      config: CONFIG,
    });

    vi.advanceTimersByTime(11 * MINUTE_MS);
    const { payments } = await t.mutation(
      api.payments.claimStalePending,
      SWEEP,
    );

    expect(references(payments)).toEqual(["wmpk_pending"]);
  });

  test("abandoned checkouts that cannot expire yet do not block a payment behind them", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    // More abandoned checkouts than one sweep gives, all older than the paid one.
    for (let i = 0; i < 60; i++) {
      await checkout(t, customer._id, `wmpk_abandoned_${i}`);
      vi.advanceTimersByTime(1);
    }
    await checkout(t, customer._id, "wmpk_paid", "tx_paid");

    vi.advanceTimersByTime(11 * MINUTE_MS);
    const first = await t.mutation(api.payments.claimStalePending, {
      ...SWEEP,
      limit: 50,
    });

    // The sweep has no work for an abandoned checkout until it can expire.
    expect(references(first.payments)).toEqual(["wmpk_paid"]);
    expect(first.hasMore).toBe(false);
  });

  test("gives an abandoned checkout when it is old enough to expire", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    await checkout(t, customer._id, "wmpk_abandoned");

    vi.advanceTimersByTime(25 * HOUR_MS);
    expect(
      (await t.mutation(api.payments.claimStalePending, SWEEP)).payments,
    ).toEqual([]);

    vi.advanceTimersByTime(2 * HOUR_MS);
    const { payments } = await t.mutation(
      api.payments.claimStalePending,
      SWEEP,
    );
    expect(references(payments)).toEqual(["wmpk_abandoned"]);
  });

  test("gives a subscription charge that has no transaction", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: { wompiSourceId: 1234, type: "CARD", status: "AVAILABLE" },
    });

    vi.advanceTimersByTime(11 * MINUTE_MS);
    const { payments } = await t.mutation(
      api.payments.claimStalePending,
      SWEEP,
    );

    expect(references(payments)).toEqual([created.payment!.reference]);
  });

  test("reaches each payment when more stay pending than one sweep gives", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    for (let i = 1; i <= 5; i++) {
      await checkout(t, customer._id, `wmpk_${i}`, `tx_${i}`);
      vi.advanceTimersByTime(1);
    }
    vi.advanceTimersByTime(11 * MINUTE_MS);
    const sweep = () =>
      t.mutation(api.payments.claimStalePending, { ...SWEEP, limit: 2 });

    // No payment is resolved between the sweeps: all five stay pending.
    const first = await sweep();
    expect(references(first.payments)).toEqual(["wmpk_1", "wmpk_2"]);
    expect(first.hasMore).toBe(true);

    const second = await sweep();
    expect(references(second.payments)).toEqual(["wmpk_3", "wmpk_4"]);
    expect(second.hasMore).toBe(true);

    const third = await sweep();
    expect(references(third.payments)).toEqual(["wmpk_5"]);
    expect(third.hasMore).toBe(false);

    // The wait time between passes did not stop the pass between its calls.
    // The pass is complete, and the next pass waits for the sweep age.
    expect(await sweep()).toEqual({ payments: [], hasMore: false });

    vi.advanceTimersByTime(10 * MINUTE_MS);
    const again = await sweep();
    expect(references(again.payments)).toEqual(["wmpk_1", "wmpk_2"]);
  });

  test("waits for the sweep age after the start of a pass before the next pass", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    await checkout(t, customer._id, "wmpk_1", "tx_1");
    await checkout(t, customer._id, "wmpk_2", "tx_2");
    vi.advanceTimersByTime(11 * MINUTE_MS);

    // The first call has no state row.
    const first = await t.mutation(api.payments.claimStalePending, SWEEP);
    expect(references(first.payments)).toEqual(["wmpk_1", "wmpk_2"]);
    expect(first.hasMore).toBe(false);

    vi.advanceTimersByTime(10 * MINUTE_MS - 1);
    expect(await t.mutation(api.payments.claimStalePending, SWEEP)).toEqual({
      payments: [],
      hasMore: false,
    });

    await t.mutation(api.billing.applyTransaction, {
      reference: "wmpk_1",
      wompiTransactionId: "tx_1",
      wompiStatus: "APPROVED",
      config: CONFIG,
    });
    vi.advanceTimersByTime(1);
    const next = await t.mutation(api.payments.claimStalePending, SWEEP);
    expect(references(next.payments)).toEqual(["wmpk_2"]);
  });

  test("a call that finds no stale payment does not start the wait time", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    expect(await t.mutation(api.payments.claimStalePending, SWEEP)).toEqual({
      payments: [],
      hasMore: false,
    });

    await checkout(t, customer._id, "wmpk_1", "tx_1");
    vi.advanceTimersByTime(11 * MINUTE_MS);
    const { payments } = await t.mutation(
      api.payments.claimStalePending,
      SWEEP,
    );
    expect(references(payments)).toEqual(["wmpk_1"]);
  });

  test("a new pass includes the payments that became stale during the last pass", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    await checkout(t, customer._id, "wmpk_old", "tx_old");
    vi.advanceTimersByTime(11 * MINUTE_MS);
    await t.mutation(api.payments.claimStalePending, SWEEP);

    await checkout(t, customer._id, "wmpk_new", "tx_new");
    vi.advanceTimersByTime(11 * MINUTE_MS);
    const { payments } = await t.mutation(
      api.payments.claimStalePending,
      SWEEP,
    );

    expect(references(payments)).toEqual(["wmpk_old", "wmpk_new"]);
  });

  test("does not change a payment row", async () => {
    const t = initConvexTest();
    const customer = await seed(t);
    const payment = await checkout(t, customer._id, "wmpk_1", "tx_1");
    const stored = () =>
      t.run(async (ctx) => await ctx.db.get("payments", payment._id));
    vi.advanceTimersByTime(11 * MINUTE_MS);
    const before = await stored();

    const { payments } = await t.mutation(
      api.payments.claimStalePending,
      SWEEP,
    );

    expect(payments).toEqual([before]);
    expect(await stored()).toEqual(before);
  });

  test("stops before it reads more bytes than the transaction can hold", async () => {
    const MiB = 1 << 20;
    const t = convexTest({
      schema,
      modules,
      transactionLimits: { bytesRead: 5 * MiB },
    });
    const customer = await seed(t);
    // Ten payments of about 600 KB each: together more than the read limit.
    for (let i = 0; i < 10; i++) {
      const payment = await checkout(t, customer._id, `wmpk_${i}`, `tx_${i}`);
      await t.run(async (ctx) => {
        await ctx.db.patch("payments", payment._id, {
          metadata: { note: "x".repeat(600_000) },
        });
      });
      vi.advanceTimersByTime(1);
    }
    vi.advanceTimersByTime(11 * MINUTE_MS);

    const seen: string[] = [];
    let hasMore = true;
    for (let call = 0; hasMore && call < 10; call++) {
      const result = await t.mutation(api.payments.claimStalePending, SWEEP);
      expect(result.payments.length).toBeLessThan(10);
      seen.push(...references(result.payments));
      hasMore = result.hasMore;
    }

    expect(hasMore).toBe(false);
    expect(seen).toEqual(Array.from({ length: 10 }, (_, i) => `wmpk_${i}`));
  });
});

describe("claimDue", () => {
  async function dueSubscriptions(t: Harness, count: number) {
    await seed(t);
    for (let i = 0; i < count; i++) {
      const customer = await t.mutation(api.customers.upsert, {
        userId: `user_due_${i}`,
        email: `due_${i}@example.com`,
      });
      const created = await t.mutation(api.subscriptions.create, {
        customerId: customer._id,
        userId: `user_due_${i}`,
        productKey: "pro-monthly",
        paymentSource: {
          wompiSourceId: 1000 + i,
          type: "CARD",
          status: "AVAILABLE",
        },
      });
      await t.mutation(api.billing.recordChargeResult, {
        paymentId: created.payment!._id,
        nextStatus: "approved",
        config: CONFIG,
      });
      await t.mutation(api.subscriptions.setNextChargeAt, {
        subscriptionId: created.subscription._id,
        at: Date.now() - 1_000,
      });
    }
  }

  test("reports that more subscriptions are due than the batch holds", async () => {
    const t = initConvexTest();
    await dueSubscriptions(t, 3);

    const first = await t.mutation(api.billing.claimDue, {
      batchSize: 2,
      config: CONFIG,
    });
    expect(first.claims).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    // The lease hides the first two, so the next call gets the last one.
    const second = await t.mutation(api.billing.claimDue, {
      batchSize: 2,
      config: CONFIG,
    });
    expect(second.claims).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  test("reports no more work when the batch holds each due subscription", async () => {
    const t = initConvexTest();
    await dueSubscriptions(t, 2);

    const { claims, hasMore } = await t.mutation(api.billing.claimDue, {
      batchSize: 2,
      config: CONFIG,
    });

    expect(claims).toHaveLength(2);
    expect(hasMore).toBe(false);
  });
});
