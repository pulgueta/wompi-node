/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";
import { computeEventChecksum, getSignatureKey } from "@pulgueta/wompi/server";
import { WompiValidationError } from "@pulgueta/wompi/schemas";
import type { SubscriptionDoc, WompiConfig } from "./index.js";
import { Wompi } from "./index.js";
import {
  components,
  dispersionCallback,
  initConvexTest,
  paymentCallback,
} from "./setup.test.js";

// The host-facing seam: the entry points each app calls first. The state
// machine behind them has its own suites (`component/billing.test.ts`,
// `billing.test.ts`, `payments.test.ts`).

const EVENTS_KEY = "test_events_key";
const PAYOUTS_EVENTS_KEY = "test_payouts_events_key";
const INTEGRITY_KEY = "integrity_key";
const PRIVATE_KEY = "prv_test_key";
const REDIRECT_URL = "https://app.test/return";

type Harness = ReturnType<typeof initConvexTest>;

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

type Call = {
  method: string;
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
};
type Route = {
  method: string;
  path: RegExp;
  respond: (call: Call) => Response | Promise<Response>;
};

/**
 * Route-based fetch mock. Each test declares the Wompi API that it expects,
 * and `calls` keeps each request for assertions.
 */
const mockWompi = (routes: Route[]) => {
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url: String(input),
        headers: new Headers(init?.headers),
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
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    fetchMock,
    to: (method: string, path: RegExp) =>
      calls.filter((call) => call.method === method && path.test(call.url)),
  };
};

const MERCHANT: Route = {
  method: "GET",
  path: /\/merchants\//,
  respond: () => merchant(),
};
const PAYMENT_SOURCE: Route = {
  method: "POST",
  path: /\/payment_sources$/,
  respond: () =>
    json({ data: { id: 1234, type: "CARD", status: "AVAILABLE" } }),
};
const chargeWith = (
  status: string,
  extra: Record<string, unknown> = {},
): Route => ({
  method: "POST",
  path: /\/transactions$/,
  respond: ({ body }) =>
    json({
      data: {
        ...transaction(
          `tx_${String(body.reference)}`,
          status,
          String(body.reference),
          Number(body.amount_in_cents),
        ),
        ...extra,
      },
    }),
});
const NO_TRANSACTIONS: Route = {
  method: "GET",
  path: /\/transactions\?reference=/,
  respond: () => json({ data: [] }),
};

const makeWompi = (overrides: Partial<WompiConfig> = {}) =>
  new Wompi(components.wompi, {
    getUserInfo: async () => ({
      userId: "user_1",
      email: "ada@example.com",
      fullName: "Ada Lovelace",
    }),
    publicKey: "pub_test_key",
    privateKey: PRIVATE_KEY,
    eventsKey: EVENTS_KEY,
    integrityKey: INTEGRITY_KEY,
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
      pendingSweepAfterMs: 0,
      expirePendingAfterMs: 0,
    },
    ...overrides,
  });

/** Identity from `ctx.auth`, as a host app configures it. */
const authedConfig: Partial<WompiConfig> = {
  getUserInfo: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return {
      userId: identity.subject,
      email: identity.email ?? "user@example.com",
    };
  },
};

const ADA = { subject: "user_1", email: "ada@example.com" };
const BOB = { subject: "user_2", email: "bob@example.com" };

const CRON_CONFIG = {
  maxRetries: 3,
  retryScheduleMs: [1_000],
  onExhausted: "mark_unpaid" as const,
  leaseMs: 0,
};

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
}

const paymentsOf = (t: Harness, userId: string) =>
  t.query(components.wompi.payments.listByUser, { userId });

const subscriptionsOf = (t: Harness, userId: string) =>
  t.query(components.wompi.subscriptions.listByUser, { userId });

const ledger = (t: Harness) =>
  t.run(async (ctx) => await ctx.db.query("creditLedger").collect());

const dispersionLog = (t: Harness) =>
  t.run(async (ctx) => await ctx.db.query("dispersionLog").collect());

// Registered Convex functions keep the raw handler on `_handler` (how
// convex-test itself invokes them).
type Handler = (
  ctx: unknown,
  args: Record<string, unknown>,
) => Promise<unknown>;
const handlerOf = (fn: unknown): Handler =>
  (fn as { _handler: Handler })._handler;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// checkout()
// ---------------------------------------------------------------------------

