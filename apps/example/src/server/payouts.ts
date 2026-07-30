import { WompiPayoutsClient } from "@pulgueta/wompi";
import { WompiPayoutApiError } from "@pulgueta/wompi/schemas";
import type { BrebKeyType, Result } from "@pulgueta/wompi/schemas";
import { createServerFn } from "@tanstack/react-start";

import { createDispersionIdempotencyKey } from "./idempotency";
import {
  applyDispersionStatus,
  findDispersion,
  listDispersions,
  listProviders,
  recordDispersion,
  type DispersionState,
  type ProviderState,
} from "./store";

export type PayoutErrorDto = {
  code: string;
  message: string;
  statusCode: number | null;
};

export type ServerResult<T> =
  | { error: PayoutErrorDto; data: null }
  | { error: null; data: T };

/** Wompi's payout amount ceiling (see RechargePayoutAccountInputSchema). */
const MAX_PAYOUT_CENTS = 5_000_000_000;
/** BRE-B payout transactions require a beneficiary email; demo placeholder. */
const DEMO_PAYEE_EMAIL = "proveedores@panabarbero.co";

export type KeyResolutionDto = {
  holderName: string;
  keyType: string;
  keyValue: string;
  financialEntityName?: string;
  financialEntityCode?: string;
};

export type ResolveKeyInput = {
  key: string;
  keyType?: BrebKeyType;
};

export type CreateDispersionInput = {
  providerKey: string;
  keyValue: string;
  amountInCents: number;
  /** Sandbox-only: forces the final state of the batch. */
  simulate: "APPROVED" | "FAILED";
};

export type CreateDispersionDto = {
  reference: string;
  wompiPayoutId: string;
  status: string;
};

export type PayoutStatusDto = {
  reference: string;
  wompiPayoutId: string;
  status: string;
  transactionStatus?: string;
  transactionFailureReason?: string;
};

let payoutsClient: WompiPayoutsClient | null = null;

const FRIENDLY_PAYOUT_ERRORS: Record<string, string> = {
  EXC_008: "The source account does not have enough available balance.",
  EXC_017: "This payout would exceed the account's daily limit.",
  EXC_022:
    "This bank payout was already submitted. Keep the original payout ID.",
  EXC_032:
    "This BRE-B payout was already submitted. Keep the original payout ID.",
  EXC_033: "The BRE-B key format is not valid.",
  EXC_034: "We could not find an active BRE-B key. Try a listed sandbox key.",
  EXC_035: "That BRE-B key is inactive.",
  EXC_036: "BRE-B resolution is temporarily unavailable.",
  EXC_037: "BRE-B resolution timed out. Try again.",
};

