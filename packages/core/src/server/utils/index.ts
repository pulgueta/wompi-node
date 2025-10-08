import { WompiError } from "@/errors/wompi-error";
import { ServerTransactions } from "@/server/transactions";
import type { RequestClientOptions, WompiEnvironment } from "@/lib/request";

type WompiServerOptions = {
  privateKey: string;
  privateEventsKey?: string;
  eventsUrl?: string;
  environment?: WompiEnvironment;
  baseUrl?: string;
};

export class WompiServer {
  protected readonly privateKey: string;
  protected readonly privateEventsKey: string;
  protected readonly eventsUrl: string;
  readonly transactions: ServerTransactions;

  constructor(private readonly options: WompiServerOptions) {
    if (!options) {
      throw new WompiError("Please provide the required credentials");
    }

    this.privateKey = options.privateKey;
    this.privateEventsKey = options.privateEventsKey ?? "";
    this.eventsUrl = options.eventsUrl ?? "";

    const requestOptions: RequestClientOptions = {
      environment: options.environment,
      baseUrl: options.baseUrl,
      defaultHeaders: { Authorization: `Bearer ${this.privateKey}` },
    };
    this.transactions = new ServerTransactions(`Bearer ${this.privateKey}`, requestOptions);
  }
}
