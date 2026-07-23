import { describe, expect, it } from "vitest";
import { createDispersionIdempotencyKey } from "./idempotency";

const bankOperation = {
  accountId: "account-1",
  reference: "demo-001",
  paymentType: "PROVIDERS" as const,
  transaction: {
    legalIdType: "CC" as const,
    legalId: "1234567890",
    bankId: "bank-1",
    accountType: "AHORROS" as const,
    accountNumber: "12345678",
    name: "John Doe",
    amount: 500_000,
  },
};

describe("createDispersionIdempotencyKey", () => {
  it("is stable for an exact logical retry regardless of object key order", () => {
    const reordered = {
      paymentType: bankOperation.paymentType,
      transaction: {
        amount: bankOperation.transaction.amount,
        name: bankOperation.transaction.name,
        accountNumber: bankOperation.transaction.accountNumber,
        accountType: bankOperation.transaction.accountType,
        bankId: bankOperation.transaction.bankId,
        legalId: bankOperation.transaction.legalId,
        legalIdType: bankOperation.transaction.legalIdType,
      },
      reference: bankOperation.reference,
      accountId: bankOperation.accountId,
    };

    expect(createDispersionIdempotencyKey(reordered)).toBe(
      createDispersionIdempotencyKey(bankOperation),
    );
  });

  it.each([
    ["account", { ...bankOperation, accountId: "account-2" }],
    ["reference", { ...bankOperation, reference: "demo-002" }],
    [
      "beneficiary",
      {
        ...bankOperation,
        transaction: {
          ...bankOperation.transaction,
          accountNumber: "87654321",
        },
      },
    ],
    [
      "amount",
      {
        ...bankOperation,
        transaction: { ...bankOperation.transaction, amount: 600_000 },
      },
    ],
    [
      "rail",
      {
        ...bankOperation,
        transaction: {
          key: "@JOHNDOE",
          name: "John Doe",
          email: "john@example.com",
          amount: 500_000,
        },
      },
    ],
  ])("changes when the %s changes", (_label, changedOperation) => {
    expect(createDispersionIdempotencyKey(changedOperation)).not.toBe(
      createDispersionIdempotencyKey(bankOperation),
    );
  });

  it("returns a Wompi-compatible SHA-256 key", () => {
    expect(createDispersionIdempotencyKey(bankOperation)).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
