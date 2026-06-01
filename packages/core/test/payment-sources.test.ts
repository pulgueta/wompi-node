import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WompiClient } from "../src";
import { WompiError } from "../src/schemas";
import { okJson } from "./helpers";

const PAYMENT_SOURCE_RESPONSE = {
  data: {
    id: 543,
    type: "CARD",
    token: "tok_prod_280_abc",
    status: "AVAILABLE",
    customer_email: "juan@example.com",
    public_data: { type: "CARD" },
  },
};

describe("PaymentSources", () => {
  const mockFetch = vi.fn();
  const PUBLIC_KEY = "pub_test_123";
  const PRIVATE_KEY = "prv_test_456";

  const makeClient = (privateKey: string | undefined) =>
    new WompiClient({ publicKey: PUBLIC_KEY, privateKey, sandbox: true }).paymentSources;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPaymentSource", () => {
    it("should return [null, data] with private key", async () => {
      const sources = makeClient(PRIVATE_KEY);

      mockFetch.mockResolvedValueOnce(okJson(PAYMENT_SOURCE_RESPONSE));

      const [error, data] = await sources.getPaymentSource(543);

      expect(error).toBeNull();
      expect(data!.id).toBe(543);
      expect(data!.type).toBe("CARD");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payment_sources/543");
      expect(options.method).toBe("GET");
      expect(options.headers.Authorization).toBe(`Bearer ${PRIVATE_KEY}`);
    });

    it("should return [error, null] when private key is missing", async () => {
      const sources = makeClient(undefined);

      const [error, data] = await sources.getPaymentSource(543);

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Private key is required");
    });
  });

  describe("createPaymentSource", () => {
    it("should return [null, data] with valid input", async () => {
      const sources = makeClient(PRIVATE_KEY);
      const input = {
        type: "CARD",
        token: "tok_test_abc",
        acceptance_token: "eyJhb...",
        customer_email: "test@example.com",
      };

      mockFetch.mockResolvedValueOnce(
        okJson({
          data: {
            id: 999,
            type: "CARD",
            token: "tok_test_abc",
            status: "AVAILABLE",
            customer_email: "test@example.com",
            public_data: { type: "CARD" },
          },
        })
      );

      const [error, data] = await sources.createPaymentSource(input);

      expect(error).toBeNull();
      expect(data!.id).toBe(999);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payment_sources");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe(`Bearer ${PRIVATE_KEY}`);
    });

    it("should return [error, null] when private key is missing", async () => {
      const sources = makeClient(undefined);

      const [error, data] = await sources.createPaymentSource({
        type: "NEQUI",
        token: "nequi_test_abc",
        acceptance_token: "eyJhb...",
        customer_email: "test@example.com",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Private key is required");
    });

    it("should return [error, null] on invalid input", async () => {
      const sources = makeClient(PRIVATE_KEY);

      const [error, data] = await sources.createPaymentSource({
        type: "INVALID_TYPE",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid input");
    });
  });
});
