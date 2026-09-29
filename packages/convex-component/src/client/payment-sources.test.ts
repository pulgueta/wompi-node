/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { computeEventChecksum } from "@pulgueta/wompi/server";
import type { WompiConfig } from "./index.js";
import { Wompi } from "./index.js";
import { components, initConvexTest, paymentCallback } from "./setup.test.js";

const EVENTS_KEY = "test_events_key";
const NEQUI_TOKEN = "nequi_test_token";

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

type Body = Record<string, unknown>;

/**
 * The Wompi API these tests talk to. Each test sets the state of the Nequi
 * token and the status of the next transactions; the record of the requests
 * shows which sources were created and charged.
 */
const wompiApi = () => {
  const api = {
    /** States the token reads return, in order; the last one repeats. */
    tokenStatuses: ["PENDING"],
    /** Statuses of the transactions to create, in order; the last one repeats. */
    transactionStatuses: ["APPROVED"],
    nextSourceId: 5678,
    createdSources: [] as Body[],
    charges: [] as Body[],
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Body) : {};

      if (method === "GET" && /\/merchants\//.test(url)) return merchant();

      if (method === "GET" && /\/tokens\/nequi\//.test(url)) {
        const status = api.tokenStatuses.length > 1 ? api.tokenStatuses.shift() : api.tokenStatuses[0];
        return json({ data: { id: url.split("/").pop(), status } });
      }

      if (method === "POST" && /\/payment_sources$/.test(url)) {
        api.createdSources.push(body);
        return json({
          data: { id: api.nextSourceId++, type: body.type, status: "AVAILABLE" },
        });
      }

      if (method === "POST" && /\/transactions$/.test(url)) {
        api.charges.push(body);
        const status =
          api.transactionStatuses.length > 1
            ? api.transactionStatuses.shift()
            : api.transactionStatuses[0];
        return json({
          data: {
            id: `tx_${api.charges.length}`,
            status,
            reference: body.reference,
            amount_in_cents: body.amount_in_cents,
            currency: body.currency,
            payment_method_type: "NEQUI",
            created_at: "2026-08-18T10:00:00.000Z",
          },
        });
      }

      if (method === "GET" && /\/transactions\?reference=/.test(url)) return json({ data: [] });

      throw new Error(`Unexpected fetch ${method} ${url}`);
    }),
  };
  return api;
};

const makeWompi = (overrides: Partial<WompiConfig> = {}) =>
  new Wompi(components.wompi, {
    getUserInfo: async () => ({ userId: "user_1", email: "ada@example.com" }),
    publicKey: "pub_test_key",
    privateKey: "prv_test_key",
    eventsKey: EVENTS_KEY,
    integrityKey: "integrity_key",
    sandbox: true,
    billing: {
      leaseMs: 0,
      pollAttempts: 1,
      pollIntervalMs: 0,
      pendingSweepAfterMs: 0,
    },
    events: { onPaymentChange: paymentCallback },
    ...overrides,
  });

type T = ReturnType<typeof initConvexTest>;

async function seed(t: T) {
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
    ],
  });
}

const subscriptionOf = (t: T, subscriptionId: string) =>
  t.query(components.wompi.subscriptions.get, { subscriptionId: subscriptionId as never });

const paymentsOf = (t: T) => t.query(components.wompi.payments.listByUser, { userId: "user_1" });

const tokenStatus = (t: T, tokenId = NEQUI_TOKEN) =>
  t.query(components.wompi.paymentSources.getStatusByTokenId, { tokenId, userId: "user_1" });

/** Statuses the app's `onPaymentChange` mutation recorded, in order. */
const callbackStatuses = async (t: T) =>
  (await t.run(async (ctx) => await ctx.db.query("creditLedger").collect())).map(
    (row) => row.status,
  );

const routes = new Map<
  string,
  { _handler: (ctx: unknown, request: Request) => Promise<Response> }
>();
const http = {
  route: (spec: { path: string; handler: unknown }) => {
    routes.set(spec.path, spec.handler as never);
  },
};

const nequiEvent = async (status: string, tokenId = NEQUI_TOKEN, timestamp = 1_700_000_000) => {
  const event = {
    event: "nequi_token.updated",
    data: { nequi_token: { id: tokenId, status, phone_number: "3107654321" } },
    environment: "test",
    signature: { properties: ["nequi_token.id", "nequi_token.status"], checksum: "" },
    timestamp,
    sent_at: "2026-08-18T10:00:00.000Z",
  };
  event.signature.checksum = await computeEventChecksum(event as never, EVENTS_KEY);
  return event;
};

