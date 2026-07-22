import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WompiPayoutsClient } from "../src";
import { WompiError, WompiPayoutApiError } from "../src/schemas";
import { okJson, errorJson } from "./helpers";

const API_KEY = "payouts_api_key_123";
const USER_PRINCIPAL_ID = "63416484-e3e2-48ff-8f0d-20877cd0d161";

describe("BRE-B dispersions", () => {
  const mockFetch = vi.fn();

  const makeClient = (sandbox = true) =>
    new WompiPayoutsClient({ apiKey: API_KEY, userPrincipalId: USER_PRINCIPAL_ID, sandbox });

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

  const bankTransaction = () => ({
    legalIdType: "CC",
    legalId: "1234567890",
    bankId: "9183a03b-cd82-451a-a6c7-6a9ab406a477",
    accountType: "AHORROS",
    accountNumber: "9876543210",
    name: "Carlos Gomez",
    email: "carlos@example.com",
    amount: 250_000,
  });

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveBrebKey", () => {
    it("resolves a key against the sandbox v2 host with auth headers", async () => {
      const payouts = makeClient();

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

      const [error, data] = await payouts.resolveBrebKey("@JUANPEREZ", "ALPHANUMERIC");

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

    it("uses the production v2 host when sandbox is false", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: {} }));

      await makeClient(false).resolveBrebKey("3001234567");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.payouts.wompi.co/v2/breb/keys/resolve/3001234567");
    });

    it("omits the keyType query when not provided", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: {} }));

      await makeClient().resolveBrebKey("juan@email.com");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).not.toContain("keyType");
      expect(url).toContain("/v2/breb/keys/resolve/juan%40email.com");
    });

    it("rejects an invalid keyType without calling the API", async () => {
      const [error, data] = await makeClient().resolveBrebKey("@JUANPEREZ", "PASSPORT");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("Invalid keyType");
      expect(error?.message).toContain("ALPHANUMERIC, MAIL, PHONE, IDENTIFICATION");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an empty keyValue without calling the API", async () => {
      const [error, data] = await makeClient().resolveBrebKey("");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("keyValue");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("surfaces an unknown-key 404 as a WompiPayoutApiError with the payouts body", async () => {
      const body = {
        status: 404,
        meta: { trace_id: "6fbfdee0-1ed8-11f0-acf5-eb60899d3e82" },
        code: "EXC_034",
        message: "La llave BRE-B no se encuentra activa o no está registrada.",
        type: "Business",
      };

      mockFetch.mockResolvedValueOnce(errorJson(404, body));

      const [error, data] = await makeClient().resolveBrebKey("noexiste@test.com");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiPayoutApiError);
      expect((error as WompiPayoutApiError).code).toBe("EXC_034");
      expect((error as WompiPayoutApiError).statusCode).toBe(404);
      expect((error as WompiPayoutApiError).body).toEqual(body);
    });
  });

  describe("createPayout with BRE-B keys", () => {
    it("routes a key batch to /v2/payouts with auth and idempotency headers", async () => {
      const payouts = makeClient();

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

      const [error, data] = await payouts.createPayout(payoutInput(), {
        idempotencyKey: "payout-unique-key-001",
      });

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

    it("keeps a bank-only batch on /v1/payouts", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-bank" } }, 201));

      const [error] = await makeClient().createPayout(
        { ...payoutInput(), transactions: [bankTransaction()] },
        { idempotencyKey: "payout-bank-key-001" }
      );

      expect(error).toBeNull();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.sandbox.payouts.wompi.co/v1/payouts");
    });

    it("routes a mixed batch of BRE-B and bank transactions to /v2/payouts", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-1" } }, 201));

      const [error] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            { amount: 150_000, name: "Juan Perez", email: "juan@example.com", key: "@juanperez" },
            bankTransaction(),
          ],
        },
        { idempotencyKey: "payout-mixed-key-001" }
      );

      expect(error).toBeNull();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.sandbox.payouts.wompi.co/v2/payouts");
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
      const [error] = await makeClient().createPayout(input, {
        idempotencyKey: "payout-breb-document-001",
      });

      expect(error).toBeNull();
      const [, options] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(options.body)).toEqual(input);
    });

    it.each([
      ["legalIdType only", { legalIdType: "CC" }],
      ["legalId only", { legalId: "1234567890" }],
    ])("rejects partial beneficiary document fields with a BRE-B key: %s", async (_, document) => {
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
        { idempotencyKey: "payout-breb-partial-document-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("both legalIdType and legalId");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a transaction with neither a key nor bank details", async () => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [{ amount: 150_000, name: "Juan Perez", email: "juan@example.com" }],
        },
        { idempotencyKey: "payout-invalid-key-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("either a BRE-B key or bankId");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a bank transaction missing accountType", async () => {
      const { accountType: _, ...incomplete } = bankTransaction();

      const [error, data] = await makeClient().createPayout(
        { ...payoutInput(), transactions: [incomplete] },
        { idempotencyKey: "payout-no-account-type-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("either a BRE-B key or bankId");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects unsupported bank account types", async () => {
      const [error, data] = await makeClient().createPayout(
        { ...payoutInput(), transactions: [{ ...bankTransaction(), accountType: "SAVINGS" }] },
        { idempotencyKey: "payout-invalid-account-type-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a bank transaction missing the beneficiary document", async () => {
      const { legalIdType: _, legalId: __, ...incomplete } = bankTransaction();

      const [error, data] = await makeClient().createPayout(
        { ...payoutInput(), transactions: [incomplete] },
        { idempotencyKey: "payout-no-legal-id-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a transaction with both a key and bank details", async () => {
      const [error, data] = await makeClient().createPayout(
        { ...payoutInput(), transactions: [{ ...bankTransaction(), key: "@juanperez" }] },
        { idempotencyKey: "payout-both-methods-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("not both");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a blank BRE-B key", async () => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [{ amount: 150_000, name: "Juan Perez", key: "" }],
        },
        { idempotencyKey: "payout-blank-key-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a BRE-B transaction without the required email", async () => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [{ amount: 150_000, name: "Juan Perez", key: "@juanperez" }],
        },
        { idempotencyKey: "payout-no-email-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each([
      ["longer than 40 characters", "a".repeat(41)],
      ["carrying characters outside letters, numbers and hyphens", "pago #1"],
    ])("rejects a BRE-B transaction reference %s", async (_, reference) => {
      const [error, data] = await makeClient().createPayout(
        {
          ...payoutInput(),
          transactions: [
            {
              amount: 150_000,
              name: "Juan Perez",
              email: "juan@example.com",
              key: "@juanperez",
              reference,
            },
          ],
        },
        { idempotencyKey: "payout-bad-reference-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("passes the sandbox-only transactionStatus simulation field through", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { payoutId: "p-2" } }, 201));

      await makeClient().createPayout(
        { ...payoutInput(), transactionStatus: "FAILED" },
        { idempotencyKey: "payout-failed-key-001" }
      );

      const [, options] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(options.body).transactionStatus).toBe("FAILED");
    });

    it("rejects the sandbox-only transactionStatus field in production", async () => {
      const [error, data] = await makeClient(false).createPayout(
        { ...payoutInput(), transactionStatus: "FAILED" },
        { idempotencyKey: "payout-production-status-001" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("sandbox");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an idempotency key with characters other than letters, numbers, and hyphens", async () => {
      const [error, data] = await makeClient().createPayout(payoutInput(), {
        idempotencyKey: "payout_key!",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error?.message).toContain("Invalid idempotency key");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an idempotency key longer than 64 characters", async () => {
      const [error] = await makeClient().createPayout(payoutInput(), {
        idempotencyKey: "a".repeat(65),
      });

      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("surfaces a duplicated idempotency key 409 as a WompiPayoutApiError", async () => {
      const body = {
        status: 409,
        code: "EXC_032",
        message: "La llave de idempotencia ya fue procesada.",
        type: "Business",
      };

      mockFetch.mockResolvedValueOnce(errorJson(409, body));

      const [error, data] = await makeClient().createPayout(payoutInput(), {
        idempotencyKey: "payout-dup-key-001",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiPayoutApiError);
      expect((error as WompiPayoutApiError).code).toBe("EXC_032");
      expect((error as WompiPayoutApiError).statusCode).toBe(409);
      expect((error as WompiPayoutApiError).body).toEqual(body);
    });
  });

  describe("BRE-B payout reads", () => {
    it("gets a BRE-B batch from the sandbox v2 endpoint", async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({ data: { id: "p-breb", status: "PENDING", reference: "payout-breb-001" } })
      );

      const [error, payout] = await makeClient().getPayout("p-breb", { apiVersion: "v2" });

      expect(error).toBeNull();
      expect(payout?.id).toBe("p-breb");
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.sandbox.payouts.wompi.co/v2/payouts/p-breb");
    });

    it("gets a BRE-B batch from the production v2 endpoint", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { id: "p-breb", status: "PENDING" } }));

      const [error] = await makeClient(false).getPayout("p-breb", { apiVersion: "v2" });

      expect(error).toBeNull();
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.payouts.wompi.co/v2/payouts/p-breb");
    });

    it("preserves filters and pagination on the v2 transaction endpoint", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { page: 2, records: [] } }));

      const [error] = await makeClient().listPayoutTransactions(
        "p-breb",
        { status: "APPROVED", page: 2, limit: 25 },
        { apiVersion: "v2" }
      );

      expect(error).toBeNull();
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        "https://api.sandbox.payouts.wompi.co/v2/payouts/p-breb/transactions?status=APPROVED&page=2&limit=25"
      );
    });
  });
});
