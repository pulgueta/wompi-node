import { describe, expect, it } from "vitest";

import {
  buildDispersionOperation,
  createSettlementReference,
  SETTLEMENT_AMOUNT_IN_CENTS,
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
