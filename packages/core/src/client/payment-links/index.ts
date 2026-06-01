import { WompiRequest } from "@/request";
import {
  CreatePaymentLinkInputSchema,
  PaymentLinkSchema,
  UpdatePaymentLinkInputSchema,
  WompiError,
  wompiResponse,
  type PaymentLink,
  type Result,
} from "@/schemas";

const CHECKOUT_BASE_URL = "https://checkout.wompi.co";

const PaymentLinkResponseSchema = wompiResponse(PaymentLinkSchema);

const withCheckoutUrl = (link: PaymentLink): PaymentLink => ({
  ...link,
  checkout_url: `${CHECKOUT_BASE_URL}/l/${link.id}`,
});

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
  async getPaymentLink(id: string): Promise<Result<PaymentLink>> {
    const [error, link] = await this.get(`/payment_links/${id}`, PaymentLinkResponseSchema);
    if (error) return [error, null];
    return [null, withCheckoutUrl(link)];
  }

  /**
   * Create a new payment link.
   * Requires private key (BearerPrivateKey).
   */
  async createPaymentLink(input: unknown): Promise<Result<PaymentLink>> {
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

    const [error, link] = await this.post(
      "/payment_links",
      PaymentLinkResponseSchema,
      parsed.data,
      {
        Authorization: `Bearer ${this.privateKey}`,
      }
    );
    if (error) return [error, null];
    return [null, withCheckoutUrl(link)];
  }

  /**
   * Activate or deactivate a payment link.
   * Requires private key (BearerPrivateKey).
   */
  async updatePaymentLink(id: string, input: unknown): Promise<Result<PaymentLink>> {
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

    const [error, link] = await this.patch(
      `/payment_links/${id}`,
      PaymentLinkResponseSchema,
      parsed.data,
      {
        Authorization: `Bearer ${this.privateKey}`,
      }
    );
    if (error) return [error, null];
    return [null, withCheckoutUrl(link)];
  }
}
