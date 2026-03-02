import { WompiError } from "@/errors/wompi-error";
import { Merchants } from "@/client/merchants";
import { Transactions } from "@/client/transactions";
import { Tokens } from "@/client/tokens";
import { PaymentSources } from "@/client/payment-sources";
import { PaymentLinks } from "@/client/payment-links";
import { PSE } from "@/client/pse";
import { WompiClientOptionsSchema } from "@/schemas";

export class WompiClient {
  /** Merchant operations (get merchant info, acceptance token). */
  readonly merchants: Merchants;

  /** Transaction operations (create, get, list, void). */
  readonly transactions: Transactions;

  /** Token operations (tokenize cards, Nequi accounts). */
  readonly tokens: Tokens;

  /** Payment source operations (create, get). Requires private key. */
  readonly paymentSources: PaymentSources;

  /** Payment link operations (create, get, update). Requires private key for write operations. */
  readonly paymentLinks: PaymentLinks;

  /** PSE operations (list financial institutions). */
  readonly pse: PSE;

  constructor(options: unknown) {
    const parsed = WompiClientOptionsSchema.safeParse(options);

    if (!parsed.success) {
      throw new WompiError(
        `Invalid client options: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
      );
    }

    const { publicKey, privateKey, sandbox } = parsed.data;

    this.merchants = new Merchants(publicKey, sandbox);
    this.transactions = new Transactions(publicKey, privateKey, sandbox);
    this.tokens = new Tokens(publicKey, sandbox);
    this.paymentSources = new PaymentSources(privateKey, sandbox);
    this.paymentLinks = new PaymentLinks(privateKey, sandbox);
    this.pse = new PSE(publicKey, sandbox);
  }
}
