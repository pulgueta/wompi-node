import { describe, expect, it } from "vitest";

import { readCheckoutBinding, saveCheckoutBinding } from "./checkout-storage";

describe("checkout reference storage", () => {
  it("restores the exact launched order reference after returning from Wompi", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    const binding = {
      reference: "order-barber-kit-launched",
      orderProof: "signed-order-proof",
    };
    saveCheckoutBinding(storage, binding);

    expect(readCheckoutBinding(storage)).toEqual(binding);
  });
});
