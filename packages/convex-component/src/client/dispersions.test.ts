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

const transaction = (
  id: string,
  payoutId: string,
  amountInCents = 500_000,
) => ({
  id,
  status: "PENDING",
  amountInCents,
  payout: payout(payoutId, amountInCents),
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
            records: [
              transaction("transaction-1", "payout-1"),
              transaction("transaction-2", "payout-2"),
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

  test("rejects recovery when the candidate does not match the attempted payout", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { records: [transaction("transaction-1", "payout-1", 1)] },
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
            records: [
              {
                id: "transaction-1",
                status: "PENDING",
                payout: {
                  id: "payout-1",
                  status: "PENDING",
                  reference: PAYOUT_INPUT.reference,
                },
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

  test("recovers only one fully matching payout candidate", async () => {
    mockFetch
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { records: [transaction("transaction-1", "payout-1")] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
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
  });
});
