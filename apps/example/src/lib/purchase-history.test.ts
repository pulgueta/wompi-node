import { describe, expect, it } from "vitest";

import {
  type PurchaseRecord,
  readPurchaseHistory,
  recordPurchase,
} from "./purchase-history";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function createRecord(transactionId: string): PurchaseRecord {
  return {
    reference: `PB-${transactionId}`,
    transactionId,
    amountInCents: 3_800_000,
    finalizedAt: "2026-07-30T12:00:00.000Z",
    items: [
      {
        productId: "pomada",
        name: "Pomada mate fijación fuerte",
        quantity: 1,
        unitPriceCents: 3_800_000,
      },
    ],
  };
}

describe("purchase history storage", () => {
  it("returns an empty history when nothing is stored", () => {
    expect(readPurchaseHistory(createStorage())).toEqual([]);
  });

  it("restores a recorded purchase", () => {
    const storage = createStorage();
    const record = createRecord("transaction-1");

    recordPurchase(storage, record);

    expect(readPurchaseHistory(storage)).toEqual([record]);
  });

  it("treats corrupt JSON as missing purchase history", () => {
    const storage = createStorage();
    storage.setItem("panabarbero:purchase-history", "not-json");

    expect(readPurchaseHistory(storage)).toEqual([]);
  });

  it("does not record the same transaction twice", () => {
    const storage = createStorage();
    const record = createRecord("transaction-1");

    recordPurchase(storage, record);
    recordPurchase(storage, record);

    expect(readPurchaseHistory(storage)).toEqual([record]);
  });

  it("keeps at most 20 purchases", () => {
    const storage = createStorage();

    for (let index = 1; index <= 21; index += 1) {
      recordPurchase(storage, createRecord(`transaction-${index}`));
    }

    const history = readPurchaseHistory(storage);
    expect(history).toHaveLength(20);
    expect(history.at(-1)?.transactionId).toBe("transaction-2");
  });

  it("returns purchases newest first", () => {
    const storage = createStorage();

    recordPurchase(storage, createRecord("transaction-1"));
    recordPurchase(storage, createRecord("transaction-2"));

    expect(
      readPurchaseHistory(storage).map((record) => record.transactionId),
    ).toEqual(["transaction-2", "transaction-1"]);
  });
});
