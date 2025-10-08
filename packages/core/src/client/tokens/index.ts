import { WompiRequest } from "@/lib/request";
import type { RequestClientOptions } from "@/lib/request";

export type CreateCardTokenRequest = {
  readonly number: string;
  readonly cvc: string;
  readonly exp_month: string;
  readonly exp_year: string;
  readonly card_holder?: string;
};

export type TokenResponse<T = unknown> = {
  readonly data: T;
  readonly meta: Record<string, unknown>;
};

export type CardTokenData = {
  readonly id: string;
  readonly status: string;
  readonly bin: string;
  readonly type: string;
  readonly last_four: string;
  readonly exp_month: string;
  readonly exp_year: string;
  readonly card_holder?: string;
};

export class Tokens extends WompiRequest {
  constructor(private readonly authorizationToken: string, options?: RequestClientOptions) {
    super(options);
  }

  async createCardToken(payload: CreateCardTokenRequest) {
    return this.post<TokenResponse<CardTokenData>>(
      "/tokens/cards",
      { Authorization: this.authorizationToken },
      payload
    );
  }
}

