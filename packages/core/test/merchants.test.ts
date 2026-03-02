import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Merchants } from "../src/client/merchants";

const MERCHANT_RESPONSE = {
  data: {
    id: 11000,
    name: "Tienda del ahorro",
    legal_name: "Mi Tienda S.A.S.",
    legal_id: "9001723102-4",
    legal_id_type: "NIT",
    phone_number: "5712134489",
    active: true,
    logo_url: null,
    email: "admin@mitienda.com.co",
    contact_name: "Pedro Perez",
    public_key: "pub_test_123",
    accepted_payment_methods: ["CARD", "NEQUI", "PSE"],
    accepted_currencies: ["COP"],
    presigned_acceptance: {
      acceptance_token: "eyJhb...",
      permalink: "https://wompi.co/terms",
      type: "END_USER_POLICY",
    },
  },
};

describe("Merchants", () => {
  const mockFetch = vi.fn();
  const PUBLIC_KEY = "pub_test_123";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getMerchant", () => {
    it("should return [null, data] with merchant info", async () => {
      const merchants = new Merchants(PUBLIC_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MERCHANT_RESPONSE,
      });

      const [error, data] = await merchants.getMerchant();

      expect(error).toBeNull();
      expect(data!.data.id).toBe(11000);
      expect(data!.data.name).toBe("Tienda del ahorro");
      expect(data!.data.accepted_payment_methods).toEqual(["CARD", "NEQUI", "PSE"]);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain(`/merchants/${PUBLIC_KEY}`);
      expect(options.method).toBe("GET");
    });

    it("should use sandbox URL when sandbox is enabled", async () => {
      const merchants = new Merchants(PUBLIC_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MERCHANT_RESPONSE,
      });

      await merchants.getMerchant();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("sandbox.wompi.co");
    });

    it("should use production URL when sandbox is disabled", async () => {
      const merchants = new Merchants(PUBLIC_KEY, false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MERCHANT_RESPONSE,
      });

      await merchants.getMerchant();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("production.wompi.co");
    });
  });
});
