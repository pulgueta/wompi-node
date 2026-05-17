import { WompiError } from "@/errors/wompi-error";

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

  const encodedText = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encodedText);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  const signature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return signature;
};
