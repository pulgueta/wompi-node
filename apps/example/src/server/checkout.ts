import { WompiClient } from "@pulgueta/wompi";
import type { Transaction } from "@pulgueta/wompi/schemas";
import { buildCheckoutUrl } from "@pulgueta/wompi/server";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

import { PRODUCTS, SHIPPING_CENTS } from "#/lib/catalog";
import { applyPaymentStatus, getPayment, recordPayment } from "./store";

export const ORDER_CURRENCY = "COP" as const;

export type CheckoutErrorDto = {
  code: "CONFIGURATION" | "INVALID_INPUT" | "WOMPI_REQUEST" | "UNEXPECTED";
  message: string;
  statusCode: number | null;
};

export type CheckoutServerResult<T> =
  | { error: CheckoutErrorDto; data: null }
  | { error: null; data: T };

export type CheckoutLineInput = {
  productId: string;
  quantity: number;
};

export type CheckoutBuyerInput = {
  fullName: string;
  email: string;
  phone: string;
  document: string;
  documentType: string;
};

export type CreateCheckoutSessionInput = {
  lines: CheckoutLineInput[];
  buyer: CheckoutBuyerInput;
};

export type CheckoutSessionDto = {
  checkoutUrl: string;
  reference: string;
  orderProof: string;
  amountInCents: number;
  currency: typeof ORDER_CURRENCY;
};

export type CheckoutTransactionDto = {
  id: string;
  status: Transaction["status"] | string;
  reference: string;
  amountInCents: number | null;
  paymentMethodType: string | null;
  statusMessage: string | null;
  /** Whether the final status came from the webhook or an API poll. */
  source: "webhook" | "api";
};