/** Deliver an event to the payments webhook of `wompi`. */
const deliver = async (t: T, wompi: Wompi, event: unknown) => {
  wompi.registerRoutes(http as never);
  const handler = routes.get("/wompi/webhook")!._handler;
  return await t.action(async (ctx) => {
    const response = await handler(
      ctx,
      new Request("https://example.convex.site/wompi/webhook", {
        method: "POST",
        body: JSON.stringify(event),
      }),
    );
    // Actions must return Convex values, so unwrap the Response first.
    return { status: response.status, body: (await response.json()) as unknown };
  });
};

const recordedOutcome = async (t: T, checksum: string) =>
  (
    await t.mutation(components.wompi.webhooks.recordEvent, {
      checksum,
      eventType: "nequi_token.updated",
      timestamp: 1_700_000_000,
    })
  ).outcome;

const subscribeWithNequi = (t: T, wompi: Wompi, productKey = "pro-monthly") =>
  t.action(
    async (ctx) =>
      await wompi.subscribe(ctx, { productKey, token: NEQUI_TOKEN, type: "NEQUI" }),
  );

/** An active subscription paid with the card source 1234. */
async function activeSubscription(t: T, wompi: Wompi, api: ReturnType<typeof wompiApi>) {
  api.nextSourceId = 1234;
  const { subscription } = await t.action(
    async (ctx) => await wompi.subscribe(ctx, { productKey: "pro-monthly", token: "tok_card_1" }),
  );
  expect(subscription.status).toBe("active");
  return subscription;
}

let api: ReturnType<typeof wompiApi>;

