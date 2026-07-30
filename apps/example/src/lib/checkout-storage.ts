type CheckoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CheckoutBinding = {
  reference: string;
  orderProof: string;
  amountInCents: number;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
  }>;
};

const CHECKOUT_BINDING_STORAGE_KEY = "panabarbero:checkout-binding";

export function readCheckoutBinding(
  storage: CheckoutStorage,
): CheckoutBinding | null {
  try {
    const value = storage.getItem(CHECKOUT_BINDING_STORAGE_KEY);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<CheckoutBinding>;
    const items =
      Array.isArray(parsed.items) &&
      parsed.items.every(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          typeof item.productId === "string" &&
          typeof item.name === "string" &&
          typeof item.quantity === "number" &&
          typeof item.unitPriceCents === "number",
      )
        ? parsed.items
        : [];
    if (
      typeof parsed.reference === "string" &&
      typeof parsed.orderProof === "string" &&
      typeof parsed.amountInCents === "number"
    ) {
      return {
        reference: parsed.reference,
        orderProof: parsed.orderProof,
        amountInCents: parsed.amountInCents,
        items,
      };
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

export function clearCheckoutBinding(storage: CheckoutStorage) {
  storage.removeItem(CHECKOUT_BINDING_STORAGE_KEY);
}
