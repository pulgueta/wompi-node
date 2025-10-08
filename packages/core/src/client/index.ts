import { WompiError } from "@/errors/wompi-error";
import { Merchants } from "@/client/merchants";
import { Transactions } from "@/client/transactions";
import { PSE } from "@/client/pse";
import { Tokens } from "@/client/tokens";
import { PaymentSources } from "@/client/payment-sources";
import type { RequestClientOptions, WompiEnvironment } from "@/lib/request";

type WompiClientOptions = {
  publicKey: string;
  publicEventsKey?: string;
  eventsUrl?: string;
  environment?: WompiEnvironment;
  baseUrl?: string;
};

export class WompiClient {
  protected readonly publicKey: string;
  protected readonly publicEventsKey: string;
  protected readonly eventsUrl: string;

  private readonly merchants: Merchants;
  readonly transactions: Transactions;
  readonly pse: PSE;
  readonly tokens: Tokens;
  readonly paymentSources: PaymentSources;

  constructor(private readonly options: WompiClientOptions) {
    if (!options) {
      throw new WompiError("Please provide the required credentials");
    }

    this.publicKey = options.publicKey;
    this.publicEventsKey = options.publicEventsKey ?? "";
    this.eventsUrl = options.eventsUrl ?? "";

    this.merchants = new Merchants(this.publicKey, { environment: options.environment, baseUrl: options.baseUrl });
    this.transactions = new Transactions(`Bearer ${this.publicKey}`, { environment: options.environment, baseUrl: options.baseUrl });
    this.pse = new PSE(`Bearer ${this.publicKey}`, { environment: options.environment, baseUrl: options.baseUrl });
    this.tokens = new Tokens(`Bearer ${this.publicKey}`, { environment: options.environment, baseUrl: options.baseUrl });
    this.paymentSources = new PaymentSources(`Bearer ${this.publicKey}`, { environment: options.environment, baseUrl: options.baseUrl });
  }
}
