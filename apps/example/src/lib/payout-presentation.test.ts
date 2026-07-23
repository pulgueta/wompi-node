import { describe, expect, it } from "vitest";

import { getPayoutPresentation } from "./payout-presentation";

describe("payout presentation", () => {
  it("never presents a failed transfer as submitted or paid", () => {
    expect(
      getPayoutPresentation(
        { failed: 0 },
        { status: "TOTAL_PAYMENT", transactionStatus: "FAILED" },
      ),
    ).toEqual({ visibleStatus: "FAILED", title: "Payout failed" });
  });

  it("surfaces an immediately failed single-transfer batch", () => {
    expect(getPayoutPresentation({ failed: 1 }, null)).toEqual({
      visibleStatus: "FAILED",
      title: "Payout failed",
    });
  });

  it("marks a completed payout as paid", () => {
    expect(
      getPayoutPresentation({ failed: 0 }, { status: "TOTAL_PAYMENT" }),
    ).toEqual({ visibleStatus: "TOTAL_PAYMENT", title: "Supplier paid" });
  });
});
