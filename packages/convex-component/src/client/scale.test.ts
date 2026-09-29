/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";
import type { WompiConfig } from "./index.js";
import { Wompi } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

type Harness = ReturnType<typeof initConvexTest>;

const CRON_CONFIG = {
  maxRetries: 3,
  retryScheduleMs: [1_000],
  onExhausted: "mark_unpaid" as const,
  leaseMs: 0,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const merchant = () =>
  json({
    data: {
      id: 1,
      presigned_acceptance: {
        acceptance_token: "acc_token",
        permalink: "https://wompi.co/terms.pdf",
        type: "END_USER_POLICY",
      },
      presigned_personal_data_auth: {
        acceptance_token: "personal_token",
        permalink: "https://wompi.co/personal-data.pdf",
        type: "PERSONAL_DATA_AUTH",
      },
    },
  });

const transaction = (
  id: string,
  status: string,
  reference: string,
  amount: number,
) => ({
  id,
  status,
  reference,
  amount_in_cents: amount,
  currency: "COP",
  payment_method_type: "CARD",
  created_at: "2026-08-18T10:00:00.000Z",
});

type Call = { method: string; url: string; body: Record<string, unknown> };
type Route = {
  method: string;
  path: RegExp;
  respond: (call: Call) => Response | Promise<Response>;
};

const mockWompi = (routes: Route[]) => {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url: String(input),
        body: init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : {},
      };
      const route = routes.find(
        (r) => r.method === call.method && r.path.test(call.url),
      );
      if (!route)
        throw new Error(`Unexpected fetch ${call.method} ${call.url}`);
      calls.push(call);
      return await route.respond(call);
    }),
  );
  return {
    to: (method: string, path: RegExp) =>
      calls.filter((call) => call.method === method && path.test(call.url)),
  };
};

const MERCHANT: Route = {
  method: "GET",
  path: /\/merchants\//,
  respond: () => merchant(),
};
const NO_TRANSACTIONS: Route = {
  method: "GET",
  path: /\/transactions\?reference=/,
  respond: () => json({ data: [] }),
};
const chargeWith = (status: string): Route => ({
  method: "POST",
  path: /\/transactions$/,
  respond: ({ body }) =>
    json({
      data: transaction(
        `tx_${String(body.reference)}`,
        status,
        String(body.reference),
        Number(body.amount_in_cents),
      ),
    }),
});

const makeWompi = (billing: WompiConfig["billing"] = {}) =>
  new Wompi(components.wompi, {
    getUserInfo: async () => ({ userId: "user_1", email: "ada@example.com" }),
    publicKey: "pub_test_key",
    privateKey: "prv_test_key",
    eventsKey: "test_events_key",
    integrityKey: "integrity_key",
    sandbox: true,
    billing: {
      // The lease hides a claimed subscription from the next run.
      leaseMs: 10 * 60_000,
      pollIntervalMs: 0,
      pendingSweepAfterMs: 0,
      ...billing,
    },
  });

async function seedProducts(t: Harness) {
  await t.mutation(components.wompi.products.sync, {
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
}

/** `count` active subscriptions, each for its own user, all due now. */
async function dueRenewals(t: Harness, count: number) {
  await seedProducts(t);
  const subscriptionIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const customer = await t.mutation(components.wompi.customers.upsert, {
      userId: `user_${i}`,
      email: `user_${i}@example.com`,
    });
    const created = await t.mutation(components.wompi.subscriptions.create, {
      customerId: customer._id,
      userId: `user_${i}`,
      productKey: "pro-monthly",
      paymentSource: {
        wompiSourceId: 1000 + i,
        type: "CARD",
        status: "AVAILABLE",
      },
    });
    await t.mutation(components.wompi.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "approved",
      wompiTransactionId: `tx_init_${i}`,
      config: CRON_CONFIG,
    });
    await t.mutation(components.wompi.subscriptions.setNextChargeAt, {
      subscriptionId: created.subscription._id,
      at: Date.now() - 1_000,
    });
    subscriptionIds.push(created.subscription._id);
  }
  return subscriptionIds;
}