beforeEach(() => {
  routes.clear();
  api = wompiApi();
  vi.stubGlobal("fetch", api.fetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Nequi subscriptions", () => {
  test("a token that waits for approval saves the subscription and charges nothing", async () => {
    const t = initConvexTest();
    await seed(t);

    const result = await subscribeWithNequi(t, makeWompi());

    expect(result.awaitingApproval).toBe(true);
    expect(result.outcome).toBeNull();
    expect(result.subscription.status).toBe("incomplete");
    expect(result.subscription.nextChargeAt).toBeUndefined();
    expect(result.payment?.status).toBe("pending");
    expect(api.createdSources).toEqual([]);
    expect(api.charges).toEqual([]);
    expect(await tokenStatus(t)).toBe("PENDING");
  });

  test("the approval creates the source and charges the first period exactly once", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const { subscription } = await subscribeWithNequi(t, wompi);

    const approved = await nequiEvent("APPROVED");
    const first = await deliver(t, wompi, approved);

    expect(first).toEqual({ status: 200, body: { received: true, duplicate: false } });
    expect(api.createdSources).toHaveLength(1);
    expect(api.createdSources[0]).toMatchObject({
      type: "NEQUI",
      token: NEQUI_TOKEN,
      customer_email: "ada@example.com",
      acceptance_token: "acc_token",
      accept_personal_auth: "personal_token",
    });
    expect(api.charges).toHaveLength(1);
    expect(api.charges[0]).toMatchObject({ payment_source_id: 5678, amount_in_cents: 2_990_000 });

    const active = await subscriptionOf(t, subscription._id);
    expect(active?.status).toBe("active");
    expect(active?.nextChargeAt).toBe(active?.currentPeriodEnd);
    expect(await tokenStatus(t)).toBe("AVAILABLE");
    expect(await callbackStatuses(t)).toEqual(["approved"]);
    expect(await recordedOutcome(t, approved.signature.checksum)).toBe("activated");

    // Wompi sends the same delivery again: a duplicate, nothing runs.
    const replay = await deliver(t, wompi, approved);
    expect(replay.body).toEqual({ received: true, duplicate: true });

    // A different delivery for the same approval is applied as a no-op.
    const again = await nequiEvent("APPROVED", NEQUI_TOKEN, 1_700_000_500);
    await deliver(t, wompi, again);
    expect(await recordedOutcome(t, again.signature.checksum)).toBe("noop");

    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toHaveLength(1);
    expect(await callbackStatuses(t)).toEqual(["approved"]);
    expect((await paymentsOf(t)).map((p) => p.status)).toEqual(["approved"]);
  });

  test("a delivery that fails after the source was created charges once on the retry", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const { subscription } = await subscribeWithNequi(t, wompi);

    // The charge request fails at the transport level: the charge is not
    // resolved, and the delivery stays without an outcome.
    const chargeFails = api.fetch.getMockImplementation()!;
    let failOnce = true;
    api.fetch.mockImplementation(async (input, init) => {
      if (failOnce && init?.method === "POST" && /\/transactions$/.test(String(input))) {
        failOnce = false;
        throw new TypeError("fetch failed");
      }
      return await chargeFails(input, init);
    });

    const approved = await nequiEvent("APPROVED");
    const failed = await deliver(t, wompi, approved);
    expect(failed.status).toBe(503);
    expect(await recordedOutcome(t, approved.signature.checksum)).toBeUndefined();
    expect(await tokenStatus(t)).toBe("AVAILABLE");
    expect((await subscriptionOf(t, subscription._id))?.status).toBe("incomplete");

    // Wompi sends the delivery again: it finds the source active and charges
    // the same payment.
    const retry = await deliver(t, wompi, approved);

    expect(retry).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(await recordedOutcome(t, approved.signature.checksum)).toBe("noop");
    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toHaveLength(1);
    expect((await subscriptionOf(t, subscription._id))?.status).toBe("active");
    expect((await paymentsOf(t)).map((p) => p.status)).toEqual(["approved"]);
  });

  test("a refusal cancels the subscription and a later approval does nothing", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const { subscription } = await subscribeWithNequi(t, wompi);

    const declined = await nequiEvent("DECLINED");
    const response = await deliver(t, wompi, declined);

    expect(response.status).toBe(200);
    const canceled = await subscriptionOf(t, subscription._id);
    expect(canceled?.status).toBe("canceled");
    expect(canceled?.lastError).toBe("The customer declined the Nequi token");
    expect(canceled?.nextChargeAt).toBeUndefined();
    expect(await tokenStatus(t)).toBe("DECLINED");
    expect((await paymentsOf(t)).map((p) => p.status)).toEqual(["error"]);
    expect(await callbackStatuses(t)).toEqual(["error"]);
    expect(await recordedOutcome(t, declined.signature.checksum)).toBe("declined");

    await deliver(t, wompi, await nequiEvent("APPROVED", NEQUI_TOKEN, 1_700_000_500));

    expect(api.createdSources).toEqual([]);
    expect(api.charges).toEqual([]);
    expect((await subscriptionOf(t, subscription._id))?.status).toBe("canceled");
  });

  test("a refusal does not cancel while an earlier charge is in progress", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();

    // The charge of a card stays PENDING at Wompi.
    api.transactionStatuses = ["PENDING"];
    const withCard = await t.action(
      async (ctx) =>
        await wompi.subscribe(ctx, { productKey: "pro-monthly", token: "tok_card_1" }),
    );
    expect(withCard.subscription.status).toBe("incomplete");
    expect(withCard.payment).toMatchObject({ status: "pending", wompiTransactionId: "tx_1" });

    // The customer tries again with Nequi, and then refuses the token.
    await subscribeWithNequi(t, wompi);
    await deliver(t, wompi, await nequiEvent("DECLINED"));

    const waiting = await subscriptionOf(t, withCard.subscription._id);
    expect(waiting?.status).toBe("incomplete");
    expect(waiting?.lastError).toBe("The customer declined the Nequi token");
    expect(await tokenStatus(t)).toBe("DECLINED");
    expect((await paymentsOf(t)).map((p) => p.status)).toEqual(["pending"]);

    // Wompi approves the charge of the card.
    await t.mutation(components.wompi.billing.applyTransaction, {
      reference: withCard.payment!.reference,
      wompiTransactionId: "tx_1",
      wompiStatus: "APPROVED",
      config: { maxRetries: 3, retryScheduleMs: [1_000], onExhausted: "mark_unpaid", leaseMs: 0 },
    });

    expect((await subscriptionOf(t, withCard.subscription._id))?.status).toBe("active");
    expect((await paymentsOf(t)).map((p) => p.status)).toEqual(["approved"]);
  });

  test("a refusal cancels a trial, which has no payment", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const result = await subscribeWithNequi(t, wompi, "pro-trial");

    expect(result.awaitingApproval).toBe(true);
    expect(result.subscription.status).toBe("trialing");
    expect(result.payment).toBeNull();

    await deliver(t, wompi, await nequiEvent("DECLINED"));

    expect((await subscriptionOf(t, result.subscription._id))?.status).toBe("canceled");
    expect(await paymentsOf(t)).toEqual([]);
  });

  test("an approval during a trial activates the source and charges nothing", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const { subscription } = await subscribeWithNequi(t, wompi, "pro-trial");

    await deliver(t, wompi, await nequiEvent("APPROVED"));

    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toEqual([]);
    expect((await subscriptionOf(t, subscription._id))?.status).toBe("trialing");
    expect(await tokenStatus(t)).toBe("AVAILABLE");
  });

  test("an approval after the trial ended makes the subscription due immediately", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const { subscription } = await subscribeWithNequi(t, wompi, "pro-trial");

    // The trial ends before the customer approves the token.
    await t.mutation(components.wompi.subscriptions.setNextChargeAt, {
      subscriptionId: subscription._id as never,
      at: Date.now() - 1_000,
    });
    await t.action(async (ctx) => await wompi.processBilling(ctx));

    const pastDue = await subscriptionOf(t, subscription._id);
    expect(pastDue?.status).toBe("past_due");
    // The dunning retry is a day away.
    expect(pastDue!.nextChargeAt!).toBeGreaterThan(Date.now() + 60_000);
    expect(api.charges).toEqual([]);

    await deliver(t, wompi, await nequiEvent("APPROVED"));

    const due = await subscriptionOf(t, subscription._id);
    expect(due?.status).toBe("past_due");
    expect(due!.nextChargeAt!).toBeLessThanOrEqual(Date.now());

    const run = await t.action(async (ctx) => await wompi.processBilling(ctx));

    expect(run.approved).toBe(1);
    expect(api.charges.map((c) => c.payment_source_id)).toEqual([5678]);
    expect((await subscriptionOf(t, subscription._id))?.status).toBe("active");
  });

  test("subscribe applies an approval that arrived before the source was saved", async () => {
    const t = initConvexTest();
    await seed(t);
    // The token is PENDING at the first read and APPROVED at the second.
    api.tokenStatuses = ["PENDING", "APPROVED"];

    const result = await subscribeWithNequi(t, makeWompi());

    expect(result.awaitingApproval).toBe(false);
    expect(result.subscription.status).toBe("active");
    expect(result.payment?.status).toBe("approved");
    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toHaveLength(1);
  });

  test("subscribe returns the payment of a refusal that arrived before the source was saved", async () => {
    const t = initConvexTest();
    await seed(t);
    // The token is PENDING at the first read and DECLINED at the second.
    api.tokenStatuses = ["PENDING", "DECLINED"];

    const result = await subscribeWithNequi(t, makeWompi());

    expect(result.awaitingApproval).toBe(false);
    expect(result.outcome).toBeNull();
    expect(result.subscription.status).toBe("canceled");
    expect(result.payment?.status).toBe("error");
    expect(result.payment?.failureReason).toBe("The customer declined the Nequi token");
    expect((await paymentsOf(t)).map((p) => p.status)).toEqual(["error"]);
  });

  test("a token that is approved at subscribe time charges immediately", async () => {
    const t = initConvexTest();
    await seed(t);
    api.tokenStatuses = ["APPROVED"];

    const result = await subscribeWithNequi(t, makeWompi());

    expect(result.awaitingApproval).toBe(false);
    expect(result.subscription.status).toBe("active");
    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toHaveLength(1);
    expect(await tokenStatus(t)).toBe("AVAILABLE");
  });

  test("a token that is declined at subscribe time is rejected and saves nothing", async () => {
    const t = initConvexTest();
    await seed(t);
    api.tokenStatuses = ["DECLINED"];

    await expect(subscribeWithNequi(t, makeWompi())).rejects.toThrow(
      "The customer declined the Nequi token",
    );

    expect(await tokenStatus(t)).toBeNull();
    expect(
      await t.query(components.wompi.subscriptions.listByUser, { userId: "user_1" }),
    ).toEqual([]);
  });

  test("an event for a token the component does not own is ignored", async () => {
    const t = initConvexTest();
    await seed(t);

    const foreign = await nequiEvent("APPROVED", "nequi_of_another_system");
    const response = await deliver(t, makeWompi(), foreign);

    expect(response.status).toBe(200);
    expect(api.fetch).not.toHaveBeenCalled();
    expect(await recordedOutcome(t, foreign.signature.checksum)).toBe("unknown_token");
  });

  test("the token status is not visible to another user", async () => {
    const t = initConvexTest();
    await seed(t);
    await subscribeWithNequi(t, makeWompi());

    expect(
      await t.query(components.wompi.paymentSources.getStatusByTokenId, {
        tokenId: NEQUI_TOKEN,
        userId: "user_2",
      }),
    ).toBeNull();
  });
});

