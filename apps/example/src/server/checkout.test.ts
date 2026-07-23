import { describe, expect, it } from "vitest";

import {
  createOrderProof,
  createOrderReference,
  getCheckoutRedirectUrl,
  ORDER_AMOUNT_IN_CENTS,
  toCheckoutTransactionDto,
  verifyOrderProof,
} from "./checkout";
import type { Transaction } from "@pulgueta/wompi/schemas";

describe("checkout helpers", () => {
  it("uses the fixed order price in cents", () => {
    expect(ORDER_AMOUNT_IN_CENTS).toBe(4_950_000);
  });

  it("creates compact, unique order references", () => {
    const timestamp = 1_721_234_567_890;
    const first = createOrderReference(
      timestamp,
      "123e4567-e89b-12d3-a456-426614174000",
    );
    const second = createOrderReference(
      timestamp,
      "987e6543-e21b-12d3-a456-426614174000",
    );

    expect(first).toMatch(/^order-barber-kit-[a-z0-9]+-[a-f0-9]{12}$/);
    expect(second).not.toBe(first);
  });

  it("returns to the application origin without carrying request state", () => {
    expect(
      getCheckoutRedirectUrl(
        new URL("https://shop.example.com/orders?id=old#status"),
        "https://shop.example.com",
      ),
    ).toBe("https://shop.example.com/");
  });

  it("rejects non-web return protocols", () => {
    expect(() =>
      getCheckoutRedirectUrl(new URL("file:///tmp/checkout")),
    ).toThrow("must use HTTP or HTTPS");
  });

  it("requires a configured origin for a public tunnel", () => {
    expect(() =>
      getCheckoutRedirectUrl(new URL("https://shop.example.com/"), ""),
    ).toThrow("WOMPI_EXAMPLE_ORIGIN");
  });

  it("signs an order-specific server proof", async () => {
    const proof = await createOrderProof("order-one", "test_integrity_secret");

    expect(proof).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await verifyOrderProof("order-one", proof, "test_integrity_secret"),
    ).toBe(true);
    expect(
      await verifyOrderProof("order-two", proof, "test_integrity_secret"),
    ).toBe(false);
    expect(
      await createOrderProof("order-one", "test_integrity_secret"),
    ).not.toBe(await createOrderProof("order-two", "test_integrity_secret"));
  });

  it("verifies the exact launched reference, amount, and currency", () => {
    const reference = "order-barber-kit-m0abc123-123e4567e89b";
    const transaction: Transaction = {
      id: "transaction-1",
      status: "APPROVED",
      reference,
      amount_in_cents: ORDER_AMOUNT_IN_CENTS,
      currency: "COP",
    };

    expect(toCheckoutTransactionDto(transaction, reference)).toMatchObject({
      id: "transaction-1",
      reference,
      amountInCents: ORDER_AMOUNT_IN_CENTS,
      currency: "COP",
      paymentMethodType: null,
      statusMessage: null,
      createdAt: null,
    });
    expect(() =>
      toCheckoutTransactionDto(transaction, `${reference}-different`),
    ).toThrow("does not belong");
    expect(() =>
      toCheckoutTransactionDto(
        { ...transaction, amount_in_cents: ORDER_AMOUNT_IN_CENTS + 100 },
        reference,
      ),
    ).toThrow("does not belong");
    expect(() =>
      toCheckoutTransactionDto(
        { ...transaction, currency: undefined },
        reference,
      ),
    ).toThrow("does not belong");
  });
});
