type PurchaseHistoryStorage = Pick<Storage, "getItem" | "setItem">;

export type PurchaseRecord = {
  reference: string;
  transactionId: string;
  amountInCents: number;
  finalizedAt: string;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
  }>;
};

const PURCHASE_HISTORY_STORAGE_KEY = "panabarbero:purchase-history";

function isPurchaseRecord(value: unknown): value is PurchaseRecord {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Partial<PurchaseRecord>;
  return (
    typeof record.reference === "string" &&
    typeof record.transactionId === "string" &&
    typeof record.amountInCents === "number" &&
    typeof record.finalizedAt === "string" &&
    Array.isArray(record.items) &&
    record.items.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.productId === "string" &&
        typeof item.name === "string" &&
        typeof item.quantity === "number" &&
        typeof item.unitPriceCents === "number",
    )
  );
}

export function readPurchaseHistory(
  storage: PurchaseHistoryStorage,
): PurchaseRecord[] {
  try {
    const value = storage.getItem(PURCHASE_HISTORY_STORAGE_KEY);
    if (!value) return [];

    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every(isPurchaseRecord)) {
      return parsed;
    }
  } catch {
    // Treat a corrupt demo entry as missing purchase history.
  }

  return [];
}

export function recordPurchase(
  storage: PurchaseHistoryStorage,
  record: PurchaseRecord,
) {
  const history = readPurchaseHistory(storage);
  if (history.some((entry) => entry.transactionId === record.transactionId)) {
    return;
  }

  storage.setItem(
    PURCHASE_HISTORY_STORAGE_KEY,
    JSON.stringify([record, ...history].slice(0, 20)),
  );
}
