import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WompiPayoutsClient } from "../src";
import { WompiError, WompiPayoutApiError } from "../src/schemas";
import { okJson } from "./helpers";

const API_KEY = "payouts_api_key_123";
const USER_PRINCIPAL_ID = "principal-456";

const CREATE_PAYOUT_INPUT = {
  reference: "payroll-2026-07",
  accountId: "account-id",
  paymentType: "PAYROLL",
  transactions: [
    {
      legalIdType: "CC",
      legalId: "1000000000",
      bankId: "00000000-0000-0000-0000-000000000000",
      accountType: "AHORROS",
      accountNumber: "12345678",
      personType: "NATURAL",
      name: "John Doe",
      email: "john@example.com",
      amount: 1_000_000,
      reference: "tx-1",
    },
  ],
};

const CREATE_PAYOUT_RESPONSE = {
  status: 201,
  code: "OK",
  message: "Solicitud ejecutada correctamente.",
  meta: { trace_id: "00000000-0000-0000-0000-000000000000" },
  data: { payoutId: "payout-1", transactions: 1, success: 1, failed: 0 },
};

describe("WompiPayoutsClient", () => {
  const mockFetch = vi.fn();

  const makeClient = () =>
    new WompiPayoutsClient({
      apiKey: API_KEY,
      userPrincipalId: USER_PRINCIPAL_ID,
      sandbox: true,
    });

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("throws a WompiError on missing credentials", () => {
      expect(() => new WompiPayoutsClient({ apiKey: "only-key" })).toThrow(WompiError);
    });

    it("targets the sandbox host when sandbox is true", async () => {
      mockFetch.mockResolvedValueOnce(okJson([]));

      await makeClient().listBanks();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.sandbox.payouts.wompi.co/v1/banks");
    });

    it("targets the production host by default", async () => {
      mockFetch.mockResolvedValueOnce(okJson([]));

      await new WompiPayoutsClient({
        apiKey: API_KEY,
        userPrincipalId: USER_PRINCIPAL_ID,
      }).listBanks();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.payouts.wompi.co/v1/banks");
    });
  });

  describe("createPayout", () => {
    it("sends auth and idempotency headers and returns the created batch", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(okJson(CREATE_PAYOUT_RESPONSE, 201));

      const [error, data] = await payouts.createPayout(CREATE_PAYOUT_INPUT, {
        idempotencyKey: "payroll-2026-07",
      });

      expect(error).toBeNull();
      expect(data!.payoutId).toBe("payout-1");
      expect(data!.success).toBe(1);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payouts");
      expect(options.method).toBe("POST");
      expect(options.headers["x-api-key"]).toBe(API_KEY);
      expect(options.headers["user-principal-id"]).toBe(USER_PRINCIPAL_ID);
      expect(options.headers["idempotency-key"]).toBe("payroll-2026-07");
      expect(JSON.parse(options.body).reference).toBe("payroll-2026-07");
    });

    it("accepts scheduled and recurring batches", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(okJson(CREATE_PAYOUT_RESPONSE, 201));

      const [error] = await payouts.createPayout(
        {
          ...CREATE_PAYOUT_INPUT,
          dispersionDatetime: "2026-08-15T19:01",
          recurring: { interval: "biweek", months: 3, description: "Nómina" },
        },
        { idempotencyKey: "payroll-recurring" }
      );

      expect(error).toBeNull();

      const [, options] = mockFetch.mock.calls[0]!;
      const body = JSON.parse(options.body);
      expect(body.dispersionDatetime).toBe("2026-08-15T19:01");
      expect(body.recurring.months).toBe(3);
    });

    it("rejects a recurring batch without dispersionDatetime", async () => {
      const [error, data] = await makeClient().createPayout(
        { ...CREATE_PAYOUT_INPUT, recurring: { interval: "month", months: 6 } },
        { idempotencyKey: "abc" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("dispersionDatetime");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an invalid idempotency key", async () => {
      const [error, data] = await makeClient().createPayout(CREATE_PAYOUT_INPUT, {
        idempotencyKey: "not valid!",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid idempotency key");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects invalid input before hitting the network", async () => {
      const [error, data] = await makeClient().createPayout(
        { ...CREATE_PAYOUT_INPUT, transactions: [] },
        { idempotencyKey: "abc" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Invalid input");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each(["abc123", "12345", "000000"])(
      "rejects invalid beneficiary account number %s",
      async (accountNumber) => {
        const [error, data] = await makeClient().createPayout(
          {
            ...CREATE_PAYOUT_INPUT,
            transactions: [{ ...CREATE_PAYOUT_INPUT.transactions[0], accountNumber }],
          },
          { idempotencyKey: "abc" }
        );

        expect(data).toBeNull();
        expect(error).toBeInstanceOf(WompiError);
        expect(error!.message).toContain("accountNumber");
        expect(mockFetch).not.toHaveBeenCalled();
      }
    );

    it("maps a payout API error body to WompiPayoutApiError", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          code: "EXC_008",
          message: "Saldo insuficiente para procesar el lote.",
        }),
      });

      const [error, data] = await payouts.createPayout(CREATE_PAYOUT_INPUT, {
        idempotencyKey: "abc",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiPayoutApiError);
      expect((error as WompiPayoutApiError).code).toBe("EXC_008");
      expect((error as WompiPayoutApiError).statusCode).toBe(400);
    });

    it("preserves payout API diagnostics on errors", async () => {
      const responseBody = {
        code: "SERVICE_UNAVAILABLE",
        message: "Payout services are unavailable.",
        type: "HEALTH_ERROR",
        meta: { trace_id: "trace-123" },
        data: {
          status: "PARTIAL_OUTAGE",
          services: [{ name: "transactions", healthy: false }],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => responseBody,
      });

      const [error, data] = await makeClient().createPayout(CREATE_PAYOUT_INPUT, {
        idempotencyKey: "abc",
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiPayoutApiError);
      expect((error as WompiPayoutApiError).body).toEqual(responseBody);
    });

    it("rejects the sandbox-only transactionStatus on a production client", async () => {
      const [error, data] = await new WompiPayoutsClient({
        apiKey: API_KEY,
        userPrincipalId: USER_PRINCIPAL_ID,
      }).createPayout(
        { ...CREATE_PAYOUT_INPUT, transactionStatus: "APPROVED" },
        { idempotencyKey: "abc" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("sandbox");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("createPayoutFromFile", () => {
    it("rejects the sandbox-only transactionStatus on a production client", async () => {
      const [error, data] = await new WompiPayoutsClient({
        apiKey: API_KEY,
        userPrincipalId: USER_PRINCIPAL_ID,
      }).createPayoutFromFile(
        {
          reference: "batch-file-1",
          file: new Blob(["header\nrow"], { type: "text/csv" }),
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          transactionStatus: "APPROVED",
        },
        { idempotencyKey: "batch-file-1" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("sandbox");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("posts a multipart body without a JSON content type", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(okJson(CREATE_PAYOUT_RESPONSE, 201));

      const file = new Blob(["header\nrow"], { type: "text/csv" });
      const [error, data] = await payouts.createPayoutFromFile(
        {
          reference: "batch-file-1",
          file,
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
        },
        { idempotencyKey: "batch-file-1" }
      );

      expect(error).toBeNull();
      expect(data!.payoutId).toBe("payout-1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payouts/file");
      expect(options.headers["Content-Type"]).toBeUndefined();
      expect(options.headers["idempotency-key"]).toBe("batch-file-1");
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get("reference")).toBe("batch-file-1");
      expect(options.body.get("fileType")).toBe("WOMPI");
      expect(options.body.get("file")).toBeInstanceOf(Blob);
      expect(options.body.get("file").name).toBe("payout-batch.csv");
    });

    it("uses a .txt multipart filename for a bare bank-format blob", async () => {
      mockFetch.mockResolvedValueOnce(okJson(CREATE_PAYOUT_RESPONSE, 201));

      const [error] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-pab",
          file: new Blob(["bank row"], { type: "text/plain" }),
          fileType: "PAB",
          accountId: "account-id",
          paymentType: "PROVIDERS",
        },
        { idempotencyKey: "batch-file-pab" }
      );

      expect(error).toBeNull();
      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.body.get("file").name).toBe("payout-batch.txt");
    });

    it("names a gzip blob part after the original file plus .gz", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(okJson(CREATE_PAYOUT_RESPONSE, 201));

      const file = new Blob([new Uint8Array([0x1f, 0x8b])], { type: "application/gzip" });
      const [error] = await payouts.createPayoutFromFile(
        {
          reference: "batch-file-gz",
          file,
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          fileName: "plantilla-wompi.csv",
          fileMime: "text/csv",
        },
        { idempotencyKey: "batch-file-gz" }
      );

      expect(error).toBeNull();

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.body.get("fileName")).toBe("plantilla-wompi.csv");
      expect(options.body.get("fileMime")).toBe("text/csv");
      expect(options.body.get("file").name).toBe("plantilla-wompi.csv.gz");
    });

    it("keeps the own name of an uploaded gzip File", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(okJson(CREATE_PAYOUT_RESPONSE, 201));

      const file = new File([new Uint8Array([0x1f, 0x8b])], "batch.gz", {
        type: "application/gzip",
      });
      const [error] = await payouts.createPayoutFromFile(
        {
          reference: "batch-file-gz-file",
          file,
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          fileName: "plantilla-wompi.csv",
          fileMime: "text/csv",
        },
        { idempotencyKey: "batch-file-gz-file" }
      );

      expect(error).toBeNull();

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.body.get("file").name).toBe("batch.gz");
    });

    it("rejects a gzip File whose multipart filename does not end in .gz", async () => {
      const file = new File([new Uint8Array([0x1f, 0x8b])], "batch.csv", {
        type: "application/gzip",
      });

      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-gz-name",
          file,
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          fileName: "batch.csv",
          fileMime: "text/csv",
        },
        { idempotencyKey: "batch-file-gz-name" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect((error as WompiError).message).toContain(".gz");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a .gz File whose MIME is not application/gzip", async () => {
      const file = new File([new Uint8Array([0x1f, 0x8b])], "batch.gz", {
        type: "application/octet-stream",
      });

      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-gz-mime",
          file,
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          fileName: "batch.csv",
          fileMime: "text/csv",
        },
        { idempotencyKey: "batch-file-gz-mime" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect((error as WompiError).message).toContain("application/gzip");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an uncompressed File with the wrong extension for its format", async () => {
      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-extension",
          file: new File(["header\nrow"], "batch.txt", { type: "text/plain" }),
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
        },
        { idempotencyKey: "batch-file-extension" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain(".csv");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects gzip metadata with the wrong original extension", async () => {
      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-original-extension",
          file: new Blob([new Uint8Array([0x1f, 0x8b])], { type: "application/gzip" }),
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          fileName: "batch.txt",
          fileMime: "text/plain",
        },
        { idempotencyKey: "batch-file-original-extension" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain(".csv");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a recurring file payout without months", async () => {
      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-recurring",
          file: new Blob(["header\nrow"], { type: "text/csv" }),
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          dispersionDatetime: "2026-08-15T19:01",
          interval: "month",
        },
        { idempotencyKey: "batch-file-recurring" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect((error as WompiError).message).toContain("months");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a recurring file payout without interval", async () => {
      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-recurring",
          file: new Blob(["header\nrow"], { type: "text/csv" }),
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          dispersionDatetime: "2026-08-15T19:01",
          months: 3,
        },
        { idempotencyKey: "batch-file-recurring" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect((error as WompiError).message).toContain("interval");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a gzip file without the original fileName and fileMime", async () => {
      const file = new Blob([new Uint8Array([0x1f, 0x8b])], { type: "application/gzip" });
      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-gz",
          file,
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
        },
        { idempotencyKey: "batch-file-gz" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect((error as WompiError).message).toContain("fileName");
      expect((error as WompiError).message).toContain("fileMime");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a gzip file with blank fileName and fileMime", async () => {
      const file = new Blob([new Uint8Array([0x1f, 0x8b])], { type: "application/gzip" });
      const [error, data] = await makeClient().createPayoutFromFile(
        {
          reference: "batch-file-gz",
          file,
          fileType: "WOMPI",
          accountId: "account-id",
          paymentType: "PROVIDERS",
          fileName: "",
          fileMime: "  ",
        },
        { idempotencyKey: "batch-file-gz" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect((error as WompiError).message).toContain("fileName");
      expect((error as WompiError).message).toContain("fileMime");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects input without a file", async () => {
      const [error, data] = await makeClient().createPayoutFromFile(
        { reference: "x", fileType: "WOMPI", accountId: "a", paymentType: "OTHER" },
        { idempotencyKey: "abc" }
      );

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("listPayouts", () => {
    it("joins array filters into comma-separated query params", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          data: {
            page: 1,
            limit: 10,
            total: 1,
            pages: 1,
            records: [{ id: "payout-1", status: "TOTAL_PAYMENT", reference: "payroll-2026-07" }],
          },
        })
      );

      const [error, data] = await payouts.listPayouts({
        status: ["PENDING", "REJECTED"],
        fromDate: "2026-01-01",
        page: 1,
        limit: 10,
      });

      expect(error).toBeNull();
      expect(data!.records[0]!.id).toBe("payout-1");
      expect(data!.total).toBe(1);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("status=PENDING%2CREJECTED");
      expect(url).toContain("fromDate=2026-01-01");
    });

    it("rejects a malformed date filter", async () => {
      const [error, data] = await makeClient().listPayouts({ fromDate: "01/01/2026" });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("YYYY-MM-DD");
    });

    it("accepts the technical-reference payout statuses", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { records: [] } }));

      const [error] = await makeClient().listPayouts({
        status: ["AFE_REJECTED", "AFE_ON_HOLD"],
      });

      expect(error).toBeNull();
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("status=AFE_REJECTED%2CAFE_ON_HOLD");
    });
  });

  describe("getPayout", () => {
    it("unwraps the enveloped payout", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          status: 200,
          code: "OK",
          data: {
            id: "payout-1",
            status: "PARTIAL_PAYMENT",
            reference: "payroll-2026-07",
            amountInCents: 1_000_000,
            totalTransactions: 1,
          },
        })
      );

      const [error, data] = await payouts.getPayout("payout-1");

      expect(error).toBeNull();
      expect(data!.id).toBe("payout-1");
      expect(data!.amountInCents).toBe(1_000_000);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payouts/payout-1");
      expect(options.method).toBe("GET");
    });
  });

  describe("payout transactions", () => {
    it("lists the transactions of a batch with filters", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          data: {
            page: 1,
            records: [
              {
                id: "tx-1",
                status: "APPROVED",
                amountInCents: 1_000_000,
                payeeInfo: { name: "John Doe", bankCode: "BANCOLOMBIA" },
              },
            ],
          },
        })
      );

      const [error, data] = await payouts.listPayoutTransactions("payout-1", {
        status: "APPROVED",
        payeeName: "John",
      });

      expect(error).toBeNull();
      expect(data!.records[0]!.payeeInfo?.name).toBe("John Doe");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payouts/payout-1/transactions?");
      expect(url).toContain("status=APPROVED");
      expect(url).toContain("payeeName=John");
    });

    it("accepts transaction statuses from the technical reference", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ data: { records: [] } }));

      const [error] = await makeClient().listPayoutTransactions("payout-1", {
        status: ["READY_TO_FILE", "ADDED_TO_FILE"],
      });

      expect(error).toBeNull();
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("status=READY_TO_FILE%2CADDED_TO_FILE");
    });

    it("gets a single transaction of a batch", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({ data: { id: "tx-1", status: "FAILED", failureReason: "Cuenta inactiva" } })
      );

      const [error, data] = await payouts.getPayoutTransaction("payout-1", "tx-1");

      expect(error).toBeNull();
      expect(data!.status).toBe("FAILED");
      expect(data!.failureReason).toBe("Cuenta inactiva");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/payouts/payout-1/transactions/tx-1");
    });

    it("lists transactions by their payout reference", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({ data: { records: [{ id: "tx-1", status: "APPROVED", reference: "tx-ref" }] } })
      );

      const [error, data] = await payouts.listTransactionsByReference("batch-ref", {
        status: ["PROCESSING", "REJECTED"],
      });

      expect(error).toBeNull();
      expect(data!.records).toHaveLength(1);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/transactions/batch-ref");
      expect(url).toContain("status=PROCESSING&status=REJECTED");
    });
  });

  describe("banks, accounts and limits", () => {
    it("accepts the bare bank list the spec documents", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson([{ id: "bank-1", name: "Bancolombia", code: "BANCOLOMBIA", achCode: 1507 }])
      );

      const [error, data] = await payouts.listBanks();

      expect(error).toBeNull();
      expect(data![0]!.code).toBe("BANCOLOMBIA");
    });

    it("unwraps the enveloped account list with filters", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          data: [
            {
              id: "account-1",
              balanceInCents: 340_000_000,
              status: "ACTIVE",
              bank: { code: "BANCOLOMBIA", name: "Bancolombia" },
            },
          ],
        })
      );

      const [error, data] = await payouts.listAccounts({
        bankCodes: ["BANCOLOMBIA", "BANCO_BOGOTA"],
        status: "ACTIVE",
      });

      expect(error).toBeNull();
      expect(data![0]!.balanceInCents).toBe(340_000_000);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("bankCodes=BANCOLOMBIA%2CBANCO_BOGOTA");
      expect(url).toContain("status=ACTIVE");
    });

    it("returns the dispersion limits", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          numberOfTransactionsConsumed: 22,
          limits: { dailyLimit: 1_500_000_000, dailyAvailable: 1_499_800_000 },
        })
      );

      const [error, data] = await payouts.getLimits();

      expect(error).toBeNull();
      expect(data!.limits?.dailyLimit).toBe(1_500_000_000);
    });

    it("does not accept an invalid envelope as a bare limits payload", async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({ status: 200, code: "OK", message: "Invalid payload", data: null })
      );

      const [error, data] = await makeClient().getLimits();

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("Response validation failed");
    });
  });

  describe("reports", () => {
    it("lists reports with the required query params", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({ data: { reports: [{ _id: "report-1", status: "finished" }], total: 1 } })
      );

      const [error, data] = await payouts.listReports({
        periodicity: "weekly",
        reportType: "payouts",
      });

      expect(error).toBeNull();
      expect(data!.reports[0]!._id).toBe("report-1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("periodicity=weekly");
      expect(url).toContain("reportType=payouts");
    });

    it("rejects a report listing without required params", async () => {
      const [error, data] = await makeClient().listReports({ periodicity: "weekly" });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
    });

    it("returns the presigned CSV URL", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(okJson({ data: "https://example.com/report.csv" }));

      const [error, data] = await payouts.getReportDownloadUrl({
        reportExecutionId: "report-1",
        reportIntegration: "payouts",
      });

      expect(error).toBeNull();
      expect(data).toBe("https://example.com/report.csv");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/reports/presigned_url?");
      expect(url).toContain("reportExecutionId=report-1");
    });
  });

  describe("health", () => {
    it("unwraps the enveloped health payload", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(
        okJson({
          status: 200,
          code: "OK",
          data: {
            status: "HEALTHY",
            services: [
              { name: "users", healthy: true },
              { name: "payments", healthy: true },
            ],
          },
        })
      );

      const [error, data] = await payouts.getHealth();

      expect(error).toBeNull();
      expect(data!.status).toBe("HEALTHY");
      expect(data!.services).toHaveLength(2);
    });

    it("returns the health payload from an error envelope during an outage", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          code: "SERVICE_UNAVAILABLE",
          message: "Payout services are unavailable.",
          meta: { trace_id: "trace-123" },
          data: {
            status: "UNHEALTHY",
            services: [{ name: "payments", healthy: false }],
          },
        }),
      });

      const [error, data] = await makeClient().getHealth();

      expect(error).toBeNull();
      expect(data!.status).toBe("UNHEALTHY");
      expect(data!.services).toEqual([{ name: "payments", healthy: false }]);
    });
  });

  describe("rechargeAccountBalance", () => {
    it("recharges a sandbox account and returns the updated accounts", async () => {
      const payouts = makeClient();

      mockFetch.mockResolvedValueOnce(okJson([{ id: "account-1", balanceInCents: 340_000_000 }]));

      const [error, data] = await payouts.rechargeAccountBalance({
        accountId: "account-1",
        amountInCents: 340_000_000,
      });

      expect(error).toBeNull();
      expect(data![0]!.balanceInCents).toBe(340_000_000);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/accounts/balance-recharge");
      expect(options.method).toBe("POST");
    });

    it.each([10_000, 5_000_000_000])(
      "accepts amount %s from the union of the documented recharge ranges",
      async (amountInCents) => {
        mockFetch.mockResolvedValueOnce(okJson([]));

        const [error] = await makeClient().rechargeAccountBalance({
          accountId: "account-1",
          amountInCents,
        });

        expect(error).toBeNull();
      }
    );

    it("rejects an amount below both documented sandbox minimums", async () => {
      const [error, data] = await makeClient().rechargeAccountBalance({
        accountId: "account-1",
        amountInCents: 9_999,
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
    });

    it("rejects an amount above both documented sandbox maximums", async () => {
      const [error, data] = await makeClient().rechargeAccountBalance({
        accountId: "account-1",
        amountInCents: 5_000_000_001,
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
    });

    it("rejects the call on a production client without hitting the network", async () => {
      const [error, data] = await new WompiPayoutsClient({
        apiKey: API_KEY,
        userPrincipalId: USER_PRINCIPAL_ID,
      }).rechargeAccountBalance({ accountId: "account-1", amountInCents: 340_000_000 });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiError);
      expect(error!.message).toContain("sandbox");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
