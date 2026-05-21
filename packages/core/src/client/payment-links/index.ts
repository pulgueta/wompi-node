import { WompiRequest } from "@/request";
import { WompiError } from "@/errors/wompi-error";
import {
  PaymentLinkSchema,
  CreatePaymentLinkInputSchema,
  UpdatePaymentLinkInputSchema,
  wompiResponse,
} from "@/schemas";
import type { PaymentLink, Result, WompiResponse } from "@/types";

const CHECKOUT_BASE_URL = "https://checkout.wompi.co";

const PaymentLinkResponseSchema = wompiResponse(PaymentLinkSchema);

function withCheckoutUrl(response: WompiResponse<PaymentLink>): WompiResponse<PaymentLink> {
  return {
    ...response,
    data: {
      ...response.data,
      checkout_url: `${CHECKOUT_BASE_URL}/l/${response.data.id}`,
    },
  };
}

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
    const [error, response] = await this.get(`/payment_links/${id}`, PaymentLinkResponseSchema);
    if (error) return [error, null];
    return [null, withCheckoutUrl(response)];
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

    const [error, response] = await this.post(
      "/payment_links",
      PaymentLinkResponseSchema,
      parsed.data,
      {
        Authorization: `Bearer ${this.privateKey}`,
      }
    );
    if (error) return [error, null];
    return [null, withCheckoutUrl(response)];
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

    const [error, response] = await this.patch(
      `/payment_links/${id}`,
      PaymentLinkResponseSchema,
      parsed.data,
      {
        Authorization: `Bearer ${this.privateKey}`,
      }
    );
    if (error) return [error, null];
    return [null, withCheckoutUrl(response)];
  }
}
