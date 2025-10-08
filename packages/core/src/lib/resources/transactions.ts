import { BaseResource } from '../base';
import type { WompiResponse } from '../types';

export type TransactionStatus = 'APPROVED' | 'DECLINED' | 'PENDING' | 'ERROR' | 'VOIDED';

export type PaymentMethodType = 
  | 'CARD' 
  | 'NEQUI' 
  | 'PSE' 
  | 'BANCOLOMBIA' 
  | 'BANCOLOMBIA_TRANSFER' 
  | 'BANCOLOMBIA_COLLECT'
  | 'BANCOLOMBIA_QR';

export type YYYYMMDD = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export interface TransactionData {
  id: string;
  created_at: string;
  finalized_at: string | null;
  amount_in_cents: number;
  reference: string;
  customer_email: string;
  currency: string;
  payment_method_type: string;
  payment_method: TransactionPaymentMethod;
  status: TransactionStatus;
  status_message: string | null;
  billing_data: BillingData | null;
  shipping_address: ShippingAddress | null;
  redirect_url: string | null;
  payment_source_id: string | null;
  payment_link_id: string | null;
  customer_data: CustomerData | null;
  bill_id: string | null;
  taxes: Tax[];
  tip_in_cents: number | null;
  merchant?: MerchantInfo;
}

export interface TransactionPaymentMethod {
  type: string;
  extra: {
    bin?: string;
    name?: string;
    brand?: string;
    exp_year?: string;
    card_type?: string;
    exp_month?: string;
    last_four?: string;
    card_holder?: string;
    is_three_ds?: boolean;
  };
  installments: number;
}

export interface BillingData {
  legal_id: string;
  legal_id_type: string;
}

export interface ShippingAddress {
  address_line_1: string;
  address_line_2?: string;
  country: string;
  region: string;
  city: string;
  name: string;
  phone_number: string;
  postal_code: string;
}

export interface CustomerData {
  legal_id: string;
  full_name: string;
  phone_number: string;
  legal_id_type: string;
}

export interface Tax {
  type: string;
  amount_in_cents: number;
}

export interface MerchantInfo {
  id: number;
  name: string;
  legal_name: string;
  contact_name: string;
  phone_number: string;
  logo_url: string | null;
  legal_id_type: string;
  email: string;
  legal_id: string;
  public_key: string;
}

export interface GetTransactionsParams {
  reference?: string;
  from_date?: YYYYMMDD;
  until_date?: YYYYMMDD;
  page?: number;
  page_size?: number;
  id?: string;
  payment_method_type?: PaymentMethodType;
  status?: TransactionStatus;
  customer_email?: string;
  order_by?: string;
  order?: 'DESC' | 'ASC';
}

export interface CreateTransactionParams {
  amount_in_cents: number;
  currency: string;
  customer_email: string;
  payment_method: {
    type: 'CARD' | 'NEQUI' | 'PSE';
    token?: string;
    installments?: number;
    payment_source_id?: number;
  };
  reference: string;
  customer_data?: {
    phone_number: string;
    full_name: string;
    legal_id: string;
    legal_id_type: string;
  };
  shipping_address?: ShippingAddress;
  redirect_url?: string;
}

export class Transactions extends BaseResource {
  private readonly publicKey: string;
  private readonly privateKey?: string;

  constructor(baseUrl: string, publicKey: string, privateKey?: string) {
    super(baseUrl);
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  /**
   * Get a transaction by ID
   * @param id - Transaction ID
   * @returns Transaction data
   */
  async getById(id: string): Promise<WompiResponse<TransactionData>> {
    return super.get<WompiResponse<TransactionData>>(
      `/transactions/${id}`,
      { Authorization: `Bearer ${this.publicKey}` }
    );
  }

  /**
   * List transactions with optional filters
   * @param params - Query parameters
   * @returns List of transactions
   */
  async list(params?: GetTransactionsParams): Promise<WompiResponse<TransactionData[]>> {
    const searchParams: Record<string, string | number | boolean | undefined> = {};

    if (params) {
      // Set defaults
      const fromYesterday = this.formatDate(new Date(Date.now() - 86400000));
      const untilAMonthFromYesterday = this.formatDate(new Date(Date.now() + 2592000000));

      searchParams.from_date = params.from_date || fromYesterday;
      searchParams.until_date = params.until_date || untilAMonthFromYesterday;
      searchParams.page = params.page || 1;
      searchParams.page_size = params.page_size || 30;

      if (params.id) searchParams.id = params.id;
      if (params.order) searchParams.order = params.order;
      if (params.order_by) searchParams.order_by = params.order_by;
      if (params.payment_method_type) searchParams.payment_method_type = params.payment_method_type;
      if (params.reference) searchParams.reference = params.reference;
      if (params.status) searchParams.status = params.status;
      if (params.customer_email) searchParams.customer_email = params.customer_email;
    }

    return super.get<WompiResponse<TransactionData[]>>(
      '/transactions',
      { Authorization: `Bearer ${this.publicKey}` },
      searchParams
    );
  }

  /**
   * Create a new transaction (requires private key)
   * @param params - Transaction parameters
   * @returns Created transaction
   */
  async create(params: CreateTransactionParams): Promise<WompiResponse<TransactionData>> {
    if (!this.privateKey) {
      throw new Error('Private key is required to create transactions');
    }

    return super.post<WompiResponse<TransactionData>>(
      '/transactions',
      params,
      { Authorization: `Bearer ${this.privateKey}` }
    );
  }

  private formatDate(date: Date): YYYYMMDD {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}` as YYYYMMDD;
  }
}