describe("the creation of the Wompi payment source", () => {
  // A claim that stays valid during the test, as in production.
  const withLease = () =>
    makeWompi({
      billing: { leaseMs: 60_000, pollAttempts: 1, pollIntervalMs: 0, pendingSweepAfterMs: 0 },
    });

  test("two deliveries at the same time create one payment source", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = withLease();
    const { subscription } = await subscribeWithNequi(t, wompi);

    // The first creation request waits until the second delivery is complete.
    const original = api.fetch.getMockImplementation()!;
    let reached = () => {};
    let release = () => {};
    const inCreation = new Promise<void>((resolve) => (reached = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    let held = false;
    api.fetch.mockImplementation(async (input, init) => {
      if (!held && init?.method === "POST" && /\/payment_sources$/.test(String(input))) {
        held = true;
        reached();
        await gate;
      }
      return await original(input, init);
    });

    const first = deliver(t, wompi, await nequiEvent("APPROVED"));
    await inCreation;
    const other = await nequiEvent("APPROVED", NEQUI_TOKEN, 1_700_000_500);
    const second = await deliver(t, wompi, other);
    release();

    expect(second.status).toBe(503);
    expect(await recordedOutcome(t, other.signature.checksum)).toBeUndefined();
    expect((await first).status).toBe(200);
    expect(api.createdSources).toHaveLength(1);
    expect(api.charges.map((c) => c.payment_source_id)).toEqual([5678]);
    expect((await subscriptionOf(t, subscription._id))?.status).toBe("active");

    // The delivery that Wompi sends again finds the work done.
    expect((await deliver(t, wompi, other)).status).toBe(200);
    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toHaveLength(1);
  });

  test("a run that failed after Wompi created the source is not repeated while its claim is valid", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = withLease();
    const { subscription } = await subscribeWithNequi(t, wompi);

    // Wompi creates the source, but the response does not arrive.
    const original = api.fetch.getMockImplementation()!;
    let lost = false;
    api.fetch.mockImplementation(async (input, init) => {
      if (!lost && init?.method === "POST" && /\/payment_sources$/.test(String(input))) {
        lost = true;
        api.createdSources.push(JSON.parse(String(init.body)) as Body);
        throw new TypeError("fetch failed");
      }
      return await original(input, init);
    });

    const approved = await nequiEvent("APPROVED");
    await expect(deliver(t, wompi, approved)).rejects.toThrow();
    expect(await tokenStatus(t)).toBe("PENDING");

    const early = await deliver(t, wompi, approved);
    expect(early.status).toBe(503);
    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toEqual([]);

    // Wompi has no request to find the first source again. When the claim
    // is not valid anymore, the retry creates a source and charges it.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 61_000);
      const late = await deliver(t, wompi, approved);

      expect(late.status).toBe(200);
      expect(api.createdSources).toHaveLength(2);
      expect(api.charges.map((c) => c.payment_source_id)).toEqual([5678]);
      expect((await subscriptionOf(t, subscription._id))?.status).toBe("active");
      expect(await tokenStatus(t)).toBe("AVAILABLE");
    } finally {
      vi.useRealTimers();
    }
  });

  test("the charge uses the payment source that the row stores", async () => {
    const t = initConvexTest();
    await seed(t);
    await subscribeWithNequi(t, makeWompi());

    const first = await t.mutation(components.wompi.paymentSources.activate, {
      tokenId: NEQUI_TOKEN,
      wompiSourceId: 111,
      status: "AVAILABLE",
    });
    // A second run that created a source of its own.
    const second = await t.mutation(components.wompi.paymentSources.activate, {
      tokenId: NEQUI_TOKEN,
      wompiSourceId: 222,
      status: "AVAILABLE",
    });

    expect(first.wompiSourceId).toBe(111);
    expect(second.outcome).toBe("noop");
    expect(second.wompiSourceId).toBe(111);
    expect(second.payment?._id).toBe(first.payment?._id);
  });
});

