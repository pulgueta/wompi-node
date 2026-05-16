import { describe, it, expect } from "vitest";
import { getSignatureKey } from "../src/server/utils";
import { WompiError } from "../src/errors/wompi-error";

/**
 * Vectors below are SHA-256 hex digests computed independently of the SDK:
 *   echo -n "<reference><amountInCents><currency><expirationTime?><integrityKey>" | shasum -a 256
 */
describe("getSignatureKey", () => {
  it("hashes <reference><amountInCents><currency><integrityKey> (currency defaults to COP)", async () => {
    const signature = await getSignatureKey({
      reference: "ref-123",
      amountInCents: 2_490_000,
      integrityKey: "test_integrity_key",
    });

    // SHA-256 of "ref-1232490000COPtest_integrity_key"
    expect(signature).toBe(
      "3020531ed7879230f3ed79e981eda23c5efcd8ce2da4576876ca16f783224e54"
    );
  });

  it("inserts expirationTime before the integrity key when provided", async () => {
    const signature = await getSignatureKey({
      reference: "ref-123",
      amountInCents: 2_490_000,
      integrityKey: "test_integrity_key",
      expirationTime: "2025-01-01T00:00:00.000Z",
    });

    // SHA-256 of "ref-1232490000COP2025-01-01T00:00:00.000Ztest_integrity_key"
    expect(signature).toBe(
      "e03cb492e50b9497abd14c0e99a9d677401d9fafce3ed8d6296c68e7fa3304b9"
    );
  });

  it("matches Wompi's documented signature concatenation", async () => {
    const signature = await getSignatureKey({
      reference: "sk8-438k4-xmxm392-sn2m",
      amountInCents: 2_490_000,
      integrityKey: "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6",
    });

    // SHA-256 of the concatenation Wompi's OpenAPI spec documents.
    expect(signature).toBe(
      "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5"
    );
  });

  it("hashes amountInCents as-is, never multiplying it", async () => {
    const signature = await getSignatureKey({
      reference: "ref-123",
      amountInCents: 2_490_000,
      integrityKey: "test_integrity_key",
    });

    // Hashing 249000000 (the old `* 100` bug) would produce a different digest.
    const inflated = await getSignatureKey({
      reference: "ref-123",
      amountInCents: 249_000_000,
      integrityKey: "test_integrity_key",
    });

    expect(signature).not.toBe(inflated);
  });

  it("accepts an amountInCents of 0", async () => {
    const signature = await getSignatureKey({
      reference: "order-1",
      amountInCents: 0,
      integrityKey: "k",
    });

    // SHA-256 of "order-10COPk"
    expect(signature).toBe(
      "df9981b4922d84265572a27a7b11a15c16ce1a334f2744c2f82961bb2f83f81e"
    );
  });

  it("produces a different signature with and without expirationTime", async () => {
    const base = {
      reference: "ref-123",
      amountInCents: 2_490_000,
      integrityKey: "test_integrity_key",
    };

    const withExpiration = await getSignatureKey({
      ...base,
      expirationTime: "2025-01-01T00:00:00.000Z",
    });
    const withoutExpiration = await getSignatureKey(base);

    expect(withExpiration).not.toBe(withoutExpiration);
  });

  it("honors a non-default currency", async () => {
    const cop = await getSignatureKey({
      reference: "ref-123",
      amountInCents: 2_490_000,
      integrityKey: "test_integrity_key",
    });
    const usd = await getSignatureKey({
      reference: "ref-123",
      amountInCents: 2_490_000,
      currency: "USD",
      integrityKey: "test_integrity_key",
    });

    expect(cop).not.toBe(usd);
  });

  it("is deterministic for the same input", async () => {
    const options = {
      reference: "order-abc",
      amountInCents: 10_000,
      integrityKey: "my_key",
    };

    expect(await getSignatureKey(options)).toBe(await getSignatureKey(options));
  });

  it("returns a 64-character lowercase hex string", async () => {
    const signature = await getSignatureKey({
      reference: "order-123",
      amountInCents: 30_000,
      integrityKey: "test_integrity_key",
    });

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a non-integer amountInCents", async () => {
    await expect(
      getSignatureKey({
        reference: "ref-123",
        amountInCents: 19.99,
        integrityKey: "test_integrity_key",
      })
    ).rejects.toThrow(WompiError);
  });

  it("rejects a negative amountInCents", async () => {
    await expect(
      getSignatureKey({
        reference: "ref-123",
        amountInCents: -1,
        integrityKey: "test_integrity_key",
      })
    ).rejects.toThrow(/non-negative integer/);
  });
});
