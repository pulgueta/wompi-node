import {
  PayoutTransactionUpdatedEventSchema,
  PayoutWebhookEventSchema,
  PayoutUpdatedEventSchema,
  TransactionUpdatedEventSchema,
  WebhookEventSchema,
  WompiError,
  WompiWebhookVerificationError,
} from "@/schemas";
import type {
  PayoutTransactionUpdatedEvent,
  PayoutUpdatedEvent,
  PayoutWebhookEvent,
  Result,
  TransactionUpdatedEvent,
  WebhookEvent,
} from "@/schemas";

/** SHA-256 hex digest (lowercase) of a UTF-8 string, via Web Crypto. */
const sha256Hex = async (input: string): Promise<string> => {
  const encodedText = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encodedText);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export type GetSignatureKeyOptions = {
  /** Unique merchant reference for the transaction — the same value passed to `createTransaction`. */
  reference: string;
  /**
   * Transaction amount, already expressed in cents (an integer). This is the exact
   * same value passed as `amount_in_cents` to `createTransaction` — it is hashed
   * as-is and must never be multiplied.
   */
  amountInCents: number;
  /** The merchant integrity secret, available in the Wompi dashboard. */
  integrityKey: string;
  /** ISO-4217 currency code. Defaults to `"COP"`. */
  currency?: string;
  /**
   * ISO-8601 timestamp. Provide it only when the transaction also sets
   * `expiration_time`; Wompi hashes it right before the integrity secret.
   */
  expirationTime?: string;
};

/**
 * Compute the Wompi integrity signature for a transaction.
 *
 * The signature is the SHA-256 hex digest of
 * `<reference><amountInCents><currency><expirationTime?><integrityKey>`, matching
 * the hash Wompi expects in a transaction's `signature` field.
 *
 * @example
 * ```ts
 * const signature = await getSignatureKey({
 *   reference: "ref-12345",
 *   amountInCents: 2_490_000,
 *   integrityKey: process.env.WOMPI_INTEGRITY_KEY!,
 * });
 * ```
 *
 * @throws {WompiError} If `amountInCents` is not a non-negative integer.
 */
export const getSignatureKey = async (options: GetSignatureKeyOptions): Promise<string> => {
  const { reference, amountInCents, integrityKey, currency = "COP", expirationTime } = options;

  if (!Number.isInteger(amountInCents) || amountInCents < 0) {
    throw new WompiError(
      `getSignatureKey: amountInCents must be a non-negative integer in cents, received ${amountInCents}`
    );
  }

  const str = `${reference}${amountInCents}${currency}${expirationTime ?? ""}${integrityKey}`;

  return sha256Hex(str);
};

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted property path from an event's `signature.properties`
 * (e.g. `"transaction.id"`) against the event's `data` object.
 */