describe("a Nequi token that is submitted again", () => {
  test("a second subscribe with the same token keeps one source, and the approval charges once", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();

    const first = await subscribeWithNequi(t, wompi);
    const second = await subscribeWithNequi(t, wompi);

    expect(second.awaitingApproval).toBe(true);
    expect(second.subscription._id).toBe(first.subscription._id);
    expect(second.subscription.paymentSourceId).toBe(first.subscription.paymentSourceId);
    expect(second.payment?._id).toBe(first.payment?._id);
    expect(await tokenStatus(t)).toBe("PENDING");

    const response = await deliver(t, wompi, await nequiEvent("APPROVED"));

    expect(response.status).toBe(200);
    expect(api.createdSources).toHaveLength(1);
    expect(api.charges).toHaveLength(1);
    expect((await subscriptionOf(t, first.subscription._id))?.status).toBe("active");
    expect(await tokenStatus(t)).toBe("AVAILABLE");
  });

  test("a second replacement with the same token keeps one source", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const before = await activeSubscription(t, wompi, api);
    const replace = () =>
      t.action(
        async (ctx) =>
          await wompi.updateSubscriptionPaymentSource(ctx, {
            subscriptionId: before._id,
            token: NEQUI_TOKEN,
            type: "NEQUI",
          }),
      );

    await replace();
    await replace();
    expect(await tokenStatus(t)).toBe("PENDING");

    await deliver(t, wompi, await nequiEvent("APPROVED"));

    expect(api.createdSources.map((s) => s.token)).toEqual(["tok_card_1", NEQUI_TOKEN]);
    expect((await subscriptionOf(t, before._id))?.paymentSourceId).not.toBe(
      before.paymentSourceId,
    );
    expect(await tokenStatus(t)).toBe("AVAILABLE");
  });

  test("a token of another user is rejected", async () => {
    const t = initConvexTest();
    await seed(t);
    const owner = await subscribeWithNequi(t, makeWompi());

    const intruder = makeWompi({
      getUserInfo: async () => ({ userId: "user_2", email: "eve@example.com" }),
    });

    await expect(subscribeWithNequi(t, intruder)).rejects.toThrow(
      "This Nequi token is already in use",
    );
    expect(await tokenStatus(t)).toBe("PENDING");
    expect((await subscriptionOf(t, owner.subscription._id))?.paymentSourceId).toBe(
      owner.subscription.paymentSourceId,
    );
    expect(
      await t.query(components.wompi.subscriptions.listByUser, { userId: "user_2" }),
    ).toEqual([]);
  });

  test("a token of another subscription is rejected", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    await subscribeWithNequi(t, wompi);

    await expect(subscribeWithNequi(t, wompi, "pro-trial")).rejects.toThrow(
      "This Nequi token is already in use",
    );
    expect(await tokenStatus(t)).toBe("PENDING");
  });
});

