import { BaseResource } from '../base';
import type { WompiResponse } from '../types';

export interface PaymentLinkData {
  id: string;
  created_at: string;
  active: boolean;
  name: string;
  description: string;
  single_use: boolean;
  collect_shipping: boolean;
  currency: string;
  amount_in_cents: number;
  expires_at: string | null;
  image_url: string | null;
  redirect_url: string | null;
  url: string;
  sku?: string;
}

export interface CreatePaymentLinkParams {
  name: string;
  description: string;
  single_use: boolean;
  collect_shipping?: boolean;
  currency: string;
  amount_in_cents: number;
  expires_at?: string;
  image_url?: string;
  redirect_url?: string;
  sku?: string;
}

export interface UpdatePaymentLinkParams {
  name?: string;
  description?: string;
  image_url?: string;
  redirect_url?: string;
  expires_at?: string;
  active?: boolean;
}

export class PaymentLinks extends BaseResource {
  private readonly privateKey?: string;

  constructor(baseUrl: string, privateKey?: string) {
    super(baseUrl);
    this.privateKey = privateKey;
  }

  private ensurePrivateKey(): void {
    if (!this.privateKey) {
      throw new Error('Private key is required for payment link operations');
    }
  }

  /**
   * Create a payment link
   * @param params - Payment link details
   * @returns Created payment link
   */
  async create(params: CreatePaymentLinkParams): Promise<WompiResponse<PaymentLinkData>> {
    this.ensurePrivateKey();
    
    return super.post<WompiResponse<PaymentLinkData>>(
      '/payment_links',
      params,
      { Authorization: `Bearer ${this.privateKey}` }
    );
  }

  /**
   * Get a payment link by ID
   * @param id - Payment link ID
   * @returns Payment link data
   */
  async getById(id: string): Promise<WompiResponse<PaymentLinkData>> {
    this.ensurePrivateKey();
    
    return super.get<WompiResponse<PaymentLinkData>>(
      `/payment_links/${id}`,
      { Authorization: `Bearer ${this.privateKey}` }
    );
  }

  /**
   * Update a payment link
   * @param id - Payment link ID
   * @param params - Updated payment link details
   * @returns Updated payment link
   */
  async update(id: string, params: UpdatePaymentLinkParams): Promise<WompiResponse<PaymentLinkData>> {
    this.ensurePrivateKey();
    
    return super.patch<WompiResponse<PaymentLinkData>>(
      `/payment_links/${id}`,
      params,
      { Authorization: `Bearer ${this.privateKey}` }
    );
  }

  /**
   * Deactivate a payment link
   * @param id - Payment link ID
   */
  async deactivate(id: string): Promise<WompiResponse<PaymentLinkData>> {
    return this.update(id, { active: false });
  }

  /**
   * Activate a payment link
   * @param id - Payment link ID
   */
  async activate(id: string): Promise<WompiResponse<PaymentLinkData>> {
    return this.update(id, { active: true });
  }
}
