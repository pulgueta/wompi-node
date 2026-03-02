import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Tokens } from "../src/client/tokens";
import { WompiError } from "../src/errors/wompi-error";

describe("Tokens", () => {
  const mockFetch = vi.fn();
  const PUBLIC_KEY = "pub_test_123";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tokenizeCard", () => {
    it("should return [null, data] with valid input", async () => {
      const tokens = new Tokens(PUBLIC_KEY, true);
      const input = {
        number: "4242424242424242",
        cvc: "789",
        exp_month: "12",
        exp_year: "29",
        card_holder: "Pedro Pérez",
      };
      const mockResponse = {
        data: {
          id: "tok_test_123",
          created_at: "2024-01-01",
          brand: "VISA",
          name: "VISA-4242",
          last_four: "4242",
          bin: "424242",
          exp_year: "29",
          exp_month: "12",
          card_holder: "Pedro Pérez",
          expires_at: "2024-01-02",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const [error, data] = await tokens.tokenizeCard(input);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
    });

    it("should return [error, null] on invalid input", async () => {
      const tokens = new Tokens(PUBLIC_KEY, true);

      const [error, data] = await tokens.tokenizeCard({ number: 123 });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid input");
    });
  });

  describe("tokenizeNequi", () => {
    it("should return [null, data] with valid input", async () => {
      const tokens = new Tokens(PUBLIC_KEY, true);
      const mockResponse = {
        data: {
          id: "nequi_test_123",
          status: "PENDING",
          phone_number: "3107654321",
          name: "Mi Tienda",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const [error, data] = await tokens.tokenizeNequi({ phone_number: "3107654321" });

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
    });

    it("should return [error, null] on missing phone_number", async () => {
      const tokens = new Tokens(PUBLIC_KEY, true);

      const [error, data] = await tokens.tokenizeNequi({});

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
    });
  });

  describe("getNequiToken", () => {
    it("should return [null, data] for a valid token", async () => {
      const tokens = new Tokens(PUBLIC_KEY, true);
      const mockResponse = {
        data: {
          id: "nequi_test_123",
          status: "APPROVED",
          phone_number: "3097654321",
          name: "Mi Tienda",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const [error, data] = await tokens.getNequiToken("nequi_test_123");

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/tokens/nequi/nequi_test_123"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });
});
