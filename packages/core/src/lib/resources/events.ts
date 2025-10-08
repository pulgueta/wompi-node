import { WompiError } from '../errors';

export interface WebhookEvent {
  event: string;
  data: {
    transaction: {
      id: string;
      amount_in_cents: number;
      reference: string;
      customer_email: string;
      currency: string;
      payment_method_type: string;
      redirect_url: string | null;
      status: string;
      shipping_address: unknown | null;
      payment_link_id: string | null;
      payment_source_id: number | null;
    };
  };
  sent_at: string;
  timestamp: number;
  signature: {
    checksum: string;
    properties: string[];
  };
  environment: string;
}

export class Events {
  private readonly eventsSecret?: string;

  constructor(eventsSecret?: string) {
    this.eventsSecret = eventsSecret;
  }

  /**
   * Generate integrity signature for a transaction
   * @param reference - Transaction reference
   * @param amountInCents - Amount in cents
   * @param integritySecret - Integrity secret key
   * @returns Integrity signature
   */
  async generateIntegritySignature(
    reference: string,
    amountInCents: number,
    integritySecret: string
  ): Promise<string> {
    const str = `${reference}${amountInCents}COP${integritySecret}`;
    
    const encodedText = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedText);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verify webhook event signature
   * @param event - Webhook event payload
   * @param signature - Signature from webhook headers
   * @returns True if signature is valid
   */
  async verifySignature(event: WebhookEvent, signature: string): Promise<boolean> {
    if (!this.eventsSecret) {
      throw new WompiError('Events secret is required for signature verification', 400);
    }

    const { checksum, properties } = event.signature;
    
    // Concatenate properties from event data
    const concatenatedProperties = properties
      .map((prop) => {
        // Navigate through nested properties
        const keys = prop.split('.');
        let value: unknown = event;
        
        for (const key of keys) {
          if (value && typeof value === 'object' && key in value) {
            value = (value as Record<string, unknown>)[key];
          } else {
            return '';
          }
        }
        
        return String(value);
      })
      .join('');

    const stringToHash = `${concatenatedProperties}${event.timestamp}${this.eventsSecret}`;
    const expectedChecksum = await this.generateChecksum(stringToHash);
    
    return expectedChecksum === checksum && signature === checksum;
  }

  /**
   * Generate checksum for webhook verification
   * @param data - Data to hash
   * @returns Checksum
   */
  private async generateChecksum(data: string): Promise<string> {
    const encodedText = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedText);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Parse and verify webhook event
   * @param payload - Raw webhook payload
   * @param signature - Signature from headers
   * @returns Parsed and verified event
   */
  async constructEvent(payload: string | WebhookEvent, signature: string): Promise<WebhookEvent> {
    const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
    
    const isValid = await this.verifySignature(event, signature);
    
    if (!isValid) {
      throw new WompiError('Invalid webhook signature', 401);
    }
    
    return event;
  }
}
