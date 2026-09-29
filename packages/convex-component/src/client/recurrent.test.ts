/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";
import { Wompi } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

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

const makeWompi = () =>
  new Wompi(components.wompi, {
    getUserInfo: async () => ({ userId: "user_1", email: "ada@example.com" }),
    publicKey: "pub_test_key",
    privateKey: "prv_test_key",
    eventsKey: "test_events_key",
    integrityKey: "integrity_key",
    sandbox: true,
    billing: {
      leaseMs: 0,
      pollAttempts: 1,
      pollIntervalMs: 0,
      pendingSweepAfterMs: 0,
    },
  });

/**
 * A Wompi API mock that records each charge payload and answers with the
 * status the test sets for that charge.
 */
const mockWompi = (statuses: string[]) => {
  const charges: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && /\/merchants\//.test(url)) return merchant();
      if (method === "POST" && /\/payment_sources$/.test(url)) {
        return json({ data: { id: 1234, type: "CARD", status: "AVAILABLE" } });
      }
      if (method === "POST" && /\/transactions$/.test(url)) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        charges.push(body);
        return json({
          data: {
            id: `tx_${charges.length}`,
            status: statuses[charges.length - 1] ?? "APPROVED",
            reference: body.reference,
            amount_in_cents: body.amount_in_cents,
            currency: "COP",
            payment_method_type: "CARD",
            created_at: "2026-08-18T10:00:00.000Z",
          },
        });
      }
      if (method === "GET" && /\/transactions\?reference=/.test(url))
        return json({ data: [] });
      throw new Error(`Unexpected fetch ${method} ${url}`);
    }),
  );
  return charges;
};

async function seed(t: ReturnType<typeof initConvexTest>) {
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

const makeDue = async (
  t: ReturnType<typeof initConvexTest>,
  subscriptionId: string,
) =>
  await t.mutation(components.wompi.subscriptions.setNextChargeAt, {
    subscriptionId: subscriptionId as never,
    at: Date.now() - 1_000,
  });

describe("Credential-on-File flag on subscription charges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("the initial charge, the renewal and the dunning retry send recurrent: true", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    // Initial charge approved, renewal declined, dunning retry approved.
    const charges = mockWompi(["APPROVED", "DECLINED", "APPROVED"]);

    const { subscription } = await t.action(
      async (ctx) =>
        await wompi.subscribe(ctx, {
          productKey: "pro-monthly",
          token: "tok_card",
        }),
    );
    expect(subscription.status).toBe("active");

    await makeDue(t, subscription._id);
    const renewal = await t.action(
      async (ctx) => await wompi.processBilling(ctx),
    );
    expect(renewal.declined).toBe(1);

    await makeDue(t, subscription._id);
    const retry = await t.action(
      async (ctx) => await wompi.processBilling(ctx),
    );
    expect(retry.approved).toBe(1);

    expect(charges).toHaveLength(3);
    for (const charge of charges) {
      expect(charge.recurrent).toBe(true);
      expect(charge.payment_source_id).toBe(1234);
      expect(charge.amount_in_cents).toBe(2_990_000);
    }
    // Each attempt has its own reference.
    expect(new Set(charges.map((charge) => charge.reference)).size).toBe(3);
  });

  test("a renewal after a plan change to a different amount sends recurrent: false, then true again", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    // Initial approved, changed-amount renewal declined, its retry approved,
    // next renewal approved.
    const charges = mockWompi(["APPROVED", "DECLINED", "APPROVED", "APPROVED"]);

    const { subscription } = await t.action(
      async (ctx) =>
        await wompi.subscribe(ctx, {
          productKey: "pro-monthly",
          token: "tok_card",
        }),
    );
    await t.mutation(components.wompi.products.sync, {
      products: [
        {
          key: "pro-plus",
          name: "Pro Plus",
          type: "subscription" as const,
          amountInCents: 4_990_000,
          interval: "month" as const,
        },
      ],
    });
    await t.mutation(components.wompi.subscriptions.changeProduct, {
      subscriptionId: subscription._id as never,
      userId: "user_1",
      productKey: "pro-plus",
    });

    // First renewal at the new amount: declined.
    await makeDue(t, subscription._id);
    await t.action(async (ctx) => await wompi.processBilling(ctx));
    // Dunning retry of that same period: approved.
    await makeDue(t, subscription._id);
    await t.action(async (ctx) => await wompi.processBilling(ctx));
    // Renewal after an approved charge at the new amount.
    await makeDue(t, subscription._id);
    await t.action(async (ctx) => await wompi.processBilling(ctx));

    expect(charges.map((charge) => charge.amount_in_cents)).toEqual([
      2_990_000, 4_990_000, 4_990_000, 4_990_000,
    ]);
    expect(charges.map((charge) => charge.recurrent)).toEqual([true, false, false, true]);
  });

  test("a one-time checkout creates no server-side charge, so it sends no flag", async () => {
    const t = initConvexTest();
    await seed(t);
    const wompi = makeWompi();
    const charges = mockWompi([]);

    const { url, payment } = await t.action(
      async (ctx) =>
        await wompi.checkout(ctx, {
          productKey: "sticker-pack",
          redirectUrl: "https://example.com/return",
        }),
    );

    expect(payment.kind).toBe("checkout");
    expect(url).not.toContain("recurrent");
    expect(charges).toEqual([]);
  });
});
