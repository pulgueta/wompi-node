type CheckoutStorage = Pick<Storage, "getItem" | "setItem">;

export type CheckoutBinding = {
  reference: string;
  orderProof: string;
};

const CHECKOUT_BINDING_STORAGE_KEY = "wompi-sdk-demo:checkout-binding";

export function readCheckoutBinding(
  storage: CheckoutStorage,
): CheckoutBinding | null {
  try {
    const value = storage.getItem(CHECKOUT_BINDING_STORAGE_KEY);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<CheckoutBinding>;
    if (
      typeof parsed.reference === "string" &&
      typeof parsed.orderProof === "string"
    ) {
      return { reference: parsed.reference, orderProof: parsed.orderProof };
    }
  } catch {
    // Treat a corrupt demo entry as missing checkout context.
  }

  return null;
}

export function saveCheckoutBinding(
  storage: CheckoutStorage,
  binding: CheckoutBinding,
) {
  storage.setItem(CHECKOUT_BINDING_STORAGE_KEY, JSON.stringify(binding));
}
