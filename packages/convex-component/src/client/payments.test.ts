/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { computeEventChecksum } from "@pulgueta/wompi/server";
import type { WompiConfig } from "./index.js";
import { Wompi } from "./index.js";
import {
  components,
  dispersionCallback,
  initConvexTest,
  paymentCallback,
} from "./setup.test.js";

const EVENTS_KEY = "test_events_key";
const PAYOUTS_EVENTS_KEY = "test_payouts_events_key";

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

const transaction = (id: string, status: string, reference: string, amount = 500_000) => ({
  id,
  status,
  reference,
  amount_in_cents: amount,
  currency: "COP",
  payment_method_type: "CARD",
  created_at: "2026-08-18T10:00:00.000Z",
});

type Route = {
  method: string;
  path: RegExp;
  respond: (init?: RequestInit) => Response | Promise<Response>;
};

const routeFetch = (routes: Route[]) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const route = routes.find((r) => r.method === method && r.path.test(url));
    if (!route) throw new Error(`Unexpected fetch ${method} ${url}`);
    return await route.respond(init);
  });

const CARD = {
  wompiSourceId: 1234,
  type: "CARD",
  status: "AVAILABLE",
  brand: "VISA",
  lastFour: "4242",
};

const CRON_CONFIG = {
  maxRetries: 3,
  retryScheduleMs: [1_000],
  onExhausted: "mark_unpaid" as const,
  leaseMs: 0,
};

const makeWompi = (overrides: Partial<WompiConfig> = {}) =>
  new Wompi(components.wompi, {
    getUserInfo: async () => ({ userId: "user_1", email: "ada@example.com" }),
    publicKey: "pub_test_key",
    privateKey: "prv_test_key",
    eventsKey: EVENTS_KEY,
    integrityKey: "integrity_key",
    sandbox: true,
    payouts: {
      apiKey: "payouts_api_key",
      userPrincipalId: "payouts_user",
      eventsKey: PAYOUTS_EVENTS_KEY,
    },
    billing: {
      leaseMs: 0,
      pollAttempts: 1,
      pollIntervalMs: 0,
      pendingSweepAfterMs: 60_000,
    },
    events: { onPaymentChange: paymentCallback, onDispersionChange: dispersionCallback },
    ...overrides,
  });

type Harness = ReturnType<typeof initConvexTest>;

const ledger = (t: Harness) => t.run(async (ctx) => await ctx.db.query("creditLedger").collect());

const dispersionLog = (t: Harness) =>
  t.run(async (ctx) => await ctx.db.query("dispersionLog").collect());

const failCallbacks = (t: Harness, fail: boolean) =>
  t.run(async (ctx) => {
    await ctx.db.insert("callbackControl", { fail });
  });

