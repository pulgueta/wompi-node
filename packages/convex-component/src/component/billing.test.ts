/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { initConvexTest } from "./setup.test.js";
import { api } from "./_generated/api.js";

const MONTH_MS_MIN = 28 * 86_400_000;

const CONFIG = {
  maxRetries: 3,
  retryScheduleMs: [1_000, 2_000, 4_000],
  onExhausted: "mark_unpaid" as const,
  leaseMs: 60_000,
};

const CARD = {
  wompiSourceId: 1234,
  type: "CARD",
  status: "AVAILABLE",
  brand: "VISA",
  lastFour: "4242",
};

async function seed(t: ReturnType<typeof initConvexTest>) {
  const customer = await t.mutation(api.customers.upsert, {
    userId: "user_1",
    email: "ada@example.com",
    fullName: "Ada Lovelace",
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
        key: "pro-trial",
        name: "Pro with trial",
        type: "subscription" as const,
        amountInCents: 2_990_000,
        interval: "month" as const,
        trialDays: 7,
      },
      {
        key: "sticker-pack",
        name: "Sticker pack",
        type: "one_time" as const,
        amountInCents: 500_000,
      },
    ],
  });

  return { customer };
}

describe("checkout payments", () => {
  test("approves via applyTransaction and is idempotent on redelivery", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const payment = await t.mutation(api.payments.createCheckout, {
      reference: "wmpk_test_1",
      customerId: customer._id,
      userId: "user_1",
      productKey: "sticker-pack",
    });

    expect(payment.status).toBe("pending");
    expect(payment.amountInCents).toBe(500_000);

    const first = await t.mutation(api.billing.applyTransaction, {
      reference: "wmpk_test_1",
      wompiTransactionId: "tx_1",
      wompiStatus: "APPROVED",
      amountInCents: 500_000,
      currency: "COP",
      config: CONFIG,
    });

    expect(first.outcome).toBe("applied");
    expect(first.payment?.status).toBe("approved");

    const second = await t.mutation(api.billing.applyTransaction, {
      reference: "wmpk_test_1",
      wompiTransactionId: "tx_1",
      wompiStatus: "APPROVED",
      amountInCents: 500_000,
      currency: "COP",
      config: CONFIG,
    });

    expect(second.outcome).toBe("noop");
    expect(second.paymentChanged).toBe(false);
  });

  test("rejects forged transactions with a different amount", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    await t.mutation(api.payments.createCheckout, {
      reference: "wmpk_test_2",
      customerId: customer._id,
      userId: "user_1",
      productKey: "sticker-pack",
    });

    const result = await t.mutation(api.billing.applyTransaction, {
      reference: "wmpk_test_2",
      wompiTransactionId: "tx_forged",
      wompiStatus: "APPROVED",
      amountInCents: 100,
      currency: "COP",
      config: CONFIG,
    });

    expect(result.outcome).toBe("amount_mismatch");
    expect(result.payment?.status).toBe("pending");
  });

  test("ignores references it does not own", async () => {
    const t = initConvexTest();
    await seed(t);

    const result = await t.mutation(api.billing.applyTransaction, {
      reference: "someone-elses-order",
      wompiTransactionId: "tx_x",
      wompiStatus: "APPROVED",
      config: CONFIG,
    });

    expect(result.outcome).toBe("unknown_reference");
  });
});

