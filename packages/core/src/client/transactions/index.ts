import { WompiRequest } from "@/index";
import {
  TransactionSchema,
  TransactionListParamsSchema,
  CreateTransactionInputSchema,
  VoidTransactionInputSchema,
  wompiResponse,
} from "@/schemas";
import { WompiError } from "@/errors/wompi-error";
import type { Transaction, Result, WompiResponse } from "@/types";

const TransactionResponseSchema = wompiResponse(TransactionSchema);
const TransactionListResponseSchema = wompiResponse(TransactionSchema.array());

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
   */
  async voidTransaction(
    transactionId: string,
    input?: unknown
  ): Promise<Result<WompiResponse<Transaction>>> {
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
        TransactionResponseSchema,
        parsed.data,
        { Authorization: `Bearer ${this.privateKey}` }
      );
    }

    return this.post(`/transactions/${transactionId}/void`, TransactionResponseSchema, undefined, {
      Authorization: `Bearer ${this.privateKey}`,
    });
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
