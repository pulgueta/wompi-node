export interface WompiOptions {
  /**
   * Public API key (pub_test_... or pub_prod_...)
   */
  publicKey: string;
  
  /**
   * Private API key (prv_test_... or prv_prod_...) - Required for creating transactions
   */
  privateKey?: string;
  
  /**
   * Integrity secret for signature verification
   */
  integritySecret?: string;
  
  /**
   * Events secret for webhook signature verification
   */
  eventsSecret?: string;
  
  /**
   * Environment to use
   * @default 'production'
   */
  environment?: 'production' | 'sandbox';
}

export interface WompiResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface ErrorResponse {
  error: {
    type: string;
    messages: string[];
    reason?: string;
  };
}
