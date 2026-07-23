import { WompiPayoutsClient } from "@pulgueta/wompi";
import { WompiPayoutApiError } from "@pulgueta/wompi/schemas";
import type {
  BrebKeyType,
  CreatePayoutTransaction,
  Result,
} from "@pulgueta/wompi/schemas";
import { createServerFn } from "@tanstack/react-start";

import { createDispersionIdempotencyKey } from "./idempotency";
import { verifyCheckoutTransaction } from "./checkout";

export type PayoutErrorDto = {
  code: string;
  message: string;
  statusCode: number | null;
};

export type ServerResult<T> =
  | { error: PayoutErrorDto; data: null }
  | { error: null; data: T };

export const SETTLEMENT_AMOUNT_IN_CENTS = 4_000_000;
export const SUPPLIER_NAME = "Elias Cano";
export const SUPPLIER_EMAIL = "seller@example.com";
export const SUPPLIER_PERSON_TYPE = "NATURAL" as const;
export const SUPPLIER_LEGAL_ID_TYPE = "CC" as const;
export const SUPPLIER_LEGAL_ID = "1000000000";

export type AccountDto = {
  id: string;
  number?: string;
  balanceInCents?: number | null;
  status?: string;
  accountType?: string;
  bankName?: string;
};

export type BankDto = {
  id: string;
  name?: string;
  code?: string;
  isElectronicDeposit?: boolean;
};

export type KeyResolutionDto = {
  holderName: string;
  keyType: string;
  keyValue: string;
  financialEntityName?: string;
  financialEntityCode?: string;
};

export type CreateResultDto = {
  payoutId?: string;
  transactions?: number;
  success?: number;
  failed?: number;
};

export type PayoutStatusDto = {
  id: string;
  status: string;
  reference?: string;
  createdAt?: string;
  transactionStatus?: string;
  transactionFailureReason?: string;
  transactionLookupError?: string;
};

export type ResolveKeyInput = {
  key: string;
  keyType?: BrebKeyType;
};

export type CreateDispersionInput = {
  accountId: string;
  checkoutTransactionId: string;
  checkoutReference: string;
  orderProof: string;
  destination:
    | { rail: "breb"; key: string }
    | {
        rail: "bank";
        bankId: string;
        accountType: "AHORROS" | "CORRIENTE" | "DEPOSITO_ELECTRONICO";
        accountNumber: string;
      };
};

export type PayoutRail = "bank" | "breb";

export type DispersionOperation = {
  accountId: string;
  reference: string;
  paymentType: "PROVIDERS";
  transaction: CreatePayoutTransaction;
};

let payoutsClient: WompiPayoutsClient | null = null;
const settlementAttempts = new Map<
  string,
  Promise<ServerResult<CreateResultDto>>
>();

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
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "The unauthenticated payouts demo is available only in local development",
    );
  }

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

export function buildDispersionOperation(
  data: CreateDispersionInput,
): DispersionOperation {
  const reference = createSettlementReference(data.checkoutTransactionId);
  const transactionBase = {
    name: SUPPLIER_NAME,
    email: SUPPLIER_EMAIL,
    amount: SETTLEMENT_AMOUNT_IN_CENTS,
    reference,
    description: `Supplier share for ${data.checkoutReference}`,
  };
  const transaction: CreatePayoutTransaction =
    data.destination.rail === "breb"
      ? { ...transactionBase, key: data.destination.key.trim() }
      : {
          ...transactionBase,
          personType: SUPPLIER_PERSON_TYPE,
          legalIdType: SUPPLIER_LEGAL_ID_TYPE,
          legalId: SUPPLIER_LEGAL_ID,
          bankId: data.destination.bankId,
          accountType: data.destination.accountType,
          accountNumber: data.destination.accountNumber.trim(),
        };

  return {
    accountId: data.accountId,
    reference,
    paymentType: "PROVIDERS",
    transaction,
  };
}

