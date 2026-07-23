import { WompiClient } from "@pulgueta/wompi";
import type { Transaction } from "@pulgueta/wompi/schemas";
import { buildCheckoutUrl } from "@pulgueta/wompi/server";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

export const ORDER_AMOUNT_IN_CENTS = 4_950_000;
export const ORDER_CURRENCY = "COP" as const;

export type CheckoutErrorDto = {
  code: "CONFIGURATION" | "INVALID_INPUT" | "WOMPI_REQUEST" | "UNEXPECTED";
  message: string;
  statusCode: number | null;
};

export type CheckoutServerResult<T> =
  | { error: CheckoutErrorDto; data: null }
  | { error: null; data: T };

export type CheckoutSessionDto = {
  checkoutUrl: string;
  reference: string;
  orderProof: string;
  amountInCents: number;
  currency: typeof ORDER_CURRENCY;
};

export type CheckoutTransactionDto = {
  id: string;
  status: Transaction["status"];
  reference: string;
  amountInCents: number | null;
  currency: string | null;
  paymentMethodType: string | null;
  statusMessage: string | null;
  createdAt: string | null;
};

export type GetCheckoutTransactionInput = {
  transactionId: string;
  expectedReference: string;
  orderProof: string;
};

class CheckoutConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutConfigurationError";
  }
}

class CheckoutInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutInputError";
  }
}

function assertLocalDemo() {
  if (process.env.NODE_ENV !== "development") {
    throw new CheckoutConfigurationError(
      "The unauthenticated checkout demo is available only in local development.",
    );
  }
}

function getSandboxPublicKey() {
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();

  if (!publicKey?.startsWith("pub_test_")) {
    throw new CheckoutConfigurationError(
      "Set WOMPI_PUBLIC_KEY to a Wompi sandbox public key (pub_test_...).",
    );
  }

  return publicKey;
}

function getSandboxCheckoutCredentials() {
  const publicKey = getSandboxPublicKey();
  const integrityKey = process.env.WOMPI_INTEGRITY_KEY?.trim();

  if (!integrityKey?.startsWith("test_integrity_")) {
    throw new CheckoutConfigurationError(
      "Set WOMPI_INTEGRITY_KEY to a Wompi sandbox integrity key (test_integrity_...).",
    );
  }

  return { publicKey, integrityKey };
}

function getStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return null;
}

function toCheckoutError(error: unknown): CheckoutErrorDto {
  if (error instanceof CheckoutConfigurationError) {
    return { code: "CONFIGURATION", message: error.message, statusCode: null };
  }

  if (error instanceof CheckoutInputError) {
    return { code: "INVALID_INPUT", message: error.message, statusCode: null };
  }

  if (error instanceof Error) {
    return {
      code: "WOMPI_REQUEST",
      message: error.message,
      statusCode: getStatusCode(error),
    };
  }

  return {
    code: "UNEXPECTED",
    message: "Unexpected checkout error",
    statusCode: null,
  };
}

function parseTransactionId(
  input: GetCheckoutTransactionInput | null | undefined,
) {
  const transactionId =
    typeof input?.transactionId === "string" ? input.transactionId.trim() : "";

  if (!transactionId || !/^[A-Za-z0-9_-]{1,200}$/.test(transactionId)) {
    throw new CheckoutInputError("Enter a valid Wompi transaction ID.");
  }

  return transactionId;
}

function parseExpectedReference(
  input: GetCheckoutTransactionInput | null | undefined,
) {
  const expectedReference =
    typeof input?.expectedReference === "string"
      ? input.expectedReference.trim()
      : "";

  if (!/^order-barber-kit-[a-z0-9]+-[a-f0-9]{12}$/.test(expectedReference)) {
    throw new CheckoutInputError(
      "This browser no longer has the launched order reference. Start another checkout.",
    );
  }

  return expectedReference;
}

function parseOrderProof(
  input: GetCheckoutTransactionInput | null | undefined,
) {
  const orderProof =
    typeof input?.orderProof === "string" ? input.orderProof.trim() : "";

  if (!/^[a-f0-9]{64}$/.test(orderProof)) {
    throw new CheckoutInputError(
      "This browser no longer has a valid checkout proof. Start another checkout.",
    );
  }

  return orderProof;
}

export function createOrderReference(
  timestamp = Date.now(),
  entropy = crypto.randomUUID(),
) {
  const compactEntropy = entropy.replaceAll("-", "").slice(0, 12);
  return `order-barber-kit-${timestamp.toString(36)}-${compactEntropy}`;
}

function getOrderProofPayload(reference: string) {
  return new TextEncoder().encode(
    `${reference}|${ORDER_AMOUNT_IN_CENTS}|${ORDER_CURRENCY}`,
  );
}

