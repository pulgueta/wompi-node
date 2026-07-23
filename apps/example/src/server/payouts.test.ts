import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDispersionOperation,
  type CreateResultDto,
  createSettlementReference,
  getPayoutsClient,
  type PayoutErrorDto,
  runSettlementAttempt,
  SETTLEMENT_AMOUNT_IN_CENTS,
  type ServerResult,
  SUPPLIER_EMAIL,
  SUPPLIER_NAME,
} from "./payouts";

const baseInput = {
  accountId: "WOMPI_ACCOUNT",
  checkoutTransactionId: "transaction-001",
  checkoutReference: "order-barber-kit-001",
  orderProof: "proof-001",
};

const settlementReference = createSettlementReference(
  baseInput.checkoutTransactionId,
);

describe("buildDispersionOperation", () => {
  it("builds the complete supplier bank transfer", () => {
    expect(
      buildDispersionOperation({
        ...baseInput,
        destination: {
          rail: "bank",
          bankId: "bancolombia",
          accountType: "AHORROS",
          accountNumber: " 12345678 ",
        },
      }),
    ).toEqual({
      accountId: "WOMPI_ACCOUNT",
      reference: settlementReference,
      paymentType: "PROVIDERS",
      transaction: {
        personType: "NATURAL",
        legalIdType: "CC",
        legalId: "1000000000",
        bankId: "bancolombia",
        accountType: "AHORROS",
        accountNumber: "12345678",
        name: SUPPLIER_NAME,
        email: SUPPLIER_EMAIL,
        amount: SETTLEMENT_AMOUNT_IN_CENTS,
        reference: settlementReference,
        description: "Supplier share for order-barber-kit-001",
      },
    });
  });

  it("builds a BRE-B transfer without bank-only fields", () => {
    const operation = buildDispersionOperation({
      ...baseInput,
      destination: { rail: "breb", key: " @elias123 " },
    });

    expect(operation).toEqual({
      accountId: "WOMPI_ACCOUNT",
      reference: settlementReference,
      paymentType: "PROVIDERS",
      transaction: {
        key: "@elias123",
        name: SUPPLIER_NAME,
        email: SUPPLIER_EMAIL,
        amount: SETTLEMENT_AMOUNT_IN_CENTS,
        reference: settlementReference,
        description: "Supplier share for order-barber-kit-001",
      },
    });
    expect(operation.transaction).not.toHaveProperty("bankId");
    expect(operation.transaction).not.toHaveProperty("personType");
  });

  it("derives the same settlement reference for every retry of one checkout", () => {
    expect(createSettlementReference("transaction-001")).toBe(
      createSettlementReference("transaction-001"),
    );
    expect(createSettlementReference("transaction-001")).not.toBe(
      createSettlementReference("transaction-002"),
    );
  });
});

describe("getPayoutsClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws a clear error naming both missing credentials", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WOMPI_PAYOUTS_API_KEY", "");
    vi.stubEnv("WOMPI_PAYOUTS_USER_PRINCIPAL_ID", "");

    expect(() => getPayoutsClient()).toThrowError(
      "Wompi payouts credentials missing. Set WOMPI_PAYOUTS_API_KEY and WOMPI_PAYOUTS_USER_PRINCIPAL_ID in the example app environment.",
    );
  });

  it("names only the credential that is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WOMPI_PAYOUTS_API_KEY", "some-key");
    vi.stubEnv("WOMPI_PAYOUTS_USER_PRINCIPAL_ID", "");

    expect(() => getPayoutsClient()).toThrowError(
      "Wompi payouts credentials missing. Set WOMPI_PAYOUTS_USER_PRINCIPAL_ID in the example app environment.",
    );
  });
});

describe("runSettlementAttempt", () => {
  const failure = (
    statusCode: number | null,
  ): ServerResult<CreateResultDto> => ({
    error: { code: "WOMPI_REQUEST", message: "failed", statusCode },
    data: null,
  });
  const success: ServerResult<CreateResultDto> = {
    error: null,
    data: { payoutId: "payout-1", transactions: 1, success: 1, failed: 0 },
  };

  it.each<[string, PayoutErrorDto["statusCode"]]>([
    ["a network error", 0],
    ["an unknown error", null],
    ["a 5xx server error", 502],
  ])(
    "keeps the attempt record after %s so a retry reuses the same idempotency key",
    async (_label, statusCode) => {
      const attempts = new Map<
        string,
        Promise<ServerResult<CreateResultDto>>
      >();
      const run = vi.fn().mockResolvedValue(failure(statusCode));

      const first = await runSettlementAttempt("checkout-1", run, attempts);
      expect(first.error?.statusCode).toBe(statusCode);
      expect(attempts.has("checkout-1")).toBe(true);

      const second = await runSettlementAttempt("checkout-1", run, attempts);
      expect(second).toBe(first);
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it("clears the attempt record after a definitive rejection so a fresh attempt can run", async () => {
    const attempts = new Map<string, Promise<ServerResult<CreateResultDto>>>();
    const run = vi
      .fn()
      .mockResolvedValueOnce(failure(422))
      .mockResolvedValueOnce(success);

    const first = await runSettlementAttempt("checkout-1", run, attempts);
    expect(first.error?.statusCode).toBe(422);
    expect(attempts.has("checkout-1")).toBe(false);

    const second = await runSettlementAttempt("checkout-1", run, attempts);
    expect(second).toBe(success);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps the attempt record after a success to block duplicate settlements", async () => {
    const attempts = new Map<string, Promise<ServerResult<CreateResultDto>>>();
    const run = vi.fn().mockResolvedValue(success);

    await runSettlementAttempt("checkout-1", run, attempts);
    await runSettlementAttempt("checkout-1", run, attempts);

    expect(attempts.has("checkout-1")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
