import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Transactions } from "../src/client/transactions";
import { WompiError } from "../src/errors/wompi-error";

const TRANSACTION_RESPONSE = {
  data: {
    id: "txn-123",
    created_at: "2024-01-01",
    amount_in_cents: 3000000,
    status: "APPROVED",
    reference: "ref-123",
    customer_email: "test@example.com",
    currency: "COP",
    payment_method_type: "CARD",
    payment_method: { type: "CARD" },
    shipping_address: null,
    redirect_url: null,
    payment_link_id: null,
  },
};

describe("Transactions", () => {
  const mockFetch = vi.fn();
  const PUBLIC_KEY = "pub_test_123";
  const PRIVATE_KEY = "prv_test_456";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTransaction", () => {
    it("should return [null, data] for a valid transaction", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => TRANSACTION_RESPONSE,
      });

      const [error, data] = await transactions.getTransaction("txn-123");

      expect(error).toBeNull();
      expect(data!.data.id).toBe("txn-123");
      expect(data!.data.status).toBe("APPROVED");
    });
  });

  describe("listTransactions", () => {
    it("should return [null, data] with valid params", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [TRANSACTION_RESPONSE.data] }),
      });

      const [error, data] = await transactions.listTransactions({
        from_date: "2024-01-01",
        until_date: "2024-12-31",
        page: 1,
        page_size: 50,
      });

      expect(error).toBeNull();
      expect(data!.data).toHaveLength(1);
    });

    it("should return [error, null] when private key is missing", async () => {
      const transactions = new Transactions(PUBLIC_KEY, undefined, true);

      const [error, data] = await transactions.listTransactions();

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Private key is required");
    });

    it("should return [error, null] on invalid from_date format", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      const [error, data] = await transactions.listTransactions({
        from_date: "01-2024-01",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid parameters");
    });

    it("should return [error, null] when page is less than 1", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      const [error, data] = await transactions.listTransactions({ page: 0 });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
    });

    it("should return [error, null] when page_size exceeds 200", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      const [error, data] = await transactions.listTransactions({ page_size: 201 });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
    });

    it("should include optional query parameters", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const [error] = await transactions.listTransactions({
        reference: "ref-123",
        status: "APPROVED",
        payment_method_type: "CARD",
        order: "DESC",
      });

      expect(error).toBeNull();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("reference=ref-123");
      expect(url).toContain("status=APPROVED");
      expect(url).toContain("payment_method_type=CARD");
      expect(url).toContain("order=DESC");
    });
  });

  describe("createTransaction", () => {
    it("should return [null, data] with valid input", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);
      const input = {
        acceptance_token: "eyJhb...",
        amount_in_cents: 3000000,
        currency: "COP",
        signature: "sig_123",
        customer_email: "test@example.com",
        reference: "ref-123",
        payment_method: { type: "CARD", token: "tok_123", installments: 2 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => TRANSACTION_RESPONSE,
      });

      const [error, data] = await transactions.createTransaction(input);

      expect(error).toBeNull();
      expect(data!.data.id).toBe("txn-123");
      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers.Authorization).toBe(`Bearer ${PUBLIC_KEY}`);
    });

    it("should use private key when payment_source_id is provided", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => TRANSACTION_RESPONSE,
      });

      const [error] = await transactions.createTransaction({
        acceptance_token: "eyJhb...",
        amount_in_cents: 3000000,
        currency: "COP",
        signature: "sig_123",
        customer_email: "test@example.com",
        reference: "ref-123",
        payment_source_id: 1234,
      });

      expect(error).toBeNull();
      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers.Authorization).toBe(`Bearer ${PRIVATE_KEY}`);
    });

    it("should return [error, null] when using payment_source_id without private key", async () => {
      const transactions = new Transactions(PUBLIC_KEY, undefined, true);

      const [error, data] = await transactions.createTransaction({
        acceptance_token: "eyJhb...",
        amount_in_cents: 3000000,
        currency: "COP",
        signature: "sig_123",
        customer_email: "test@example.com",
        reference: "ref-123",
        payment_source_id: 1234,
      });

      expect(data).toBeNull();
      expect(error!.message).toContain("Private key is required");
    });

    it("should return [error, null] on invalid input", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      const [error, data] = await transactions.createTransaction({
        amount_in_cents: -5,
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid input");
    });
  });

  describe("voidTransaction", () => {
    it("should return [null, data] on successful void", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...TRANSACTION_RESPONSE,
          data: { ...TRANSACTION_RESPONSE.data, status: "VOIDED" },
        }),
      });

      const [error, data] = await transactions.voidTransaction("txn-123", {
        amount_in_cents: 3000000,
      });

      expect(error).toBeNull();
      expect(data!.data.status).toBe("VOIDED");
    });

    it("should return [error, null] without private key", async () => {
      const transactions = new Transactions(PUBLIC_KEY, undefined, true);

      const [error, data] = await transactions.voidTransaction("txn-123");

      expect(data).toBeNull();
      expect(error!.message).toContain("Private key is required");
    });

    it("should allow void without body", async () => {
      const transactions = new Transactions(PUBLIC_KEY, PRIVATE_KEY, true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...TRANSACTION_RESPONSE,
          data: { ...TRANSACTION_RESPONSE.data, status: "VOIDED" },
        }),
      });

      const [error] = await transactions.voidTransaction("txn-123");

      expect(error).toBeNull();
    });
  });
});
