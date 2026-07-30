import { describe, expect, it } from "vitest";

import {
  clearCheckoutBinding,
  readCheckoutBinding,
  saveCheckoutBinding,
} from "./checkout-storage";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("checkout reference storage", () => {
  it("restores the exact launched order binding after returning from Wompi", () => {
    const storage = createStorage();

    const binding = {
      reference: "PB-launched-abcdef123456",
      orderProof: "signed-order-proof",
      amountInCents: 4_650_000,
      items: [
        {
          productId: "pomada",
          name: "Pomada para cabello",
          quantity: 2,
          unitPriceCents: 1_250_000,
        },
      ],
    };
    saveCheckoutBinding(storage, binding);

    expect(readCheckoutBinding(storage)).toEqual(binding);
  });

  it("restores legacy bindings without purchase items", () => {
    const storage = createStorage();
    storage.setItem(
      "panabarbero:checkout-binding",
      JSON.stringify({
        reference: "PB-legacy-abcdef123456",
        orderProof: "signed-order-proof",
        amountInCents: 4_650_000,
      }),
    );

    expect(readCheckoutBinding(storage)).toEqual({
      reference: "PB-legacy-abcdef123456",
      orderProof: "signed-order-proof",
      amountInCents: 4_650_000,
      items: [],
    });
  });

  it("treats bindings without an amount as missing checkout context", () => {
    const storage = createStorage();
    storage.setItem(
      "panabarbero:checkout-binding",
      JSON.stringify({ reference: "PB-x-abcdef123456", orderProof: "p" }),
    );

    expect(readCheckoutBinding(storage)).toBeNull();
  });

  it("clears the binding once the order is finished", () => {
    const storage = createStorage();
    saveCheckoutBinding(storage, {
      reference: "PB-launched-abcdef123456",
      orderProof: "signed-order-proof",
      amountInCents: 100,
      items: [],
    });

    clearCheckoutBinding(storage);

    expect(readCheckoutBinding(storage)).toBeNull();
  });
});