export function getPayoutsClient() {
  const apiKey = process.env.WOMPI_PAYOUTS_API_KEY;
  const userPrincipalId = process.env.WOMPI_PAYOUTS_USER_PRINCIPAL_ID;
  if (!apiKey || !userPrincipalId) {
    const missing = [
      apiKey ? null : "WOMPI_PAYOUTS_API_KEY",
      userPrincipalId ? null : "WOMPI_PAYOUTS_USER_PRINCIPAL_ID",
    ].filter(Boolean);
    throw new Error(
      `Wompi payouts credentials missing. Set ${missing.join(" and ")} in the example app environment.`,
    );
  }

  payoutsClient ??= new WompiPayoutsClient({
    apiKey,
    userPrincipalId,
    sandbox: true,
  });

  return payoutsClient;
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

function toPayoutError(error: unknown): PayoutErrorDto {
  if (error instanceof WompiPayoutApiError) {
    return {
      code: error.code,
      message: FRIENDLY_PAYOUT_ERRORS[error.code] ?? error.message,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    console.error(error);
    const statusCode = getStatusCode(error);
    if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
      return {
        code: "WOMPI_REQUEST",
        message: `El servicio de Payouts del sandbox de Wompi no está disponible en este momento (HTTP ${statusCode}). Es una caída del lado de Wompi; intenta de nuevo más tarde.`,
        statusCode,
      };
    }
    return {
      code: "WOMPI_REQUEST",
      message: error.message,
      statusCode,
    };
  }

  return {
    code: "UNEXPECTED",
    message: "The payout request could not be completed.",
    statusCode: null,
  };
}

async function runPayoutRequest<T, TDto>(
  request: (client: WompiPayoutsClient) => Promise<Result<T>>,
  mapData: (data: T) => TDto,
): Promise<ServerResult<TDto>> {
  try {
    const [error, data] = await request(getPayoutsClient());

    if (error) {
      return { error: toPayoutError(error), data: null };
    }

    return { error: null, data: mapData(data) };
  } catch (error) {
    return { error: toPayoutError(error), data: null };
  }
}

// Ambiguous failures may still have been accepted by Wompi, so forgetting them
// could create a duplicate payout when an operator retries.
function isAmbiguousPayoutFailure(error: PayoutErrorDto) {
  return (
    error.statusCode === null ||
    error.statusCode < 400 ||
    error.statusCode >= 500
  );
}

export function createDispersionReference(
  providerKey: string,
  timestamp = Date.now(),
) {
  return `PB-PO-${providerKey}-${timestamp}`;
}

/**
 * Resolve a BRE-B key to its (masked) holder before paying it. Sandbox
 * error keys are an expected demo path, so API errors come back as
 * `{ error }` instead of throwing.
 */
export const resolveKey = createServerFn({ method: "POST" })
  .validator((data: ResolveKeyInput) => data)
  .handler(async ({ data }): Promise<ServerResult<KeyResolutionDto>> => {
    const result = await runPayoutRequest(
      (client) => client.resolveBrebKey(data.key, data.keyType),
      (resolution): KeyResolutionDto => ({
        holderName: resolution.holderName ?? "",
        keyType: resolution.keyType ?? "",
        keyValue: resolution.keyValue ?? "",
        financialEntityName: resolution.financialEntity?.name,
        financialEntityCode: resolution.financialEntity?.code,
      }),
    );

    return result;
  });

/** One dispersion attempt per provider at a time — a double click or
 *  concurrent request joins the in-flight attempt instead of paying twice. */
const dispersionAttempts = new Map<
  string,
  Promise<ServerResult<CreateDispersionDto>>
>();

/**
 * Pay a provider through a single-transaction BRE-B dispersion. `simulate`
 * uses the sandbox-only `transactionStatus` field to force the batch's
 * final state, so the demo can showcase both the happy and failure paths.
 * The destination key is re-resolved server-side: the client never supplies
 * the beneficiary name, and the amount is capped at the provider's balance.
 */
export const createDispersion = createServerFn({ method: "POST" })
  .validator((data: CreateDispersionInput) => data)
  .handler(async ({ data }): Promise<ServerResult<CreateDispersionDto>> => {
    if (
      !Number.isInteger(data.amountInCents) ||
      data.amountInCents <= 0 ||
      data.amountInCents > MAX_PAYOUT_CENTS
    ) {
      return {
        error: {
          code: "INVALID_AMOUNT",
          message: `amountInCents debe ser un entero entre 1 y ${MAX_PAYOUT_CENTS}.`,
          statusCode: 400,
        },
        data: null,
      };
    }
    if (data.simulate !== "APPROVED" && data.simulate !== "FAILED") {
      return {
        error: {
          code: "INVALID_INPUT",
          message: "simulate debe ser APPROVED o FAILED.",
          statusCode: 400,
        },
        data: null,
      };
    }
    const provider = listProviders().find((p) => p.key === data.providerKey);
    if (!provider) {
      return {
        error: {
          code: "UNKNOWN_PROVIDER",
          message: `Proveedor desconocido: ${data.providerKey}`,
          statusCode: 404,
        },
        data: null,
      };
    }
    if (data.amountInCents > provider.pendingCents) {
      return {
        error: {
          code: "AMOUNT_EXCEEDS_PENDING",
          message: `El monto excede el saldo pendiente de ${provider.name}.`,
          statusCode: 400,
        },
        data: null,
      };
    }

    const existingAttempt = dispersionAttempts.get(data.providerKey);
    if (existingAttempt) return existingAttempt;

    // Failures before `createPayout` is dispatched (key resolution, account
    // lookup) cannot have moved money, so they are always safe to retry.
    const payment = { attempted: false };
    let attemptThrew = false;
    const attempt = runDispersion(data, payment).catch(
      (error): ServerResult<CreateDispersionDto> => {
        attemptThrew = true;
        return { error: toPayoutError(error), data: null };
      },
    );
    dispersionAttempts.set(data.providerKey, attempt);
    const result = await attempt;
    const mustRetainAttempt =
      payment.attempted &&
      (attemptThrew ||
        (result.error !== null && isAmbiguousPayoutFailure(result.error)));
    if (!mustRetainAttempt) {
      dispersionAttempts.delete(data.providerKey);
    }
    return result;
  });

async function runDispersion(
  data: CreateDispersionInput,
  payment: { attempted: boolean },
): Promise<ServerResult<CreateDispersionDto>> {
  const keyValue = data.keyValue.trim();

  // Resolve the destination inside the same server workflow so the
  // beneficiary name comes from the BRE-B directory, never the client.
  const resolution = await runPayoutRequest(
    (client) => client.resolveBrebKey(keyValue),
    (resolved) => resolved,
  );
  if (resolution.error) {
    return { error: resolution.error, data: null };
  }

  // The origin account funds the batch; take the first active one.
  const accountsResult = await runPayoutRequest(
    (client) => client.listAccounts({ status: "ACTIVE" }),
    (accounts) => accounts,
  );
  if (accountsResult.error) {
    return { error: accountsResult.error, data: null };
  }
  const account = accountsResult.data[0];
  if (account === undefined) {
    return {
      error: {
        code: "NO_ACCOUNT",
        message: "La cuenta de Payouts no tiene cuentas de origen activas.",
        statusCode: 404,
      },
      data: null,
    };
  }

  const reference = createDispersionReference(data.providerKey);
  const operation = {
    reference,
    accountId: account.id,
    paymentType: "PROVIDERS" as const,
    // Sandbox-only: forces the final state of every transaction in the batch.
    transactionStatus: data.simulate,
    transactions: [
      {
        key: keyValue,
        name: resolution.data.holderName ?? keyValue,
        email: DEMO_PAYEE_EMAIL,
        amount: data.amountInCents,
      },
    ],
  };
  const idempotencyKey = createDispersionIdempotencyKey(operation);

  payment.attempted = true;
  const result = await runPayoutRequest(
    (client) => client.createPayout(operation, { idempotencyKey }),
    ({ payoutId }): CreateDispersionDto => ({
      reference,
      wompiPayoutId: payoutId ?? "",
      status: "PENDING",
    }),
  );

  if (result.data) {
    recordDispersion({
      reference,
      wompiPayoutId: result.data.wompiPayoutId,
      providerKey: data.providerKey,
      brebKey: keyValue,
      amountInCents: data.amountInCents,
      status: "PENDING",
    });
  }
  return result;
}

/**
 * Poll a tracked dispersion until the sandbox settles it. The payouts
 * webhook (`/api/payouts-webhook`) applies the same transition when it
 * arrives first; `applyDispersionStatus` settles the provider exactly once.
 */
export const getPayoutStatus = createServerFn({ method: "POST" })
  .validator((data: { reference: string }) => data)
  .handler(async ({ data }): Promise<ServerResult<PayoutStatusDto>> => {
    const dispersion = findDispersion(data.reference);
    if (!dispersion) {
      return {
        error: {
          code: "UNKNOWN_DISPERSION",
          message: `No hay una dispersión con referencia ${data.reference}.`,
          statusCode: 404,
        },
        data: null,
      };
    }

    try {
      const client = getPayoutsClient();
      const [payoutError, payout] = await client.getPayout(
        dispersion.wompiPayoutId,
        { apiVersion: "v2" },
      );
      if (payoutError) {
        return { error: toPayoutError(payoutError), data: null };
      }

      const [transactionError, page] = await client.listPayoutTransactions(
        dispersion.wompiPayoutId,
        {},
        { apiVersion: "v2" },
      );
      const transaction = page?.records[0];
      const failureReason = transaction?.failureReason;
      const transactionFailureReason =
        typeof failureReason === "string"
          ? failureReason
          : (failureReason?.message ?? failureReason?.description);

      const updated = applyDispersionStatus(
        { reference: dispersion.reference },
        payout.status,
      );

      return {
        error: null,
        data: {
          reference: dispersion.reference,
          wompiPayoutId: dispersion.wompiPayoutId,
          status: updated?.status ?? payout.status,
          transactionStatus: transaction?.status,
          transactionFailureReason:
            transactionFailureReason ??
            (transactionError
              ? toPayoutError(transactionError).message
              : undefined),
        },
      };
    } catch (error) {
      return { error: toPayoutError(error), data: null };
    }
  });

/** Demo providers with their live pending balances. */
export const getProviders = createServerFn({ method: "POST" }).handler(
  async (): Promise<ProviderState[]> => listProviders(),
);

/** Tracked dispersions, newest first. */
export const getDispersions = createServerFn({ method: "POST" })
  .validator((data: { limit?: number } | undefined) => data)
  .handler(async ({ data }): Promise<DispersionState[]> => {
    const requested = data?.limit ?? 20;
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.floor(requested), 1), 50)
      : 20;
    return listDispersions(limit);
  });

/** Payout origin accounts and their balances, straight from the Payouts API. */
export const getAccountBalances = createServerFn({ method: "POST" }).handler(
  async (): Promise<
    ServerResult<
      Array<{ accountId: string; name: string; balanceInCents: number }>
    >
  > => {
    const result = await runPayoutRequest(
      (client) => client.listAccounts(),
      (accounts) =>
        accounts.map((account) => ({
          accountId: account.id,
          name: account.bank?.name ?? account.number ?? account.id,
          balanceInCents: account.balanceInCents ?? 0,
        })),
    );

    return result;
  },
);
