import { BaseResource } from '../base';
import type { WompiResponse } from '../types';

export interface MerchantData {
  id: number;
  name: string;
  email: string;
  contact_name: string;
  phone_number: string;
  active: boolean;
  logo_url: string | null;
  legal_name: string;
  legal_id_type: string;
  legal_id: string;
  public_key: string;
  accepted_currencies: string[];
  fraud_javascript_key: string | null;
  fraud_groups: unknown[];
  accepted_payment_methods: string[];
  payment_methods: PaymentMethod[];
  presigned_acceptance: PresignedAcceptance;
}

export interface PaymentMethod {
  name: string;
  payment_processors: PaymentProcessor[];
}

export interface PaymentProcessor {
  name: string;
}

export interface PresignedAcceptance {
  acceptance_token: string;
  permalink: string;
  type: string;
}

export class Merchants extends BaseResource {
  private readonly publicKey: string;

  constructor(baseUrl: string, publicKey: string) {
    super(baseUrl);
    this.publicKey = publicKey;
  }

  /**
   * Get merchant information and acceptance token
   * @returns Merchant data including presigned acceptance token
   */
  async getMerchantInfo(): Promise<WompiResponse<MerchantData>> {
    return super.get<WompiResponse<MerchantData>>(`/merchants/${this.publicKey}`);
  }

  /**
   * Get the acceptance token for the merchant
   * @returns The acceptance token
   */
  async getAcceptanceToken(): Promise<string> {
    const response = await this.getMerchantInfo();
    return response.data.presigned_acceptance.acceptance_token;
  }
}
