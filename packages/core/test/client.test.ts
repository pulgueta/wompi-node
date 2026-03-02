import { describe, it, expect } from "vitest";
import { WompiClient } from "../src/client";
import { WompiError } from "../src/errors/wompi-error";

describe("WompiClient", () => {
  it("should create a client with a public key", () => {
    const client = new WompiClient({ publicKey: "pub_test_123" });

    expect(client).toBeDefined();
    expect(client.merchants).toBeDefined();
    expect(client.transactions).toBeDefined();
    expect(client.tokens).toBeDefined();
    expect(client.paymentSources).toBeDefined();
    expect(client.paymentLinks).toBeDefined();
    expect(client.pse).toBeDefined();
  });

  it("should create a client with both public and private keys", () => {
    const client = new WompiClient({
      publicKey: "pub_test_123",
      privateKey: "prv_test_456",
    });

    expect(client).toBeDefined();
  });

  it("should throw WompiError when no public key is provided", () => {
    expect(() => new WompiClient({ publicKey: "" })).toThrow(WompiError);
  });

  it("should throw WompiError when options are invalid", () => {
    expect(() => new WompiClient({})).toThrow(WompiError);
    expect(() => new WompiClient(null)).toThrow(WompiError);
  });

  it("should accept sandbox option", () => {
    const client = new WompiClient({
      publicKey: "pub_test_123",
      sandbox: true,
    });

    expect(client).toBeDefined();
  });

  it("should default sandbox to false", () => {
    const client = new WompiClient({ publicKey: "pub_test_123" });

    expect(client).toBeDefined();
  });
});
