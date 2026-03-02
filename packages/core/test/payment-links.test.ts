import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PaymentLinks } from "../src/client/payment-links";
import { WompiError } from "../src/errors/wompi-error";

const PAYMENT_LINK_RESPONSE = {
  data: {
    id: "link_123",
    name: "Subscripcion",
    description: "Subscripcion mensual",
    single_use: false,
    collect_shipping: false,
    active: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
};

describe("PaymentLinks", () => {
  const mockFetch = vi.fn();
  const PRIVATE_KEY = "prv_test_456";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPaymentLink", () => {
    it("should return [null, data] for a valid link", async () => {
      const links = new PaymentLinks(PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => PAYMENT_LINK_RESPONSE,
      });

      const [error, data] = await links.getPaymentLink("link_123");

      expect(error).toBeNull();
      expect(data!.data.id).toBe("link_123");
      expect(data!.data.active).toBe(true);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payment_links/link_123");
      expect(options.method).toBe("GET");
    });

    it("should work without private key for read operations", async () => {
      const links = new PaymentLinks(undefined, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => PAYMENT_LINK_RESPONSE,
      });

      const [error, data] = await links.getPaymentLink("link_123");

      expect(error).toBeNull();
      expect(data!.data.id).toBe("link_123");
    });
  });

  describe("createPaymentLink", () => {
    it("should return [null, data] with valid input", async () => {
      const links = new PaymentLinks(PRIVATE_KEY, true);
      const input = {
        name: "Test Link",
        description: "A test payment link",
        single_use: true,
        collect_shipping: false,
        amount_in_cents: 1000000,
        currency: "COP",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "link_new",
            active: true,
            ...input,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        }),
      });

      const [error, data] = await links.createPaymentLink(input);

      expect(error).toBeNull();
      expect(data!.data.id).toBe("link_new");
      expect(data!.data.active).toBe(true);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payment_links");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe(`Bearer ${PRIVATE_KEY}`);
    });

    it("should return [error, null] when private key is missing", async () => {
      const links = new PaymentLinks(undefined, true);

      const [error, data] = await links.createPaymentLink({
        name: "Test",
        description: "Test",
        single_use: true,
        collect_shipping: false,
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Private key is required");
    });

    it("should return [error, null] on invalid input", async () => {
      const links = new PaymentLinks(PRIVATE_KEY, true);

      const [error, data] = await links.createPaymentLink({
        name: 123,
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid input");
    });

    it("should support taxes in payment link creation", async () => {
      const links = new PaymentLinks(PRIVATE_KEY, true);
      const input = {
        name: "Link with taxes",
        description: "Has VAT",
        single_use: false,
        collect_shipping: true,
        amount_in_cents: 1000000,
        currency: "COP",
        taxes: [{ type: "VAT", percentage: 19 }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "link_tax",
            active: true,
            ...input,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        }),
      });

      const [error] = await links.createPaymentLink(input);

      expect(error).toBeNull();

      const [, options] = mockFetch.mock.calls[0]!;
      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.taxes).toEqual([{ type: "VAT", percentage: 19 }]);
    });
  });

  describe("updatePaymentLink", () => {
    it("should return [null, data] on successful update", async () => {
      const links = new PaymentLinks(PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { ...PAYMENT_LINK_RESPONSE.data, active: false },
        }),
      });

      const [error, data] = await links.updatePaymentLink("link_123", { active: false });

      expect(error).toBeNull();
      expect(data!.data.active).toBe(false);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payment_links/link_123");
      expect(options.method).toBe("PATCH");
      expect(options.headers.Authorization).toBe(`Bearer ${PRIVATE_KEY}`);
    });

    it("should return [error, null] when private key is missing", async () => {
      const links = new PaymentLinks(undefined, true);

      const [error, data] = await links.updatePaymentLink("link_123", { active: false });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Private key is required");
    });

    it("should return [error, null] on invalid input", async () => {
      const links = new PaymentLinks(PRIVATE_KEY, true);

      const [error, data] = await links.updatePaymentLink("link_123", { active: "not-a-boolean" });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid input");
    });
  });
});
