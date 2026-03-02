import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PaymentSources } from "../src/client/payment-sources";
import { WompiError } from "../src/errors/wompi-error";

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
  const PRIVATE_KEY = "prv_test_456";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPaymentSource", () => {
    it("should return [null, data] with private key", async () => {
      const sources = new PaymentSources(PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => PAYMENT_SOURCE_RESPONSE,
      });

      const [error, data] = await sources.getPaymentSource(543);

      expect(error).toBeNull();
      expect(data!.data.id).toBe(543);
      expect(data!.data.type).toBe("CARD");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payment_sources/543");
      expect(options.method).toBe("GET");
      expect(options.headers.Authorization).toBe(`Bearer ${PRIVATE_KEY}`);
    });

    it("should return [error, null] when private key is missing", async () => {
      const sources = new PaymentSources(undefined, true);

      const [error, data] = await sources.getPaymentSource(543);

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Private key is required");
    });
  });

  describe("createPaymentSource", () => {
    it("should return [null, data] with valid input", async () => {
      const sources = new PaymentSources(PRIVATE_KEY, true);
      const input = {
        type: "CARD",
        token: "tok_test_abc",
        acceptance_token: "eyJhb...",
        customer_email: "test@example.com",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 999,
            type: "CARD",
            token: "tok_test_abc",
            status: "AVAILABLE",
            customer_email: "test@example.com",
            public_data: { type: "CARD" },
          },
        }),
      });

      const [error, data] = await sources.createPaymentSource(input);

      expect(error).toBeNull();
      expect(data!.data.id).toBe(999);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payment_sources");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe(`Bearer ${PRIVATE_KEY}`);
    });

    it("should return [error, null] when private key is missing", async () => {
      const sources = new PaymentSources(undefined, true);

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
      const sources = new PaymentSources(PRIVATE_KEY, true);

      const [error, data] = await sources.createPaymentSource({
        type: "INVALID_TYPE",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid input");
    });
  });
});
