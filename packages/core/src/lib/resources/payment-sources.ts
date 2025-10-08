import { BaseResource } from '../base';
import type { WompiResponse } from '../types';

export interface PaymentSourceData {
  id: number;
  type: 'CARD' | 'NEQUI' | 'BANCOLOMBIA_TRANSFER';
  status: 'AVAILABLE' | 'UNAVAILABLE';
  created_at: string;
  public_data: {
    bin?: string;
    last_four?: string;
    exp_month?: string;
    exp_year?: string;
    card_holder?: string;
    brand?: string;
  };
  customer_email?: string;
}

export interface CreateCardSourceParams {
  type: 'CARD';
  token: string;
  customer_email: string;
  acceptance_token: string;
}

export interface CreateNequiSourceParams {
  type: 'NEQUI';
  phone_number: string;
}

export interface TokenizeCardParams {
  number: string;
  cvc: string;
  exp_month: string;
  exp_year: string;
  card_holder: string;
}

export interface TokenizeCardResponse {
  id: string;
  created_at: string;
  brand: string;
  name: string;
  last_four: string;
  bin: string;
  exp_year: string;
  exp_month: string;
  card_holder: string;
  expires_at: string;
}

export type CreatePaymentSourceParams = CreateCardSourceParams | CreateNequiSourceParams;

export class PaymentSources extends BaseResource {
  private readonly publicKey: string;

  constructor(baseUrl: string, publicKey: string) {
    super(baseUrl);
    this.publicKey = publicKey;
  }

  /**
   * Tokenize a credit/debit card
   * @param params - Card details
   * @returns Tokenized card data
   */
  async tokenizeCard(params: TokenizeCardParams): Promise<WompiResponse<TokenizeCardResponse>> {
    return super.post<WompiResponse<TokenizeCardResponse>>(
      '/tokens/cards',
      params,
      { Authorization: `Bearer ${this.publicKey}` }
    );
  }

  /**
   * Create a payment source (saved payment method)
   * @param params - Payment source details
   * @returns Created payment source
   */
  async create(params: CreatePaymentSourceParams): Promise<WompiResponse<PaymentSourceData>> {
    return super.post<WompiResponse<PaymentSourceData>>(
      '/payment_sources',
      params,
      { Authorization: `Bearer ${this.publicKey}` }
    );
  }

  /**
   * Get a payment source by ID
   * @param id - Payment source ID
   * @returns Payment source data
   */
  async getById(id: string): Promise<WompiResponse<PaymentSourceData>> {
    return super.get<WompiResponse<PaymentSourceData>>(
      `/payment_sources/${id}`,
      { Authorization: `Bearer ${this.publicKey}` }
    );
  }

  /**
   * Delete a payment source
   * @param id - Payment source ID
   */
  async remove(id: string): Promise<void> {
    await super.delete<void>(
      `/payment_sources/${id}`,
      { Authorization: `Bearer ${this.publicKey}` }
    );
  }
}