describe("checkout()", () => {
  test("creates a pending payment and a signed Web Checkout URL", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([]);

    const result = await t.action(
      async (ctx) =>
        await makeWompi().checkout(ctx, {
          productKey: "sticker-pack",
          redirectUrl: REDIRECT_URL,
        }),
    );

    expect(result.reference).toMatch(/^wmpk_[0-9a-f]{32}$/);

    const url = new URL(result.url);
    expect(url.searchParams.get("public-key")).toBe("pub_test_key");
    expect(url.searchParams.get("reference")).toBe(result.reference);
    expect(url.searchParams.get("amount-in-cents")).toBe("500000");
    expect(url.searchParams.get("currency")).toBe("COP");
    expect(url.searchParams.get("redirect-url")).toBe(REDIRECT_URL);
    expect(url.searchParams.get("customer-data:email")).toBe("ada@example.com");
    expect(url.searchParams.get("customer-data:full-name")).toBe(
      "Ada Lovelace",
    );
    expect(url.searchParams.get("signature:integrity")).toBe(
      await getSignatureKey({
        reference: result.reference,
        amountInCents: 500_000,
        currency: "COP",
        integrityKey: INTEGRITY_KEY,
      }),
    );
    // The integrity key signs the URL; it is never a part of it.
    expect(result.url).not.toContain(INTEGRITY_KEY);

    const stored = await t.query(components.wompi.payments.getByReference, {
      reference: result.reference,
    });
    expect(stored).toMatchObject({
      kind: "checkout",
      status: "pending",
      userId: "user_1",
      productKey: "sticker-pack",
      amountInCents: 500_000,
      currency: "COP",
    });
    expect(result.payment._id).toBe(stored?._id);

    // Web Checkout needs no server-side request to Wompi.
    expect(wompi.fetchMock).not.toHaveBeenCalled();
  });

  test("two calls for the same product create two payments with different references", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([]);
    const wompi = makeWompi();
    const args = { productKey: "sticker-pack", redirectUrl: REDIRECT_URL };

    const first = await t.action(
      async (ctx) => await wompi.checkout(ctx, args),
    );
    const second = await t.action(
      async (ctx) => await wompi.checkout(ctx, args),
    );

    expect(first.reference).not.toBe(second.reference);
    const payments = await paymentsOf(t, "user_1");
    expect(payments.map((payment) => payment.reference).sort()).toEqual(
      [first.reference, second.reference].sort(),
    );
    // One customer row, not one for each checkout.
    expect(first.payment.customerId).toBe(second.payment.customerId);
  });

  test("a server function can set the amount, the description and the metadata", async () => {
    const t = initConvexTest();
    mockWompi([]);

    const result = await t.action(
      async (ctx) =>
        await makeWompi().checkout(ctx, {
          amountInCents: 1_234_500,
          description: "Custom order",
          metadata: { orderId: "order_42" },
          expirationTime: "2026-12-31T23:59:59.000Z",
          redirectUrl: REDIRECT_URL,
        }),
    );

    const url = new URL(result.url);
    expect(url.searchParams.get("amount-in-cents")).toBe("1234500");
    expect(url.searchParams.get("expiration-time")).toBe(
      "2026-12-31T23:59:59.000Z",
    );
    // The expiration time is a part of the signed string.
    expect(url.searchParams.get("signature:integrity")).toBe(
      await getSignatureKey({
        reference: result.reference,
        amountInCents: 1_234_500,
        currency: "COP",
        integrityKey: INTEGRITY_KEY,
        expirationTime: "2026-12-31T23:59:59.000Z",
      }),
    );
    expect(result.payment).toMatchObject({
      amountInCents: 1_234_500,
      description: "Custom order",
      metadata: { orderId: "order_42" },
    });
  });

  test.each([
    ["an unknown product", { productKey: "nope" }, 'Unknown product "nope"'],
    [
      "a subscription product",
      { productKey: "pro-monthly" },
      "use subscribe instead",
    ],
    [
      "no product and no amount",
      {},
      "positive integer amountInCents is required",
    ],
    [
      "an amount that is not an integer",
      { amountInCents: 10.5 },
      "positive integer",
    ],
    ["a negative amount", { amountInCents: -100 }, "positive integer"],
  ])("rejects %s and stores no payment", async (_name, args, message) => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([]);

    await expect(
      t.action(
        async (ctx) =>
          await makeWompi().checkout(ctx, {
            ...args,
            redirectUrl: REDIRECT_URL,
          }),
      ),
    ).rejects.toThrow(message);

    expect(await paymentsOf(t, "user_1")).toEqual([]);
  });

  test("fails before it stores a payment when the integrity key is missing", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([]);

    await expect(
      t.action(
        async (ctx) =>
          await makeWompi({ integrityKey: "" }).checkout(ctx, {
            productKey: "sticker-pack",
            redirectUrl: REDIRECT_URL,
          }),
      ),
    ).rejects.toThrow("WOMPI_INTEGRITY_KEY");

    expect(await paymentsOf(t, "user_1")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// subscribe()
// ---------------------------------------------------------------------------

describe("subscribe()", () => {
  test("card: creates the source, charges the first period and activates", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([MERCHANT, PAYMENT_SOURCE, chargeWith("APPROVED")]);
    const changes: SubscriptionDoc[] = [];

    const result = await t.action(
      async (ctx) =>
        await makeWompi({
          events: {
            onPaymentChange: paymentCallback,
            onSubscriptionChange: (_ctx, subscription) => {
              changes.push(subscription);
            },
          },
        }).subscribe(ctx, {
          productKey: "pro-monthly",
          token: "tok_card",
          paymentMethod: { brand: "VISA", lastFour: "4242" },
          installments: 3,
          metadata: { plan: "pro" },
        }),
    );

    // The payment source request carries both acceptance tokens and the
    // private key.
    const [source] = wompi.to("POST", /\/payment_sources$/);
    expect(source.headers.get("Authorization")).toBe(`Bearer ${PRIVATE_KEY}`);
    expect(source.body).toMatchObject({
      type: "CARD",
      token: "tok_card",
      acceptance_token: "acc_token",
      accept_personal_auth: "personal_token",
      customer_email: "ada@example.com",
    });

    // The charge uses the saved source, the payment reference and a signature
    // for the exact amount.
    const [charge] = wompi.to("POST", /\/transactions$/);
    expect(charge.headers.get("Authorization")).toBe(`Bearer ${PRIVATE_KEY}`);
    expect(charge.body).toMatchObject({
      payment_source_id: 1234,
      amount_in_cents: 2_990_000,
      currency: "COP",
      customer_email: "ada@example.com",
      acceptance_token: "acc_token",
      accept_personal_auth: "personal_token",
      payment_method: { installments: 3 },
      reference: result.payment!.reference,
    });
    expect(charge.body.signature).toBe(
      await getSignatureKey({
        reference: result.payment!.reference,
        amountInCents: 2_990_000,
        currency: "COP",
        integrityKey: INTEGRITY_KEY,
      }),
    );

    expect(result.outcome?.outcome).toBe("applied");
    expect(result.payment).toMatchObject({
      kind: "subscription",
      status: "approved",
      wompiTransactionId: `tx_${result.payment!.reference}`,
    });
    expect(result.subscription).toMatchObject({
      status: "active",
      productKey: "pro-monthly",
      amountInCents: 2_990_000,
      failedAttempts: 0,
      metadata: { plan: "pro" },
    });
    expect(result.subscription.currentPeriodEnd).toBeGreaterThan(
      result.subscription.currentPeriodStart,
    );
    expect(result.subscription.nextChargeAt).toBe(
      result.subscription.currentPeriodEnd,
    );

    const current = await t.query(components.wompi.subscriptions.getCurrent, {
      userId: "user_1",
    });
    expect(current?._id).toBe(result.subscription._id);

    // Each callback runs one time.
    expect((await ledger(t)).map((row) => row.status)).toEqual(["approved"]);
    expect(changes.map((subscription) => subscription.status)).toEqual([
      "active",
    ]);
  });

  test("uses one installment when the caller gives none", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([MERCHANT, PAYMENT_SOURCE, chargeWith("APPROVED")]);

    await t.action(
      async (ctx) =>
        await makeWompi().subscribe(ctx, {
          productKey: "pro-monthly",
          token: "tok_card",
        }),
    );

    const [charge] = wompi.to("POST", /\/transactions$/);
    expect(charge.body.payment_method).toEqual({ installments: 1 });
  });

  test("a declined first charge leaves the subscription incomplete and not entitled", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([
      MERCHANT,
      PAYMENT_SOURCE,
      chargeWith("DECLINED", { status_message: "Fondos insuficientes" }),
    ]);

    const result = await t.action(
      async (ctx) =>
        await makeWompi().subscribe(ctx, {
          productKey: "pro-monthly",
          token: "tok_card",
        }),
    );

    expect(result.payment).toMatchObject({
      status: "declined",
      failureReason: "Fondos insuficientes",
    });
    expect(result.subscription).toMatchObject({
      status: "incomplete",
      lastError: "Fondos insuficientes",
    });
    expect(
      await t.query(components.wompi.subscriptions.getCurrent, {
        userId: "user_1",
      }),
    ).toBeNull();
  });

  test("a first charge that stays pending resolves through the poll", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([
      MERCHANT,
      PAYMENT_SOURCE,
      chargeWith("PENDING"),
      {
        method: "GET",
        path: /\/transactions\/tx_/,
        respond: ({ url }) => {
          const id = url.split("/").pop()!;
          return json({
            data: transaction(
              id,
              "APPROVED",
              id.replace(/^tx_/, ""),
              2_990_000,
            ),
          });
        },
      },
    ]);

    const result = await t.action(
      async (ctx) =>
        await makeWompi().subscribe(ctx, {
          productKey: "pro-monthly",
          token: "tok_card",
        }),
    );

    expect(wompi.to("GET", /\/transactions\/tx_/)).toHaveLength(1);
    expect(result.payment?.status).toBe("approved");
    expect(result.subscription.status).toBe("active");
  });

  test("a trial starts without a charge", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([MERCHANT, PAYMENT_SOURCE]);
    const changes: SubscriptionDoc[] = [];

    const result = await t.action(
      async (ctx) =>
        await makeWompi({
          events: {
            onSubscriptionChange: (_ctx, subscription) => {
              changes.push(subscription);
            },
          },
        }).subscribe(ctx, { productKey: "pro-trial", token: "tok_card" }),
    );

    expect(result.payment).toBeNull();
    expect(result.outcome).toBeNull();
    expect(result.subscription.status).toBe("trialing");
    expect(result.subscription.trialEndsAt).toBe(
      result.subscription.nextChargeAt,
    );
    expect(wompi.to("POST", /\/transactions$/)).toEqual([]);
    expect(await paymentsOf(t, "user_1")).toEqual([]);
    expect(changes.map((subscription) => subscription.status)).toEqual([
      "trialing",
    ]);
  });

  test.each([
    ["an unknown product", "nope", 'Unknown product "nope"'],
    ["a one-time product", "sticker-pack", "is not a subscription"],
  ])(
    "rejects %s and creates no subscription or charge",
    async (_name, productKey, message) => {
      const t = initConvexTest();
      await seedProducts(t);
      const wompi = mockWompi([MERCHANT, PAYMENT_SOURCE]);

      await expect(
        t.action(
          async (ctx) =>
            await makeWompi().subscribe(ctx, { productKey, token: "tok_card" }),
        ),
      ).rejects.toThrow(message);

      expect(await subscriptionsOf(t, "user_1")).toEqual([]);
      expect(await paymentsOf(t, "user_1")).toEqual([]);
      expect(wompi.to("POST", /\/transactions$/)).toEqual([]);
    },
  );

  test("a second subscription to the same product is rejected without a charge", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([MERCHANT, PAYMENT_SOURCE, chargeWith("APPROVED")]);
    const args = { productKey: "pro-monthly", token: "tok_card" };

    await t.action(async (ctx) => await makeWompi().subscribe(ctx, args));
    await expect(
      t.action(async (ctx) => await makeWompi().subscribe(ctx, args)),
    ).rejects.toThrow("An active subscription");

    expect(wompi.to("POST", /\/transactions$/)).toHaveLength(1);
    expect(await subscriptionsOf(t, "user_1")).toHaveLength(1);
  });

  test("a payment source that Wompi rejects stops the flow", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([
      MERCHANT,
      {
        method: "POST",
        path: /\/payment_sources$/,
        respond: () =>
          json(
            {
              error: {
                type: "INPUT_VALIDATION_ERROR",
                messages: { token: ["El token no existe"] },
              },
            },
            422,
          ),
      },
    ]);

    await expect(
      t.action(
        async (ctx) =>
          await makeWompi().subscribe(ctx, {
            productKey: "pro-monthly",
            token: "tok_bad",
          }),
      ),
    ).rejects.toThrow(WompiValidationError);

    expect(await subscriptionsOf(t, "user_1")).toEqual([]);
    expect(wompi.to("POST", /\/transactions$/)).toEqual([]);
  });

  test("a merchant without acceptance tokens stops the flow", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([
      {
        method: "GET",
        path: /\/merchants\//,
        respond: () => json({ data: { id: 1 } }),
      },
    ]);

    await expect(
      t.action(
        async (ctx) =>
          await makeWompi().subscribe(ctx, {
            productKey: "pro-monthly",
            token: "tok_card",
          }),
      ),
    ).rejects.toThrow("merchant acceptance tokens");

    expect(wompi.to("POST", /\/payment_sources$/)).toEqual([]);
    expect(await subscriptionsOf(t, "user_1")).toEqual([]);
  });

  test.each([
    ["private key", { privateKey: "" }, "WOMPI_PRIVATE_KEY"],
    ["integrity key", { integrityKey: "" }, "WOMPI_INTEGRITY_KEY"],
  ])(
    "fails before each request when the %s is missing",
    async (_name, overrides, message) => {
      const t = initConvexTest();
      await seedProducts(t);
      const wompi = mockWompi([
        MERCHANT,
        PAYMENT_SOURCE,
        chargeWith("APPROVED"),
      ]);

      await expect(
        t.action(
          async (ctx) =>
            await makeWompi(overrides).subscribe(ctx, {
              productKey: "pro-monthly",
              token: "tok_card",
            }),
        ),
      ).rejects.toThrow(message);

      expect(wompi.fetchMock).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// registerRoutes()
// ---------------------------------------------------------------------------

type RouteHandler = (ctx: unknown, request: Request) => Promise<Response>;

const makeRouter = () => {
  const routes = new Map<string, { method: string; handler: RouteHandler }>();
  return {
    routes,
    http: {
      route: (spec: {
        path: string;
        method: string;
        handler: { _handler: RouteHandler };
      }) => {
        routes.set(spec.path, {
          method: spec.method,
          handler: spec.handler._handler,
        });
      },
    },
  };
};

/** Actions must return Convex values, so unwrap the Response first. */
const deliver = async (
  handler: RouteHandler,
  ctx: unknown,
  path: string,
  body: unknown,
) => {
  const response = await handler(
    ctx,
    new Request(`https://example.convex.site${path}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as unknown };
};

const signedTransactionEvent = async (
  transactionData: {
    id?: string;
    status?: string;
    reference: string;
    amount?: number;
  },
  eventsKey = EVENTS_KEY,
) => {
  const event = {
    event: "transaction.updated",
    data: {
      transaction: {
        id: transactionData.id ?? "tx_hook",
        status: transactionData.status ?? "APPROVED",
        reference: transactionData.reference,
        amount_in_cents: transactionData.amount ?? 500_000,
        currency: "COP",
      },
    },
    environment: "test",
    signature: {
      properties: [
        "transaction.id",
        "transaction.status",
        "transaction.amount_in_cents",
      ],
      checksum: "",
    },
    timestamp: 1_700_000_000,
    sent_at: "2026-08-18T10:00:00.000Z",
  };
  event.signature.checksum = await computeEventChecksum(
    event as never,
    eventsKey,
  );
  return event;
};

const signedPayoutEvent = async (
  status: string,
  eventsKey = PAYOUTS_EVENTS_KEY,
) => {
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
  event.signature.checksum = await computeEventChecksum(
    event as never,
    eventsKey,
  );
  return event;
};

const signedPayoutTransactionEvent = async (status: string) => {
  const event = {
    event: "transaction.updated",
    data: {
      transaction: {
        id: "payout_tx_1",
        payoutId: "payout_1",
        amountInCents: 500_000,
        status,
        payee: {
          name: "Juan Pérez",
          bank: "BANCOLOMBIA",
          accountNumber: "1234567890",
        },
        failureReason: {
          code: "C01",
          message: "La cuenta no existe o está inactiva",
        },
        currency: "COP",
      },
    },
    signature: {
      properties: [
        "transaction.id",
        "transaction.status",
        "transaction.amountInCents",
      ],
      checksum: "",
    },
    timestamp: 1_700_000_001_000,
    sentAt: "2026-08-18T10:00:01.000Z",
  };
  event.signature.checksum = await computeEventChecksum(
    event as never,
    PAYOUTS_EVENTS_KEY,
  );
  return event;
};

/** True when no delivery with this checksum is in the event log. */
const notRecorded = async (t: Harness, checksum: string) =>
  !(
    await t.mutation(components.wompi.webhooks.recordEvent, {
      checksum,
      eventType: "probe",
      timestamp: 1_700_000_000,
    })
  ).duplicate;

async function seedCheckout(t: Harness, reference: string) {
  await seedProducts(t);
  const customer = await t.mutation(components.wompi.customers.upsert, {
    userId: "user_1",
    email: "ada@example.com",
  });
  await t.mutation(components.wompi.payments.createCheckout, {
    reference,
    customerId: customer._id,
    userId: "user_1",
    productKey: "sticker-pack",
  });
}

const statusOf = async (t: Harness, reference: string) =>
  (await t.query(components.wompi.payments.getByReference, { reference }))
    ?.status;

describe("registerRoutes()", () => {
  test("registers the two POST routes at the default paths", () => {
    const { routes, http } = makeRouter();
    makeWompi().registerRoutes(http as never);

    expect([...routes.keys()].sort()).toEqual([
      "/wompi/payouts-webhook",
      "/wompi/webhook",
    ]);
    expect([...routes.values()].map((route) => route.method)).toEqual([
      "POST",
      "POST",
    ]);
  });

  test("registers the routes at the paths the app gives", () => {
    const { routes, http } = makeRouter();
    makeWompi().registerRoutes(http as never, {
      path: "/hooks/payments",
      payoutsPath: "/hooks/payouts",
    });

    expect([...routes.keys()].sort()).toEqual([
      "/hooks/payments",
      "/hooks/payouts",
    ]);
  });

  describe("payments handler", () => {
    const setup = async (options?: Parameters<Wompi["registerRoutes"]>[1]) => {
      const t = initConvexTest();
      await seedCheckout(t, "wmpk_hook");
      const { routes, http } = makeRouter();
      makeWompi({
        events: { onPaymentChange: paymentCallback },
      }).registerRoutes(http as never, options);
      const send = (body: unknown) =>
        t.action(
          async (ctx) =>
            await deliver(
              routes.get("/wompi/webhook")!.handler,
              ctx,
              "/wompi/webhook",
              body,
            ),
        );
      return { t, send };
    };

    test("applies a valid transaction.updated and records the outcome", async () => {
      const { t, send } = await setup();
      const event = await signedTransactionEvent({ reference: "wmpk_hook" });

      const response = await send(event);

      expect(response).toEqual({
        status: 200,
        body: { received: true, duplicate: false },
      });
      expect(await statusOf(t, "wmpk_hook")).toBe("approved");
      expect((await ledger(t)).map((row) => row.status)).toEqual(["approved"]);

      const recorded = await t.mutation(components.wompi.webhooks.recordEvent, {
        checksum: event.signature.checksum,
        eventType: "transaction.updated",
        timestamp: 1_700_000_000,
      });
      expect(recorded).toMatchObject({ duplicate: true, outcome: "applied" });
    });

    test.each([
      [
        "a wrong checksum",
        async () => {
          const event = await signedTransactionEvent({
            reference: "wmpk_hook",
          });
          event.signature.checksum = "deadbeef";
          return event;
        },
      ],
      [
        "a body changed after the signature",
        async () => {
          const event = await signedTransactionEvent({
            reference: "wmpk_hook",
            status: "DECLINED",
          });
          event.data.transaction.status = "APPROVED";
          return event;
        },
      ],
      [
        "a signature made with a different secret",
        async () =>
          await signedTransactionEvent(
            { reference: "wmpk_hook" },
            "attacker_key",
          ),
      ],
      [
        "a signature made with the payouts secret",
        async () =>
          await signedTransactionEvent(
            { reference: "wmpk_hook" },
            PAYOUTS_EVENTS_KEY,
          ),
      ],
    ])("rejects %s with 403 and stores nothing", async (_name, makeEvent) => {
      const { t, send } = await setup();
      const event = await makeEvent();

      const response = await send(event);

      expect(response).toEqual({
        status: 403,
        body: { error: "Invalid signature" },
      });
      expect(await statusOf(t, "wmpk_hook")).toBe("pending");
      expect(await ledger(t)).toEqual([]);
      expect(await notRecorded(t, event.signature.checksum)).toBe(true);
    });

    test.each([
      ["a body that is not JSON", "not json"],
      ["a JSON body that is not an event", { hello: "world" }],
    ])("rejects %s with 403", async (_name, body) => {
      const { t, send } = await setup();

      const response = await send(body);

      expect(response.status).toBe(403);
      expect(await statusOf(t, "wmpk_hook")).toBe("pending");
    });

    test("a duplicate delivery answers duplicate: true and applies nothing again", async () => {
      const seen: string[] = [];
      const { t, send } = await setup({
        onEvent: (_ctx, event) => {
          seen.push(event.signature.checksum);
        },
      });
      const event = await signedTransactionEvent({ reference: "wmpk_hook" });

      const first = await send(event);
      const second = await send(event);

      expect(first.body).toEqual({ received: true, duplicate: false });
      expect(second).toEqual({
        status: 200,
        body: { received: true, duplicate: true },
      });
      expect(await ledger(t)).toHaveLength(1);
      expect(seen).toEqual([event.signature.checksum]);
    });

    test("an onEvent callback that throws does not fail the response", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { t, send } = await setup({
        onEvent: () => {
          throw new Error("app callback failed");
        },
      });

      const response = await send(
        await signedTransactionEvent({ reference: "wmpk_hook" }),
      );

      expect(response).toEqual({
        status: 200,
        body: { received: true, duplicate: false },
      });
      // The component state committed before the callback ran.
      expect(await statusOf(t, "wmpk_hook")).toBe("approved");
      expect(console.error).toHaveBeenCalledWith(
        "Wompi onEvent callback failed:",
        expect.any(Error),
      );
    });

    test("a transaction with a different amount does not approve the payment", async () => {
      const { t, send } = await setup();

      const response = await send(
        await signedTransactionEvent({ reference: "wmpk_hook", amount: 100 }),
      );

      expect(response.status).toBe(200);
      expect(await statusOf(t, "wmpk_hook")).toBe("pending");
      expect(await ledger(t)).toEqual([]);
    });

    test("a transaction for a reference the component does not own changes nothing", async () => {
      const { t, send } = await setup();

      const response = await send(
        await signedTransactionEvent({ reference: "other_system_1" }),
      );

      expect(response).toEqual({
        status: 200,
        body: { received: true, duplicate: false },
      });
      expect(await statusOf(t, "wmpk_hook")).toBe("pending");
      expect(await ledger(t)).toEqual([]);
    });

    test("fails when the events key is missing", async () => {
      const t = initConvexTest();
      await seedCheckout(t, "wmpk_hook");
      const { routes, http } = makeRouter();
      makeWompi({ eventsKey: "" }).registerRoutes(http as never);
      const event = await signedTransactionEvent({ reference: "wmpk_hook" });

      await expect(
        t.action(
          async (ctx) =>
            await deliver(
              routes.get("/wompi/webhook")!.handler,
              ctx,
              "/wompi/webhook",
              event,
            ),
        ),
      ).rejects.toThrow("WOMPI_EVENTS_KEY");

      expect(await statusOf(t, "wmpk_hook")).toBe("pending");
    });
  });

  describe("payouts handler", () => {
    const setup = () => {
      const t = initConvexTest();
      const { routes, http } = makeRouter();
      makeWompi({
        events: { onDispersionChange: dispersionCallback },
      }).registerRoutes(http as never);
      const send = (body: unknown) =>
        t.action(
          async (ctx) =>
            await deliver(
              routes.get("/wompi/payouts-webhook")!.handler,
              ctx,
              "/wompi/payouts-webhook",
              body,
            ),
        );
      const dispersion = () =>
        t.query(components.wompi.dispersions.get, {
          wompiPayoutId: "payout_1",
        });
      return { t, send, dispersion };
    };

    test("applies a valid payout.updated and calls back", async () => {
      const { t, send, dispersion } = setup();

      const response = await send(await signedPayoutEvent("PENDING"));

      expect(response).toEqual({
        status: 200,
        body: { received: true, duplicate: false },
      });
      expect(await dispersion()).toMatchObject({
        status: "PENDING",
        reference: "providers-2026-07",
        paymentType: "PROVIDERS",
        amountInCents: 500_000,
      });
      expect(await dispersionLog(t)).toMatchObject([
        { wompiPayoutId: "payout_1", status: "PENDING" },
      ]);
    });

    test("applies a payout transaction.updated to its batch", async () => {
      const { t, send, dispersion } = setup();
      await send(await signedPayoutEvent("PENDING"));

      const response = await send(await signedPayoutTransactionEvent("FAILED"));

      expect(response).toEqual({
        status: 200,
        body: { received: true, duplicate: false },
      });
      const batch = await dispersion();
      const transactions = await t.query(
        components.wompi.dispersions.listTransactions,
        {
          dispersionId: batch!._id,
        },
      );
      expect(transactions).toMatchObject([
        {
          wompiTransactionId: "payout_tx_1",
          status: "FAILED",
          amountInCents: 500_000,
          payeeName: "Juan Pérez",
          failureReason: "La cuenta no existe o está inactiva",
        },
      ]);
    });

    test.each([
      [
        "a wrong checksum",
        async () => {
          const event = await signedPayoutEvent("TOTAL_PAYMENT");
          event.signature.checksum = "deadbeef";
          return event;
        },
      ],
      [
        "a body changed after the signature",
        async () => {
          const event = await signedPayoutEvent("PENDING");
          event.data.payout.status = "TOTAL_PAYMENT";
          return event;
        },
      ],
      [
        "a signature made with the payments secret",
        async () => await signedPayoutEvent("TOTAL_PAYMENT", EVENTS_KEY),
      ],
    ])("rejects %s with 403 and stores nothing", async (_name, makeEvent) => {
      const { t, send, dispersion } = setup();
      const event = await makeEvent();

      const response = await send(event);

      expect(response).toEqual({
        status: 403,
        body: { error: "Invalid signature" },
      });
      expect(await dispersion()).toBeNull();
      expect(await dispersionLog(t)).toEqual([]);
      expect(await notRecorded(t, event.signature.checksum)).toBe(true);
    });

    test("a duplicate delivery answers duplicate: true and applies nothing again", async () => {
      const { t, send, dispersion } = setup();
      const event = await signedPayoutEvent("TOTAL_PAYMENT");

      const first = await send(event);
      const second = await send(event);

      expect(first.body).toEqual({ received: true, duplicate: false });
      expect(second).toEqual({
        status: 200,
        body: { received: true, duplicate: true },
      });
      expect((await dispersion())?.status).toBe("TOTAL_PAYMENT");
      expect(await dispersionLog(t)).toHaveLength(1);
    });

    test("fails when the payouts events key is missing", async () => {
      const t = initConvexTest();
      const { routes, http } = makeRouter();
      makeWompi({
        payouts: {
          apiKey: "payouts_api_key",
          userPrincipalId: "payouts_user",
          eventsKey: "",
        },
      }).registerRoutes(http as never);
      const event = await signedPayoutEvent("PENDING");

      await expect(
        t.action(
          async (ctx) =>
            await deliver(
              routes.get("/wompi/payouts-webhook")!.handler,
              ctx,
              "/wompi/payouts-webhook",
              event,
            ),
        ),
      ).rejects.toThrow("WOMPI_PAYOUTS_EVENTS_KEY");
    });
  });
});

// ---------------------------------------------------------------------------
// api()
// ---------------------------------------------------------------------------

describe("api()", () => {
  test("getConfig gives the public configuration and no secret", async () => {
    const t = initConvexTest();
    const api = makeWompi().api();

    const config = await t.query(
      async (ctx) => await handlerOf(api.getConfig)(ctx, {}),
    );

    expect(config).toEqual({
      publicKey: "pub_test_key",
      sandbox: true,
      currency: "COP",
    });
    const serialized = JSON.stringify(config);
    for (const secret of [
      PRIVATE_KEY,
      EVENTS_KEY,
      INTEGRITY_KEY,
      PAYOUTS_EVENTS_KEY,
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test("listProducts gives the active catalog without authentication", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const api = makeWompi(authedConfig).api();

    const products = (await t.query(
      async (ctx) => await handlerOf(api.listProducts)(ctx, {}),
    )) as { key: string }[];

    expect(products.map((product) => product.key).sort()).toEqual([
      "pro-monthly",
      "pro-trial",
      "sticker-pack",
    ]);
  });

  test("checkout charges the signed-in user and gives only the URL and the reference", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([]);
    const api = makeWompi(authedConfig).api();

    const result = (await t.withIdentity(BOB).action(
      async (ctx) =>
        await handlerOf(api.checkout)(ctx, {
          productKey: "sticker-pack",
          redirectUrl: REDIRECT_URL,
        }),
    )) as { url: string; reference: string };

    expect(Object.keys(result).sort()).toEqual(["reference", "url"]);
    expect(new URL(result.url).searchParams.get("customer-data:email")).toBe(
      "bob@example.com",
    );

    expect(await paymentsOf(t, "user_1")).toEqual([]);
    expect(await paymentsOf(t, "user_2")).toMatchObject([
      { reference: result.reference, userId: "user_2", amountInCents: 500_000 },
    ]);
  });

  test("subscribe binds the subscription to the signed-in user", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const wompi = mockWompi([MERCHANT, PAYMENT_SOURCE, chargeWith("APPROVED")]);
    const api = makeWompi(authedConfig).api();

    const result = (await t
      .withIdentity(BOB)
      .action(
        async (ctx) =>
          await handlerOf(api.subscribe)(ctx, {
            productKey: "pro-monthly",
            token: "tok_card",
          }),
      )) as Record<string, { userId: string; status: string }>;

    expect(Object.keys(result).sort()).toEqual(["payment", "subscription"]);
    expect(result.subscription).toMatchObject({
      userId: "user_2",
      status: "active",
    });
    expect(result.payment).toMatchObject({
      userId: "user_2",
      status: "approved",
    });

    const [source] = wompi.to("POST", /\/payment_sources$/);
    expect(source.body.customer_email).toBe("bob@example.com");
    expect(await subscriptionsOf(t, "user_1")).toEqual([]);
  });

  test("the queries give each user only their rows", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([MERCHANT, PAYMENT_SOURCE, chargeWith("APPROVED")]);
    const api = makeWompi(authedConfig).api();

    const created = (await t
      .withIdentity(ADA)
      .action(
        async (ctx) =>
          await handlerOf(api.subscribe)(ctx, {
            productKey: "pro-monthly",
            token: "tok_card",
          }),
      )) as { payment: { reference: string } };
    const reference = created.payment.reference;

    const asAda = t.withIdentity(ADA);
    const asBob = t.withIdentity(BOB);
    const query = (
      as: typeof asAda,
      fn: unknown,
      args: Record<string, unknown> = {},
    ) => as.query(async (ctx) => await handlerOf(fn)(ctx, args));

    expect(await query(asAda, api.getCurrentSubscription)).toMatchObject({
      userId: "user_1",
      status: "active",
      product: { key: "pro-monthly" },
    });
    expect(await query(asAda, api.listSubscriptions)).toHaveLength(1);
    expect(await query(asAda, api.listPayments)).toHaveLength(1);
    expect(await query(asAda, api.getPayment, { reference })).toMatchObject({
      reference,
    });

    expect(await query(asBob, api.getCurrentSubscription)).toBeNull();
    expect(await query(asBob, api.listSubscriptions)).toEqual([]);
    expect(await query(asBob, api.listPayments)).toEqual([]);
    // A reference is not a secret: it is in the redirect URL.
    expect(await query(asBob, api.getPayment, { reference })).toBeNull();
  });

  test("a user cannot cancel, resume or change the subscription of a different user", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([MERCHANT, PAYMENT_SOURCE, chargeWith("APPROVED")]);
    const api = makeWompi(authedConfig).api();

    const created = (await t
      .withIdentity(ADA)
      .action(
        async (ctx) =>
          await handlerOf(api.subscribe)(ctx, {
            productKey: "pro-monthly",
            token: "tok_card",
          }),
      )) as { subscription: { _id: string } };
    const subscriptionId = created.subscription._id;

    const asBob = t.withIdentity(BOB);
    for (const [fn, args] of [
      [api.cancelSubscription, { subscriptionId }],
      [api.cancelSubscription, { subscriptionId, immediately: true }],
      [api.resumeSubscription, { subscriptionId }],
      [api.changeSubscription, { subscriptionId, productKey: "pro-trial" }],
    ] as const) {
      await expect(
        asBob.mutation(async (ctx) => await handlerOf(fn)(ctx, args)),
      ).rejects.toThrow("Subscription not found");
    }

    const [subscription] = await subscriptionsOf(t, "user_1");
    expect(subscription).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: false,
    });
    expect(subscription.pendingProductKey).toBeUndefined();
  });

  test("the owner can cancel at period end, resume, and schedule a plan change", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([MERCHANT, PAYMENT_SOURCE, chargeWith("APPROVED")]);
    const changes: string[] = [];
    const api = makeWompi({
      ...authedConfig,
      events: {
        onSubscriptionChange: (_ctx, subscription) => {
          changes.push(
            `${subscription.status}:${subscription.cancelAtPeriodEnd}:${subscription.pendingProductKey ?? "-"}`,
          );
        },
      },
    }).api();

    const asAda = t.withIdentity(ADA);
    const created = (await asAda.action(
      async (ctx) =>
        await handlerOf(api.subscribe)(ctx, {
          productKey: "pro-monthly",
          token: "tok_card",
        }),
    )) as { subscription: { _id: string } };
    const subscriptionId = created.subscription._id;
    const mutate = (fn: unknown, args: Record<string, unknown>) =>
      asAda.mutation(async (ctx) => await handlerOf(fn)(ctx, args));

    expect(
      await mutate(api.cancelSubscription, { subscriptionId }),
    ).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
    });
    // A second cancel request is a no-op and calls back no more.
    await mutate(api.cancelSubscription, { subscriptionId });
    expect(
      await mutate(api.resumeSubscription, { subscriptionId }),
    ).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: false,
    });
    expect(
      await mutate(api.changeSubscription, {
        subscriptionId,
        productKey: "pro-trial",
      }),
    ).toMatchObject({
      productKey: "pro-monthly",
      pendingProductKey: "pro-trial",
    });

    expect(changes).toEqual([
      "active:false:-",
      "active:true:-",
      "active:false:-",
      "active:false:pro-trial",
    ]);
  });
});

// ---------------------------------------------------------------------------
// processBilling()
// ---------------------------------------------------------------------------

describe("processBilling()", () => {
  /** A subscription for `userId` with an approved first period, on `sourceId`. */
  const activeSubscription = async (
    t: Harness,
    userId: string,
    sourceId: number,
  ) => {
    const customer = await t.mutation(components.wompi.customers.upsert, {
      userId,
      email: `${userId}@example.com`,
    });
    const created = await t.mutation(components.wompi.subscriptions.create, {
      customerId: customer._id,
      userId,
      productKey: "pro-monthly",
      paymentSource: {
        wompiSourceId: sourceId,
        type: "CARD",
        status: "AVAILABLE",
      },
    });
    await t.mutation(components.wompi.billing.recordChargeResult, {
      paymentId: created.payment!._id,
      nextStatus: "approved",
      wompiTransactionId: `tx_init_${userId}`,
      config: CRON_CONFIG,
    });
    return { customer, subscriptionId: created.subscription._id };
  };

  const makeDue = (t: Harness, subscriptionId: string) =>
    t.mutation(components.wompi.subscriptions.setNextChargeAt, {
      subscriptionId: subscriptionId as never,
      at: Date.now() - 1_000,
    });

  const subscriptionOf = (t: Harness, subscriptionId: string) =>
    t.query(components.wompi.subscriptions.get, {
      subscriptionId: subscriptionId as never,
    });

  test("one run renews, retries a failed renewal and sweeps stale payments", async () => {
    const t = initConvexTest();
    await seedProducts(t);

    // Renewal: an active subscription that is due.
    const renewing = await activeSubscription(t, "user_renew", 1111);
    await makeDue(t, renewing.subscriptionId);

    // Dunning: a subscription with one failed renewal, due for its retry.
    const dunning = await activeSubscription(t, "user_dunning", 2222);
    await makeDue(t, dunning.subscriptionId);
    const { claims } = await t.mutation(components.wompi.billing.claimDue, {
      config: CRON_CONFIG,
    });
    const failed = claims.find(
      (claim) => claim.subscription._id === dunning.subscriptionId,
    )!;
    await t.mutation(components.wompi.billing.recordChargeResult, {
      paymentId: failed.payment._id,
      nextStatus: "declined",
      failureReason: "Fondos insuficientes",
      config: CRON_CONFIG,
    });
    expect(await subscriptionOf(t, dunning.subscriptionId)).toMatchObject({
      status: "past_due",
      failedAttempts: 1,
    });
    await makeDue(t, renewing.subscriptionId);
    await makeDue(t, dunning.subscriptionId);

    // Sweep: one checkout that was paid without a webhook, one abandoned.
    for (const reference of ["wmpk_paid", "wmpk_abandoned"]) {
      await t.mutation(components.wompi.payments.createCheckout, {
        reference,
        customerId: renewing.customer._id,
        userId: "user_renew",
        productKey: "sticker-pack",
      });
    }

    const wompi = mockWompi([
      MERCHANT,
      {
        method: "POST",
        path: /\/transactions$/,
        respond: ({ body }) =>
          json({
            data: transaction(
              `tx_${String(body.reference)}`,
              body.payment_source_id === 1111 ? "APPROVED" : "DECLINED",
              String(body.reference),
              Number(body.amount_in_cents),
            ),
          }),
      },
      {
        method: "GET",
        path: /\/transactions\?reference=/,
        respond: ({ url }) => {
          const reference = new URL(url).searchParams.get("reference");
          return json({
            data:
              reference === "wmpk_paid"
                ? [transaction("tx_paid", "APPROVED", "wmpk_paid", 500_000)]
                : [],
          });
        },
      },
    ]);

    const before = await subscriptionOf(t, renewing.subscriptionId);
    const summary = await t.action(
      async (ctx) =>
        await makeWompi({
          events: { onPaymentChange: paymentCallback },
        }).processBilling(ctx),
    );

    expect(summary).toMatchObject({
      claimed: 2,
      approved: 1,
      declined: 1,
      stillPending: 0,
      sweptPending: 1,
      expired: 1,
      finalizedCancellations: 0,
      errors: [],
    });

    // The renewal and the retry each sent one charge, on their own source.
    const charges = wompi.to("POST", /\/transactions$/);
    expect(
      charges.map((charge) => charge.body.payment_source_id).sort(),
    ).toEqual([1111, 2222]);
    expect(new Set(charges.map((charge) => charge.body.reference)).size).toBe(
      2,
    );

    // Renewal: the period moved forward by one interval.
    const renewed = await subscriptionOf(t, renewing.subscriptionId);
    expect(renewed).toMatchObject({ status: "active", failedAttempts: 0 });
    expect(renewed!.currentPeriodStart).toBe(before!.currentPeriodEnd);
    expect(renewed!.currentPeriodEnd).toBeGreaterThan(before!.currentPeriodEnd);

    // Dunning: the second failure moves the ladder one step.
    expect(await subscriptionOf(t, dunning.subscriptionId)).toMatchObject({
      status: "past_due",
      failedAttempts: 2,
    });

    // Sweep: the paid checkout is approved, the abandoned one is expired.
    expect(await statusOf(t, "wmpk_paid")).toBe("approved");
    expect(await statusOf(t, "wmpk_abandoned")).toBe("expired");

    // Each payment change reached the app callback one time.
    expect(
      (await ledger(t))
        .map((row) => `${row.reference.slice(0, 4)}:${row.status}`)
        .sort(),
    ).toEqual([
      "wmpk:approved",
      "wmpk:expired",
      "wmps:approved",
      "wmps:declined",
    ]);

    // A second run has no work to do.
    const second = await t.action(
      async (ctx) =>
        await makeWompi({
          events: { onPaymentChange: paymentCallback },
        }).processBilling(ctx),
    );
    expect(second).toMatchObject({
      claimed: 0,
      approved: 0,
      declined: 0,
      expired: 0,
      errors: [],
    });
    expect(wompi.to("POST", /\/transactions$/)).toHaveLength(2);
  });

  test("finalizes a cancel-at-period-end subscription without a charge", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const { subscriptionId } = await activeSubscription(t, "user_cancel", 3333);
    await t.mutation(components.wompi.subscriptions.cancel, {
      subscriptionId,
      userId: "user_cancel",
    });
    await makeDue(t, subscriptionId);
    const wompi = mockWompi([
      MERCHANT,
      chargeWith("APPROVED"),
      NO_TRANSACTIONS,
    ]);
    const changes: string[] = [];

    const summary = await t.action(
      async (ctx) =>
        await makeWompi({
          events: {
            onSubscriptionChange: (_ctx, subscription) => {
              changes.push(subscription.status);
            },
          },
        }).processBilling(ctx),
    );

    expect(summary).toMatchObject({
      claimed: 0,
      finalizedCancellations: 1,
      errors: [],
    });
    expect((await subscriptionOf(t, subscriptionId))?.status).toBe("canceled");
    expect(changes).toEqual(["canceled"]);
    expect(wompi.fetchMock).not.toHaveBeenCalled();
  });

  test("a merchant lookup that fails charges nothing and reports the error", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    const { subscriptionId } = await activeSubscription(t, "user_renew", 1111);
    await makeDue(t, subscriptionId);
    const wompi = mockWompi([
      {
        method: "GET",
        path: /\/merchants\//,
        respond: () => json({ error: { type: "INTERNAL_ERROR" } }, 500),
      },
      chargeWith("APPROVED"),
      NO_TRANSACTIONS,
    ]);

    const summary = await t.action(
      async (ctx) => await makeWompi().processBilling(ctx),
    );

    expect(summary.claimed).toBe(1);
    expect(summary.approved).toBe(0);
    expect(summary.declined).toBe(0);
    expect(summary.errors.some((error) => error.startsWith("merchant:"))).toBe(
      true,
    );
    expect(wompi.to("POST", /\/transactions$/)).toEqual([]);
    expect(await subscriptionOf(t, subscriptionId)).toMatchObject({
      status: "active",
      failedAttempts: 0,
    });
  });

  test("billing() gives an internal action that runs processBilling", async () => {
    const t = initConvexTest();
    await seedProducts(t);
    mockWompi([MERCHANT, NO_TRANSACTIONS]);

    const run = makeWompi().billing();
    const summary = await t.action(
      async (ctx) => await handlerOf(run)(ctx, {}),
    );

    expect((run as unknown as { isInternal: boolean }).isInternal).toBe(true);
    expect(summary).toMatchObject({ claimed: 0, errors: [] });
  });
});