const statusOf = async (t: Harness, reference: string) =>
  (await t.query(components.wompi.payments.getByReference, { reference }))
    ?.status;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("processBilling: work that remains", () => {
  test("remaining is true until a run claims the last due subscription", async () => {
    const t = initConvexTest();
    await dueRenewals(t, 5);
    const wompi = mockWompi([
      MERCHANT,
      chargeWith("APPROVED"),
      NO_TRANSACTIONS,
    ]);
    const run = () =>
      t.action(
        async (ctx) => await makeWompi().processBilling(ctx, { batchSize: 2 }),
      );

    const first = await run();
    expect(first).toMatchObject({ claimed: 2, approved: 2, remaining: true });

    const second = await run();
    expect(second).toMatchObject({ claimed: 2, approved: 2, remaining: true });

    const third = await run();
    expect(third).toMatchObject({ claimed: 1, approved: 1, remaining: false });

    const fourth = await run();
    expect(fourth).toMatchObject({ claimed: 0, remaining: false });
    expect(wompi.to("POST", /\/transactions$/)).toHaveLength(5);
  });

  test("remaining is true when the sweep has more stale payments than its batch", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const customer = await t.mutation(components.wompi.customers.upsert, {
      userId: "user_1",
      email: "ada@example.com",
    });
    // More stale payments with a Wompi transaction than one sweep takes.
    for (let i = 0; i < 60; i++) {
      await t.mutation(components.wompi.payments.createCheckout, {
        reference: `wmpk_${i}`,
        customerId: customer._id,
        userId: "user_1",
        productKey: "sticker-pack",
      });
      await t.mutation(components.wompi.billing.applyTransaction, {
        reference: `wmpk_${i}`,
        wompiTransactionId: `tx_${i}`,
        wompiStatus: "PENDING",
        config: CRON_CONFIG,
      });
    }
    const wompi = mockWompi([
      {
        method: "GET",
        path: /\/transactions\/tx_\d+$/,
        respond: ({ url }) => {
          const id = url.split("/").pop()!;
          return json({
            data: transaction(
              id,
              "APPROVED",
              `wmpk_${id.replace("tx_", "")}`,
              500_000,
            ),
          });
        },
      },
    ]);
    const run = () =>
      t.action(async (ctx) => await makeWompi().processBilling(ctx));

    const first = await run();
    expect(first).toMatchObject({
      sweptPending: 50,
      remaining: true,
      errors: [],
    });

    const second = await run();
    expect(second).toMatchObject({
      sweptPending: 10,
      remaining: false,
      errors: [],
    });

    expect(wompi.to("GET", /\/transactions\/tx_/)).toHaveLength(60);
    for (const reference of ["wmpk_0", "wmpk_49", "wmpk_50", "wmpk_59"]) {
      expect(await statusOf(t, reference)).toBe("approved");
    }
  });
});

describe("processBilling: charges in parallel", () => {
  test("runs no more than five charges at the same time", async () => {
    const t = initConvexTest();
    await dueRenewals(t, 12);
    let inFlight = 0;
    let maxInFlight = 0;
    const wompi = mockWompi([
      MERCHANT,
      {
        method: "POST",
        path: /\/transactions$/,
        respond: async ({ body }) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight--;
          return json({
            data: transaction(
              `tx_${String(body.reference)}`,
              "APPROVED",
              String(body.reference),
              2_990_000,
            ),
          });
        },
      },
      NO_TRANSACTIONS,
    ]);

    const summary = await t.action(
      async (ctx) => await makeWompi().processBilling(ctx, { batchSize: 12 }),
    );

    expect(summary).toMatchObject({ claimed: 12, approved: 12, errors: [] });
    expect(maxInFlight).toBe(5);
    // Each subscription got one charge, on its own payment source.
    const sources = wompi
      .to("POST", /\/transactions$/)
      .map((call) => call.body.payment_source_id);
    expect(new Set(sources).size).toBe(12);
  });

  test("one charge that throws does not stop the other charges", async () => {
    const t = initConvexTest();
    await dueRenewals(t, 6);
    mockWompi([
      MERCHANT,
      {
        method: "POST",
        path: /\/transactions$/,
        respond: ({ body }) => {
          if (body.payment_source_id === 1002) {
            return json(
              { error: { type: "UNAUTHORIZED", reason: "bad key" } },
              401,
            );
          }
          return json({
            data: transaction(
              `tx_${String(body.reference)}`,
              "APPROVED",
              String(body.reference),
              2_990_000,
            ),
          });
        },
      },
      NO_TRANSACTIONS,
    ]);

    const summary = await t.action(
      async (ctx) => await makeWompi().processBilling(ctx, { batchSize: 6 }),
    );

    expect(summary).toMatchObject({ claimed: 6, approved: 5, declined: 1 });
  });
});