describe("subscription lifecycle", () => {
  test("activates on the approved initial charge", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const { subscription, payment } = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });

    expect(subscription.status).toBe("incomplete");
    expect(payment).not.toBeNull();
    expect(payment!.reference).toContain(subscription._id);

    const before = Date.now();
    const outcome = await t.mutation(api.billing.recordChargeResult, {
      paymentId: payment!._id,
      nextStatus: "approved",
      wompiTransactionId: "tx_init",
      config: CONFIG,
    });

    expect(outcome.subscription?.status).toBe("active");
    expect(outcome.subscription!.currentPeriodStart).toBeGreaterThanOrEqual(before - 1_000);
    expect(
      outcome.subscription!.currentPeriodEnd - outcome.subscription!.currentPeriodStart,
    ).toBeGreaterThanOrEqual(MONTH_MS_MIN);
    expect(outcome.subscription!.nextChargeAt).toBe(outcome.subscription!.currentPeriodEnd);
  });

  test("blocks duplicate live subscriptions to the same product", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const { payment } = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });
    await t.mutation(api.billing.recordChargeResult, {
      paymentId: payment!._id,
      nextStatus: "approved",
      config: CONFIG,
    });

    await expect(
      t.mutation(api.subscriptions.create, {
        customerId: customer._id,
        userId: "user_1",
        productKey: "pro-monthly",
        paymentSource: CARD,
      }),
    ).rejects.toThrow(/already exists/);
  });

  test("renews from the previous period end with a deterministic reference", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });
    const activated = await t.mutation(api.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "approved",
      config: CONFIG,
    });
    const periodEnd = activated.subscription!.currentPeriodEnd;

    await t.mutation(api.subscriptions.setNextChargeAt, {
      subscriptionId: created.subscription._id,
      at: Date.now() - 1_000,
    });

    const { claims, finalized } = await t.mutation(api.billing.claimDue, { config: CONFIG });

    expect(finalized).toHaveLength(0);
    expect(claims).toHaveLength(1);
    expect(claims[0].action).toBe("charge");
    expect(claims[0].wompiSourceId).toBe(1234);
    // periodEnd was clamped to "due now" by setNextChargeAt; the reference
    // encodes (subscription, period, attempt).
    expect(claims[0].payment.reference).toMatch(
      new RegExp(`^wmps_${created.subscription._id}_\\d+_a0$`),
    );
    expect(claims[0].payment.periodStart).toBe(claims[0].subscription.currentPeriodEnd);

    // The lease prevents a concurrent run from double-claiming.
    const second = await t.mutation(api.billing.claimDue, { config: CONFIG });
    expect(second.claims).toHaveLength(0);

    const renewed = await t.mutation(api.billing.recordChargeResult, {
      paymentId: claims[0].payment._id,
      nextStatus: "approved",
      wompiTransactionId: "tx_renewal",
      config: CONFIG,
    });

    expect(renewed.subscription?.status).toBe("active");
    expect(renewed.subscription!.currentPeriodStart).toBe(
      claims[0].subscription.currentPeriodEnd,
    );
    expect(renewed.subscription!.failedAttempts).toBe(0);
    void periodEnd;
  });

  test("walks the dunning ladder and marks unpaid when exhausted", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });
    await t.mutation(api.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "approved",
      config: CONFIG,
    });

    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
      await t.mutation(api.subscriptions.setNextChargeAt, {
        subscriptionId: created.subscription._id,
        at: Date.now() - 1_000,
      });

      const { claims } = await t.mutation(api.billing.claimDue, { config: CONFIG });
      expect(claims).toHaveLength(1);
      expect(claims[0].payment.reference).toMatch(new RegExp(`_a${attempt}$`));

      const before = Date.now();
      const outcome = await t.mutation(api.billing.recordChargeResult, {
        paymentId: claims[0].payment._id,
        nextStatus: "declined",
        failureReason: "Insufficient funds",
        config: CONFIG,
      });

      if (attempt < CONFIG.maxRetries) {
        expect(outcome.subscription?.status).toBe("past_due");
        expect(outcome.subscription!.failedAttempts).toBe(attempt + 1);
        const expectedDelay =
          CONFIG.retryScheduleMs[Math.min(attempt, CONFIG.retryScheduleMs.length - 1)];
        expect(outcome.subscription!.nextChargeAt).toBeGreaterThanOrEqual(
          before + expectedDelay - 50,
        );
      } else {
        expect(outcome.subscription?.status).toBe("unpaid");
        expect(outcome.subscription!.nextChargeAt).toBeUndefined();
        expect(outcome.subscription!.lastError).toBe("Insufficient funds");
      }
    }
  });

  test("cancels at period end without charging", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });
    await t.mutation(api.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "approved",
      config: CONFIG,
    });

    const canceled = await t.mutation(api.subscriptions.cancel, {
      subscriptionId: created.subscription._id,
      userId: "user_1",
    });
    expect(canceled.cancelAtPeriodEnd).toBe(true);
    expect(canceled.status).toBe("active");

    // Still entitled until the period actually ends.
    const current = await t.query(api.subscriptions.getCurrent, { userId: "user_1" });
    expect(current?._id).toBe(created.subscription._id);

    await t.mutation(api.subscriptions.setNextChargeAt, {
      subscriptionId: created.subscription._id,
      at: Date.now() - 1_000,
    });

    const { claims, finalized } = await t.mutation(api.billing.claimDue, { config: CONFIG });

    expect(claims).toHaveLength(0);
    expect(finalized).toHaveLength(1);
    expect(finalized[0].status).toBe("canceled");

    const after = await t.query(api.subscriptions.getCurrent, { userId: "user_1" });
    expect(after).toBeNull();
  });

  test("resume undoes cancel-at-period-end", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });
    await t.mutation(api.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "approved",
      config: CONFIG,
    });
    await t.mutation(api.subscriptions.cancel, {
      subscriptionId: created.subscription._id,
      userId: "user_1",
    });

    const resumed = await t.mutation(api.subscriptions.resume, {
      subscriptionId: created.subscription._id,
      userId: "user_1",
    });

    expect(resumed.cancelAtPeriodEnd).toBe(false);
    expect(resumed.canceledAt).toBeUndefined();
  });

  test("trials start without a charge and convert at trial end", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-trial",
      paymentSource: CARD,
    });

    expect(created.subscription.status).toBe("trialing");
    expect(created.payment).toBeNull();
    expect(created.subscription.trialEndsAt).toBe(created.subscription.currentPeriodEnd);

    // Trialing users are entitled.
    const current = await t.query(api.subscriptions.getCurrent, {
      userId: "user_1",
      productKey: "pro-trial",
    });
    expect(current?.status).toBe("trialing");

    await t.mutation(api.subscriptions.setNextChargeAt, {
      subscriptionId: created.subscription._id,
      at: Date.now() - 1_000,
    });

    const { claims } = await t.mutation(api.billing.claimDue, { config: CONFIG });
    expect(claims).toHaveLength(1);

    const converted = await t.mutation(api.billing.recordChargeResult, {
      paymentId: claims[0].payment._id,
      nextStatus: "approved",
      wompiTransactionId: "tx_conversion",
      config: CONFIG,
    });

    expect(converted.subscription?.status).toBe("active");
  });

  test("declined initial charge stays incomplete and is not entitled", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });

    const outcome = await t.mutation(api.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "declined",
      failureReason: "Card declined",
      config: CONFIG,
    });

    expect(outcome.subscription?.status).toBe("incomplete");
    expect(outcome.subscription?.lastError).toBe("Card declined");
    expect(outcome.subscription?.nextChargeAt).toBeUndefined();

    const current = await t.query(api.subscriptions.getCurrent, { userId: "user_1" });
    expect(current).toBeNull();

    // The user retries: the incomplete subscription is reused, not duplicated.
    const retried = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });
    expect(retried.subscription._id).toBe(created.subscription._id);
    expect(retried.payment!._id).not.toBe(created.payment!._id);
  });

  test("scheduled plan change applies at the next renewal claim", async () => {
    const t = initConvexTest();
    const { customer } = await seed(t);

    await t.mutation(api.products.sync, {
      products: [
        {
          key: "pro-yearly",
          name: "Pro yearly",
          type: "subscription" as const,
          amountInCents: 29_900_000,
          interval: "year" as const,
        },
      ],
    });

    const created = await t.mutation(api.subscriptions.create, {
      customerId: customer._id,
      userId: "user_1",
      productKey: "pro-monthly",
      paymentSource: CARD,
    });
    await t.mutation(api.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "approved",
      config: CONFIG,
    });

    await t.mutation(api.subscriptions.changeProduct, {
      subscriptionId: created.subscription._id,
      userId: "user_1",
      productKey: "pro-yearly",
    });

    await t.mutation(api.subscriptions.setNextChargeAt, {
      subscriptionId: created.subscription._id,
      at: Date.now() - 1_000,
    });

    const { claims } = await t.mutation(api.billing.claimDue, { config: CONFIG });

    expect(claims).toHaveLength(1);
    expect(claims[0].subscription.productKey).toBe("pro-yearly");
    expect(claims[0].payment.amountInCents).toBe(29_900_000);
    expect(claims[0].subscription.pendingProductKey).toBeUndefined();
  });
});

describe("webhook events", () => {
  test("deduplicates deliveries by checksum", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.webhooks.recordEvent, {
      checksum: "abc123",
      eventType: "transaction.updated",
      environment: "test",
      timestamp: 1_700_000_000,
    });
    const second = await t.mutation(api.webhooks.recordEvent, {
      checksum: "abc123",
      eventType: "transaction.updated",
      environment: "test",
      timestamp: 1_700_000_000,
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.eventId).toBe(first.eventId);
  });

  test("cleanup removes only events older than the cutoff", async () => {
    const t = initConvexTest();

    await t.mutation(api.webhooks.recordEvent, {
      checksum: "old",
      eventType: "transaction.updated",
      environment: "test",
      timestamp: 1_000,
    });
    await t.mutation(api.webhooks.recordEvent, {
      checksum: "new",
      eventType: "transaction.updated",
      environment: "test",
      timestamp: 2_000,
    });

    const deleted = await t.mutation(api.webhooks.cleanup, { olderThanTimestamp: 1_500 });
    expect(deleted).toBe(1);
  });
});
