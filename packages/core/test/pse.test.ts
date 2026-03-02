import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PSE } from "../src/client/pse";

describe("PSE", () => {
  const mockFetch = vi.fn();
  const PUBLIC_KEY = "pub_test_123";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getFinancialInstitutions", () => {
    it("should return [null, data] with financial institutions list", async () => {
      const pse = new PSE(PUBLIC_KEY, true);
      const mockResponse = {
        data: [
          { financial_institution_code: "1051", financial_institution_name: "Bancolombia" },
          { financial_institution_code: "1007", financial_institution_name: "Davivienda" },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const [error, data] = await pse.getFinancialInstitutions();

      expect(error).toBeNull();
      expect(data!.data).toHaveLength(2);
      expect(data!.data[0]!.financial_institution_name).toBe("Bancolombia");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/pse/financial_institutions");
      expect(options.method).toBe("GET");
      expect(options.headers.Authorization).toBe(`Bearer ${PUBLIC_KEY}`);
    });
  });
});
