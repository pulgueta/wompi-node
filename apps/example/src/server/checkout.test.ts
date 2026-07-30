import { describe, expect, it } from "vitest";

import { PRODUCTS, SHIPPING_CENTS } from "#/lib/catalog";
import {
  computeOrderAmount,
  createOrderProof,
  createOrderReference,
  getCheckoutRedirectUrl,
  verifyOrderProof,
} from "./checkout";

const INTEGRITY_KEY = "test_integrity_fake_key";

describe("computeOrderAmount", () => {
  it("prices the cart from the catalog plus shipping", () => {
    const pomada = PRODUCTS[0];
    const cera = PRODUCTS[1];

    const amount = computeOrderAmount([
      { productId: pomada.id, quantity: 2 },
      { productId: cera.id, quantity: 1 },
    ]);

    expect(amount).toBe(
      pomada.priceCents * 2 + cera.priceCents + SHIPPING_CENTS,
    );
  });

  it("rejects an empty cart", () => {
    expect(() => computeOrderAmount([])).toThrow("El carrito está vacío.");
  });

  it("rejects products that are not in the catalog", () => {
    expect(() =>
      computeOrderAmount([{ productId: "no-such-product", quantity: 1 }]),
    ).toThrow("Producto desconocido: no-such-product");
  });

  it("rejects non-integer and out-of-range quantities", () => {
    const product = PRODUCTS[0];
    for (const quantity of [0, -1, 1.5, 100]) {
      expect(() =>
        computeOrderAmount([{ productId: product.id, quantity }]),
      ).toThrow(/Cantidad inválida/);
    }
  });
});

describe("order reference", () => {
  it("creates references that match the pattern the status lookup accepts", () => {
    const reference = createOrderReference(
      1_722_000_000_000,
      "01234567-89ab-cdef-0123-456789abcdef",
    );
    expect(reference).toMatch(/^PB-[a-z0-9]+-[a-f0-9]{12}$/);
  });
});

describe("order proof", () => {
  it("round-trips for the launched reference and amount", async () => {
    const reference = createOrderReference();
    const proof = await createOrderProof(reference, 4_650_000, INTEGRITY_KEY);

    await expect(
      verifyOrderProof(reference, 4_650_000, proof, INTEGRITY_KEY),
    ).resolves.toBe(true);
  });

  it("fails when the amount is tampered with", async () => {
    const reference = createOrderReference();
    const proof = await createOrderProof(reference, 4_650_000, INTEGRITY_KEY);

    await expect(
      verifyOrderProof(reference, 9_999_999, proof, INTEGRITY_KEY),
    ).resolves.toBe(false);
  });

  it("fails for a proof minted for another order", async () => {
    const proof = await createOrderProof(
      createOrderReference(),
      4_650_000,
      INTEGRITY_KEY,
    );

    await expect(
      verifyOrderProof(createOrderReference(), 4_650_000, proof, INTEGRITY_KEY),
    ).resolves.toBe(false);
  });
});

describe("getCheckoutRedirectUrl", () => {
  it("uses the request origin on localhost", () => {
    expect(getCheckoutRedirectUrl(new URL("http://localhost:3000/x"))).toBe(
      "http://localhost:3000/",
    );
  });

  it("requires a configured origin for public hosts", () => {
    expect(() =>
      getCheckoutRedirectUrl(new URL("https://demo.example.com/")),
    ).toThrow(/WOMPI_EXAMPLE_ORIGIN/);
  });

  it("prefers the configured origin when present", () => {
    expect(
      getCheckoutRedirectUrl(
        new URL("http://localhost:3000/"),
        "https://demo.example.com",
      ),
    ).toBe("https://demo.example.com/");
  });
});
