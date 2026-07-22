/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ComponentApi } from "../component/_generated/component.js";
import { Wompi } from "./index.js";

const PAYOUT_INPUT = {
  reference: "providers-2026-07",
  accountId: "account-1",
  paymentType: "PROVIDERS" as const,
  transactions: [
    {
      legalIdType: "CC" as const,
      legalId: "1234567890",
      bankId: "bank-1",
      accountType: "AHORROS" as const,
      accountNumber: "12345678",
      name: "John Doe",
      amount: 500_000,
    },
  ],
};

const conflictResponse = () =>
  new Response(
    JSON.stringify({
      status: 409,
      code: "EXC_032",
      message: "La llave de idempotencia ya fue procesada.",
      type: "Business",
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );

const payout = (id: string, amountInCents = 500_000) => ({
  id,
  status: "PENDING",
  reference: PAYOUT_INPUT.reference,
  paymentType: PAYOUT_INPUT.paymentType,
  totalTransactions: PAYOUT_INPUT.transactions.length,
  amountInCents,
  createdAt: new Date(Date.now() + 1_000).toISOString(),
});

const BREB_INPUT = {
  reference: "providers-2026-07",
  accountId: "account-1",
  paymentType: "PROVIDERS" as const,
  transactions: [
    {
      key: "3001234567",
      name: "John Doe",
      amount: 500_000,
      email: "john@example.com",
    },
  ],
};

const detailTransaction = (accountNumber: string, amountInCents = 500_000) => ({
  id: "payout-tx-1",
  status: "PENDING",
  amountInCents,
  payeeInfo: { accountNumber },
});

const transactionsPage = (records: unknown[], page = 1, pages = 1) =>
  new Response(JSON.stringify({ data: { page, pages, records } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const makeWompi = () =>
  new Wompi(
    {
      dispersions: { record: "dispersions:record" },
    } as unknown as ComponentApi,
    {
      getUserInfo: async () => ({
        userId: "user-1",
        email: "user@example.com",
      }),
      sandbox: true,
      payouts: {
        apiKey: "payouts-api-key",
        userPrincipalId: "user-principal-id",
      },
    },
  );

const makeCtx = () => ({
  runQuery: vi.fn(),
  runMutation: vi.fn().mockResolvedValue({
    _id: "dispersion-1",
    _creationTime: Date.now(),
    wompiPayoutId: "payout-1",
    reference: PAYOUT_INPUT.reference,
    status: "PENDING",
    paymentType: PAYOUT_INPUT.paymentType,
    transactionsTotal: 1,
    transactionsSuccess: 0,
    transactionsFailed: 0,
    amountInCents: 500_000,
  }),
});

describe("createDispersion idempotency recovery", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("rejects recovery when a reused reference identifies multiple payouts", async () => {
    mockFetch.mockResolvedValueOnce(conflictResponse()).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            page: 1,
            pages: 1,
            records: [
              payout("payout-1"),
              payout("payout-2"),
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      makeWompi().createDispersion(makeCtx() as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });
  });

  test("rejects recovery when another matching payout is on a later page", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              page: 1,
              pages: 2,
              records: [payout("payout-1")],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              page: 2,
              pages: 2,
              records: [payout("payout-2")],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await expect(
      makeWompi().createDispersion(makeCtx() as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(String(mockFetch.mock.calls[2]?.[0])).toContain("page=2");
  });

  test("rejects recovery when the candidate does not match the attempted payout", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { page: 1, pages: 1, records: [payout("payout-1", 1)] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await expect(
      makeWompi().createDispersion(makeCtx() as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });
  });

  test("rejects recovery when Wompi omits fields needed to prove the candidate", async () => {
    mockFetch.mockResolvedValueOnce(conflictResponse()).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            page: 1,
            pages: 1,
            records: [
              {
                id: "payout-1",
                status: "PENDING",
                reference: PAYOUT_INPUT.reference,
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      makeWompi().createDispersion(makeCtx() as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });
  });

  test("rejects recovery when Wompi omits pagination metadata", async () => {
    mockFetch.mockResolvedValueOnce(conflictResponse()).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { records: [payout("payout-1")] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const ctx = makeCtx();

    await expect(
      makeWompi().createDispersion(ctx as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  test("preserves the conflict for BRE-B batches without searching the v1 collection", async () => {
    mockFetch.mockResolvedValueOnce(conflictResponse());
    const ctx = makeCtx();

    await expect(
      makeWompi().createDispersion(ctx as never, BREB_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain("/v2/payouts");
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  test("rejects recovery when the candidate pays different beneficiaries", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { page: 1, pages: 1, records: [payout("payout-1")] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(transactionsPage([detailTransaction("99999999")]));
    const ctx = makeCtx();

    await expect(
      makeWompi().createDispersion(ctx as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  test("rejects recovery when transaction detail omits the payee account", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { page: 1, pages: 1, records: [payout("payout-1")] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        transactionsPage([{ id: "payout-tx-1", status: "PENDING", amountInCents: 500_000 }]),
      );
    const ctx = makeCtx();

    await expect(
      makeWompi().createDispersion(ctx as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  test("rejects recovery when a transaction repeats across detail pages", async () => {
    const twoBeneficiaries = {
      ...PAYOUT_INPUT,
      transactions: PAYOUT_INPUT.transactions
        .concat(PAYOUT_INPUT.transactions)
        .map((transaction) => ({ ...transaction, amount: 250_000 })),
    };
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              page: 1,
              pages: 1,
              records: [{ ...payout("payout-1"), totalTransactions: 2 }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(transactionsPage([detailTransaction("12345678", 250_000)], 1, 2))
      .mockResolvedValueOnce(transactionsPage([detailTransaction("12345678", 250_000)], 2, 2));
    const ctx = makeCtx();

    await expect(
      makeWompi().createDispersion(ctx as never, twoBeneficiaries, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  test("rejects recovery when transaction detail carries a blank id", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { page: 1, pages: 1, records: [payout("payout-1")] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        transactionsPage([{ ...detailTransaction("12345678"), id: "" }]),
      );
    const ctx = makeCtx();

    await expect(
      makeWompi().createDispersion(ctx as never, PAYOUT_INPUT, {
        idempotencyKey: "providers-2026-07",
      }),
    ).rejects.toMatchObject({ code: "EXC_032" });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  test("recovers when the listing masks the beneficiary account number", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { page: 1, pages: 1, records: [payout("payout-1")] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(transactionsPage([detailTransaction("****5678")]));
    const ctx = makeCtx();

    const recovered = await makeWompi().createDispersion(ctx as never, PAYOUT_INPUT, {
      idempotencyKey: "providers-2026-07",
    });

    expect(recovered.result.payoutId).toBe("payout-1");
    expect(ctx.runMutation).toHaveBeenCalledOnce();
  });

  test("recovers only one fully matching payout candidate", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { page: 1, pages: 1, records: [payout("payout-1")] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(transactionsPage([detailTransaction("12345678")]));
    const ctx = makeCtx();

    const recovered = await makeWompi().createDispersion(
      ctx as never,
      PAYOUT_INPUT,
      {
        idempotencyKey: "providers-2026-07",
      },
    );

    expect(recovered.result.payoutId).toBe("payout-1");
    expect(ctx.runMutation).toHaveBeenCalledOnce();
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain(
      "/v1/payouts?reference=providers-2026-07&page=1",
    );
    expect(String(mockFetch.mock.calls[2]?.[0])).toContain(
      "/v1/payouts/payout-1/transactions",
    );
  });
});
