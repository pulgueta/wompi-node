import { beforeEach, describe, expect, it } from "vitest";

import {
  applyDispersionStatus,
  applyPaymentStatus,
  findActiveDispersion,
  getPayment,
  listProviders,
  recordDispersion,
  recordPayment,
  resetStore,
  settleProvider,
} from "./store";

function pendingCentsOf(key: string) {
  const provider = listProviders().find((candidate) => candidate.key === key);
  if (!provider) throw new Error(`Unknown test provider: ${key}`);
  return provider.pendingCents;
}

beforeEach(() => {
  resetStore();
});

describe("settleProvider", () => {
  it("subtracts the dispersed amount from the provider's pending balance", () => {
    const before = pendingCentsOf("p1");

    expect(settleProvider("p1", 100_000)).toBe(true);

    const after = pendingCentsOf("p1");
    expect(after).toBe(before - 100_000);
  });

  it("never drives a balance below zero", () => {
    settleProvider("p1", Number.MAX_SAFE_INTEGER - 1);
    expect(pendingCentsOf("p1")).toBe(0);
  });

  it("rejects unknown providers and invalid amounts", () => {
    expect(settleProvider("nope", 100)).toBe(false);
    expect(settleProvider("p1", -5)).toBe(false);
    expect(settleProvider("p1", 10.5)).toBe(false);
  });
});

describe("applyDispersionStatus", () => {
  const dispersion = {
    reference: "PB-PO-p1-1722000000000",
    wompiPayoutId: "payout-1",
    providerKey: "p1",
    brebKey: "@elias123",
    amountInCents: 250_000,
    status: "PENDING",
  };

  it("settles the provider exactly once when the batch is fully paid", () => {
    recordDispersion(dispersion);
    const before = pendingCentsOf("p1");

    // Poll and webhook race: both report TOTAL_PAYMENT.
    applyDispersionStatus({ reference: dispersion.reference }, "TOTAL_PAYMENT");
    applyDispersionStatus(
      { wompiPayoutId: dispersion.wompiPayoutId },
      "TOTAL_PAYMENT",
    );

    expect(pendingCentsOf("p1")).toBe(before - dispersion.amountInCents);
  });

  it("normalizes total_payment before settling the provider", () => {
    recordDispersion(dispersion);
    const before = pendingCentsOf("p1");

    const updated = applyDispersionStatus(
      { reference: dispersion.reference },
      "total_payment",
    );

    expect(updated?.status).toBe("TOTAL_PAYMENT");
    expect(pendingCentsOf("p1")).toBe(before - dispersion.amountInCents);
  });

  it("keeps the balance untouched on failed batches", () => {
    recordDispersion(dispersion);
    const before = pendingCentsOf("p1");

    applyDispersionStatus({ reference: dispersion.reference }, "TOTAL_FAILURE");

    expect(pendingCentsOf("p1")).toBe(before);
  });

  it("ignores dispersions it never tracked", () => {
    expect(
      applyDispersionStatus({ reference: "PB-PO-p9-0" }, "TOTAL_PAYMENT"),
    ).toBeNull();
  });

  it("never lets a stale update revert a terminal status", () => {
    recordDispersion(dispersion);

    applyDispersionStatus({ reference: dispersion.reference }, "TOTAL_PAYMENT");
    const after = applyDispersionStatus(
      { reference: dispersion.reference },
      "PENDING",
    );

    expect(after?.status).toBe("TOTAL_PAYMENT");
  });

  it("treats NOT_APPROVED as terminal against stale updates", () => {
    recordDispersion(dispersion);

    applyDispersionStatus({ reference: dispersion.reference }, "not_approved");
    const after = applyDispersionStatus(
      { reference: dispersion.reference },
      "PENDING",
    );

    expect(after?.status).toBe("NOT_APPROVED");
  });

  it("finds only nonterminal unsettled dispersions for a provider", () => {
    recordDispersion(dispersion);

    expect(findActiveDispersion("p1")?.reference).toBe(dispersion.reference);

    applyDispersionStatus({ reference: dispersion.reference }, "NOT_APPROVED");

    expect(findActiveDispersion("p1")).toBeNull();
  });

  it("requires every supplied identifier to agree with the record", () => {
    recordDispersion(dispersion);

    expect(
      applyDispersionStatus(
        { reference: dispersion.reference, wompiPayoutId: "someone-elses" },
        "TOTAL_PAYMENT",
      ),
    ).toBeNull();
  });

  it("attaches the payout id when an ambiguous attempt is reconciled", () => {
    recordDispersion({ ...dispersion, wompiPayoutId: "" });

    const updated = applyDispersionStatus(
      { reference: dispersion.reference, wompiPayoutId: "payout-reconciled" },
      "TOTAL_PAYMENT",
    );

    expect(updated?.wompiPayoutId).toBe("payout-reconciled");
    expect(updated?.status).toBe("TOTAL_PAYMENT");
  });
});

describe("applyPaymentStatus", () => {
  it("lets the webhook's final status win over a later API poll", () => {
    recordPayment("PB-ref-abcdef123456", 4_650_000);

    applyPaymentStatus("PB-ref-abcdef123456", {
      status: "APPROVED",
      transactionId: "txn-1",
      source: "webhook",
    });
    applyPaymentStatus("PB-ref-abcdef123456", {
      status: "PENDING",
      source: "api",
    });

    const payment = getPayment("PB-ref-abcdef123456");
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe("APPROVED");
    expect(payment?.source).toBe("webhook");
  });

  it("returns null for unknown references", () => {
    expect(
      applyPaymentStatus("PB-unknown", { status: "APPROVED", source: "api" }),
    ).toBeNull();
  });
});
