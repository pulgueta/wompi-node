import { describe, it, expect } from "vitest";
import { buildCheckoutUrl, CHECKOUT_BASE_URL, getSignatureKey } from "../src/server";
import { WompiError } from "../src/schemas";

const BASE = {
  publicKey: "pub_test_abc123",
  reference: "order-1042",
  amountInCents: 8_900_000,
  integrityKey: "test_integrity_key",
} as const;

describe("buildCheckoutUrl", () => {
  it("builds the required parameters and computes the integrity signature", async () => {
    const url = new URL(await buildCheckoutUrl(BASE));
    const expectedSignature = await getSignatureKey({
      reference: BASE.reference,
      amountInCents: BASE.amountInCents,
      integrityKey: BASE.integrityKey,
    });

    expect(url.origin + url.pathname).toBe(CHECKOUT_BASE_URL);
    expect(url.searchParams.get("public-key")).toBe("pub_test_abc123");
    expect(url.searchParams.get("currency")).toBe("COP");
    expect(url.searchParams.get("amount-in-cents")).toBe("8900000");
    expect(url.searchParams.get("reference")).toBe("order-1042");
    expect(url.searchParams.get("signature:integrity")).toBe(expectedSignature);
  });

  it("uses a precomputed signature as-is", async () => {
    const url = new URL(
      await buildCheckoutUrl({
        publicKey: BASE.publicKey,
        reference: BASE.reference,
        amountInCents: BASE.amountInCents,
        signature: "precomputed-signature",
      })
    );

    expect(url.searchParams.get("signature:integrity")).toBe("precomputed-signature");
  });

  it("includes the expiration time in both the URL and the signature", async () => {
    const expirationTime = "2026-01-01T00:00:00.000Z";
    const url = new URL(await buildCheckoutUrl({ ...BASE, expirationTime }));
    const expectedSignature = await getSignatureKey({
      reference: BASE.reference,
      amountInCents: BASE.amountInCents,
      integrityKey: BASE.integrityKey,
      expirationTime,
    });

    expect(url.searchParams.get("expiration-time")).toBe(expirationTime);
    expect(url.searchParams.get("signature:integrity")).toBe(expectedSignature);
  });

  it("encodes optional redirect, customer, shipping, and tax parameters", async () => {
    const url = new URL(
      await buildCheckoutUrl({
        ...BASE,
        redirectUrl: "https://example.com/orders/1042?source=wompi",
        collectShipping: false,
        customerData: {
          email: "ada@example.com",
          fullName: "Ada Lovelace",
          phoneNumber: "3001234567",
          phoneNumberPrefix: "+57",
          legalId: "1099888777",
          legalIdType: "CC",
        },
        taxInCents: { vat: 1_421_008, consumption: 0 },
      })
    );

    expect(url.searchParams.get("redirect-url")).toBe(
      "https://example.com/orders/1042?source=wompi"
    );
    expect(url.searchParams.get("collect-shipping")).toBe("false");
    expect(url.searchParams.get("customer-data:email")).toBe("ada@example.com");
    expect(url.searchParams.get("customer-data:full-name")).toBe("Ada Lovelace");
    expect(url.searchParams.get("customer-data:phone-number-prefix")).toBe("+57");
    expect(url.searchParams.get("customer-data:legal-id-type")).toBe("CC");
    expect(url.searchParams.get("tax-in-cents:vat")).toBe("1421008");
    expect(url.searchParams.get("tax-in-cents:consumption")).toBe("0");
  });

  it("omits optional parameters that were not provided", async () => {
    const url = new URL(await buildCheckoutUrl(BASE));

    expect(url.searchParams.has("redirect-url")).toBe(false);
    expect(url.searchParams.has("expiration-time")).toBe(false);
    expect(url.searchParams.has("collect-shipping")).toBe(false);
    expect(url.searchParams.has("customer-data:email")).toBe(false);
  });

  it("rejects non-integer amounts", async () => {
    await expect(buildCheckoutUrl({ ...BASE, amountInCents: 89_000.5 })).rejects.toThrow(
      WompiError
    );
  });
});
