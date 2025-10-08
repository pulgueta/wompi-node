import type { WompiOptions } from './types';
import { Merchants } from './resources/merchants';
import { Transactions } from './resources/transactions';
import { PSE } from './resources/pse';
import { PaymentSources } from './resources/payment-sources';
import { PaymentLinks } from './resources/payment-links';
import { Events } from './resources/events';

export class Wompi {
  readonly #baseUrl: string;
  readonly #publicKey: string;
  readonly #privateKey?: string;
  readonly #integritySecret?: string;
  readonly #eventsSecret?: string;

  readonly merchants: Merchants;
  readonly transactions: Transactions;
  readonly pse: PSE;
  readonly paymentSources: PaymentSources;
  readonly paymentLinks: PaymentLinks;
  readonly events: Events;

  constructor(options: WompiOptions) {
    const { publicKey, privateKey, integritySecret, eventsSecret, environment = 'production' } = options;

    this.#publicKey = publicKey;
    this.#privateKey = privateKey;
    this.#integritySecret = integritySecret;
    this.#eventsSecret = eventsSecret;
    
    this.#baseUrl = environment === 'production' 
      ? 'https://production.wompi.co/v1'
      : 'https://sandbox.wompi.co/v1';

    // Initialize resource modules
    this.merchants = new Merchants(this.#baseUrl, this.#publicKey);
    this.transactions = new Transactions(this.#baseUrl, this.#publicKey, this.#privateKey);
    this.pse = new PSE(this.#baseUrl, this.#publicKey);
    this.paymentSources = new PaymentSources(this.#baseUrl, this.#publicKey);
    this.paymentLinks = new PaymentLinks(this.#baseUrl, this.#privateKey);
    this.events = new Events(this.#eventsSecret);
  }

  /**
   * Get the integrity signature for a transaction
   * @param reference - The transaction reference
   * @param amountInCents - The transaction amount in cents
   * @returns The integrity signature
   */
  getIntegritySignature(reference: string, amountInCents: number): Promise<string> {
    if (!this.#integritySecret) {
      throw new Error('Integrity secret is required to generate signature');
    }
    return this.events.generateIntegritySignature(reference, amountInCents, this.#integritySecret);
  }
}
