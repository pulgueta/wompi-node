import { createHash } from "node:crypto";
import { env } from "node:process";

import { WompiPayoutsClient } from "@pulgueta/wompi";
import type {
  BrebKeyType,
  CreatePayoutTransaction,
  Result,
} from "@pulgueta/wompi/schemas";
import { createServerFn } from "@tanstack/react-start";

type ServerResult<T> = { error: string; data: null } | { error: null; data: T };

export type AccountDto = {
  id: string;
  number?: string;
  balanceInCents?: number;
  status?: string;
  accountType?: string;
};

export type BankDto = {
  id: string;
  name?: string;
  code?: string;
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
};

export type ResolveKeyInput = {
  key: string;
  keyType?: BrebKeyType;
};

export type CreateDispersionInput = {
  accountId: string;
  reference: string;
  transaction: CreatePayoutTransaction;
};

let payoutsClient: WompiPayoutsClient | null = null;

function getPayoutsClient() {
  payoutsClient ??= new WompiPayoutsClient({
    apiKey: env.WOMPI_PAYOUTS_API_KEY ?? "",
    userPrincipalId: env.WOMPI_PAYOUTS_USER_PRINCIPAL_ID ?? "",
    sandbox: true,
  });

  return payoutsClient;
}

async function runPayoutRequest<T, TDto>(
  request: (client: WompiPayoutsClient) => Promise<Result<T>>,
  mapData: (data: T) => TDto,
): Promise<ServerResult<TDto>> {
  try {
    const [error, data] = await request(getPayoutsClient());

    if (error) {
      return { error: error.message, data: null };
    }

    return { error: null, data: mapData(data) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unexpected payouts error",
      data: null,
    };
  }
}

export const listAccounts = createServerFn({ method: "POST" }).handler(
  async (): Promise<ServerResult<AccountDto[]>> =>
    runPayoutRequest(
      (client) => client.listAccounts(),
      (accounts) =>
        accounts.map(({ id, number, balanceInCents, status, accountType }) => ({
          id,
          number,
          balanceInCents,
          status,
          accountType,
        })),
    ),
);

export const listBanks = createServerFn({ method: "POST" }).handler(
  async (): Promise<ServerResult<BankDto[]>> =>
    runPayoutRequest(
      (client) => client.listBanks(),
      (banks) => banks.map(({ id, name, code }) => ({ id, name, code })),
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

export const createDispersion = createServerFn({ method: "POST" })
  .validator((data: CreateDispersionInput) => data)
  .handler(async ({ data }): Promise<ServerResult<CreateResultDto>> => {
    const idempotencyKey = createHash("sha256")
      .update(data.reference)
      .digest("hex");

    return runPayoutRequest(
      (client) =>
        client.createPayout(
          {
            reference: data.reference,
            accountId: data.accountId,
            paymentType: "OTHER",
            transactions: [data.transaction],
          },
          { idempotencyKey },
        ),
      ({ payoutId, transactions, success, failed }) => ({
        payoutId,
        transactions,
        success,
        failed,
      }),
    );
  });

export const getPayoutStatus = createServerFn({ method: "POST" })
  .validator((data: { payoutId: string }) => data)
  .handler(
    async ({ data }): Promise<ServerResult<PayoutStatusDto>> =>
      runPayoutRequest(
        (client) => client.getPayout(data.payoutId),
        ({ id, status, reference, createdAt }) => ({
          id,
          status,
          reference,
          createdAt,
        }),
      ),
  );