describe("a source that another source replaced", () => {
  const replaceWithNequi = (t: T, wompi: Wompi, subscriptionId: string, token: string) =>
    t.action(
      async (ctx) =>
        await wompi.updateSubscriptionPaymentSource(ctx, {
          subscriptionId,
          token,
          type: "NEQUI",
        }),
    );

  test("a late approval does not replace the card that replaced the token", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const before = await activeSubscription(t, wompi, api);
    await replaceWithNequi(t, wompi, before._id, NEQUI_TOKEN);

    const { subscription: withCard } = await t.action(
      async (ctx) =>
        await wompi.updateSubscriptionPaymentSource(ctx, {
          subscriptionId: before._id,
          token: "tok_card_2",
        }),
    );
    expect(await tokenStatus(t)).toBe("SUPERSEDED");

    const approved = await nequiEvent("APPROVED");
    await deliver(t, wompi, approved);

    expect(api.createdSources.map((s) => s.token)).toEqual(["tok_card_1", "tok_card_2"]);
    expect((await subscriptionOf(t, before._id))?.paymentSourceId).toBe(
      withCard.paymentSourceId,
    );
    expect(await tokenStatus(t)).toBe("SUPERSEDED");
    expect(await recordedOutcome(t, approved.signature.checksum)).toBe("noop");
  });

  test("a late approval does not charge the token of an incomplete subscription", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    await subscribeWithNequi(t, wompi);

    // The customer tries again with a card, and the card is declined.
    api.transactionStatuses = ["DECLINED", "APPROVED"];
    const withCard = await t.action(
      async (ctx) =>
        await wompi.subscribe(ctx, { productKey: "pro-monthly", token: "tok_card_1" }),
    );
    expect(withCard.subscription.status).toBe("incomplete");
    expect(await tokenStatus(t)).toBe("SUPERSEDED");

    await deliver(t, wompi, await nequiEvent("APPROVED"));

    expect(api.createdSources.map((s) => s.token)).toEqual(["tok_card_1"]);
    expect(api.charges).toHaveLength(1);
    const after = await subscriptionOf(t, withCard.subscription._id);
    expect(after?.status).toBe("incomplete");
    expect(after?.paymentSourceId).toBe(withCard.subscription.paymentSourceId);
  });

  test("a refusal of the token that was replaced keeps the subscription", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    await subscribeWithNequi(t, wompi);
    api.transactionStatuses = ["DECLINED"];
    const withCard = await t.action(
      async (ctx) =>
        await wompi.subscribe(ctx, { productKey: "pro-monthly", token: "tok_card_1" }),
    );

    await deliver(t, wompi, await nequiEvent("DECLINED"));

    expect((await subscriptionOf(t, withCard.subscription._id))?.status).toBe("incomplete");
    expect(await tokenStatus(t)).toBe("SUPERSEDED");
  });

  test("the newest token wins, and the approval of the older token does nothing", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const before = await activeSubscription(t, wompi, api);
    await replaceWithNequi(t, wompi, before._id, "nequi_old");
    await replaceWithNequi(t, wompi, before._id, "nequi_new");
    expect(await tokenStatus(t, "nequi_old")).toBe("SUPERSEDED");
    expect(await tokenStatus(t, "nequi_new")).toBe("PENDING");

    await deliver(t, wompi, await nequiEvent("APPROVED", "nequi_old"));
    expect((await subscriptionOf(t, before._id))?.paymentSourceId).toBe(before.paymentSourceId);

    await deliver(t, wompi, await nequiEvent("APPROVED", "nequi_new"));

    expect(api.createdSources.map((s) => s.token)).toEqual(["tok_card_1", "nequi_new"]);
    expect((await subscriptionOf(t, before._id))?.paymentSourceId).not.toBe(
      before.paymentSourceId,
    );
    expect(await tokenStatus(t, "nequi_new")).toBe("AVAILABLE");
  });

  test("a token that is submitted again after a card waits for the approval again", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const { subscription } = await subscribeWithNequi(t, wompi);
    api.transactionStatuses = ["DECLINED", "APPROVED"];
    await t.action(
      async (ctx) =>
        await wompi.subscribe(ctx, { productKey: "pro-monthly", token: "tok_card_1" }),
    );

    const again = await subscribeWithNequi(t, wompi);
    expect(again.subscription.paymentSourceId).toBe(subscription.paymentSourceId);
    expect(await tokenStatus(t)).toBe("PENDING");

    await deliver(t, wompi, await nequiEvent("APPROVED"));

    expect(api.charges.map((c) => c.payment_source_id)).toEqual([5678, 5679]);
    expect((await subscriptionOf(t, subscription._id))?.status).toBe("active");
  });
});

