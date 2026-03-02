import { describe, it, expect } from "vitest";
import { getSignatureKey } from "../src/server/utils/get-signature-key";

describe("getSignatureKey", () => {
  it("should generate a SHA-256 hex signature", async () => {
    const signature = await getSignatureKey("order-123", 30000, "test_integrity_key");

    expect(signature).toBeDefined();
    expect(typeof signature).toBe("string");
    expect(signature).toHaveLength(64);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce consistent results for the same input", async () => {
    const sig1 = await getSignatureKey("order-abc", 10000, "my_key");
    const sig2 = await getSignatureKey("order-abc", 10000, "my_key");

    expect(sig1).toBe(sig2);
  });

  it("should produce different results for different inputs", async () => {
    const sig1 = await getSignatureKey("order-1", 10000, "key");
    const sig2 = await getSignatureKey("order-2", 10000, "key");

    expect(sig1).not.toBe(sig2);
  });

  it("should produce different signatures for different totals", async () => {
    const sig1 = await getSignatureKey("ref", 100, "key");
    const sig2 = await getSignatureKey("ref", 200, "key");

    expect(sig1).not.toBe(sig2);
  });
});
