import { WompiRequest } from "@/request";
import {
  BrebKeyResolutionSchema,
  BrebKeyTypeSchema,
  CreatePayoutInputSchema,
  CreatePayoutResultSchema,
  PayoutSchema,
  PayoutTransactionPageSchema,
  WompiError,
  wompiResponse,
} from "@/schemas";
import type {
  BrebKeyResolution,
  CreatePayoutResult,
  Payout,
  PayoutTransactionPage,
  PayoutsCredentials,
  Result,
} from "@/schemas";

const KeyResolutionResponseSchema = wompiResponse(BrebKeyResolutionSchema);
const CreatePayoutResponseSchema = wompiResponse(CreatePayoutResultSchema);
const PayoutResponseSchema = wompiResponse(PayoutSchema);
const PayoutTransactionsResponseSchema = wompiResponse(PayoutTransactionPageSchema);

/** Wompi requires 1-64 characters: letters, numbers, and hyphens only. */
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

const missingCredentialsError = () =>
  new WompiError(
    "Payouts credentials are required for BRE-B operations: pass `payouts: { apiKey, userPrincipalId }` to the WompiClient"
  );

const authHeaders = ({ apiKey, userPrincipalId }: PayoutsCredentials): Record<string, string> => ({
  "x-api-key": apiKey,
  "user-principal-id": userPrincipalId,
});

/**
 * BRE-B dispersals over the payouts API (Pagos a Terceros). Runs against
 * `api.payouts.wompi.co` — a different host and credential pair than the
 * payments API. Requires `payouts.apiKey` and `payouts.userPrincipalId`.
 */
export class Breb extends WompiRequest {
  constructor(
    private readonly credentials: PayoutsCredentials | undefined,
    private readonly sandbox = false
  ) {
    super({ sandbox, api: "payouts" });
  }

  /**
   * Resolve a BRE-B key and get the (masked) holder information before paying.
   * Read-only: no transaction or fund movement happens. Show the holder data
   * to your user for confirmation before creating the payout.
   *
   * @param keyValue The BRE-B key (e.g. `@JUANPEREZ`, `juan@email.com`, `3001234567`).
   * @param keyType Optional; when sent, Wompi validates the key format against it.
   */
  async resolveKey(keyValue: string, keyType?: unknown): Promise<Result<BrebKeyResolution>> {
    const { credentials } = this;
    if (!credentials) return [missingCredentialsError(), null];

    if (!keyValue) {
      return [new WompiError("resolveKey: keyValue must be a non-empty string"), null];
    }

    let endpoint = `/breb/keys/resolve/${encodeURIComponent(keyValue)}`;

    if (keyType !== undefined) {
      const parsed = BrebKeyTypeSchema.safeParse(keyType);

      if (!parsed.success) {
        return [
          new WompiError(`Invalid keyType: must be one of ${BrebKeyTypeSchema.options.join(", ")}`),
          null,
        ];
      }

      endpoint += `?keyType=${parsed.data}`;
    }

    return this.get(endpoint, KeyResolutionResponseSchema, authHeaders(credentials));
  }

  /**
   * Create a payout batch. Each transaction pays a beneficiary either by
   * BRE-B `key` or by traditional bank fields; both can be mixed in one batch.
   *
   * @param input The batch: `reference`, `accountId`, `paymentType` and `transactions`.
   * @param idempotencyKey Unique per payment request (1-64 chars: letters,
   *   numbers, hyphens). Reusing one within 24 hours returns a 409.
   */
  async createPayout(input: unknown, idempotencyKey: string): Promise<Result<CreatePayoutResult>> {
    const { credentials } = this;
    if (!credentials) return [missingCredentialsError(), null];

    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return [
        new WompiError(
          "idempotencyKey must be 1 to 64 characters of letters, numbers, and hyphens"
        ),
        null,
      ];
    }

    const parsed = CreatePayoutInputSchema.safeParse(input);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    if (!this.sandbox && parsed.data.transactionStatus !== undefined) {
      return [new WompiError("transactionStatus is available only in sandbox"), null];
    }

    return this.post("/payouts", CreatePayoutResponseSchema, parsed.data, {
      ...authHeaders(credentials),
      "idempotency-key": idempotencyKey,
    });
  }

  /** Get a payout batch by ID — an alternative to waiting for `payout.updated` events. */
  async getPayout(payoutId: string): Promise<Result<Payout>> {
    const { credentials } = this;
    if (!credentials) return [missingCredentialsError(), null];

    return this.get(
      `/payouts/${encodeURIComponent(payoutId)}`,
      PayoutResponseSchema,
      authHeaders(credentials)
    );
  }

  /**
   * List the individual transactions of a payout batch.
   *
   * Returns the provider's pagination fields and the transactions in `records`.
   *
   * @param options Optional `limit` and `page` (positive integers) to paginate large batches.
   */
  async getPayoutTransactions(
    payoutId: string,
    options?: { limit?: number; page?: number }
  ): Promise<Result<PayoutTransactionPage>> {
    const { credentials } = this;
    if (!credentials) return [missingCredentialsError(), null];

    for (const name of ["limit", "page"] as const) {
      const value = options?.[name];
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
        return [new WompiError(`${name} must be a positive integer`), null];
      }
    }

    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.page !== undefined) params.set("page", String(options.page));
    const query = params.toString();

    return this.get(
      `/payouts/${encodeURIComponent(payoutId)}/transactions${query ? `?${query}` : ""}`,
      PayoutTransactionsResponseSchema,
      authHeaders(credentials)
    );
  }
}
