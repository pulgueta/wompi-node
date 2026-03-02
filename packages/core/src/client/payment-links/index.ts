import { WompiRequest } from "@/index";
import { WompiError } from "@/errors/wompi-error";
import {
  PaymentLinkSchema,
  CreatePaymentLinkInputSchema,
  UpdatePaymentLinkInputSchema,
  wompiResponse,
} from "@/schemas";
import type { PaymentLink, Result, WompiResponse } from "@/types";

const PaymentLinkResponseSchema = wompiResponse(PaymentLinkSchema);

export class PaymentLinks extends WompiRequest {
  constructor(
    private readonly privateKey: string | undefined,
    sandbox?: boolean
  ) {
    super({ sandbox });
  }

  /**
   * Get a payment link by ID.
   * No authentication required.
   */
  async getPaymentLink(id: string): Promise<Result<WompiResponse<PaymentLink>>> {
    return this.get(`/payment_links/${id}`, PaymentLinkResponseSchema);
  }

  /**
   * Create a new payment link.
   * Requires private key (BearerPrivateKey).
   */
  async createPaymentLink(input: unknown): Promise<Result<WompiResponse<PaymentLink>>> {
    if (!this.privateKey) {
      return [new WompiError("Private key is required for payment link operations"), null];
    }

    const parsed = CreatePaymentLinkInputSchema.safeParse(input);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    return this.post("/payment_links", PaymentLinkResponseSchema, parsed.data, {
      Authorization: `Bearer ${this.privateKey}`,
    });
  }

  /**
   * Activate or deactivate a payment link.
   * Requires private key (BearerPrivateKey).
   */
  async updatePaymentLink(id: string, input: unknown): Promise<Result<WompiResponse<PaymentLink>>> {
    if (!this.privateKey) {
      return [new WompiError("Private key is required for payment link operations"), null];
    }

    const parsed = UpdatePaymentLinkInputSchema.safeParse(input);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    return this.patch(`/payment_links/${id}`, PaymentLinkResponseSchema, parsed.data, {
      Authorization: `Bearer ${this.privateKey}`,
    });
  }
}