export type GetCheckoutTransactionInput = {
  transactionId: string;
  reference: string;
  amountInCents: number;
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

function getSandboxCheckoutCredentials() {
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();
  if (!publicKey?.startsWith("pub_test_")) {
    throw new CheckoutConfigurationError(
      "Set WOMPI_PUBLIC_KEY to a Wompi sandbox public key (pub_test_...).",
    );
  }

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

const MAX_QUANTITY_PER_LINE = 99;

/**
 * The amount is always recomputed on the server from the catalog — the
 * client only says *what* it wants to buy, never how much it costs.
 */
export function computeOrderAmount(lines: CheckoutLineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CheckoutInputError("El carrito está vacío.");
  }

  let subtotal = 0;
  for (const line of lines) {
    const product = PRODUCTS.find((p) => p.id === line.productId);
    if (!product) {
      throw new CheckoutInputError(`Producto desconocido: ${line.productId}`);
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY_PER_LINE
    ) {
      throw new CheckoutInputError(
        `Cantidad inválida para ${product.name} (1–${MAX_QUANTITY_PER_LINE}).`,
      );
    }
    subtotal += product.priceCents * line.quantity;
  }

  return subtotal + SHIPPING_CENTS;
}

function parseBuyer(buyer: CheckoutBuyerInput | null | undefined) {
  const email = buyer?.email?.trim() ?? "";
  const fullName = buyer?.fullName?.trim() ?? "";
  if (!email.includes("@") || fullName.length === 0) {
    throw new CheckoutInputError(
      "Completa el nombre y el email del comprador.",
    );
  }
  return {
    email,
    fullName,
    phone: buyer?.phone?.trim() ?? "",
    document: buyer?.document?.trim() ?? "",
    documentType: buyer?.documentType?.trim() ?? "CC",
  };
}

export function createOrderReference(
  timestamp = Date.now(),
  entropy = crypto.randomUUID(),
) {
  const compactEntropy = entropy.replaceAll("-", "").slice(0, 12);
  return `PB-${timestamp.toString(36)}-${compactEntropy}`;
}

const ORDER_REFERENCE_PATTERN = /^PB-[a-z0-9]+-[a-f0-9]{12}$/;

function getOrderProofPayload(reference: string, amountInCents: number) {
  return new TextEncoder().encode(
    `${reference}|${amountInCents}|${ORDER_CURRENCY}`,
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

/**
 * HMAC over `reference|amount|currency` handed to the browser at launch
 * time; it proves a status lookup belongs to an order this server created,
 * without keeping per-order state.
 */
export async function createOrderProof(
  reference: string,
  amountInCents: number,
  integrityKey: string,
) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getOrderProofKey(integrityKey),
    getOrderProofPayload(reference, amountInCents),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyOrderProof(
  reference: string,
  amountInCents: number,
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
    getOrderProofPayload(reference, amountInCents),
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

function parseGetTransactionInput(
  input: GetCheckoutTransactionInput | null | undefined,
) {
  const transactionId =
    typeof input?.transactionId === "string" ? input.transactionId.trim() : "";
  if (!transactionId || !/^[A-Za-z0-9_-]{1,200}$/.test(transactionId)) {
    throw new CheckoutInputError("Enter a valid Wompi transaction ID.");
  }

  const reference =
    typeof input?.reference === "string" ? input.reference.trim() : "";
  if (!ORDER_REFERENCE_PATTERN.test(reference)) {
    throw new CheckoutInputError(
      "This browser no longer has the launched order reference. Start another checkout.",
    );
  }

  const amountInCents = input?.amountInCents;
  if (
    typeof amountInCents !== "number" ||
    !Number.isInteger(amountInCents) ||
    amountInCents <= 0
  ) {
    throw new CheckoutInputError(
      "This browser no longer has the launched order amount. Start another checkout.",
    );
  }

  const orderProof =
    typeof input?.orderProof === "string" ? input.orderProof.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(orderProof)) {
    throw new CheckoutInputError(
      "This browser no longer has a valid checkout proof. Start another checkout.",
    );
  }

  return { transactionId, reference, amountInCents, orderProof };
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: CreateCheckoutSessionInput) => data)
  .handler(
    async ({ data }): Promise<CheckoutServerResult<CheckoutSessionDto>> => {
      try {
        const { publicKey, integrityKey } = getSandboxCheckoutCredentials();
        const amountInCents = computeOrderAmount(data.lines);
        const buyer = parseBuyer(data.buyer);
        const reference = createOrderReference();
        const orderProof = await createOrderProof(
          reference,
          amountInCents,
          integrityKey,
        );
        const redirectUrl = getCheckoutRedirectUrl(
          getRequestUrl(),
          process.env.WOMPI_EXAMPLE_ORIGIN,
        );
        const checkoutUrl = await buildCheckoutUrl({
          publicKey,
          integrityKey,
          reference,
          amountInCents,
          currency: ORDER_CURRENCY,
          redirectUrl,
          collectShipping: false,
          customerData: {
            email: buyer.email,
            fullName: buyer.fullName,
            phoneNumber: buyer.phone,
            phoneNumberPrefix: "+57",
            legalId: buyer.document,
            legalIdType: buyer.documentType,
          },
        });

        recordPayment(reference, amountInCents);

        return {
          error: null,
          data: {
            checkoutUrl,
            reference,
            orderProof,
            amountInCents,
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
        const { transactionId, reference, amountInCents, orderProof } =
          parseGetTransactionInput(data);
        const { publicKey, integrityKey } = getSandboxCheckoutCredentials();

        if (
          !(await verifyOrderProof(
            reference,
            amountInCents,
            orderProof,
            integrityKey,
          ))
        ) {
          throw new CheckoutInputError(
            "The checkout proof does not match this sandbox order.",
          );
        }

        // The webhook is the source of truth: when it already delivered the
        // final status for this order, answer from it without polling.
        const recorded = getPayment(reference);
        if (
          recorded &&
          recorded.source === "webhook" &&
          recorded.status !== "PENDING"
        ) {
          return {
            error: null,
            data: {
              id: recorded.transactionId ?? transactionId,
              status: recorded.status,
              reference,
              amountInCents: recorded.amountInCents,
              paymentMethodType: null,
              statusMessage: null,
              source: "webhook",
            },
          };
        }

        const client = new WompiClient({ publicKey, sandbox: true });
        const [error, transaction] =
          await client.transactions.getTransaction(transactionId);
        if (error) throw error;

        if (
          transaction.reference !== reference ||
          transaction.amount_in_cents !== amountInCents ||
          transaction.currency !== ORDER_CURRENCY
        ) {
          throw new CheckoutInputError(
            "That transaction does not belong to this sandbox order.",
          );
        }

        applyPaymentStatus(reference, {
          status: transaction.status,
          transactionId: transaction.id,
          source: "api",
        });

        return {
          error: null,
          data: {
            id: transaction.id,
            status: transaction.status,
            reference: transaction.reference,
            amountInCents: transaction.amount_in_cents ?? null,
            paymentMethodType: transaction.payment_method_type ?? null,
            statusMessage: transaction.status_message ?? null,
            source: "api",
          },
        };
      } catch (error) {
        return { error: toCheckoutError(error), data: null };
      }
    },
  );
