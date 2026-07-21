import { z } from "zod";

import { WompiRequest } from "@/request";
import {
  CreatePayoutFileInputSchema,
  CreatePayoutInputSchema,
  CreatePayoutResultSchema,
  PAYOUT_FILE_EXTENSIONS,
  PayoutAccountListParamsSchema,
  PayoutApiErrorResponseSchema,
  PayoutAccountSchema,
  PayoutBankSchema,
  PayoutHealthSchema,
  PayoutIdempotencyKeySchema,
  PayoutLimitsSchema,
  PayoutListParamsSchema,
  PayoutReportListParamsSchema,
  PayoutReportPageSchema,
  PayoutReportUrlParamsSchema,
  PayoutSchema,
  PayoutTransactionListParamsSchema,
  PayoutTransactionSchema,
  PayoutTransactionsByReferenceParamsSchema,
  RechargePayoutAccountInputSchema,
  WompiError,
  WompiPayoutApiError,
  WompiPayoutsClientOptionsSchema,
  isGzipPayoutFile,
  payoutPage,
  wompiResponse,
} from "@/schemas";
import type {
  CreatePayoutResult,
  Payout,
  PayoutAccount,
  PayoutBank,
  PayoutHealth,
  PayoutLimits,
  PayoutPage,
  PayoutReportPage,
  PayoutTransaction,
  Result,
} from "@/schemas";

const PAYOUT_BASE_URLS = {
  production: "https://api.payouts.wompi.co/v1",
  sandbox: "https://api.sandbox.payouts.wompi.co/v1",
} as const;

/**
 * The Payouts API is inconsistent about its envelope: most endpoints wrap the
 * payload as `{ status, code, message, meta, data }`, but a few (`/banks`,
 * `/limits`, `/accounts/balance-recharge`) answer with the bare payload.
 * Accepting both keeps every call resilient to either shape.
 */
const looksLikePayoutEnvelope = (value: unknown): boolean =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "data" in value &&
  ("code" in value || "message" in value || "meta" in value);

const payoutResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.union([
    wompiResponse(dataSchema),
    dataSchema.refine((value) => !looksLikePayoutEnvelope(value), {
      message: "An invalid response envelope cannot be used as a bare payout payload",
    }),
  ]);

const CreatePayoutResponseSchema = payoutResponse(CreatePayoutResultSchema);
const PayoutResponseSchema = payoutResponse(PayoutSchema);
const PayoutPageResponseSchema = payoutResponse(payoutPage(PayoutSchema));
const PayoutTransactionResponseSchema = payoutResponse(PayoutTransactionSchema);
const PayoutTransactionPageResponseSchema = payoutResponse(payoutPage(PayoutTransactionSchema));
const PayoutBankListResponseSchema = payoutResponse(PayoutBankSchema.array());
const PayoutAccountListResponseSchema = payoutResponse(PayoutAccountSchema.array());
const PayoutLimitsResponseSchema = payoutResponse(PayoutLimitsSchema);
const PayoutReportPageResponseSchema = payoutResponse(PayoutReportPageSchema);
const PayoutReportUrlResponseSchema = payoutResponse(z.string());
const PayoutHealthResponseSchema = payoutResponse(PayoutHealthSchema);

/** Validate SDK-side input, flattening zod issues into a single WompiError. */
const parseWith = <T>(schema: z.ZodType<T>, value: unknown, label: string): Result<T> => {
  const parsed = schema.safeParse(value);

  if (parsed.success) return [null, parsed.data];

  const issues = parsed.error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");

  return [new WompiError(`${label}: ${issues}`), null];
};

/**
 * Client for Wompi's Pagos a Terceros (Payouts) API — bank account dispersions.
 *
 * This API lives on its own host and authenticates with the `x-api-key` and
 * `user-principal-id` headers from the Payouts developers section of the Wompi
 * dashboard, so it is a separate client from {@link WompiClient}.
 *
 * @example
 * ```ts
 * const payouts = new WompiPayoutsClient({
 *   apiKey: process.env.WOMPI_PAYOUTS_API_KEY!,
 *   userPrincipalId: process.env.WOMPI_PAYOUTS_USER_PRINCIPAL_ID!,
 *   sandbox: true,
 * });
 *
 * const [error, created] = await payouts.createPayout(
 *   {
 *     reference: "payroll-2026-07",
 *     accountId: "account-id",
 *     paymentType: "PAYROLL",
 *     transactions: [
 *       {
 *         legalIdType: "CC",
 *         legalId: "1000000000",
 *         bankId: "bank-id",
 *         accountType: "AHORROS",
 *         accountNumber: "12345678",
 *         personType: "NATURAL",
 *         name: "John Doe",
 *         email: "john@example.com",
 *         amount: 1_000_000,
 *       },
 *     ],
 *   },
 *   { idempotencyKey: "payroll-2026-07" }
 * );
 * ```
 */
