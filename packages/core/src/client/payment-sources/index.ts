import { WompiRequest } from "@/lib/request";
import type { RequestClientOptions } from "@/lib/request";

export type CreatePaymentSourceRequest = {
  readonly type: "CARD" | "NEQUI" | "BANCOLOMBIA" | "PSE";
  readonly token: string; // token id from tokens endpoint
  readonly customer_email: string;
  readonly acceptance_token: string;
};

export type PaymentSourceResponse<T = unknown> = {
  readonly data: T;
  readonly meta: Record<string, unknown>;
};

export type PaymentSourceData = {
  readonly id: number;
  readonly type: string;
  readonly status: string;
  readonly token: string;
  readonly customer_email: string;
};

export class PaymentSources extends WompiRequest {
  constructor(private readonly authorizationToken: string, options?: RequestClientOptions) {
    super(options);
  }

  async create(payload: CreatePaymentSourceRequest) {
    return this.post<PaymentSourceResponse<PaymentSourceData>>("/payment_sources", undefined, payload);
  }
}