export function createSettlementReference(checkoutTransactionId: string) {
  const compactId = checkoutTransactionId.replace(/[^A-Za-z0-9]/g, "");
  return `settlement-${compactId.slice(0, 24)}`;
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
    return {
      code: "WOMPI_REQUEST",
      message: error.message,
      statusCode: getStatusCode(error),
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

export const listAccounts = createServerFn({ method: "POST" }).handler(
  async (): Promise<ServerResult<AccountDto[]>> =>
    runPayoutRequest(
      (client) => client.listAccounts({ status: "ACTIVE" }),
      (accounts) =>
        accounts.map(
          ({ id, number, balanceInCents, status, accountType, bank }) => ({
            id,
            number,
            balanceInCents,
            status,
            accountType,
            bankName: bank?.name,
          }),
        ),
    ),
);

export const listBanks = createServerFn({ method: "POST" }).handler(
  async (): Promise<ServerResult<BankDto[]>> =>
    runPayoutRequest(
      (client) => client.listBanks(),
      (banks) =>
        banks.map(({ id, name, code, isElectronicDeposit }) => ({
          id,
          name,
          code,
          isElectronicDeposit,
        })),
    ),
);

export const resolveKey = createServerFn({ method: "POST" })
  .validator((data: ResolveKeyInput) => data)
  .handler(
    async ({ data }): Promise<ServerResult<KeyResolutionDto>> =>
      runPayoutRequest(
        (client) => client.resolveBrebKey(data.key, data.keyType),
        (resolution) => ({
          holderName: resolution.holderName ?? "",
          keyType: resolution.keyType ?? "",
          keyValue: resolution.keyValue ?? "",
          financialEntityName: resolution.financialEntity?.name,
          financialEntityCode: resolution.financialEntity?.code,
        }),
      ),
  );

// A payout is only provably rejected when Wompi answered with a 4xx status.
// Network errors (statusCode 0), timeouts, 5xx and unparseable responses are
// ambiguous: Wompi may still have accepted the payout, so we must not treat them
// as a clean rejection.
function isAmbiguousPayoutFailure(error: PayoutErrorDto) {
  return (
    error.statusCode === null ||
    error.statusCode < 400 ||
    error.statusCode >= 500
  );
}

// Dedupes concurrent settlements per checkout and, on failure, only forgets the
// attempt when Wompi provably rejected it. On ambiguous failures the record is
// kept so the deterministic idempotency key is reused on retry (letting Wompi
// dedupe within its window) and the payout can be recovered via getPayoutStatus,
// never risking a second supplier payout.
export async function runSettlementAttempt(
  checkoutId: string,
  run: () => Promise<ServerResult<CreateResultDto>>,
  attempts = settlementAttempts,
): Promise<ServerResult<CreateResultDto>> {
  const existingAttempt = attempts.get(checkoutId);
  if (existingAttempt) return existingAttempt;

  const attempt = run();
  attempts.set(checkoutId, attempt);
  const result = await attempt;
  if (result.error && !isAmbiguousPayoutFailure(result.error)) {
    attempts.delete(checkoutId);
  }
  return result;
}

export const createDispersion = createServerFn({ method: "POST" })
  .validator((data: CreateDispersionInput) => data)
  .handler(async ({ data }): Promise<ServerResult<CreateResultDto>> => {
    try {
      const verifiedCheckout = await verifyCheckoutTransaction(
        {
          transactionId: data.checkoutTransactionId,
          expectedReference: data.checkoutReference,
          orderProof: data.orderProof,
        },
        true,
      );

      const operation = buildDispersionOperation(data);
      const idempotencyKey = createDispersionIdempotencyKey({
        checkoutTransactionId: verifiedCheckout.id,
      });
      return runSettlementAttempt(verifiedCheckout.id, () =>
        runPayoutRequest(
          (client) =>
            client.createPayout(
              {
                reference: operation.reference,
                accountId: operation.accountId,
                paymentType: operation.paymentType,
                transactions: [operation.transaction],
              },
              { idempotencyKey },
            ),
          ({ payoutId, transactions, success, failed }) => ({
            payoutId,
            transactions,
            success,
            failed,
          }),
        ),
      );
    } catch (error) {
      return { error: toPayoutError(error), data: null };
    }
  });

export const getPayoutStatus = createServerFn({ method: "POST" })
  .validator((data: { payoutId: string; rail: PayoutRail }) => data)
  .handler(async ({ data }): Promise<ServerResult<PayoutStatusDto>> => {
    try {
      const client = getPayoutsClient();
      const apiVersion = data.rail === "breb" ? "v2" : "v1";
      const [payoutError, payout] = await client.getPayout(data.payoutId, {
        apiVersion,
      });

      if (payoutError) {
        return { error: toPayoutError(payoutError), data: null };
      }

      const [transactionError, page] = await client.listPayoutTransactions(
        data.payoutId,
        {},
        { apiVersion },
      );
      const transaction = page?.records[0];
      const failureReason = transaction?.failureReason;
      const transactionFailureReason =
        typeof failureReason === "string"
          ? failureReason
          : (failureReason?.message ?? failureReason?.description);

      return {
        error: null,
        data: {
          id: payout.id,
          status: payout.status,
          reference: payout.reference,
          createdAt: payout.createdAt,
          transactionStatus: transaction?.status,
          transactionFailureReason,
          transactionLookupError: transactionError
            ? toPayoutError(transactionError).message
            : undefined,
        },
      };
    } catch (error) {
      return { error: toPayoutError(error), data: null };
    }
  });
