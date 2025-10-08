import { HttpClient, type HttpClientOptions } from "@/internal/http-client";
import { WompiError } from "@/internal/wompi-error";
import { Merchants } from "@/resources/merchants";
import { Transactions } from "@/resources/transactions";
import { PSE } from "@/resources/pse";
import { getSignatureKey } from "@/server/get-signature-key";

export type Environment = "sandbox" | "production";

export type WompiOptions = {
  /** Public key for client-side operations */
  publicKey?: string;
  /** Private key for server-side operations */
  privateKey?: string;
  /** Environment selection; defaults to sandbox */
  environment?: Environment;
  /** Override base URL if needed */
  baseUrl?: string;
};

export class Wompi {
  readonly merchants: Merchants;
  readonly transactions: Transactions;
  readonly pse: PSE;

  private readonly http: HttpClient;
  private readonly publicKey?: string;
  private readonly privateKey?: string;

  constructor(options: WompiOptions = {}) {
    const environment: Environment = options.environment ?? "sandbox";

    this.http = new HttpClient(resolveHttpOptions(environment, options.baseUrl));
    this.publicKey = options.publicKey;
    this.privateKey = options.privateKey;

    const bearer = this.publicKey ? `Bearer ${this.publicKey}` : undefined;

    this.merchants = new Merchants(this.http, this.publicKey ?? "");
    this.transactions = new Transactions(this.http, bearer);
    this.pse = new PSE(this.http, bearer);
  }
}

export const WompiServer = { getSignatureKey };

function resolveHttpOptions(environment: Environment, baseUrlOverride?: string): HttpClientOptions {
  if (baseUrlOverride) return { baseUrl: baseUrlOverride };
  const baseUrl = environment === "production" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
  return { baseUrl };
}

export type { AcceptanceTokenResponse } from "@/resources/merchants.types";
export type {
  TransactionResponse,
  TransactionParameters,
  PaymentProcessor,
  TransactionStatus,
  YYYYMMDD,
} from "@/resources/transactions.types";
export type { FinantialInstitutions } from "@/resources/pse.types";

