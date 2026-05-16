import { WompiRequest } from "@/request";
import {
  TransactionSchema,
  TransactionListParamsSchema,
  CreateTransactionInputSchema,
  VoidTransactionInputSchema,
  VoidTransactionResultSchema,
  wompiResponse,
} from "@/schemas";
import { WompiError } from "@/errors/wompi-error";
import type { Transaction, Result, VoidTransactionResult, WompiResponse } from "@/types";

const TransactionResponseSchema = wompiResponse(TransactionSchema);
const TransactionListResponseSchema = wompiResponse(TransactionSchema.array());

// `POST /transactions/{id}/void` wraps the void outcome under `data` (with the
// voided transaction nested in `data.transaction`). The schema is also optional
// so an empty `201` body — which the spec documents — validates as `undefined`.
const VoidTransactionResponseSchema = wompiResponse(VoidTransactionResultSchema).optional();

export class Transactions extends WompiRequest {
  constructor(
    private readonly publicKey: string,
    private readonly privateKey: string | undefined,
    sandbox?: boolean
  ) {
    super({ sandbox });
  }

  /**
   * Get a single transaction by ID.
   * No authentication required.
   */
  async getTransaction(id: string): Promise<Result<WompiResponse<Transaction>>> {
    return this.get(`/transactions/${id}`, TransactionResponseSchema);
  }

  /**
   * List transactions matching filter criteria.
   * Requires private key (BearerPrivateKey).
   */
  async listTransactions(params: unknown = {}): Promise<Result<WompiResponse<Transaction[]>>> {
    if (!this.privateKey) {
      return [new WompiError("Private key is required for this operation"), null];
    }

    const parsed = TransactionListParamsSchema.safeParse(params);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid parameters: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    const queryUrl = this.buildQueryUrl(parsed.data);

    return this.get(queryUrl, TransactionListResponseSchema, {
      Authorization: `Bearer ${this.privateKey}`,
    });
  }

  /**
   * Create a new transaction.
   * Requires public key (BearerPublicKey). If using payment_source_id, use private key instead.
   */
  async createTransaction(input: unknown): Promise<Result<WompiResponse<Transaction>>> {
    const parsed = CreateTransactionInputSchema.safeParse(input);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    const data = parsed.data;
    const authKey = data.payment_source_id ? this.privateKey : this.publicKey;

    if (data.payment_source_id && !this.privateKey) {
      return [
        new WompiError(
          "Private key is required when creating transactions with a payment_source_id"
        ),
        null,
      ];
    }

    return this.post("/transactions", TransactionResponseSchema, data, {
      Authorization: `Bearer ${authKey}`,
    });
  }

  /**
   * Void an approved CARD transaction.
   * Requires private key (BearerPrivateKey).
   *
   * On success `data` carries the void outcome, with the voided transaction
   * under `data.transaction`; it resolves to `undefined` for an empty `201`.
   */
  async voidTransaction(
    transactionId: string,
    input?: unknown
  ): Promise<Result<WompiResponse<VoidTransactionResult> | undefined>> {
    if (!this.privateKey) {
      return [new WompiError("Private key is required for this operation"), null];
    }

    if (input !== undefined) {
      const parsed = VoidTransactionInputSchema.safeParse(input);

      if (!parsed.success) {
        return [
          new WompiError(
            `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
          ),
          null,
        ];
      }

      return this.post(
        `/transactions/${transactionId}/void`,
        VoidTransactionResponseSchema,
        parsed.data,
        { Authorization: `Bearer ${this.privateKey}` }
      );
    }

    return this.post(
      `/transactions/${transactionId}/void`,
      VoidTransactionResponseSchema,
      undefined,
      { Authorization: `Bearer ${this.privateKey}` }
    );
  }

  private buildQueryUrl(params: Record<string, unknown>): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }

    const qs = searchParams.toString();

    return qs ? `/transactions?${qs}` : "/transactions";
  }
}