async function seed(t: Harness) {
  const customer = await t.mutation(components.wompi.customers.upsert, {
    userId: "user_1",
    email: "ada@example.com",
  });
  await t.mutation(components.wompi.products.sync, {
    products: [
      {
        key: "pro-monthly",
        name: "Pro",
        type: "subscription" as const,
        amountInCents: 500_000,
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
  return { customer };
}

/** A checkout row carrying the app's order link in `metadata`. */
async function seedCheckout(t: Harness, reference: string) {
  const { customer } = await seed(t);
  await t.mutation(components.wompi.payments.createCheckout, {
    reference,
    customerId: customer._id,
    userId: "user_1",
    productKey: "sticker-pack",
    metadata: { orderId: "order_42" },
  });
}

/** An active subscription whose renewal is due now. */
async function dueRenewal(t: Harness) {
  const { customer } = await seed(t);
  const created = await t.mutation(components.wompi.subscriptions.create, {
    customerId: customer._id,
    userId: "user_1",
    productKey: "pro-monthly",
    paymentSource: CARD,
  });
  await t.mutation(components.wompi.billing.recordChargeResult, {
    paymentId: created.payment!._id,
    nextStatus: "approved",
    wompiTransactionId: "tx_init",
    config: CRON_CONFIG,
  });
  await t.mutation(components.wompi.subscriptions.setNextChargeAt, {
    subscriptionId: created.subscription._id,
    at: Date.now() - 1_000,
  });
  return created.subscription;
}

// ---------------------------------------------------------------------------
// Webhook plumbing
// ---------------------------------------------------------------------------

const makeRouter = () => {
  const routes = new Map<
    string,
    { _handler: (ctx: unknown, request: Request) => Promise<Response> }
  >();
  return {
    routes,
    http: {
      route: (spec: { path: string; handler: unknown }) => {
        routes.set(spec.path, spec.handler as never);
      },
    },
  };
};

const signedTransactionEvent = async (
  overrides: { id?: string; status?: string; reference: string; amount?: number } = {
    reference: "wmpk_hook",
  },
) => {
  const event = {
    event: "transaction.updated",
    data: {
      transaction: {
        id: overrides.id ?? "tx_hook",
        status: overrides.status ?? "APPROVED",
        reference: overrides.reference,
        amount_in_cents: overrides.amount ?? 500_000,
        currency: "COP",
      },
    },
    environment: "test",
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: "",
    },
    timestamp: 1_700_000_000,
    sent_at: "2026-08-18T10:00:00.000Z",
  };
  event.signature.checksum = await computeEventChecksum(event as never, EVENTS_KEY);
  return event;
};

const signedPayoutEvent = async (status: string) => {
  const event = {
    event: "payout.updated",
    data: {
      payout: {
        id: "payout_1",
        status,
        reference: "providers-2026-07",
        paymentType: "PROVIDERS",
        totalTransactions: 1,
        amountInCents: 500_000,
      },
    },
    signature: { properties: ["payout.id", "payout.status"], checksum: "" },
    timestamp: 1_700_000_000_000,
    sentAt: "2026-08-18T10:00:00.000Z",
  };
  event.signature.checksum = await computeEventChecksum(event as never, PAYOUTS_EVENTS_KEY);
  return event;
};

const deliver = async (
  handler: (ctx: unknown, request: Request) => Promise<Response>,
  ctx: unknown,
  path: string,
  body: unknown,
) => {
  const response = await handler(
    ctx,
    new Request(`https://example.convex.site${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as unknown };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("onPaymentChange runs atomically from every entry point", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("the webhook route applies and calls back in one transaction", async () => {
    const t = initConvexTest();
    await seedCheckout(t, "wmpk_hook");
    const { routes, http } = makeRouter();
    makeWompi().registerRoutes(http as never);
    const handler = routes.get("/wompi/webhook")!._handler;
    const event = await signedTransactionEvent({ reference: "wmpk_hook" });

    const response = await t.action(
      async (ctx) => await deliver(handler, ctx, "/wompi/webhook", event),
    );
    expect(response.status).toBe(200);

    const rows = await ledger(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reference: "wmpk_hook",
      status: "approved",
      previousStatus: "pending",
      userId: "user_1",
      amountInCents: 500_000,
      orderId: "order_42",
    });
  });

  test("a duplicate delivery does not call the callback again", async () => {
    const t = initConvexTest();
    await seedCheckout(t, "wmpk_hook");
    const { routes, http } = makeRouter();
    const seen: string[] = [];
    makeWompi().registerRoutes(http as never, {
      onEvent: (_ctx, event) => {
        seen.push(event.signature.checksum);
      },
    });
    const handler = routes.get("/wompi/webhook")!._handler;
    const event = await signedTransactionEvent({ reference: "wmpk_hook" });

    await t.action(async (ctx) => await deliver(handler, ctx, "/wompi/webhook", event));
    const second = await t.action(
      async (ctx) => await deliver(handler, ctx, "/wompi/webhook", event),
    );

    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(await ledger(t)).toHaveLength(1);
    // `onEvent` keeps its documented contract: it does not run again for a
    // delivery a previous one already applied.
    expect(seen).toHaveLength(1);
  });

  test("confirmTransaction applies and calls back once", async () => {
    const t = initConvexTest();
    await seedCheckout(t, "wmpk_confirm");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          method: "GET",
          path: /\/transactions\/tx_confirm$/,
          respond: () => json({ data: transaction("tx_confirm", "APPROVED", "wmpk_confirm") }),
        },
      ]),
    );
    const wompi = makeWompi();

    const outcome = await t.action(
      async (ctx) => await wompi.confirmTransaction(ctx, { transactionId: "tx_confirm" }),
    );
    expect(outcome.outcome).toBe("applied");

    const rows = await ledger(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reference: "wmpk_confirm",
      status: "approved",
      previousStatus: "pending",
      orderId: "order_42",
    });

    // Confirming again is a no-op, so the callback must not run twice.
    await t.action(
      async (ctx) => await wompi.confirmTransaction(ctx, { transactionId: "tx_confirm" }),
    );
    expect(await ledger(t)).toHaveLength(1);
  });

  test("the billing cron applies and calls back once", async () => {
    const t = initConvexTest();
    const subscription = await dueRenewal(t);
    vi.stubGlobal(
      "fetch",
      routeFetch([
        { method: "GET", path: /\/merchants\//, respond: () => merchant() },
        {
          method: "POST",
          path: /\/transactions$/,
          respond: (init) => {
            const body = JSON.parse(String(init?.body)) as { reference: string };
            return json({ data: transaction("tx_renewal", "APPROVED", body.reference) });
          },
        },
      ]),
    );
    const wompi = makeWompi();

    const summary = await t.action(async (ctx) => await wompi.processBilling(ctx));
    expect(summary.claimed).toBe(1);
    expect(summary.approved).toBe(1);

    const rows = await ledger(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "approved",
      previousStatus: "pending",
      userId: "user_1",
      amountInCents: 500_000,
    });
    expect(rows[0].reference).toContain(subscription._id);
  });

  test("a VOIDED change after an approval reaches the callback", async () => {
    const t = initConvexTest();
    await seedCheckout(t, "wmpk_void");
    const { routes, http } = makeRouter();
    makeWompi().registerRoutes(http as never);
    const handler = routes.get("/wompi/webhook")!._handler;

    await t.action(
      async (ctx) =>
        await deliver(
          handler,
          ctx,
          "/wompi/webhook",
          await signedTransactionEvent({ reference: "wmpk_void", status: "APPROVED" }),
        ),
    );
    await t.action(
      async (ctx) =>
        await deliver(
          handler,
          ctx,
          "/wompi/webhook",
          await signedTransactionEvent({ reference: "wmpk_void", status: "VOIDED" }),
        ),
    );

    const rows = await ledger(t);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      reference: "wmpk_void",
      status: "voided",
      previousStatus: "approved",
      orderId: "order_42",
    });
  });
});

describe("a throwing callback rolls the whole delivery back", () => {
  test("nothing is recorded, and Wompi's replay then succeeds", async () => {
    const t = initConvexTest();
    await seedCheckout(t, "wmpk_rollback");
    await failCallbacks(t, true);
    const { routes, http } = makeRouter();
    makeWompi().registerRoutes(http as never);
    const handler = routes.get("/wompi/webhook")!._handler;
    const event = await signedTransactionEvent({ reference: "wmpk_rollback" });

    await expect(
      t.action(async (ctx) => await deliver(handler, ctx, "/wompi/webhook", event)),
    ).rejects.toThrow("credits callback failed");

    // No app write, no payment change, and no delivery record: recording the
    // checksum now still reports a fresh delivery.
    expect(await ledger(t)).toHaveLength(0);
    expect(
      (await t.query(components.wompi.payments.getByReference, { reference: "wmpk_rollback" }))
        ?.status,
    ).toBe("pending");
    const probe = await t.mutation(components.wompi.webhooks.recordEvent, {
      checksum: event.signature.checksum,
      eventType: "transaction.updated",
      timestamp: 1_700_000_000,
    });
    expect(probe.duplicate).toBe(false);

    // Wompi replays the event once the app side is healthy again.
    await failCallbacks(t, false);
    const replay = await t.action(
      async (ctx) => await deliver(handler, ctx, "/wompi/webhook", event),
    );
    expect(replay.status).toBe(200);

    expect(await ledger(t)).toHaveLength(1);
    expect(
      (await t.query(components.wompi.payments.getByReference, { reference: "wmpk_rollback" }))
        ?.status,
    ).toBe("approved");
  });
});

describe("payment lookup by reference", () => {
  test("returns the row, and null for an unknown reference", async () => {
    const t = initConvexTest();
    await seedCheckout(t, "wmpk_lookup");
    const wompi = makeWompi();

    const found = await t.query(
      async (ctx) => await wompi.getPayment(ctx, { reference: "wmpk_lookup" }),
    );
    expect(found?.reference).toBe("wmpk_lookup");
    expect(found?.status).toBe("pending");
    expect(found?.metadata).toEqual({ orderId: "order_42" });

    expect(
      await t.query(async (ctx) => await wompi.getPayment(ctx, { reference: "nope" })),
    ).toBeNull();
  });
});

describe("the dispersion callback still works", () => {
  const { routes, http } = makeRouter();

  beforeEach(() => {
    routes.clear();
  });

  test("a payout delivery applies and calls back in one transaction", async () => {
    const t = initConvexTest();
    makeWompi().registerRoutes(http as never);
    const handler = routes.get("/wompi/payouts-webhook")!._handler;

    const applied = await t.action(
      async (ctx) =>
        await deliver(handler, ctx, "/wompi/payouts-webhook", await signedPayoutEvent("PENDING")),
    );
    expect(applied.status).toBe(200);
    expect(await dispersionLog(t)).toHaveLength(1);

    // A throwing dispersion callback still rolls its delivery back.
    await failCallbacks(t, true);
    await expect(
      t.action(
        async (ctx) =>
          await deliver(
            handler,
            ctx,
            "/wompi/payouts-webhook",
            await signedPayoutEvent("TOTAL_PAYMENT"),
          ),
      ),
    ).rejects.toThrow("dispersion callback failed");

    expect(await dispersionLog(t)).toHaveLength(1);
    expect(
      (await t.query(components.wompi.dispersions.get, { wompiPayoutId: "payout_1" }))?.status,
    ).toBe("PENDING");
  });
});