describe("payment source replacement", () => {
  const replaceWith = (t: T, wompi: Wompi, subscriptionId: string, type?: "CARD" | "NEQUI") =>
    t.action(
      async (ctx) =>
        await wompi.updateSubscriptionPaymentSource(ctx, {
          subscriptionId,
          token: type === "NEQUI" ? NEQUI_TOKEN : "tok_card_2",
          type,
          paymentMethod: type === "NEQUI" ? undefined : { brand: "VISA", lastFour: "1111" },
        }),
    );

  test("a replacement on an active subscription keeps the period", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const before = await activeSubscription(t, wompi, api);

    const { subscription, awaitingApproval } = await replaceWith(t, wompi, before._id);

    expect(awaitingApproval).toBe(false);
    expect(api.createdSources.map((s) => s.token)).toEqual(["tok_card_1", "tok_card_2"]);
    expect(subscription.paymentSourceId).not.toBe(before.paymentSourceId);
    expect(subscription).toMatchObject({
      status: "active",
      currentPeriodStart: before.currentPeriodStart,
      currentPeriodEnd: before.currentPeriodEnd,
      nextChargeAt: before.nextChargeAt,
      failedAttempts: 0,
    });
    // The replacement charges nothing.
    expect(api.charges).toHaveLength(1);
  });

  test("a replacement on a past_due subscription is charged at the next run, and the old source is not charged again", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const created = await activeSubscription(t, wompi, api);

    // The renewal is declined on the old source: dunning starts.
    await t.mutation(components.wompi.subscriptions.setNextChargeAt, {
      subscriptionId: created._id as never,
      at: Date.now() - 1_000,
    });
    api.transactionStatuses = ["DECLINED", "APPROVED"];
    const declinedRun = await t.action(async (ctx) => await wompi.processBilling(ctx));
    expect(declinedRun.declined).toBe(1);

    const pastDue = await subscriptionOf(t, created._id);
    expect(pastDue?.status).toBe("past_due");
    expect(pastDue?.failedAttempts).toBe(1);
    // The dunning retry is a day away.
    expect(pastDue!.nextChargeAt!).toBeGreaterThan(Date.now() + 60_000);

    const { subscription } = await replaceWith(t, wompi, created._id);
    expect(subscription.status).toBe("past_due");
    expect(subscription.failedAttempts).toBe(1);
    expect(subscription.currentPeriodEnd).toBe(pastDue!.currentPeriodEnd);
    expect(subscription.nextChargeAt!).toBeLessThanOrEqual(Date.now());

    const retryRun = await t.action(async (ctx) => await wompi.processBilling(ctx));
    expect(retryRun.claimed).toBe(1);
    expect(retryRun.approved).toBe(1);

    expect(api.charges.map((c) => c.payment_source_id)).toEqual([1234, 1234, 1235]);
    const recovered = await subscriptionOf(t, created._id);
    expect(recovered?.status).toBe("active");
    expect(recovered?.failedAttempts).toBe(0);

    // The next renewal uses the new source too.
    await t.mutation(components.wompi.subscriptions.setNextChargeAt, {
      subscriptionId: created._id as never,
      at: Date.now() - 1_000,
    });
    await t.action(async (ctx) => await wompi.processBilling(ctx));
    expect(api.charges.map((c) => c.payment_source_id)).toEqual([1234, 1234, 1235, 1235]);
  });

  test("a subscription of another user is rejected before Wompi creates a source", async () => {
    const t = initConvexTest();
    await seed(t);
    const owner = await activeSubscription(t, makeWompi(), api);

    const intruder = makeWompi({
      getUserInfo: async () => ({ userId: "user_2", email: "eve@example.com" }),
    });

    await expect(replaceWith(t, intruder, owner._id)).rejects.toThrow("Subscription not found");
    expect(api.createdSources).toHaveLength(1);
    expect((await subscriptionOf(t, owner._id))?.paymentSourceId).toBe(owner.paymentSourceId);
  });

  test("a subscription that is not live is rejected before Wompi creates a source", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const { subscription } = await subscribeWithNequi(t, wompi);
    expect(subscription.status).toBe("incomplete");

    await expect(replaceWith(t, wompi, subscription._id)).rejects.toThrow(
      "Only live subscriptions can replace the payment source",
    );
    expect(api.createdSources).toEqual([]);
  });

  test("a Nequi replacement waits for the approval, then becomes the current source", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const before = await activeSubscription(t, wompi, api);

    const waiting = await replaceWith(t, wompi, before._id, "NEQUI");

    expect(waiting.awaitingApproval).toBe(true);
    expect(waiting.subscription.paymentSourceId).toBe(before.paymentSourceId);
    expect(await tokenStatus(t)).toBe("PENDING");

    await deliver(t, wompi, await nequiEvent("APPROVED"));

    const after = await subscriptionOf(t, before._id);
    expect(after?.paymentSourceId).not.toBe(before.paymentSourceId);
    expect(after).toMatchObject({
      status: "active",
      currentPeriodEnd: before.currentPeriodEnd,
      nextChargeAt: before.nextChargeAt,
    });
    expect(await tokenStatus(t)).toBe("AVAILABLE");
    // The approval of a replacement charges nothing.
    expect(api.charges).toHaveLength(1);
  });

  test("a declined Nequi replacement keeps the subscription and its source", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const before = await activeSubscription(t, wompi, api);
    await replaceWith(t, wompi, before._id, "NEQUI");

    await deliver(t, wompi, await nequiEvent("DECLINED"));

    const after = await subscriptionOf(t, before._id);
    expect(after?.status).toBe("active");
    expect(after?.paymentSourceId).toBe(before.paymentSourceId);
    expect(after?.lastError).toBeUndefined();
    expect(await tokenStatus(t)).toBe("DECLINED");
  });
});