async function getOrderProofKey(integrityKey: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(integrityKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createOrderProof(
  reference: string,
  integrityKey: string,
) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getOrderProofKey(integrityKey),
    getOrderProofPayload(reference),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyOrderProof(
  reference: string,
  orderProof: string,
  integrityKey: string,
) {
  const received = Uint8Array.from(orderProof.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    await getOrderProofKey(integrityKey),
    received,
    getOrderProofPayload(reference),
  );
}

export function getCheckoutRedirectUrl(
  requestUrl: URL,
  configuredOrigin?: string,
) {
  const redirectBase = configuredOrigin
    ? new URL(configuredOrigin)
    : requestUrl;
  if (redirectBase.protocol !== "http:" && redirectBase.protocol !== "https:") {
    throw new CheckoutConfigurationError(
      "The checkout return URL must use HTTP or HTTPS.",
    );
  }

  const hostname = redirectBase.hostname;
  if (
    !configuredOrigin &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    !hostname.endsWith(".localhost")
  ) {
    throw new CheckoutConfigurationError(
      "Set WOMPI_EXAMPLE_ORIGIN to the public HTTPS origin used by this demo.",
    );
  }

  return new URL("/", redirectBase.origin).toString();
}

export function toCheckoutTransactionDto(
  transaction: Transaction,
  expectedReference: string,
): CheckoutTransactionDto {
  if (
    transaction.reference !== expectedReference ||
    transaction.amount_in_cents !== ORDER_AMOUNT_IN_CENTS ||
    transaction.currency !== ORDER_CURRENCY
  ) {
    throw new CheckoutInputError(
      "That transaction does not belong to this sandbox order.",
    );
  }

  return {
    id: transaction.id,
    status: transaction.status,
    reference: transaction.reference,
    amountInCents: transaction.amount_in_cents ?? null,
    currency: transaction.currency ?? null,
    paymentMethodType: transaction.payment_method_type ?? null,
    statusMessage: transaction.status_message ?? null,
    createdAt: transaction.created_at ?? null,
  };
}

export async function verifyCheckoutTransaction(
  input: GetCheckoutTransactionInput,
  requireApproval = false,
) {
  assertLocalDemo();
  const transactionId = parseTransactionId(input);
  const expectedReference = parseExpectedReference(input);
  const orderProof = parseOrderProof(input);
  const { publicKey, integrityKey } = getSandboxCheckoutCredentials();

  if (!(await verifyOrderProof(expectedReference, orderProof, integrityKey))) {
    throw new CheckoutInputError(
      "The checkout proof does not match this sandbox order.",
    );
  }

  const client = new WompiClient({ publicKey, sandbox: true });
  const [error, transaction] =
    await client.transactions.getTransaction(transactionId);

  if (error) throw error;

  const verified = toCheckoutTransactionDto(transaction, expectedReference);
  if (requireApproval && verified.status !== "APPROVED") {
    throw new CheckoutInputError(
      "The customer checkout must be approved before settling the supplier.",
    );
  }

  return verified;
}

export const createCheckoutSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<CheckoutServerResult<CheckoutSessionDto>> => {
    try {
      assertLocalDemo();
      const { publicKey, integrityKey } = getSandboxCheckoutCredentials();
      const reference = createOrderReference();
      const orderProof = await createOrderProof(reference, integrityKey);
      const redirectUrl = getCheckoutRedirectUrl(
        getRequestUrl(),
        process.env.WOMPI_EXAMPLE_ORIGIN,
      );
      const checkoutUrl = await buildCheckoutUrl({
        publicKey,
        integrityKey,
        reference,
        amountInCents: ORDER_AMOUNT_IN_CENTS,
        currency: ORDER_CURRENCY,
        redirectUrl,
        collectShipping: false,
        customerData: {
          email: "laura@example.com",
          fullName: "Laura Mendoza",
          phoneNumber: "3001234567",
          phoneNumberPrefix: "+57",
        },
      });

      return {
        error: null,
        data: {
          checkoutUrl,
          reference,
          orderProof,
          amountInCents: ORDER_AMOUNT_IN_CENTS,
          currency: ORDER_CURRENCY,
        },
      };
    } catch (error) {
      return { error: toCheckoutError(error), data: null };
    }
  },
);

export const getCheckoutTransaction = createServerFn({ method: "POST" })
  .validator((data: GetCheckoutTransactionInput) => data)
  .handler(
    async ({ data }): Promise<CheckoutServerResult<CheckoutTransactionDto>> => {
      try {
        return {
          error: null,
          data: await verifyCheckoutTransaction(data),
        };
      } catch (error) {
        return { error: toCheckoutError(error), data: null };
      }
    },
  );