describe("processBilling: no poll in the charge loop", () => {
  test("a renewal that Wompi keeps pending is recorded and the next run reconciles it", async () => {
    const t = initConvexTest();
    const [subscriptionId] = await dueRenewals(t, 1);
    let wompiStatus = "PENDING";
    const wompi = mockWompi([
      MERCHANT,
      chargeWith("PENDING"),
      {
        method: "GET",
        path: /\/transactions\/tx_/,
        respond: ({ url }) => {
          const id = url.split("/").pop()!;
          return json({
            data: transaction(
              id,
              wompiStatus,
              id.replace(/^tx_/, ""),
              2_990_000,
            ),
          });
        },
      },
      NO_TRANSACTIONS,
    ]);
    // Defaults: the interactive poll (8 attempts) must not apply to the cron.
    const billing = makeWompi({ leaseMs: 0, pendingSweepAfterMs: 10 * 60_000 });

    const first = await t.action(
      async (ctx) => await billing.processBilling(ctx),
    );

    expect(first).toMatchObject({
      claimed: 1,
      stillPending: 1,
      approved: 0,
      errors: [],
    });
    // The run sent the charge and did not wait for its result.
    expect(wompi.to("GET", /\/transactions\/tx_/)).toEqual([]);

    const [renewal] = (
      await t.query(components.wompi.payments.listByUser, { userId: "user_0" })
    ).filter((payment) => payment.periodStart !== undefined);
    expect(renewal).toMatchObject({
      status: "pending",
      wompiTransactionId: `tx_${renewal.reference}`,
    });
    expect(
      await t.query(components.wompi.subscriptions.get, {
        subscriptionId: subscriptionId as never,
      }),
    ).toMatchObject({ status: "active", failedAttempts: 0 });

    // Wompi approves later. The next run reconciles by id and sends no
    // second charge.
    wompiStatus = "APPROVED";
    const second = await t.action(
      async (ctx) => await billing.processBilling(ctx),
    );

    expect(second).toMatchObject({
      claimed: 1,
      reconciled: 1,
      approved: 1,
      errors: [],
    });
    expect(wompi.to("POST", /\/transactions$/)).toHaveLength(1);
    expect(wompi.to("GET", /\/transactions\/tx_/)).toHaveLength(1);
    expect(await statusOf(t, renewal.reference)).toBe("approved");
  });
});

describe("processBilling: stale sweep", () => {
  test("abandoned checkouts do not keep a paid checkout out of the sweep", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const customer = await t.mutation(components.wompi.customers.upsert, {
      userId: "user_1",
      email: "ada@example.com",
    });
    for (let i = 0; i < 60; i++) {
      await t.mutation(components.wompi.payments.createCheckout, {
        reference: `wmpk_abandoned_${i}`,
        customerId: customer._id,
        userId: "user_1",
        productKey: "sticker-pack",
      });
    }
    // The payer paid, but the webhook and the redirect did not arrive.
    await t.mutation(components.wompi.payments.createCheckout, {
      reference: "wmpk_paid",
      customerId: customer._id,
      userId: "user_1",
      productKey: "sticker-pack",
    });
    await t.mutation(components.wompi.billing.applyTransaction, {
      reference: "wmpk_paid",
      wompiTransactionId: "tx_paid",
      wompiStatus: "PENDING",
      config: CRON_CONFIG,
    });
    const wompi = mockWompi([
      {
        method: "GET",
        path: /\/transactions\/tx_paid$/,
        respond: () =>
          json({
            data: transaction("tx_paid", "APPROVED", "wmpk_paid", 500_000),
          }),
      },
    ]);

    const summary = await t.action(
      async (ctx) => await makeWompi().processBilling(ctx),
    );

    expect(summary).toMatchObject({
      sweptPending: 1,
      expired: 0,
      remaining: false,
      errors: [],
    });
    expect(await statusOf(t, "wmpk_paid")).toBe("approved");
    expect(await statusOf(t, "wmpk_abandoned_0")).toBe("pending");
    // An abandoned checkout that cannot expire yet costs no request.
    expect(wompi.to("GET", /\/transactions\?reference=/)).toEqual([]);
  });
});