export class WompiPayoutsClient extends WompiRequest {
  private readonly authHeaders: Record<string, string>;

  constructor(options: unknown) {
    const parsed = WompiPayoutsClientOptionsSchema.safeParse(options);

    if (!parsed.success) {
      throw new WompiError(
        `Invalid client options: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
      );
    }

    const { apiKey, userPrincipalId, sandbox } = parsed.data;

    super({
      baseUrl: sandbox ? PAYOUT_BASE_URLS.sandbox : PAYOUT_BASE_URLS.production,
      errorMapper: (statusCode, body) => {
        const error = PayoutApiErrorResponseSchema.safeParse(body);
        return error.success ? new WompiPayoutApiError(statusCode, error.data) : null;
      },
    });

    this.authHeaders = {
      "x-api-key": apiKey,
      "user-principal-id": userPrincipalId,
    };
  }

  /**
   * Create a payout batch (`POST /payouts`) with the transaction detail as JSON.
   *
   * Immediate by default; add `dispersionDatetime` to schedule it, and
   * `recurring` on top of that for recurring batches. Wompi rejects a reused
   * `idempotencyKey` (`EXC_022`) within 24 hours; persist the returned payout ID
   * and reference for retries beyond that window.
   */
  async createPayout(
    input: unknown,
    options: { idempotencyKey: string }
  ): Promise<Result<CreatePayoutResult>> {
    const [keyError, idempotencyKey] = parseWith(
      PayoutIdempotencyKeySchema,
      options?.idempotencyKey,
      "Invalid idempotency key"
    );
    if (keyError) return [keyError, null];

    const [inputError, body] = parseWith(CreatePayoutInputSchema, input, "Invalid input");
    if (inputError) return [inputError, null];

    return this.post("/payouts", CreatePayoutResponseSchema, body, {
      ...this.authHeaders,
      "idempotency-key": idempotencyKey,
    });
  }

  /**
   * Create a payout batch from a file (`POST /payouts/file`) in one of the
   * supported bank formats (WOMPI CSV, PAB, SAP, DISFON, BANCO_OCCIDENTE_FC,
   * DAVIVIENDA). Gzipped files also require `fileName` and `fileMime`.
   */
  async createPayoutFromFile(
    input: unknown,
    options: { idempotencyKey: string }
  ): Promise<Result<CreatePayoutResult>> {
    const [keyError, idempotencyKey] = parseWith(
      PayoutIdempotencyKeySchema,
      options?.idempotencyKey,
      "Invalid idempotency key"
    );
    if (keyError) return [keyError, null];

    const [inputError, parsed] = parseWith(CreatePayoutFileInputSchema, input, "Invalid input");
    if (inputError) return [inputError, null];

    const { file, ...fields } = parsed;
    const form = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) form.append(key, String(value));
    }

    // The multipart part must keep the uploaded file's own name — a compressed
    // upload has to reach Wompi as a `.gz` file, while the original name only
    // travels in the `fileName` field. Bare blobs get a deterministic name so
    // the request does not vary across FormData implementations.
    if (typeof File !== "undefined" && file instanceof File) {
      form.append("file", file);
    } else if (isGzipPayoutFile(file)) {
      form.append("file", file, `${parsed.fileName}.gz`);
    } else {
      form.append(
        "file",
        file,
        parsed.fileName ?? `payout-batch${PAYOUT_FILE_EXTENSIONS[parsed.fileType]}`
      );
    }

    return this.post("/payouts/file", CreatePayoutResponseSchema, form, {
      ...this.authHeaders,
      "idempotency-key": idempotencyKey,
    });
  }

  /** List payout batches (`GET /payouts`), optionally filtered and paginated. */
  async listPayouts(params: unknown = {}): Promise<Result<PayoutPage<Payout>>> {
    const [error, query] = parseWith(PayoutListParamsSchema, params, "Invalid parameters");
    if (error) return [error, null];

    return this.get(
      this.buildQueryUrl("/payouts", query),
      PayoutPageResponseSchema,
      this.authHeaders
    );
  }

  /** Get a single payout batch by ID (`GET /payouts/{payoutId}`). */
  async getPayout(payoutId: string): Promise<Result<Payout>> {
    return this.get(`/payouts/${payoutId}`, PayoutResponseSchema, this.authHeaders);
  }

  /** List the transactions of a batch (`GET /payouts/{payoutId}/transactions`). */
  async listPayoutTransactions(
    payoutId: string,
    params: unknown = {}
  ): Promise<Result<PayoutPage<PayoutTransaction>>> {
    const [error, query] = parseWith(
      PayoutTransactionListParamsSchema,
      params,
      "Invalid parameters"
    );
    if (error) return [error, null];

    return this.get(
      this.buildQueryUrl(`/payouts/${payoutId}/transactions`, query),
      PayoutTransactionPageResponseSchema,
      this.authHeaders
    );
  }

  /** Get a single transaction of a batch (`GET /payouts/{payoutId}/transactions/{transactionId}`). */
  async getPayoutTransaction(
    payoutId: string,
    transactionId: string
  ): Promise<Result<PayoutTransaction>> {
    return this.get(
      `/payouts/${payoutId}/transactions/${transactionId}`,
      PayoutTransactionResponseSchema,
      this.authHeaders
    );
  }

  /** List a batch's transactions by the payout reference (`GET /transactions/{reference}`). */
  async listTransactionsByReference(
    payoutReference: string,
    params: unknown = {}
  ): Promise<Result<PayoutPage<PayoutTransaction>>> {
    const [error, query] = parseWith(
      PayoutTransactionsByReferenceParamsSchema,
      params,
      "Invalid parameters"
    );
    if (error) return [error, null];

    return this.get(
      this.buildQueryUrl(`/transactions/${encodeURIComponent(payoutReference)}`, query),
      PayoutTransactionPageResponseSchema,
      this.authHeaders
    );
  }

  /** List the banks available as dispersion destinations (`GET /banks`). */
  async listBanks(): Promise<Result<PayoutBank[]>> {
    return this.get("/banks", PayoutBankListResponseSchema, this.authHeaders);
  }

  /**
   * List the merchant's origin accounts with their balance (`GET /accounts`).
   * `balanceInCents` is expressed in cents. Pass the returned `id` as the
   * `accountId` of a payout batch.
   */
  async listAccounts(params: unknown = {}): Promise<Result<PayoutAccount[]>> {
    const [error, query] = parseWith(PayoutAccountListParamsSchema, params, "Invalid parameters");
    if (error) return [error, null];

    return this.get(
      this.buildQueryUrl("/accounts", query),
      PayoutAccountListResponseSchema,
      this.authHeaders
    );
  }

  /** Get the dispersion limits and consumption (`GET /limits`), in cents. */
  async getLimits(): Promise<Result<PayoutLimits>> {
    return this.get("/limits", PayoutLimitsResponseSchema, this.authHeaders);
  }

  /** List the generated payout reports (`GET /reports/payouts`). */
  async listReports(params: unknown): Promise<Result<PayoutReportPage>> {
    const [error, query] = parseWith(PayoutReportListParamsSchema, params, "Invalid parameters");
    if (error) return [error, null];

    return this.get(
      this.buildQueryUrl("/reports/payouts", query),
      PayoutReportPageResponseSchema,
      this.authHeaders
    );
  }

  /** Get a presigned URL to download a report's CSV (`GET /reports/presigned_url`). */
  async getReportDownloadUrl(params: unknown): Promise<Result<string>> {
    const [error, query] = parseWith(PayoutReportUrlParamsSchema, params, "Invalid parameters");
    if (error) return [error, null];

    return this.get(
      this.buildQueryUrl("/reports/presigned_url", query),
      PayoutReportUrlResponseSchema,
      this.authHeaders
    );
  }

  /** Check the availability of the Payouts services (`GET /health`). */
  async getHealth(): Promise<Result<PayoutHealth>> {
    return this.get("/health", PayoutHealthResponseSchema, this.authHeaders);
  }

  /**
   * Recharge a test account's balance (`POST /accounts/balance-recharge`).
   * **Sandbox only** — the production API does not expose this endpoint.
   */
  async rechargeAccountBalance(input: unknown): Promise<Result<PayoutAccount[]>> {
    const [error, body] = parseWith(RechargePayoutAccountInputSchema, input, "Invalid input");
    if (error) return [error, null];

    return this.post(
      "/accounts/balance-recharge",
      PayoutAccountListResponseSchema,
      body,
      this.authHeaders
    );
  }

  private buildQueryUrl(endpoint: string, params: Record<string, unknown>): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) searchParams.append(key, String(item));
      } else if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }

    const qs = searchParams.toString();

    return qs ? `${endpoint}?${qs}` : endpoint;
  }
}