const resolveEventProperty = (data: unknown, path: string): unknown => {
  let current: unknown = data;

  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

/** Constant-time comparison of two checksums, case-insensitive on hex digits. */
const checksumsMatch = (a: string, b: string): boolean => {
  const left = a.toLowerCase();
  const right = b.toLowerCase();

  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return diff === 0;
};

/**
 * Compute the checksum Wompi signs an event with: the SHA-256 hex digest of the
 * concatenated values of `signature.properties` (resolved against `data`, in
 * order), followed by `timestamp` and the merchant events secret.
 */
export const computeEventChecksum = async (
  event: Pick<WebhookEvent, "data" | "signature" | "timestamp">,
  eventsKey: string
): Promise<string> => {
  const concatenated = event.signature.properties
    .map((path) => {
      const value = resolveEventProperty(event.data, path);
      return value === null || value === undefined ? "" : String(value);
    })
    .join("");

  return sha256Hex(`${concatenated}${event.timestamp}${eventsKey}`);
};

export type VerifyWebhookEventOptions = {
  /** The merchant events secret, available in the Wompi dashboard. */
  eventsKey: string;
  /** Select the payouts envelope, which omits `environment` and uses `sentAt`. */
  api?: "payments" | "payouts";
};

/**
 * Parse and authenticate an event Wompi POSTed to the configured Events URL.
 *
 * Accepts the raw request body (string) or the already-parsed JSON object,
 * validates the envelope shape, recomputes the checksum with the events secret
 * and compares it in constant time against `signature.checksum`. Events whose
 * checksum does not match must be discarded — anyone can POST to a public
 * webhook endpoint. Pass `api: "payouts"` with the payouts events secret for
 * BRE-B and bank-dispersal events, whose envelope omits `environment`.
 *
 * @example
 * ```ts
 * const [error, event] = await verifyWebhookEvent(await request.text(), {
 *   eventsKey: process.env.WOMPI_EVENTS_KEY!,
 * });
 * if (error) return new Response("Invalid signature", { status: 403 });
 * if (isTransactionUpdatedEvent(event)) {
 *   console.log(event.data.transaction.status);
 * }
 * ```
 */
export function verifyWebhookEvent(
  payload: unknown,
  options: VerifyWebhookEventOptions & { api: "payouts" }
): Promise<Result<PayoutWebhookEvent>>;
export function verifyWebhookEvent(
  payload: unknown,
  options: VerifyWebhookEventOptions & { api?: "payments" }
): Promise<Result<WebhookEvent>>;
export function verifyWebhookEvent(
  payload: unknown,
  options: VerifyWebhookEventOptions
): Promise<Result<WebhookEvent | PayoutWebhookEvent>>;
export async function verifyWebhookEvent(
  payload: unknown,
  options: VerifyWebhookEventOptions
): Promise<Result<WebhookEvent | PayoutWebhookEvent>> {
  let raw: unknown = payload;

  if (typeof payload === "string") {
    try {
      raw = JSON.parse(payload);
    } catch {
      return [new WompiWebhookVerificationError("Webhook payload is not valid JSON"), null];
    }
  }

  const schema = options.api === "payouts" ? PayoutWebhookEventSchema : WebhookEventSchema;
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return [
      new WompiWebhookVerificationError(
        `Invalid webhook payload: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
      ),
      null,
    ];
  }

  const event = parsed.data;
  const expected = await computeEventChecksum(event, options.eventsKey);

  if (!checksumsMatch(expected, event.signature.checksum)) {
    return [new WompiWebhookVerificationError("Webhook checksum verification failed"), null];
  }

  return [null, event];
}

/** Narrow a verified payments or payouts event to a payment `transaction.updated` event. */
export const isTransactionUpdatedEvent = (
  event: WebhookEvent | PayoutWebhookEvent
): event is TransactionUpdatedEvent =>
  event.event === "transaction.updated" && TransactionUpdatedEventSchema.safeParse(event).success;

/**
 * Narrow a verified {@link WebhookEvent} to a payouts-API (BRE-B/bank dispersal)
 * `transaction.updated` event. The event name is shared with the payments API;
 * the payload's `transaction.payoutId` is what tells them apart.
 */
export const isPayoutTransactionUpdatedEvent = (
  event: WebhookEvent | PayoutWebhookEvent
): event is PayoutTransactionUpdatedEvent =>
  event.event === "transaction.updated" &&
  PayoutTransactionUpdatedEventSchema.safeParse(event).success;

/** Narrow a verified payments or payouts event to a typed `payout.updated` event. */
export const isPayoutUpdatedEvent = (
  event: WebhookEvent | PayoutWebhookEvent
): event is PayoutUpdatedEvent =>
  event.event === "payout.updated" && PayoutUpdatedEventSchema.safeParse(event).success;

// ---------------------------------------------------------------------------
// Web Checkout
// ---------------------------------------------------------------------------

export const CHECKOUT_BASE_URL = "https://checkout.wompi.co/p/";

export type BuildCheckoutUrlOptions = {
  /** Merchant public key (`pub_test_…` or `pub_prod_…`). */
  publicKey: string;
  /** Unique merchant reference for the transaction. */
  reference: string;
  /** Amount in cents (integer). */
  amountInCents: number;
  /** ISO-4217 currency code. Defaults to `"COP"`. */
  currency?: string;
  /** URL Wompi redirects the customer to after paying (receives `?id=<transactionId>`). */
  redirectUrl?: string;
  /** ISO-8601 timestamp after which the checkout expires. Included in the signature. */
  expirationTime?: string;
  /** Prefills the checkout's customer form. */
  customerData?: {
    email?: string;
    fullName?: string;
    phoneNumber?: string;
    phoneNumberPrefix?: string;
    legalId?: string;
    legalIdType?: string;
  };
  /** Ask Wompi to collect a shipping address. */
  collectShipping?: boolean;
  /** Taxes already included in `amountInCents`. */
  taxInCents?: { vat?: number; consumption?: number };
} & (
  | {
      /** Merchant integrity secret; the signature is computed for you. */
      integrityKey: string;
      signature?: never;
    }
  | {
      /** Precomputed integrity signature (see {@link getSignatureKey}). */
      signature: string;
      integrityKey?: never;
    }
);

/**
 * Build a Wompi Web Checkout URL (`https://checkout.wompi.co/p/?…`) for
 * redirect-based payments. Pass either `integrityKey` (the signature is
 * computed server-side for you) or a precomputed `signature`.
 *
 * Never call this with `integrityKey` from browser code — the integrity secret
 * must stay on the server.
 *
 * @example
 * ```ts
 * const url = await buildCheckoutUrl({
 *   publicKey: process.env.WOMPI_PUBLIC_KEY!,
 *   reference: "order-1042",
 *   amountInCents: 8_900_000,
 *   redirectUrl: "https://example.com/orders/1042",
 *   integrityKey: process.env.WOMPI_INTEGRITY_KEY!,
 * });
 * ```
 *
 * @throws {WompiError} If `amountInCents` is not a non-negative integer.
 */
export const buildCheckoutUrl = async (options: BuildCheckoutUrlOptions): Promise<string> => {
  const {
    publicKey,
    reference,
    amountInCents,
    currency = "COP",
    redirectUrl,
    expirationTime,
    customerData,
    collectShipping,
    taxInCents,
  } = options;

  if (!Number.isInteger(amountInCents) || amountInCents < 0) {
    throw new WompiError(
      `buildCheckoutUrl: amountInCents must be a non-negative integer in cents, received ${amountInCents}`
    );
  }

  const signature =
    options.signature ??
    (await getSignatureKey({
      reference,
      amountInCents,
      integrityKey: options.integrityKey,
      currency,
      expirationTime,
    }));

  const params = new URLSearchParams();
  params.set("public-key", publicKey);
  params.set("currency", currency);
  params.set("amount-in-cents", String(amountInCents));
  params.set("reference", reference);
  params.set("signature:integrity", signature);

  if (redirectUrl) params.set("redirect-url", redirectUrl);
  if (expirationTime) params.set("expiration-time", expirationTime);
  if (collectShipping !== undefined) params.set("collect-shipping", String(collectShipping));

  if (customerData) {
    const fields: [string, string | undefined][] = [
      ["customer-data:email", customerData.email],
      ["customer-data:full-name", customerData.fullName],
      ["customer-data:phone-number", customerData.phoneNumber],
      ["customer-data:phone-number-prefix", customerData.phoneNumberPrefix],
      ["customer-data:legal-id", customerData.legalId],
      ["customer-data:legal-id-type", customerData.legalIdType],
    ];

    for (const [key, value] of fields) {
      if (value) params.set(key, value);
    }
  }

  if (taxInCents?.vat !== undefined) params.set("tax-in-cents:vat", String(taxInCents.vat));
  if (taxInCents?.consumption !== undefined) {
    params.set("tax-in-cents:consumption", String(taxInCents.consumption));
  }

  return `${CHECKOUT_BASE_URL}?${params.toString()}`;
};
