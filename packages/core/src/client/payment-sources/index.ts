import { WompiRequest } from "@/request";
import {
  CreatePaymentSourceInputSchema,
  PaymentSourceSchema,
  WompiError,
  wompiResponse,
  type PaymentSource,
  type Result,
} from "@/schemas";

const PaymentSourceResponseSchema = wompiResponse(PaymentSourceSchema);

export class PaymentSources extends WompiRequest {
  constructor(
    private readonly privateKey: string | undefined,
    sandbox?: boolean
  ) {
    super({ sandbox });
  }

  /**
   * Get a payment source by ID.
   * Requires private key (BearerPrivateKey).
   */
  async getPaymentSource(id: number): Promise<Result<PaymentSource>> {
    if (!this.privateKey) {
      return [new WompiError("Private key is required for payment source operations"), null];
    }

    return this.get(`/payment_sources/${id}`, PaymentSourceResponseSchema, {
      Authorization: `Bearer ${this.privateKey}`,
    });
  }

  /**
   * Create a new payment source (CARD or NEQUI).
   * Requires private key (BearerPrivateKey).
   */
  async createPaymentSource(input: unknown): Promise<Result<PaymentSource>> {
    if (!this.privateKey) {
      return [new WompiError("Private key is required for payment source operations"), null];
    }

    const parsed = CreatePaymentSourceInputSchema.safeParse(input);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    return this.post("/payment_sources", PaymentSourceResponseSchema, parsed.data, {
      Authorization: `Bearer ${this.privateKey}`,
    });
  }
}
