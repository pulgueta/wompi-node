import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WompiClient } from "../src";
import { WompiError, WompiRequestError } from "../src/schemas";
import { okJson, errorJson } from "./helpers";

describe("Breb", () => {
  const mockFetch = vi.fn();
  const API_KEY = "payouts_api_key_123";
  const USER_PRINCIPAL_ID = "63416484-e3e2-48ff-8f0d-20877cd0d161";

  const makeClient = (sandbox = true) =>
    new WompiClient({
      publicKey: "pub_test_123",
      payouts: { apiKey: API_KEY, userPrincipalId: USER_PRINCIPAL_ID },
      sandbox,
    }).breb;

  const withoutCredentials = () => new WompiClient({ publicKey: "pub_test_123" }).breb;

  const payoutInput = () => ({
    reference: "payout-breb-001",
    accountId: "84a339e8-c277-45bd-b652-50f0b689edf7",
    paymentType: "PROVIDERS",
    transactions: [
      {
        amount: 150_000,
        name: "Juan Perez",
        email: "juan@example.com",
        key: "@juanperez",
      },
    ],
  });

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveKey", () => {
    it("resolves a key against the payouts sandbox host with auth headers", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          status: 200,
          code: "OK",
          message: "Solicitud ejecutada correctamente.",
          meta: { trace_id: "6fbfdee0-1ed8-11f0-acf5-eb60899d3e82" },
          data: {
            holderName: "JUA*** PER*** GAR***",
            financialEntity: { name: "BANCOLOMBIA", code: "001" },
            keyType: "ALPHANUMERIC",
            keyValue: "@JUA***",
          },
        })
      );

      const [error, data] = await breb.resolveKey("@JUANPEREZ", "ALPHANUMERIC");

      expect(error).toBeNull();
      expect(data?.holderName).toBe("JUA*** PER*** GAR***");
      expect(data?.financialEntity?.name).toBe("BANCOLOMBIA");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        "https://api.sandbox.payouts.wompi.co/v2/breb/keys/resolve/%40JUANPEREZ?keyType=ALPHANUMERIC"
      );
      expect(options.method).toBe("GET");
      expect(options.headers["x-api-key"]).toBe(API_KEY);
      expect(options.headers["user-principal-id"]).toBe(USER_PRINCIPAL_ID);
    });

    it("uses the payouts production host when sandbox is false", async () => {
      const breb = makeClient(false);

      mockFetch.mockResolvedValueOnce(okJson({ data: {} }));

      await breb.resolveKey("3001234567");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.payouts.wompi.co/v2/breb/keys/resolve/3001234567");
    });

    it("omits the keyType query when not provided", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(okJson({ data: {} }));

      await breb.resolveKey("juan@email.com");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).not.toContain("keyType");
      expect(url).toContain("/breb/keys/resolve/juan%40email.com");
    });

    it("rejects an invalid keyType without calling the API", async () => {
      const [error, data] = await makeClient().resolveKey("@JUANPEREZ", "PASSPORT");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("Invalid keyType");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an empty keyValue without calling the API", async () => {
      const [error, data] = await makeClient().resolveKey("");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns [WompiError, null] when payouts credentials are missing", async () => {
      const [error, data] = await withoutCredentials().resolveKey("@JUANPEREZ");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("Payouts credentials are required");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("surfaces an unknown-key 404 as a WompiRequestError with the payouts body", async () => {
      const body = {
        status: 404,
        meta: { trace_id: "6fbfdee0-1ed8-11f0-acf5-eb60899d3e82" },
        code: "EXC_034",
        message: "La llave BRE-B no se encuentra activa o no está registrada.",
        type: "Business",
      };

      mockFetch.mockResolvedValueOnce(errorJson(404, body));

      const [error, data] = await makeClient().resolveKey("noexiste@test.com");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiRequestError);
      expect((error as WompiRequestError).statusCode).toBe(404);
      expect((error as WompiRequestError).body).toEqual(body);
    });
  });

  describe("createPayout", () => {
    it("creates a payout with auth and idempotency headers", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson(
          {
            status: 201,
            code: "OK",
            message: "Solicitud ejecutada correctamente.",
            data: {
              payoutId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
              transactions: 1,
              success: 1,
              failed: 0,
            },
          },
          201
        )
      );

      const [error, data] = await breb.createPayout(payoutInput(), "payout-unique-key-001");

      expect(error).toBeNull();
      expect(data?.payoutId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(data?.success).toBe(1);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.sandbox.payouts.wompi.co/v2/payouts");
      expect(options.method).toBe("POST");
      expect(options.headers["x-api-key"]).toBe(API_KEY);
      expect(options.headers["user-principal-id"]).toBe(USER_PRINCIPAL_ID);
      expect(options.headers["idempotency-key"]).toBe("payout-unique-key-001");
      expect(JSON.parse(options.body)).toEqual(payoutInput());
    });

    it("accepts a mixed batch of BRE-B and bank transactions", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-1" } }, 201));

      const [error] = await breb.createPayout(
        {
          ...payoutInput(),
          transactions: [
            { amount: 150_000, name: "Juan Perez", email: "juan@example.com", key: "@juanperez" },
            {
              amount: 250_000,
              name: "Carlos Gomez",
              email: "carlos@example.com",
              legalIdType: "CC",
              legalId: "1234567890",
              bankId: "9183a03b-cd82-451a-a6c7-6a9ab406a477",
              accountType: "AHORROS",
              accountNumber: "9876543210",
            },
          ],
        },
        "payout-mixed-key-001"
      );

      expect(error).toBeNull();
    });

    it("accepts optional beneficiary document fields with a BRE-B key", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-breb-document" } }, 201));

      const input = {
        ...payoutInput(),
        transactions: [
          {
            amount: 150_000,
            name: "Juan Perez",
            email: "juan@example.com",
            key: "@juanperez",
            legalIdType: "CC",
            legalId: "1234567890",
          },
        ],
      };
      const [error] = await makeClient().createPayout(input, "payout-breb-document-001");

      expect(error).toBeNull();
      const [, options] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(options.body)).toEqual(input);
    });

    it.each([
      ["legalIdType only", { legalIdType: "CC" }],
      ["legalId only", { legalId: "1234567890" }],
    ])("rejects partial beneficiary document fields with a BRE-B key: %s", async (_, document) => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-partial-document" } }, 201));

      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            {
              amount: 150_000,
              name: "Juan Perez",
              email: "juan@example.com",
              key: "@juanperez",
              ...document,
            },
          ],
        },
        "payout-breb-partial-document-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("both legalIdType and legalId");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects recurring payouts without a dispersion date", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-recurring" } }, 201));

      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          recurring: { interval: "month", months: 6 },
        },
        "payout-recurring-key-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("dispersionDatetime");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects recurring month counts outside 3, 6, or 12", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-recurring" } }, 201));

      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          dispersionDatetime: "2026-08-15T10:00",
          recurring: { interval: "month", months: 4 },
        },
        "payout-recurring-months-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("3, 6, or 12");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("passes the sandbox-only transactionStatus simulation field through", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-2" } }, 201));

      await breb.createPayout(
        { ...payoutInput(), transactionStatus: "FAILED" },
        "payout-failed-key-001"
      );

      const [, options] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(options.body).transactionStatus).toBe("FAILED");
    });

    it("rejects the sandbox-only transactionStatus field in production", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-production" } }, 201));

      const [error, data] = await makeClient(false).createPayout(
        { ...payoutInput(), transactionStatus: "FAILED" },
        "payout-production-status-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("sandbox");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a transaction with neither a key nor bank details", async () => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [{ amount: 150_000, name: "Juan Perez", email: "juan@example.com" }],
        },
        "payout-invalid-key-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("Provide key (BRE-B) or bankId");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a bank transaction missing accountType", async () => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            {
              amount: 150_000,
              name: "Carlos Gomez",
              email: "carlos@example.com",
              bankId: "9183a03b-cd82-451a-a6c7-6a9ab406a477",
              accountNumber: "9876543210",
            },
          ],
        },
        "payout-no-account-type-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("Provide key (BRE-B) or bankId");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects blank required bank destination fields", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-bank" } }, 201));

      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            {
              amount: 150_000,
              name: "Carlos Gomez",
              email: "carlos@example.com",
              legalIdType: "CC",
              legalId: "1234567890",
              bankId: "",
              accountType: "AHORROS",
              accountNumber: "9876543210",
            },
          ],
        },
        "payout-blank-bank-id-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects unsupported bank account types", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-bank" } }, 201));

      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            {
              amount: 150_000,
              name: "Carlos Gomez",
              email: "carlos@example.com",
              legalIdType: "CC",
              legalId: "1234567890",
              bankId: "9183a03b-cd82-451a-a6c7-6a9ab406a477",
              accountType: "SAVINGS",
              accountNumber: "9876543210",
            },
          ],
        },
        "payout-invalid-account-type-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a bank transaction missing the beneficiary document", async () => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            {
              amount: 150_000,
              name: "Carlos Gomez",
              email: "carlos@example.com",
              bankId: "9183a03b-cd82-451a-a6c7-6a9ab406a477",
              accountType: "AHORROS",
              accountNumber: "9876543210",
            },
          ],
        },
        "payout-no-legal-id-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("legalIdType + legalId");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a transaction with both a key and bank details", async () => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            {
              amount: 150_000,
              name: "Juan Perez",
              email: "juan@example.com",
              key: "@juanperez",
              bankId: "9183a03b-cd82-451a-a6c7-6a9ab406a477",
              accountType: "AHORROS",
              accountNumber: "9876543210",
            },
          ],
        },
        "payout-both-methods-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("not both");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an idempotency key with characters other than letters, numbers, and hyphens", async () => {
      const [error, data] = await makeClient().createPayout(payoutInput(), "payout_key!");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("idempotencyKey");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an idempotency key longer than 64 characters", async () => {
      const [error] = await makeClient().createPayout(payoutInput(), "a".repeat(65));

      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects invalid input without calling the API", async () => {
      const [error, data] = await makeClient().createPayout(
        { reference: "", transactions: [] },
        "payout-empty-key-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("Invalid input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns [WompiError, null] when payouts credentials are missing", async () => {
      const [error, data] = await withoutCredentials().createPayout(
        payoutInput(),
        "payout-no-creds-001"
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("surfaces a duplicated idempotency key 409 as a WompiRequestError", async () => {
      const body = {
        status: 409,
        code: "EXC_032",
        message: "La llave de idempotencia ya fue procesada.",
        type: "Business",
      };

      mockFetch.mockResolvedValueOnce(errorJson(409, body));

      const [error, data] = await makeClient().createPayout(payoutInput(), "payout-dup-key-001");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiRequestError);
      expect((error as WompiRequestError).statusCode).toBe(409);
      expect((error as WompiRequestError).body).toEqual(body);
    });
  });

  describe("getPayout", () => {
    it("fetches a payout batch by id", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          data: {
            id: "c57a05b0-646c-11f1-8436-6ca5ce550b83",
            reference: "payout-breb-001",
            amountInCents: 150_000,
            paymentType: "PROVIDERS",
            status: "TOTAL_PAYMENT",
            totalTransactions: 1,
            currency: "COP",
          },
        })
      );

      const [error, data] = await breb.getPayout("c57a05b0-646c-11f1-8436-6ca5ce550b83");

      expect(error).toBeNull();
      expect(data?.status).toBe("TOTAL_PAYMENT");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        "https://api.sandbox.payouts.wompi.co/v2/payouts/c57a05b0-646c-11f1-8436-6ca5ce550b83"
      );
      expect(options.headers["x-api-key"]).toBe(API_KEY);
    });

    it("parses the approval-flow statuses PENDING_APPROVAL and NOT_APPROVED", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({ data: { id: "p-approval", status: "PENDING_APPROVAL" } })
      );
      mockFetch.mockResolvedValueOnce(
        okJson({ data: { id: "p-approval", status: "NOT_APPROVED" } })
      );

      const [pendingError, pending] = await breb.getPayout("p-approval");
      const [notApprovedError, notApproved] = await breb.getPayout("p-approval");

      expect(pendingError).toBeNull();
      expect(pending?.status).toBe("PENDING_APPROVAL");
      expect(notApprovedError).toBeNull();
      expect(notApproved?.status).toBe("NOT_APPROVED");
    });

    it("parses the AFE review statuses AFE_ON_HOLD and AFE_REJECTED", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(okJson({ data: { id: "p-afe", status: "AFE_ON_HOLD" } }));
      mockFetch.mockResolvedValueOnce(okJson({ data: { id: "p-afe", status: "AFE_REJECTED" } }));

      const [onHoldError, onHold] = await breb.getPayout("p-afe");
      const [rejectedError, rejected] = await breb.getPayout("p-afe");

      expect(onHoldError).toBeNull();
      expect(onHold?.status).toBe("AFE_ON_HOLD");
      expect(rejectedError).toBeNull();
      expect(rejected?.status).toBe("AFE_REJECTED");
    });

    it("returns [WompiError, null] when payouts credentials are missing", async () => {
      const [error, data] = await withoutCredentials().getPayout("p-1");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("getPayoutTransactions", () => {
    it("parses Wompi's documented paginated records envelope", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          status: 200,
          code: "OK",
          message: "Solicitud ejecutada correctamente.",
          meta: { trace_id: "2796d870-21e5-11f0-805b-4b055319fe18" },
          data: {
            page: 2,
            limit: 10,
            total: 21,
            pages: 3,
            records: [
              {
                id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                amountInCents: 150_000,
                status: "FAILED",
                payeeInfo: { name: "Carlos Gomez", accountNumber: "**3210" },
                failureReason: "Cuenta cerrada",
                reference: "order-42",
                appliedAt: "2026-07-21T10:00:00.000Z",
                createdAt: "2026-07-21T09:59:00.000Z",
              },
            ],
          },
        })
      );

      const [error, data] = await breb.getPayoutTransactions("payout-1", {
        limit: 10,
        page: 2,
      });

      expect(error).toBeNull();
      expect(data?.page).toBe(2);
      expect(data?.pages).toBe(3);
      expect(data?.records).toHaveLength(1);
      expect(data?.records[0]?.failureReason).toBe("Cuenta cerrada");
      expect(data?.records[0]?.payeeInfo?.accountNumber).toBe("**3210");
    });

    it("lists the transactions of a payout batch", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          data: {
            page: 1,
            limit: 10,
            total: 1,
            pages: 1,
            records: [
              {
                id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                payoutId: "c57a05b0-646c-11f1-8436-6ca5ce550b83",
                amountInCents: 150_000,
                status: "APPROVED",
                payee: { key: "@juanperez", keyType: "ALPHANUMERIC" },
                currency: "COP",
              },
            ],
          },
        })
      );

      const [error, data] = await breb.getPayoutTransactions(
        "c57a05b0-646c-11f1-8436-6ca5ce550b83"
      );

      expect(error).toBeNull();
      expect(data?.records).toHaveLength(1);
      expect(data?.records[0]!.status).toBe("APPROVED");
      expect(data?.records[0]!.payee?.key).toBe("@juanperez");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        "https://api.sandbox.payouts.wompi.co/v2/payouts/c57a05b0-646c-11f1-8436-6ca5ce550b83/transactions"
      );
    });

    it("passes limit and page as query params", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({ data: { page: 2, limit: 50, total: 0, pages: 0, records: [] } })
      );

      const [error] = await breb.getPayoutTransactions("c57a05b0-646c-11f1-8436-6ca5ce550b83", {
        limit: 50,
        page: 2,
      });

      expect(error).toBeNull();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        "https://api.sandbox.payouts.wompi.co/v2/payouts/c57a05b0-646c-11f1-8436-6ca5ce550b83/transactions?limit=50&page=2"
      );
    });

    it("parses a CANCELLED transaction status", async () => {
      const breb = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          data: {
            page: 1,
            limit: 10,
            total: 1,
            pages: 1,
            records: [{ id: "t-cancelled", status: "CANCELLED" }],
          },
        })
      );

      const [error, data] = await breb.getPayoutTransactions("p-1");

      expect(error).toBeNull();
      expect(data?.records[0]!.status).toBe("CANCELLED");
    });

    it("rejects a non-positive or non-integer limit or page without calling the API", async () => {
      const breb = makeClient();

      for (const options of [{ limit: 0 }, { limit: 2.5 }, { page: -1 }, { page: 1.5 }]) {
        const [error, data] = await breb.getPayoutTransactions("p-1", options);

        expect(data).toBeNull();
        expect(error).toBeInstanceOf(WompiError);
        expect(error?.message).toContain("positive integer");
      }

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns [WompiError, null] when payouts credentials are missing", async () => {
      const [error, data] = await withoutCredentials().getPayoutTransactions("p-1");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
